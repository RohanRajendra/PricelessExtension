## The Plan

# Priceless — Feature Breakdown & 24hr Work Split

**Team:** 3 people, balanced full-stack
**Demo must-haves:** Price Tag + Receipt · Monthly Statement · AI Policy Summarizer

---

## Role Assignment

| Person | Role | Focus Area |
| --- | --- | --- |
| **P1** | Extension Core | Manifest setup, tracker detection, data pipeline |
| **P2** | UI / Frontend | Popup, dashboard, receipt UI |
| **P3** | AI + Data | Dollar value logic, Claude API integration, tracker dataset |

> These aren't hard silos — P1 and P2 will need to sync on the data contract early. P3 feeds both.
> 

---

## Phase 0 — Setup (Hour 0–1)

*Everyone together. Do not skip this.*

- [ ]  Init Chrome Extension with Manifest V3 boilerplate
- [ ]  Set up React + Tailwind inside the extension popup
- [ ]  Agree on the **data contract** — what shape does a "tracker event" object look like?
- [ ]  Load and test Disconnect.me tracker list locally
- [ ]  Set up Claude API key and confirm it works with a test prompt
- [ ]  Create shared GitHub repo, agree on branch strategy

**Exit criteria:** Extension loads in Chrome. Tracker list is queryable. API call returns a response.

---

## Feature 1 — Tracker Detection Engine

**Owner: P1 | Estimated time: 4–5 hrs**

This is the foundation everything else builds on. Must be done first.

### Tasks

- [ ]  Write content script to intercept all outgoing network requests on every page
- [ ]  Match request URLs against Disconnect.me tracker list
- [ ]  Classify each tracker into one of 4 categories: `AD_NETWORK | DATA_BROKER | ANALYTICS | SOCIAL_PIXEL`
- [ ]  Emit a structured tracker event to the background service worker:

```json
{
  "domain": "doubleclick.net",
  "category": "AD_NETWORK",
  "parentSite": "nytimes.com",
  "timestamp": 1712345678
}
```

- [ ]  Store events in `chrome.storage.local`, keyed by date + domain
- [ ]  Write a helper to query: "give me all tracker events for today / this month"

### Dependencies

- Disconnect.me list must be bundled in the extension (P3 handles this)
- Data contract agreed in Phase 0

---

## Feature 2 — Dollar Value Engine

**Owner: P3 | Estimated time: 3–4 hrs**

Converts raw tracker events into dollar estimates. The math doesn't need to be perfect — it needs to be defensible and consistent.

### The Model (keep it simple)

Base the estimate on **ARPU (Average Revenue Per User)** for each platform, scaled down to a per-visit rate:

| Platform / Category | Annual ARPU | Per-month | Per-day | Per-visit est. |
| --- | --- | --- | --- | --- |
| Google (Ad Network) | ~$48 | ~$4.00 | ~$0.13 | ~$0.003 |
| Meta (Social Pixel) | ~$60 | ~$5.00 | ~$0.16 | ~$0.004 |
| Amazon (Ad Network) | ~$35 | ~$2.90 | ~$0.09 | ~$0.002 |
| Generic Data Broker | ~$12 | ~$1.00 | ~$0.03 | ~$0.001 |
| Generic Analytics | ~$5 | ~$0.42 | ~$0.01 | ~$0.0003 |

> Source basis: IAB Digital Ad Revenue reports, Meta/Google investor ARPUs. State this clearly in the demo.
> 

### Tasks

- [ ]  Build a `TrackerValueMap` — a lookup of known domains to their dollar-per-visit value
- [ ]  For unknown trackers, fall back to category average
- [ ]  Write `calculatePageValue(trackerEvents[])` → returns `{ total, breakdown[] }`
- [ ]  Write `calculateMonthlyValue()` → aggregates across all stored events for current month
- [ ]  Write `calculateByPlatform()` → groups monthly total by parent company (Google, Meta, etc.)
- [ ]  Export these as utility functions P1 and P2 can both import

### Key rule

If a tracker fires multiple times on one page, count it **once per page**. Avoid inflating numbers.

---

## Feature 3 — Price Tag + The Receipt (Popup UI)

**Owner: P2 | Estimated time: 4–5 hrs**

The popup that appears when you click the extension icon. Two views: the live page view and the receipt.

### View 1 — Live Price Tag (default popup state)

- Current page's estimated data value: **`$0.003`**
- Number of trackers detected on this page: **`14 trackers`**
- Breakdown bar showing category split (AD / BROKER / ANALYTICS / SOCIAL)
- One-line AI policy summary for this domain (feeds from Feature 4)

### View 2 — The Receipt (click to expand)

- Full itemized list of trackers fired on this page
- Each row: tracker name · category · parent company · estimated value
- Total at the bottom: `"This visit was worth $0.021 to advertisers"`
- Small footnote: `"Estimates based on IAB ARPU benchmarks. Actual values may vary."`

### Tasks

- [ ]  Build popup shell with React, two-view navigation (Price Tag ↔ Receipt)
- [ ]  Price Tag view — connect to `calculatePageValue()` from P3
- [ ]  Receipt view — render tracker list from P1's storage events
- [ ]  Category breakdown bar component (color-coded: red/orange/yellow/blue)
- [ ]  Style everything in Tailwind — dark theme, bold typography, receipt aesthetic (think thermal printer)
- [ ]  Handle loading state (trackers still being detected) and empty state (no trackers found)

### Design note

Lean into the **receipt visual metaphor** hard. Monospace font for the line items. A dashed border. A total line. Make it look like something you'd get from a gas station — because that's the energy. You're getting receipts you never asked for.

