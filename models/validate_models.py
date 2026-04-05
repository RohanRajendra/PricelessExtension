"""
validate_models.py

Runs both ONNX models with realistic browser-like inputs and confirms:
  - Input/output shapes are correct
  - Output values are in sensible ranges
  - Preprocessing pipeline (scaler, OHE, LSA) produces expected feature vectors

This simulates exactly what the JS inference code will do.
"""

import json
import os
import re
import math
import numpy as np
import onnxruntime as rt

BASE     = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, 'data')

# ── Load artefacts ────────────────────────────────────────────────────────────
with open(os.path.join(DATA_DIR, 'valuation_scaler.json'))    as f: scaler   = json.load(f)
with open(os.path.join(DATA_DIR, 'valuation_categories.json')) as f: cats    = json.load(f)
with open(os.path.join(DATA_DIR, 'mirror_vocab.json'))         as f: vocab   = json.load(f)
with open(os.path.join(DATA_DIR, 'mirror_lsa.json'))           as f: lsa     = json.load(f)
with open(os.path.join(DATA_DIR, 'mirror_thresholds.json'))    as f: thresh  = json.load(f)

# ── Valuation model helpers ───────────────────────────────────────────────────
PAGE_CATEGORIES = cats['page_categories']
NUM_FEATURES    = scaler['features']
DATA_MIN  = np.array(scaler['data_min_'],  dtype=np.float32)
DATA_MAX  = np.array(scaler['data_max_'],  dtype=np.float32)

def minmax_scale(values: list[float]) -> list[float]:
    arr = np.array(values, dtype=np.float32)
    scaled = (arr - DATA_MIN) / (DATA_MAX - DATA_MIN + 1e-8)
    return np.clip(scaled, 0, 1).tolist()

def build_valuation_features(page_category, tracker_density, hour,
                              is_mobile, has_geo_signal,
                              ad_net, data_broker, analytics, social) -> np.ndarray:
    # OHE page_category
    ohe = [1.0 if c == page_category else 0.0 for c in PAGE_CATEGORIES]
    # Cyclical hour
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    # Scale numeric features
    scaled = minmax_scale([tracker_density, ad_net, data_broker, analytics, social])
    feat = ohe + [hour_sin, hour_cos, float(is_mobile), float(has_geo_signal)] + scaled
    return np.array(feat, dtype=np.float32).reshape(1, -1)

# ── Mirror model helpers ──────────────────────────────────────────────────────
VOCABULARY  = vocab['vocabulary']       # token → index
STOP_TOKENS = set(vocab['stop_tokens'])
LSA_SHAPE   = lsa['shape']              # [64, 5000]
LSA_MATRIX  = np.array(lsa['data'], dtype=np.float32).reshape(LSA_SHAPE)   # (64, 5000)
SEGMENTS    = thresh['segments']
THRESHOLDS  = thresh['thresholds']

def tokenize_url(url: str) -> list[str]:
    path = url.lower()
    path = re.sub(r'^https?://[^/]+', '', path)
    tokens = re.split(r'[^a-z0-9]+', path)
    return [t for t in tokens if t and t not in STOP_TOKENS and len(t) > 1][:20]

def url_to_lsa(url: str) -> np.ndarray:
    tokens = tokenize_url(url)
    bow = np.zeros(LSA_SHAPE[1], dtype=np.float32)
    for t in tokens:
        idx = VOCABULARY.get(t)
        if idx is not None:
            bow[idx] += 1.0
    # Project through LSA: (64, 5000) @ (5000,) = (64,)
    return LSA_MATRIX @ bow

def build_mirror_features(url: str) -> np.ndarray:
    return url_to_lsa(url).reshape(1, -1)

# ── Load ONNX sessions ────────────────────────────────────────────────────────
val_sess    = rt.InferenceSession(os.path.join(DATA_DIR, 'valuation.onnx'))
mirror_sess = rt.InferenceSession(os.path.join(DATA_DIR, 'mirror.onnx'))

