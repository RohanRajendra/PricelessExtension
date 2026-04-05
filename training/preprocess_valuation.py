"""
preprocess_valuation.py

Builds training/valuation_dataset.csv from:
  - WhoTracksMe site_categories.csv  (site → category)
  - WhoTracksMe trackers-preview.json (site → tracker counts by type)

Each row = one (site, hour, device) combination.
Targets cpm_low and cpm_high are derived from IAB CPM benchmarks
adjusted by time-of-day and device-type multipliers, with ±15% noise.
"""

import json
import csv
import math
import random
import os

random.seed(42)

# ── Paths ─────────────────────────────────────────────────────────────────────
WHOTRACKSME_DIR = '/Users/harinithirunavukkarasan/Desktop/Workspace/whotracks.me/whotracksme/data/assets'
SITE_CATEGORIES  = os.path.join(WHOTRACKSME_DIR, 'site_categories.csv')
TRACKERS_PREVIEW = os.path.join(WHOTRACKSME_DIR, 'trackers-preview.json')
OUTPUT = os.path.join(os.path.dirname(__file__), 'valuation_dataset.csv')

# ── WhoTracksMe tracker category index mapping ────────────────────────────────
# Full list: ['advertising','audio_video_player','consent','customer_interaction',
#             'extensions','hosting','misc','pornvertising','site_analytics',
#             'social_media','utilities']
IDX_AD_NETWORK    = [0, 7]   # advertising + pornvertising
IDX_DATA_BROKER   = [3]      # customer_interaction
IDX_ANALYTICS     = [8]      # site_analytics
IDX_SOCIAL_PIXEL  = [9]      # social_media

# ── WhoTracksMe site category → internal page category ───────────────────────
# Internal page categories correspond to IAB verticals with distinct CPM ranges.
WTM_TO_PAGE_CATEGORY = {
    'Banking':          'finance',
    'Business':         'finance',
    'E-Commerce':       'shopping',
    'Entertainment':    'entertainment',
    'Health':           'health',
    'News and Portals': 'news',
    'Recreation':       'travel',
    'Political':        'news',
    'Government':       'news',
    'Reference':        'other',
    'Adult':            'other',
}

# ── CPM benchmarks (USD per 1000 impressions) by page category ───────────────
# Source: IAB Internet Advertising Revenue Reports + industry benchmarks.
# These are (low, high) ranges representing the confidence interval.
CPM_BENCHMARKS = {
    'finance':       (8.00, 15.00),
    'health':        (5.00, 10.00),
    'travel':        (4.00,  8.00),
    'shopping':      (3.00,  7.00),
    'tech':          (3.00,  6.00),
    'news':          (2.00,  5.00),
    'entertainment': (1.50,  4.00),
    'other':         (1.00,  3.00),
}

# ── Multipliers ───────────────────────────────────────────────────────────────
def time_multiplier(hour: int) -> float:
    """Prime-time evening has highest CPM. Overnight is lowest."""
    if 17 <= hour < 21: return 1.30   # prime time
    if  9 <= hour < 12: return 1.20   # mid-morning
    if 12 <= hour < 17: return 1.15   # afternoon
    if  6 <= hour <  9: return 1.10   # morning
    if 21 <= hour < 24: return 1.00   # night
    return 0.70                        # overnight 0–6

DEVICE_MULTIPLIER = {0: 1.00, 1: 0.75}  # desktop=1.0, mobile=0.75

def add_noise(value: float, pct: float = 0.15) -> float:
    return value * (1 + random.uniform(-pct, pct))

def hour_cyclical(hour: int):
    """Encode hour as two floats that preserve midnight-adjacency."""
    angle = 2 * math.pi * hour / 24
    return round(math.sin(angle), 6), round(math.cos(angle), 6)

# ── Load data ─────────────────────────────────────────────────────────────────
print("Loading site categories...")
site_to_category: dict[str, str] = {}
with open(SITE_CATEGORIES) as f:
    for row in csv.DictReader(f):
        site_to_category[row['site']] = row['category']

print(f"  {len(site_to_category):,} sites loaded")

print("Loading tracker data...")
with open(TRACKERS_PREVIEW) as f:
    tracker_data = json.load(f)

trackers: dict[str, list[int]] = tracker_data['trackers']
print(f"  {len(trackers):,} sites with tracker data")

# ── Generate rows ─────────────────────────────────────────────────────────────
HOURS_TO_SAMPLE = [0, 3, 6, 9, 11, 12, 15, 17, 19, 21, 23]

rows = []
skipped = 0

for site, counts in trackers.items():
    if len(counts) < 11:
        skipped += 1
        continue

    total_trackers = sum(counts)
    if total_trackers == 0:
        skipped += 1
        continue

    wtm_cat       = site_to_category.get(site, 'Unknown')
    page_category = WTM_TO_PAGE_CATEGORY.get(wtm_cat, 'other')

    ad_network_count   = sum(counts[i] for i in IDX_AD_NETWORK)
    data_broker_count  = sum(counts[i] for i in IDX_DATA_BROKER)
    analytics_count    = sum(counts[i] for i in IDX_ANALYTICS)
    social_pixel_count = sum(counts[i] for i in IDX_SOCIAL_PIXEL)

    # Tracker density: normalised to [0, 1], clipped at 30 max
    tracker_density = round(min(total_trackers, 30) / 30.0, 4)

    # Geo signal present if any data broker tracker detected
    has_geo_signal = 1 if data_broker_count > 0 else 0

    cpm_low_base, cpm_high_base = CPM_BENCHMARKS[page_category]

    for hour in HOURS_TO_SAMPLE:
        for is_mobile in [0, 1]:
            t_mult = time_multiplier(hour)
            d_mult = DEVICE_MULTIPLIER[is_mobile]

            # Per-impression value = CPM / 1000, with noise
            cpm_low  = add_noise(cpm_low_base  * t_mult * d_mult) / 1000.0
            cpm_high = add_noise(cpm_high_base * t_mult * d_mult) / 1000.0

            if cpm_low > cpm_high:
                cpm_low, cpm_high = cpm_high, cpm_low

            hour_sin, hour_cos = hour_cyclical(hour)

            rows.append({
                'page_category':    page_category,
                'tracker_density':  tracker_density,
                'hour_sin':         hour_sin,
                'hour_cos':         hour_cos,
                'is_mobile':        is_mobile,
                'has_geo_signal':   has_geo_signal,
                'ad_network_count':    ad_network_count,
                'data_broker_count':   data_broker_count,
                'analytics_count':     analytics_count,
                'social_pixel_count':  social_pixel_count,
                'cpm_low':  round(cpm_low,  6),
                'cpm_high': round(cpm_high, 6),
            })

random.shuffle(rows)

print(f"\nSites processed:  {len(trackers) - skipped:,}")
print(f"Sites skipped:    {skipped:,}")
print(f"Total rows:       {len(rows):,}")

# ── Write output ──────────────────────────────────────────────────────────────
FIELDNAMES = [
    'page_category', 'tracker_density', 'hour_sin', 'hour_cos',
    'is_mobile', 'has_geo_signal',
    'ad_network_count', 'data_broker_count', 'analytics_count', 'social_pixel_count',
    'cpm_low', 'cpm_high',
]

with open(OUTPUT, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nWrote → {OUTPUT}")

# ── Category distribution summary ─────────────────────────────────────────────
from collections import Counter
cat_counts = Counter(r['page_category'] for r in rows)
print("\nRows per page_category:")
for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
    print(f"  {cat:<14} {count:,}")