---

## Feature 4 — AI Policy Summarizer

**Owner: P3 | Estimated time: 3–4 hrs**

One-sentence plain English summary of what a site collects, powered by Claude.

### How it works

1. Content script checks if a privacy policy link exists on the current domain (look for `/privacy`, `/privacy-policy` in common locations)
2. If found, fetch a limited excerpt (first 2000 chars is enough)
3. Send to Claude API with a tight prompt
4. Display the result in the popup under the price tag

### Prompt (use this exactly)

```
You are a privacy policy analyst. Read the following excerpt from a website's privacy policy and respond with a single sentence (max 20 words) describing what personal data they collect and what they do with it. Be specific. No legal language.

Policy excerpt:
{text}
```

### Tasks

- [ ]  Content script: detect and fetch privacy policy URL for current domain
- [ ]  Strip HTML, extract plain text, trim to 2000 chars
- [ ]  Call Claude API with the prompt above
- [ ]  Cache the result in `chrome.storage.local` keyed by domain (don't re-call on every visit)
- [ ]  Expose result to popup via `chrome.runtime.sendMessage`
- [ ]  Handle fallback: if no policy found, show `"No privacy policy detected."`

### Important

Cache aggressively. You don't want an API call on every page load — call once per domain per session max.

---

## Feature 5 — Monthly Statement Dashboard

**Owner: P2 (UI) + P3 (data) | Estimated time: 3–4 hrs combined**

A full dashboard view — accessible from a button in the popup — showing the month-to-date picture.

### What it shows

- **Hero number:** `"This month, advertisers made an estimated $47.23 from your data. You received $0."`
- **By platform bar chart:** Google · Meta · Amazon · Other — horizontal bars, dollar values
- **By category donut/pie:** AD_NETWORK · DATA_BROKER · ANALYTICS · SOCIAL_PIXEL
- **Top 5 sites that exposed you most** this month (ranked by value extracted)
- **Total tracker count** for the month

### Tasks

**P3:**

- [ ]  `getMonthlyStatement()` — returns all data the dashboard needs in one object
- [ ]  Make sure it's fast (reads from local storage, no API calls)

**P2:**

- [ ]  Dashboard page (new tab or dedicated extension page)
- [ ]  Hero stat component — big, bold, impossible to ignore
- [ ]  Platform breakdown bar chart (use Recharts or hand-rolled SVG — keep it simple)
- [ ]  Top sites list component
- [ ]  Wire up to `getMonthlyStatement()` from P3

---

## Stretch — The Leaderboard of Shame

**Owner: P2 | Only if time allows after Hour 18**

- Shareable image card generated from the Monthly Statement
- "I was worth $47 to Big Tech this month" — styled like a receipt, downloadable as PNG
- Use `html2canvas` to screenshot the card

---

## 24-Hour Timeline

| Time | P1 (Extension Core) | P2 (UI / Frontend) | P3 (AI + Data) |
| --- | --- | --- | --- |
| **0–1hr** | Phase 0 setup together | Phase 0 setup together | Phase 0 setup together |
| **1–3hr** | Content script + request interception | Popup shell + routing | Tracker value map + ARPU model |
| **3–6hr** | Tracker classification + storage | Price Tag view UI | Dollar calculation functions |
| **6–9hr** | Storage query helpers | Receipt view UI | Privacy policy fetcher + Claude API |
| **9–12hr** | Integration: feed tracker events to popup | Connect UI to P1/P3 data | AI caching layer + `getMonthlyStatement()` |
| **12–14hr** | **Sync checkpoint — integration test everything end to end** |  |  |
| **14–17hr** | Bug fixes, edge cases | Monthly Statement dashboard UI | Data fixes, fill gaps in value map |
| **17–20hr** | Polish + stress test on real sites | Polish UI, dark theme, receipt aesthetic | Test AI summarizer on 10+ sites |
| **20–22hr** | **Full demo run-through as a team** |  |  |
| **22–24hr** | Buffer — fix whatever broke in the demo run | Buffer | Prepare pitch talking points |

---

## Critical Dependencies (don't let these block you)

| Dependency | Owned by | Needed by | When |
| --- | --- | --- | --- |
| Data contract (tracker event shape) | P1 | P2, P3 | Hour 1 |
| `calculatePageValue()` function | P3 | P2 (popup) | Hour 6 |
| Tracker events in storage | P1 | P2 (receipt view) | Hour 6 |
| `getMonthlyStatement()` | P3 | P2 (dashboard) | Hour 12 |
| Claude API response shape | P3 | P2 (popup display) | Hour 9 |

---

## Demo Script (2-minute version)

1. Open a fresh tab to **nytimes.com**
2. Show the extension icon badge lighting up with a tracker count
3. Click the icon — show the **Price Tag**: *"This page is worth $0.021 to advertisers"*
4. Expand to **The Receipt** — scroll through the itemized tracker list
5. Show the **AI Policy Summary**: *"They collect browsing history, location, and purchase intent, shared with 15 advertising partners."*
6. Open the **Monthly Statement** — hit the hero number hard
7. Close with the line: *"You've always been the product. Now you know the price."*

---

## How are we getting the dollar estimates

> "The numbers are based on publicly reported ARPU figures from Google and Meta's investor filings, and IAB digital ad revenue benchmarks. We scale those down to a per-visit estimate based on tracker density and page category. These are estimates — and we're transparent about that. But the point isn't the exact number. The point is that the number exists, it's non-zero, and you never knew it."
>