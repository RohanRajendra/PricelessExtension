# Priceless — Project Overview for Claude Code

## What You Are Building

A Chrome browser extension called **Priceless** that shows users the estimated dollar value of their personal data being collected as they browse the web. The tagline is: *"You are the product. Here's your invoice."*

This is a hackathon prototype. The goal is a working, demonstrable extension — not production-ready code. Prioritize working features over perfection.

---

## Core Concept

Every website a user visits fires third-party trackers — ad networks, data brokers, analytics tools, and social pixels. These companies collect behavioral data and monetize it. The user never sees this happening and never knows what their data is worth.

Priceless makes this visible by:
1. Detecting trackers on every page in real time
2. Estimating the dollar value of data collected, based on industry ARPU benchmarks
3. Presenting it as a receipt — itemized, running total, monthly statement
4. Using Claude AI to summarize the site's privacy policy in plain English

---

## Tech Stack

- **Chrome Extension** — Manifest V3
- **React 18** — UI inside the extension popup and dashboard
- **Tailwind CSS** — styling
- **chrome.storage.local** — all data stored locally, nothing sent to any server
- **Disconnect.me tracker list** — for tracker detection (bundled as JSON)
- **Claude API** (`claude-sonnet-4-20250514`) — privacy policy summarizer

---

## File Structure

```
priceless/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   └── tracker-detector.js
├── popup/
│   ├── index.html
│   ├── index.jsx
│   ├── App.jsx
│   └── views/
│       ├── PriceTag.jsx
│       └── Receipt.jsx
├── dashboard/
│   ├── index.html
│   ├── index.jsx
│   └── Dashboard.jsx
├── data/
│   ├── trackers.json          ← Disconnect.me list (condensed)
│   └── tracker-values.json   ← Dollar value map per domain/category
├── utils/
│   ├── dollar-engine.js      ← All dollar calculation functions
│   ├── storage.js            ← chrome.storage.local helpers
│   └── claude-api.js         ← Claude API call + caching
└── styles/
    └── tailwind.css
```

---

## Non-Negotiable Rules

1. **Zero data leaves the device.** No external API calls except the Claude API for privacy policy summarization. No analytics. No telemetry.
2. **All storage is `chrome.storage.local`.** Never `localStorage`. Never `sessionStorage`.
3. **Manifest V3 only.** No deprecated Manifest V2 APIs.
4. **Use `declarativeNetRequest` for any blocking** (not `webRequest` for blocking).
5. **Dollar estimates are transparent.** Every place a dollar figure is shown, include a small footnote: *"Estimate based on IAB ARPU benchmarks."*
6. **The extension must work on real sites.** Test mentally against nytimes.com, reddit.com, and cnn.com — these have heavy tracker loads and are good demo targets.

---

## Build Order

Build in this exact order. Each file depends on the previous ones.

1. `manifest.json`
2. `data/trackers.json` and `data/tracker-values.json`
3. `utils/storage.js`
4. `utils/dollar-engine.js`
5. `content/tracker-detector.js`
6. `background/service-worker.js`
7. `utils/claude-api.js`
8. Popup UI — `PriceTag.jsx` → `Receipt.jsx` → `App.jsx`
9. Dashboard UI — `Dashboard.jsx`

---

## Data Contract — Tracker Event Object

This is the single most important agreement in the codebase. Every module uses this shape.

```js
// A single tracker event — emitted when a tracker is detected on a page
{
  domain: "doubleclick.net",          // the tracker's domain
  category: "AD_NETWORK",            // AD_NETWORK | DATA_BROKER | ANALYTICS | SOCIAL_PIXEL
  parentCompany: "Google",           // human-readable parent (Google, Meta, Amazon, etc.)
  parentSite: "nytimes.com",         // the site the user was visiting
  estimatedValue: 0.003,             // dollar value for this tracker on this visit
  timestamp: 1712345678000,          // Unix ms timestamp
  date: "2026-04-04"                 // YYYY-MM-DD string for grouping
}
```

**Important rules:**
- If the same tracker domain fires multiple times on one page, record it **once only**
- `parentSite` is the top-level domain of the tab, not the tracker domain
- `estimatedValue` comes from the dollar engine, not from the content script

---

## Dollar Value Model

Estimates are based on ARPU (Average Revenue Per User) data from public sources, scaled to per-visit values.

| Category | Annual ARPU | Per-visit estimate |
|---|---|---|
| Google (Ad Network) | $48/yr | $0.003 |
| Meta (Social Pixel) | $60/yr | $0.004 |
| Amazon (Ad Network) | $35/yr | $0.002 |
| Generic AD_NETWORK | $20/yr | $0.001 |
| Generic DATA_BROKER | $12/yr | $0.0008 |
| Generic ANALYTICS | $5/yr | $0.0003 |
| Generic SOCIAL_PIXEL | $15/yr | $0.001 |

The dollar engine checks specific known domains first, then falls back to category averages.

---

## Instructions for Claude Code

- Read ALL overview and spec files before writing any code
- Follow the build order in this file
- Do not invent features not described in the spec files
- When in doubt, implement the simpler version
- Add code comments explaining non-obvious logic
- Every React component should have a clear, single responsibility
- Use functional components and hooks only — no class components