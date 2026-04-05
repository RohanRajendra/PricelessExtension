"""
preprocess_mirror.py

Builds training/mirror_dataset.csv from:
  - Curlie URL Classification.csv  (1.5M URLs with 15 categories)
  - synthetic_urls.csv             (hand-crafted URL paths per segment)

Mapping chain:
  Curlie category → IAB Tier 1 category → Mirror segment(s)

Output columns:
  url, domain, path, segments (pipe-separated Mirror segment labels), source
"""

import csv
import os
import random
from urllib.parse import urlparse
from collections import Counter

random.seed(42)

# ── Paths ─────────────────────────────────────────────────────────────────────
CURLIE_PATH    = '/Users/harinithirunavukkarasan/Downloads/URL Classification.csv'
SYNTHETIC_PATH = os.path.join(os.path.dirname(__file__), 'synthetic_urls.csv')
OUTPUT         = os.path.join(os.path.dirname(__file__), 'mirror_dataset.csv')

# ── Mirror segments (must match profile-engine.js exactly) ───────────────────
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
SEGMENT_SET = set(SEGMENTS)

# ── IAB Tier 1 → Mirror segment(s) ───────────────────────────────────────────
# Derived from IAB Content Taxonomy 3.1.
# A single IAB category can map to multiple Mirror segments (multi-label).
IAB_TO_SEGMENTS = {
    'Automotive':                  ['Luxury Auto Intender'],
    'Business and Finance':        ['Investor'],
    'Careers':                     ['Investor'],
    'Education':                   ['Tech Enthusiast'],
    'Family and Relationships':    ['Parent'],
    'Food & Drink':                [],                          # no matching segment
    'Healthy Living':              ['Health Conscious'],
    'Home & Garden':               ['Homeowner'],
    'Medical Health':              ['Health Conscious'],
    'Personal Finance':            ['Investor'],
    'Politics':                    ['News Reader'],
    'Real Estate':                 ['Homeowner'],
    'Science':                     ['Tech Enthusiast'],
    'Shopping':                    ['Luxury Auto Intender'],    # auto/luxury dominant
    'Sports':                      ['Health Conscious'],
    'Technology & Computing':      ['Tech Enthusiast'],
    'Travel':                      ['Traveler'],
    'Video Gaming':                ['Tech Enthusiast'],
    'Entertainment':               [],
    'Fine Art':                    [],
    'Hobbies & Interests':         ['Tech Enthusiast'],
    'Books and Literature':        ['News Reader'],
    'Pop Culture':                 [],
    'Religion & Spirituality':     [],
    'Pets':                        ['Parent'],
    'Attractions':                 ['Traveler'],
    'Holidays':                    ['Traveler'],
    'Events':                      [],
    'Genres':                      [],
    'Sensitive Topics':            [],
    'Crime':                       ['News Reader'],
    'Disasters':                   ['News Reader'],
    'War and Conflicts':           ['News Reader'],
    'Law':                         ['News Reader'],
    'Communication':               ['Tech Enthusiast'],
    'Personal Celebrations & Life Events': ['Parent'],
}

# ── Curlie category → IAB Tier 1 category ────────────────────────────────────
# Curlie uses DMOZ taxonomy (15 categories). Map each to the closest IAB Tier 1.
CURLIE_TO_IAB = {
    'Adult':      None,                      # skip
    'Arts':       'Entertainment',
    'Business':   'Business and Finance',
    'Computers':  'Technology & Computing',
    'Games':      'Video Gaming',
    'Health':     'Medical Health',
    'Home':       'Home & Garden',
    'Kids':       'Family and Relationships',
    'News':       'Politics',                # closest IAB for general news
    'Recreation': 'Travel',
    'Reference':  'Education',
    'Science':    'Science',
    'Shopping':   'Shopping',
    'Society':    'Family and Relationships',
    'Sports':     'Sports',
}

