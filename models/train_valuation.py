"""
train_valuation.py

Trains a PyTorch regression model to predict per-impression CPM confidence
intervals (low, high) from page context features.

Switched from XGBoost → PyTorch for consistent ONNX export path with mirror model.

Input:  training/valuation_dataset.csv
Output: data/valuation.onnx
        models/valuation_scaler.json      (MinMaxScaler params for JS inference)
        models/valuation_categories.json  (OHE category index for JS inference)

Usage:
    source models/.venv/bin/activate
    python models/train_valuation.py
"""

import json
import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE       = os.path.dirname(os.path.dirname(__file__))
TRAIN_CSV  = os.path.join(BASE, 'training', 'valuation_dataset.csv')
DATA_DIR   = os.path.join(BASE, 'data')
MODEL_DIR  = os.path.join(BASE, 'models')
ONNX_OUT   = os.path.join(DATA_DIR, 'valuation.onnx')
SCALER_OUT = os.path.join(MODEL_DIR, 'valuation_scaler.json')
CATS_OUT   = os.path.join(MODEL_DIR, 'valuation_categories.json')

os.makedirs(DATA_DIR, exist_ok=True)

# ── Hyperparameters ───────────────────────────────────────────────────────────
EPOCHS     = 40
BATCH_SIZE = 512
LR         = 1e-3

# ── Page categories (fixed order — must match JS inference code) ──────────────
PAGE_CATEGORIES = sorted(['entertainment', 'finance', 'health', 'news', 'other', 'shopping', 'tech', 'travel'])

# ── Load data ─────────────────────────────────────────────────────────────────
print("Loading dataset...")
df = pd.read_csv(TRAIN_CSV)
print(f"  {len(df):,} rows")
print(f"  Category distribution: {df['page_category'].value_counts().to_dict()}")

# ── Feature engineering ───────────────────────────────────────────────────────
for cat in PAGE_CATEGORIES:
    df[f'cat_{cat}'] = (df['page_category'] == cat).astype(float)

NUM_FEATURES = ['tracker_density', 'ad_network_count', 'data_broker_count',
                'analytics_count', 'social_pixel_count']

scaler = MinMaxScaler()
df[NUM_FEATURES] = scaler.fit_transform(df[NUM_FEATURES])

FEATURE_COLS = (
    [f'cat_{c}' for c in PAGE_CATEGORIES] +  # 8 OHE
    ['hour_sin', 'hour_cos',                  # 2 cyclical
     'is_mobile', 'has_geo_signal'] +         # 2 binary
    NUM_FEATURES                              # 5 normalised
)
# Total: 17 features

X = df[FEATURE_COLS].values.astype(np.float32)
y = df[['cpm_low', 'cpm_high']].values.astype(np.float32)

print(f"\nFeatures: {X.shape}  Targets: {y.shape}")
print(f"Feature order ({len(FEATURE_COLS)}): {FEATURE_COLS}")

# ── Train / test split ────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
print(f"\nTrain: {len(X_train):,}  Test: {len(X_test):,}")

train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train))
test_ds  = TensorDataset(torch.tensor(X_test),  torch.tensor(y_test))
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE)

# ── Model ─────────────────────────────────────────────────────────────────────
class ValuationModel(nn.Module):
    def __init__(self, n_features: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 2),   # output: [cpm_low, cpm_high]
        )

    def forward(self, x):
        return self.net(x)

model   = ValuationModel(len(FEATURE_COLS))
loss_fn = nn.MSELoss()
optim   = torch.optim.Adam(model.parameters(), lr=LR)
sched   = torch.optim.lr_scheduler.ReduceLROnPlateau(optim, patience=4, factor=0.5)

