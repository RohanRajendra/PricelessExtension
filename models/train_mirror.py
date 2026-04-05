"""
train_mirror.py

Trains a multi-label neural network classifier to map URL paths →
IAB audience segments (Mirror feature).

Input:  training/mirror_dataset.csv
Output: data/mirror.onnx
        models/mirror_vocab.json        (token → index, top 5000 tokens)
        models/mirror_lsa.json          (TruncatedSVD components for URL encoding)
        models/mirror_thresholds.json   (per-segment classification thresholds)

Usage:
    pip install torch scikit-learn pandas numpy onnx onnxruntime
    python models/train_mirror.py
"""

import json
import os
import re
import numpy as np
import pandas as pd
from collections import Counter
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE      = os.path.dirname(os.path.dirname(__file__))
TRAIN_CSV = os.path.join(BASE, 'training', 'mirror_dataset.csv')
DATA_DIR  = os.path.join(BASE, 'data')
MODEL_DIR = os.path.join(BASE, 'models')
ONNX_OUT        = os.path.join(DATA_DIR, 'mirror.onnx')
VOCAB_OUT        = os.path.join(MODEL_DIR, 'mirror_vocab.json')
LSA_OUT          = os.path.join(MODEL_DIR, 'mirror_lsa.json')
THRESHOLDS_OUT   = os.path.join(MODEL_DIR, 'mirror_thresholds.json')

os.makedirs(DATA_DIR, exist_ok=True)

# ── Segments (fixed order — must match profile-engine.js) ────────────────────
SEGMENTS = [
    'Parent',
    'Homeowner',
    'Luxury Auto Intender',
    'Health Conscious',
    'Investor',
    'Traveler',
    'News Reader',
    'Tech Enthusiast',
]
N_SEGMENTS = len(SEGMENTS)
SEG_TO_IDX = {s: i for i, s in enumerate(SEGMENTS)}

# ── Hyperparameters ───────────────────────────────────────────────────────────
VOCAB_SIZE   = 5000
LSA_DIMS     = 64
BATCH_SIZE   = 512
EPOCHS       = 30
LR           = 1e-3
HIDDEN_1     = 128
HIDDEN_2     = 64
INPUT_DIMS   = LSA_DIMS  # just URL LSA features (no per-visit numeric signals at this stage)

# ── Load data ─────────────────────────────────────────────────────────────────
print("Loading dataset...")
df = pd.read_csv(TRAIN_CSV, dtype=str).fillna('')
print(f"  {len(df):,} rows")

# ── URL tokenisation ──────────────────────────────────────────────────────────
STOP_TOKENS = {'www', 'com', 'org', 'net', 'html', 'htm', 'php', 'asp',
               'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for',
               'index', 'page', 'http', 'https', '', '2024', '2025', '2026'}

def tokenize_url(url: str) -> str:
    """Split URL path into tokens, return as space-separated string."""
    path = url.lower()
    # Remove protocol and domain
    path = re.sub(r'^https?://[^/]+', '', path)
    # Split on non-alphanumeric characters
    tokens = re.split(r'[^a-z0-9]+', path)
    tokens = [t for t in tokens if t and t not in STOP_TOKENS and len(t) > 1]
    return ' '.join(tokens[:20])  # cap at 20 tokens per URL

print("Tokenising URLs...")
df['tokens'] = df['path'].apply(tokenize_url)

# Filter rows with empty tokens
df = df[df['tokens'].str.len() > 0].reset_index(drop=True)
print(f"  {len(df):,} rows after filtering empty tokens")

# ── Build label matrix ────────────────────────────────────────────────────────
print("Building label matrix...")
y = np.zeros((len(df), N_SEGMENTS), dtype=np.float32)
for i, segs_str in enumerate(df['segments']):
    for seg in segs_str.split('|'):
        seg = seg.strip()
        if seg in SEG_TO_IDX:
            y[i, SEG_TO_IDX[seg]] = 1.0

print(f"  Label distribution:")
for j, seg in enumerate(SEGMENTS):
    count = int(y[:, j].sum())
    pct   = count / len(df) * 100
    print(f"    {seg:<25} {count:>8,}  ({pct:.1f}%)")

# ── Vectorise + LSA ───────────────────────────────────────────────────────────
print(f"\nBuilding BoW (vocab_size={VOCAB_SIZE})...")
vectorizer = CountVectorizer(max_features=VOCAB_SIZE, min_df=2, ngram_range=(1, 2))
X_bow = vectorizer.fit_transform(df['tokens'])
print(f"  BoW matrix: {X_bow.shape}")

print(f"Fitting TruncatedSVD (n_components={LSA_DIMS})...")
svd = TruncatedSVD(n_components=LSA_DIMS, random_state=42)
X_lsa = svd.fit_transform(X_bow).astype(np.float32)
print(f"  LSA matrix: {X_lsa.shape}")
print(f"  Explained variance: {svd.explained_variance_ratio_.sum():.1%}")

# ── Class weights for imbalanced segments ─────────────────────────────────────
seg_counts = y.sum(axis=0)
# Inverse frequency weighting, clipped to avoid extreme values
weights = (len(df) / (N_SEGMENTS * (seg_counts + 1))).astype(np.float32)
weights = np.clip(weights, 0.5, 10.0)
print(f"\nClass weights: {dict(zip(SEGMENTS, weights.round(2)))}")
pos_weight = torch.tensor(weights)

# ── Train / validation split ──────────────────────────────────────────────────
X_train, X_val, y_train, y_val = train_test_split(
    X_lsa, y, test_size=0.15, random_state=42
)
print(f"\nTrain: {len(X_train):,}  Val: {len(X_val):,}")

train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train))
val_ds   = TensorDataset(torch.tensor(X_val),   torch.tensor(y_val))
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE)

