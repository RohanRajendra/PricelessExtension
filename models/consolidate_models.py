"""
consolidate_models.py

Post-processing step after training:
  1. Consolidates external .onnx.data files into single self-contained .onnx files
     (onnxruntime-web requires a single file — external data is not supported)
  2. Compresses mirror_lsa.json from 7.2MB to ~1.5MB by:
     - Rounding floats to 5 significant figures
     - Storing as a flat array with shape metadata

Run after train_valuation.py and train_mirror.py.
"""

import json
import os
import numpy as np
import onnx

BASE     = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE, 'data')
MDL_DIR  = os.path.join(BASE, 'models')

# ── 1. Consolidate ONNX external data into single files ──────────────────────
for name in ['valuation', 'mirror']:
    onnx_path      = os.path.join(DATA_DIR, f'{name}.onnx')
    data_path      = onnx_path + '.data'
    out_path       = onnx_path  # overwrite in-place

    if not os.path.exists(onnx_path):
        print(f"SKIP {name}.onnx — not found")
        continue

    print(f"Consolidating {name}.onnx...")
    model = onnx.load(onnx_path)  # loads and resolves external data automatically

    # Save back with all tensors inlined (location='' disables external data)
    onnx.save(model, out_path,
              save_as_external_data=False)

    # Remove the now-stale .data sidecar if it exists
    if os.path.exists(data_path):
        os.remove(data_path)
        print(f"  Removed {name}.onnx.data")

    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Saved → {out_path}  ({size_kb:.1f} KB)")

    # Quick ONNX validity check
    onnx.checker.check_model(out_path)
    print(f"  onnx.checker: PASSED")

# ── 2. Compress mirror_lsa.json ───────────────────────────────────────────────
lsa_in  = os.path.join(MDL_DIR, 'mirror_lsa.json')
lsa_out = os.path.join(DATA_DIR, 'mirror_lsa.json')   # goes to data/ for web access

if os.path.exists(lsa_in):
    print(f"\nCompressing mirror_lsa.json...")
    with open(lsa_in) as f:
        lsa = json.load(f)

    components = np.array(lsa['components'], dtype=np.float32)
    print(f"  Original shape: {components.shape}")

    # Round to 5 sig figs and store as flat list — reduces JSON ~75%
    flat = [round(float(v), 5) for v in components.flatten()]

    compressed = {
        'n_components': lsa['n_components'],
        'vocab_size':   lsa['vocab_size'],
        'shape':        list(components.shape),   # [64, 5000]
        'data':         flat,                     # flat row-major array
    }

    with open(lsa_out, 'w') as f:
        json.dump(compressed, f, separators=(',', ':'))  # no whitespace

    orig_mb = os.path.getsize(lsa_in)   / (1024 * 1024)
    new_mb  = os.path.getsize(lsa_out)  / (1024 * 1024)
    print(f"  {orig_mb:.1f} MB → {new_mb:.1f} MB  (saved {orig_mb - new_mb:.1f} MB)")
else:
    print(f"\nSKIP mirror_lsa.json — not found at {lsa_in}")

# ── 3. Copy remaining artefacts to data/ ─────────────────────────────────────
import shutil

for fname in ['mirror_vocab.json', 'mirror_thresholds.json',
              'valuation_scaler.json', 'valuation_categories.json']:
    src = os.path.join(MDL_DIR, fname)
    dst = os.path.join(DATA_DIR, fname)
    if os.path.exists(src):
        shutil.copy2(src, dst)
        size_kb = os.path.getsize(dst) / 1024
        print(f"Copied {fname} → data/  ({size_kb:.1f} KB)")
    else:
        print(f"SKIP {fname} — not found")

print("\nDone. All artefacts in data/:")
for f in sorted(os.listdir(DATA_DIR)):
    size = os.path.getsize(os.path.join(DATA_DIR, f)) / 1024
    print(f"  {f:<40} {size:>8.1f} KB")