# ── Training loop ─────────────────────────────────────────────────────────────
print(f"\nTraining ({EPOCHS} epochs)...")
best_loss  = float('inf')
best_state = None

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0.0
    for xb, yb in train_dl:
        optim.zero_grad()
        pred = model(xb)
        loss = loss_fn(pred, yb)
        loss.backward()
        optim.step()
        total_loss += loss.item()

    avg_loss = total_loss / len(train_dl)
    sched.step(avg_loss)

    if avg_loss < best_loss:
        best_loss  = avg_loss
        best_state = {k: v.clone() for k, v in model.state_dict().items()}

    if epoch % 5 == 0 or epoch == 1:
        print(f"  Epoch {epoch:>2}/{EPOCHS}  loss={avg_loss:.6f}")

model.load_state_dict(best_state)
print(f"\nBest training loss: {best_loss:.6f}")

# ── Evaluate ──────────────────────────────────────────────────────────────────
model.eval()
all_preds, all_labels = [], []
with torch.no_grad():
    for xb, yb in test_dl:
        all_preds.append(model(xb).numpy())
        all_labels.append(yb.numpy())

preds  = np.vstack(all_preds)
labels = np.vstack(all_labels)

mae_low  = mean_absolute_error(labels[:, 0], preds[:, 0])
mae_high = mean_absolute_error(labels[:, 1], preds[:, 1])

# Coverage: % of test samples where pred interval contains actual interval
coverage = np.mean((preds[:, 0] <= labels[:, 0]) & (preds[:, 1] >= labels[:, 1]))

print(f"\n── Evaluation ───────────────────────────────────────")
print(f"  MAE cpm_low:   ${mae_low:.6f}")
print(f"  MAE cpm_high:  ${mae_high:.6f}")
print(f"  Coverage:      {coverage:.1%}  (target >80%)")

print(f"\n── Sample predictions (first 5 test rows) ──────────")
print(f"  {'actual_low':>12} {'actual_high':>12} {'pred_low':>12} {'pred_high':>12}")
for i in range(5):
    print(f"  {labels[i,0]:>12.6f} {labels[i,1]:>12.6f} {preds[i,0]:>12.6f} {preds[i,1]:>12.6f}")

# ── Export to ONNX ────────────────────────────────────────────────────────────
print("\nExporting to ONNX...")
model.eval()
dummy = torch.randn(1, len(FEATURE_COLS))
torch.onnx.export(
    model, dummy, ONNX_OUT,
    input_names=['features'],
    output_names=['cpm_range'],
    dynamic_axes={'features': {0: 'batch'}, 'cpm_range': {0: 'batch'}},
    opset_version=17,
    do_constant_folding=True,
)

size_kb = os.path.getsize(ONNX_OUT) / 1024
print(f"  Saved → {ONNX_OUT}  ({size_kb:.1f} KB)")

# ── Validate ONNX ─────────────────────────────────────────────────────────────
import onnxruntime as rt

sess      = rt.InferenceSession(ONNX_OUT)
onnx_out  = sess.run(None, {'features': X_test[:10]})[0]
torch_out = model(torch.tensor(X_test[:10])).detach().numpy()
max_diff  = np.max(np.abs(onnx_out - torch_out))
print(f"  Max diff PyTorch vs ONNX: {max_diff:.8f}")
print(f"  {'PASSED' if max_diff < 0.0001 else 'WARNING: outputs differ'}")

# ── Save preprocessing params for JS ─────────────────────────────────────────
scaler_params = {
    'features':  NUM_FEATURES,
    'data_min_': scaler.data_min_.tolist(),
    'data_max_': scaler.data_max_.tolist(),
    'scale_':    scaler.scale_.tolist(),
    'min_':      scaler.min_.tolist(),
}
with open(SCALER_OUT, 'w') as f:
    json.dump(scaler_params, f, indent=2)
print(f"\nScaler params → {SCALER_OUT}")

with open(CATS_OUT, 'w') as f:
    json.dump({
        'page_categories': PAGE_CATEGORIES,
        'feature_order':   FEATURE_COLS,
        'n_features':      len(FEATURE_COLS),
    }, f, indent=2)
print(f"Category params  → {CATS_OUT}")
print("\nDone.")
