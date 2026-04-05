# Priceless

> **You are the product. Here's your invoice.**

A Chrome extension that puts a real dollar figure on your data in real time, shows you the receipt you were never meant to see, exposes what your privacy policy actually does, and reconstructs the audience profile advertisers have built on you.

*Built for SharkHack 2026 — Code Against the Machine*

---

## The Problem

Every time you open a browser, you walk into a marketplace. You are not the customer. You are the product — packaged, priced, and sold to the highest bidder before the page even finishes loading.

Ad networks, data brokers, and surveillance platforms have spent decades building an economy around your behavior. They know exactly what you're worth. They've assigned you a price. They buy and sell access to you every single day.

And they never told you.

Privacy tools today either block trackers silently or bury you in technical warnings. None of them answer the one question that actually makes people feel something:

> **How much am I worth to them?**

---

## Features

### Your Price Tag
The centerpiece. A real-time dollar figure as you browse — your estimated worth to the ad economy on this page, today, this month. Not a score. Not a warning. A number with a dollar sign and a running total.

### The Receipt
Every tracker on every page, itemized like a bill. Domain, parent company, category (Ad Network / Data Broker / Analytics / Social Pixel), and estimated value extracted. Sorted by highest value first. The invoice they never sent you.

### The Monthly Statement
A full-screen dashboard showing your month-to-date extraction:
- **Total value extracted** with ML confidence interval range
- **Projected annual extraction** scaled from your current browsing pace
- **By platform** — Google, Meta, Amazon, and the rest, with bar chart
- **By type** — segmented color bar across tracker categories
- **Top sites that sold you** — your personal leaderboard of shame
- **Consumer equivalents** — translates your data value into ChatGPT months, Netflix subscriptions, coffee cups
- **Exposure tier** — Low / Moderate / High / Extreme, based on annualized extraction

### The Mirror
Reconstructs the audience profile ad systems have built on you from your browsing history — without sending your data anywhere. Shows confidence scores and the sites that produced each signal.

> *"Based on your browsing, ad systems may classify you as: Luxury Shopper (84%) · Tech Enthusiast (71%)"*

### AI Policy Intelligence
Claude reads the site's privacy policy so you don't have to, then cross-references it against what's actually happening:

- **Plain English summary** — one sentence, no legalese
- **Contradiction alerts** — flags when a policy claims "we don't track you" while ad network trackers are actively firing on the page
- **Policy change detection** — hashes the policy text on every visit; alerts you when it changes and summarizes what got worse
- **Consent theater scoring** — detects dark patterns in cookie consent banners (pre-ticked boxes, buried reject options, fake "legitimate interest" flows) and scores them 0–100

### Block Mode
One toggle. Switches Chrome's `declarativeNetRequest` rules to block all known tracker domains. Shows you how much value you've denied the ad economy since enabling it.

---

## Tech Stack

### Extension Architecture
- **Chrome Manifest V3** — content scripts, background service worker, `declarativeNetRequest`
- **React + Tailwind CSS** — popup and dashboard UI
- **Vite** — build system with static asset copying for WASM and model files

### Tracker Detection
- **WhoTracksMe dataset** — open-source tracker registry with parent company mappings
- Custom categorization: Ad Networks, Data Brokers, Analytics, Social Pixels
- `PerformanceObserver` + resource timing for MV3-compatible detection (no webRequest)

### ML-Powered Valuation (ONNX, runs locally)
- **PyTorch regression model** trained on WhoTracksMe tracker density data + IAB CPM benchmarks
- 17 input features: page category (8-class OHE), time-of-day cyclical encoding, device type, geo signal, tracker type counts
- Outputs a **confidence interval** (low / mid / high) per tracker event
- Exported to ONNX and runs entirely in the service worker via **ONNX Runtime Web (WASM)**
- Static `tracker-values.json` fallback when model inference fails

### ML-Powered Profile Reconstruction (ONNX, runs locally)
- **PyTorch multi-label classifier** trained on 1.27M URL samples (Curlie dataset + synthetic URLs)
- URL tokenization → Bag-of-Words → **LSA (TruncatedSVD)** dimensionality reduction → 64-dim vector
- 8 output segments mapped from IAB Content Taxonomy 3.1: Luxury Shopper, Tech Enthusiast, News Reader, Health & Wellness, Finance-Minded, Travel Planner, Entertainment Fan, Sports Fan
- Weighted BCE loss to handle class imbalance; per-class confidence thresholds
- Keyword-matching fallback preserved for low-signal sessions

### AI Policy Intelligence
- **Claude API** (`claude-sonnet-4`) — privacy policy analysis with structured JSON output
- **SHA-256 hash** (Web Crypto API) of policy text for change detection across visits
- DOM-based consent theater scorer runs in the content script before policy fetch
- Fully cached in `chrome.storage.local` — Claude is only called when policy changes or on first visit

### Storage
- **`chrome.storage.local`** — all tracker events, model outputs, policy cache, and user settings
- **Zero data leaves the device.** No analytics. No sync. No server.

---

## The Pitch

For decades, surveillance capitalism has had a dirty secret: you are not the user, you are the product. Every search, every scroll, every click has been packaged and sold — and they've always known your price. Priceless tears that open. It's a browser extension that puts a real dollar figure on your data in real time, shows you the receipt you were never meant to see, reconstructs the audience profile built on your browsing history, and catches sites lying about what they do with your data. Not a blocker. Not a warning. A reckoning.

---

*SharkHack 2026 · Off-Grid Track · Privacy, security, and digital autonomy*