# ── Model ─────────────────────────────────────────────────────────────────────
class MirrorClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(INPUT_DIMS, HIDDEN_1),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(HIDDEN_1, HIDDEN_2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(HIDDEN_2, N_SEGMENTS),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)

model   = MirrorClassifier()
loss_fn = nn.BCELoss(reduction='none')  # per-element so we can apply weights
optim   = torch.optim.Adam(model.parameters(), lr=LR)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optim, patience=3, factor=0.5)

# ── Training loop ─────────────────────────────────────────────────────────────
print(f"\nTraining ({EPOCHS} epochs)...")
best_val_f1 = 0.0
best_state  = None

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0.0

    for xb, yb in train_dl:
        optim.zero_grad()
        pred = model(xb)
        # Weighted BCE: multiply per-element loss by pos_weight for each segment
        elem_loss = loss_fn(pred, yb)              # (batch, n_segments)
        w_loss    = (elem_loss * pos_weight).mean()
        w_loss.backward()
        optim.step()
        total_loss += w_loss.item()

    # Validation
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for xb, yb in val_dl:
            probs = model(xb).numpy()
            all_preds.append(probs)
            all_labels.append(yb.numpy())

    preds_arr  = np.vstack(all_preds)
    labels_arr = np.vstack(all_labels)

    # Use 0.5 threshold for epoch monitoring
    val_f1 = f1_score(labels_arr, preds_arr >= 0.5, average='micro', zero_division=0)
    avg_loss = total_loss / len(train_dl)
    scheduler.step(avg_loss)

    if val_f1 > best_val_f1:
        best_val_f1 = val_f1
        best_state  = {k: v.clone() for k, v in model.state_dict().items()}

    if epoch % 5 == 0 or epoch == 1:
        print(f"  Epoch {epoch:>2}/{EPOCHS}  loss={avg_loss:.4f}  val_f1={val_f1:.4f}  "
              f"(best={best_val_f1:.4f})")

print(f"\nBest val micro-F1: {best_val_f1:.4f}  (target > 0.65)")

# ── Per-segment threshold tuning ──────────────────────────────────────────────
print("\nTuning per-segment thresholds on validation set...")
model.load_state_dict(best_state)
model.eval()

all_preds, all_labels = [], []
with torch.no_grad():
    for xb, yb in val_dl:
        all_preds.append(model(xb).numpy())
        all_labels.append(yb.numpy())

preds_arr  = np.vstack(all_preds)
labels_arr = np.vstack(all_labels)

thresholds = {}
print(f"  {'Segment':<25} {'Threshold':>10} {'F1':>8}")
for j, seg in enumerate(SEGMENTS):
    best_t, best_f1 = 0.5, 0.0
    for t in np.arange(0.2, 0.9, 0.05):
        f1 = f1_score(labels_arr[:, j], preds_arr[:, j] >= t, zero_division=0)
        if f1 > best_f1:
            best_f1, best_t = f1, float(t)
    thresholds[seg] = round(best_t, 2)
    print(f"  {seg:<25} {best_t:>10.2f} {best_f1:>8.4f}")

# ── Export to ONNX ────────────────────────────────────────────────────────────
print("\nExporting model to ONNX...")
model.eval()
dummy = torch.randn(1, INPUT_DIMS)
torch.onnx.export(
    model,
    dummy,
    ONNX_OUT,
    input_names=['features'],
    output_names=['segment_probabilities'],
    dynamic_axes={
        'features':              {0: 'batch'},
        'segment_probabilities': {0: 'batch'},
    },
    opset_version=17,
    do_constant_folding=True,
)

size_kb = os.path.getsize(ONNX_OUT) / 1024
print(f"  Saved → {ONNX_OUT}  ({size_kb:.1f} KB)")

# ── Validate ONNX ─────────────────────────────────────────────────────────────
import onnxruntime as rt

sess = rt.InferenceSession(ONNX_OUT)
test_input = X_val[:10]
onnx_out   = sess.run(None, {'features': test_input})[0]
torch_out  = model(torch.tensor(test_input)).detach().numpy()
max_diff   = np.max(np.abs(onnx_out - torch_out))
print(f"  Max diff PyTorch vs ONNX: {max_diff:.8f}  (target < 0.0001)")
print(f"  {'PASSED' if max_diff < 0.0001 else 'WARNING: outputs differ'}")

# ── Save preprocessing artefacts for JS inference ─────────────────────────────
print("\nSaving preprocessing artefacts...")

# Vocabulary: token → index (CountVectorizer)
vocab = {token: int(idx) for token, idx in vectorizer.vocabulary_.items()}
with open(VOCAB_OUT, 'w') as f:
    json.dump({
        'vocabulary': vocab,
        'vocab_size': VOCAB_SIZE,
        'stop_tokens': list(STOP_TOKENS),
    }, f)
print(f"  Vocab ({len(vocab)} tokens) → {VOCAB_OUT}")

# LSA components: shape (LSA_DIMS, VOCAB_SIZE) — used in JS as matrix multiply
lsa_components = svd.components_.tolist()  # list of LSA_DIMS lists, each VOCAB_SIZE long
with open(LSA_OUT, 'w') as f:
    json.dump({
        'n_components': LSA_DIMS,
        'vocab_size':   VOCAB_SIZE,
        'components':   lsa_components,   # [64][5000] float matrix
    }, f)
print(f"  LSA components ({LSA_DIMS}×{VOCAB_SIZE}) → {LSA_OUT}")

# Thresholds
with open(THRESHOLDS_OUT, 'w') as f:
    json.dump({
        'segments':   SEGMENTS,
        'thresholds': thresholds,
    }, f, indent=2)
print(f"  Thresholds → {THRESHOLDS_OUT}")

print("\nDone.")