# ── Synthetic URL segment name → Mirror segment name ─────────────────────────
# The synthetic CSV may use slightly different names; normalise here.
SYNTHETIC_TO_SEGMENT = {
    'Automotive':             'Luxury Auto Intender',
    'Parent':                 'Parent',
    'Homeowner':              'Homeowner',
    'Health Conscious':       'Health Conscious',
    'Investor':               'Investor',
    'Traveler':               'Traveler',
    'Traveller':              'Traveler',
    'News Reader':            'News Reader',
    'Tech Enthusiast':        'Tech Enthusiast',
    'Luxury Auto Intender':   'Luxury Auto Intender',
    'Fashion':                None,    # not in our 8 segments
    'Gamer':                  'Tech Enthusiast',
    'Sports Fan':             'Health Conscious',
    'Student':                'Tech Enthusiast',
    'Foodie':                 None,
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def extract_domain_path(url: str):
    try:
        if not url.startswith('http'):
            url = 'http://' + url
        parsed = urlparse(url)
        domain = parsed.netloc.replace('www.', '').lower()
        path   = parsed.path or '/'
        return domain, path
    except Exception:
        return '', '/'

# ── Process Curlie ────────────────────────────────────────────────────────────
rows = []
curlie_skipped = 0

print("Processing Curlie dataset (1.5M rows)...")
with open(CURLIE_PATH, encoding='utf-8', errors='ignore') as f:
    reader = csv.reader(f)
    for i, row in enumerate(reader):
        if i == 0:
            # Skip header if present (first row is numeric ID for this dataset)
            if not row[0].strip().lstrip('-').isdigit():
                continue

        if len(row) < 3:
            curlie_skipped += 1
            continue

        url        = row[1].strip()
        curlie_cat = row[2].strip()

        iab_cat  = CURLIE_TO_IAB.get(curlie_cat)
        if iab_cat is None:
            curlie_skipped += 1
            continue

        segments = IAB_TO_SEGMENTS.get(iab_cat, [])
        if not segments:
            curlie_skipped += 1
            continue

        domain, path = extract_domain_path(url)
        if not domain:
            curlie_skipped += 1
            continue

        rows.append({
            'url':      url,
            'domain':   domain,
            'path':     path,
            'segments': '|'.join(segments),
            'source':   'curlie',
        })

        if i % 200_000 == 0 and i > 0:
            print(f"  {i:,} rows scanned, {len(rows):,} kept...")

print(f"\nCurlie done: {len(rows):,} kept, {curlie_skipped:,} skipped")

# ── Process synthetic URLs ────────────────────────────────────────────────────
synthetic_kept    = 0
synthetic_skipped = 0

if os.path.exists(SYNTHETIC_PATH):
    print(f"\nProcessing synthetic URLs from {SYNTHETIC_PATH}...")
    with open(SYNTHETIC_PATH, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_seg = row.get('segment', '').strip()
            url     = row.get('url', '').strip()

            if not raw_seg or not url:
                synthetic_skipped += 1
                continue

            segment = SYNTHETIC_TO_SEGMENT.get(raw_seg, raw_seg)
            if segment not in SEGMENT_SET:
                synthetic_skipped += 1
                continue

            domain, path = extract_domain_path(url)
            # Synthetic paths may not have a domain — use path directly
            if not domain:
                domain = 'synthetic'
            if not path or path == '/':
                path = url

            rows.append({
                'url':      url,
                'domain':   domain,
                'path':     path,
                'segments': segment,
                'source':   'synthetic',
            })
            synthetic_kept += 1

    print(f"Synthetic: {synthetic_kept} kept, {synthetic_skipped} skipped")
else:
    print(f"\nWARNING: synthetic_urls.csv not found at {SYNTHETIC_PATH}")
    print("  Regenerate it — the file currently has too few rows.")
    print("  Prompt to use (paste into Claude.ai):")
    print("""
  For each of these 8 audience segments:
  Parent, Homeowner, Luxury Auto Intender, Health Conscious,
  Investor, Traveler, News Reader, Tech Enthusiast

  Generate 200 realistic URL paths a user in that segment would visit.
  Format: CSV with two columns — segment,url_path
  Example: Parent,/best-strollers-2024
  One row per line, include header row.
""")

# ── Shuffle and write ─────────────────────────────────────────────────────────
random.shuffle(rows)

FIELDNAMES = ['url', 'domain', 'path', 'segments', 'source']
with open(OUTPUT, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nTotal rows written: {len(rows):,}")
print(f"Output → {OUTPUT}")

# ── Segment distribution ──────────────────────────────────────────────────────
seg_counts: Counter = Counter()
for r in rows:
    for s in r['segments'].split('|'):
        seg_counts[s] += 1

print("\nLabel distribution:")
for seg in SEGMENTS:
    print(f"  {seg:<25} {seg_counts.get(seg, 0):>8,}")