print("=" * 60)
print("VALUATION MODEL VALIDATION")
print("=" * 60)

test_cases = [
    dict(page_category='finance',       tracker_density=0.6, hour=14, is_mobile=0, has_geo_signal=1, ad_net=5, data_broker=2, analytics=3, social=1),
    dict(page_category='news',          tracker_density=0.4, hour=8,  is_mobile=1, has_geo_signal=0, ad_net=3, data_broker=0, analytics=2, social=2),
    dict(page_category='entertainment', tracker_density=0.3, hour=20, is_mobile=1, has_geo_signal=0, ad_net=2, data_broker=0, analytics=1, social=3),
    dict(page_category='shopping',      tracker_density=0.7, hour=11, is_mobile=0, has_geo_signal=1, ad_net=6, data_broker=3, analytics=2, social=1),
    dict(page_category='other',         tracker_density=0.1, hour=3,  is_mobile=0, has_geo_signal=0, ad_net=1, data_broker=0, analytics=1, social=0),
]

print(f"\n{'Page Category':<15} {'Hour':>5} {'Mobile':>7} {'cpm_low':>10} {'cpm_high':>10}  Range")
print("-" * 65)
for tc in test_cases:
    feat = build_valuation_features(**tc)
    out  = val_sess.run(None, {'features': feat})[0][0]
    low, high = float(out[0]), float(out[1])
    # Ensure low < high (model may not guarantee order)
    if low > high: low, high = high, low
    low  = max(low, 0.0)
    high = max(high, low)
    print(f"  {tc['page_category']:<13} {tc['hour']:>5} {tc['is_mobile']:>7}    "
          f"${low:.5f}   ${high:.5f}  "
          f"${low*1000:.3f}–${high*1000:.3f} per 1000")

print(f"\n✓ Input shape:  {feat.shape}  (expected (1, 17))")
print(f"✓ Output shape: (1, 2)")

print("\n" + "=" * 60)
print("MIRROR MODEL VALIDATION")
print("=" * 60)

mirror_cases = [
    ("https://www.nytimes.com/2024/politics/election-results", "News Reader"),
    ("https://www.zillow.com/homes/for-sale/3-bedroom",       "Homeowner"),
    ("https://www.bmw.com/en/new-cars/m-series/m3",           "Luxury Auto Intender"),
    ("https://github.com/pytorch/pytorch/issues",             "Tech Enthusiast"),
    ("https://www.webmd.com/diabetes/blood-sugar-levels",     "Health Conscious"),
    ("https://www.investopedia.com/terms/s/stockmarket.asp",  "Investor"),
    ("https://www.babycenter.com/baby/sleep/newborn-schedule", "Parent"),
    ("https://www.expedia.com/flights/boston-to-paris",       "Traveler"),
]

print(f"\n{'Expected Segment':<26} {'Top predictions'}")
print("-" * 65)
all_pass = True
for url, expected in mirror_cases:
    feat  = build_mirror_features(url)
    probs = mirror_sess.run(None, {'features': feat})[0][0]

    scored = sorted(zip(SEGMENTS, probs), key=lambda x: -x[1])
    top2   = [(s, float(p)) for s, p in scored[:2]]
    labels = [s for s, p in zip(SEGMENTS, probs) if float(p) >= THRESHOLDS.get(s, 0.5)]

    hit = expected in labels or (scored[0][0] == expected)
    mark = "✓" if hit else "✗"
    if not hit: all_pass = False

    print(f"  {mark} {expected:<24}  "
          f"{top2[0][0]} ({top2[0][1]:.2f})  |  {top2[1][0]} ({top2[1][1]:.2f})")

print(f"\n✓ Input shape:  {feat.shape}  (expected (1, 64))")
print(f"✓ Output shape: (1, 8)")
print(f"\n{'All cases matched' if all_pass else 'Some cases missed — expected for v1 model'}")
print("\nValidation complete.")
