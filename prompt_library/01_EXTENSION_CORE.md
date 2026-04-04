# Priceless — Extension Core Spec

## 1. manifest.json

Create a Manifest V3 `manifest.json` with the following requirements:

```json
{
  "manifest_version": 3,
  "name": "Priceless",
  "version": "1.0.0",
  "description": "You are the product. Here's your invoice.",
  "permissions": [
    "storage",
    "tabs",
    "webNavigation"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/tracker-detector.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "Priceless"
  },
  "web_accessible_resources": [
    {
      "resources": ["data/trackers.json", "data/tracker-values.json"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## 2. data/trackers.json

Create a condensed version of the Disconnect.me tracker list. This file maps known tracker domains to their category and parent company.

The structure should be:

```json
{
  "trackers": {
    "doubleclick.net": { "category": "AD_NETWORK", "parentCompany": "Google" },
    "googlesyndication.com": { "category": "AD_NETWORK", "parentCompany": "Google" },
    "googletagmanager.com": { "category": "ANALYTICS", "parentCompany": "Google" },
    "googletagservices.com": { "category": "AD_NETWORK", "parentCompany": "Google" },
    "google-analytics.com": { "category": "ANALYTICS", "parentCompany": "Google" },
    "googleadservices.com": { "category": "AD_NETWORK", "parentCompany": "Google" },
    "facebook.com": { "category": "SOCIAL_PIXEL", "parentCompany": "Meta" },
    "connect.facebook.net": { "category": "SOCIAL_PIXEL", "parentCompany": "Meta" },
    "facebook.net": { "category": "SOCIAL_PIXEL", "parentCompany": "Meta" },
    "instagram.com": { "category": "SOCIAL_PIXEL", "parentCompany": "Meta" },
    "amazon-adsystem.com": { "category": "AD_NETWORK", "parentCompany": "Amazon" },
    "advertising.com": { "category": "AD_NETWORK", "parentCompany": "Yahoo" },
    "scorecardresearch.com": { "category": "ANALYTICS", "parentCompany": "Comscore" },
    "quantserve.com": { "category": "DATA_BROKER", "parentCompany": "Quantcast" },
    "krxd.net": { "category": "DATA_BROKER", "parentCompany": "Salesforce" },
    "bluekai.com": { "category": "DATA_BROKER", "parentCompany": "Oracle" },
    "demdex.net": { "category": "DATA_BROKER", "parentCompany": "Adobe" },
    "omtrdc.net": { "category": "ANALYTICS", "parentCompany": "Adobe" },
    "2mdn.net": { "category": "AD_NETWORK", "parentCompany": "Google" },
    "adsystem.com": { "category": "AD_NETWORK", "parentCompany": "Unknown" },
    "adnxs.com": { "category": "AD_NETWORK", "parentCompany": "Xandr" },
    "pubmatic.com": { "category": "AD_NETWORK", "parentCompany": "PubMatic" },
    "rubiconproject.com": { "category": "AD_NETWORK", "parentCompany": "Magnite" },
    "openx.net": { "category": "AD_NETWORK", "parentCompany": "OpenX" },
    "criteo.com": { "category": "AD_NETWORK", "parentCompany": "Criteo" },
    "hotjar.com": { "category": "ANALYTICS", "parentCompany": "Hotjar" },
    "mixpanel.com": { "category": "ANALYTICS", "parentCompany": "Mixpanel" },
    "segment.io": { "category": "ANALYTICS", "parentCompany": "Twilio Segment" },
    "segment.com": { "category": "ANALYTICS", "parentCompany": "Twilio Segment" },
    "twitter.com": { "category": "SOCIAL_PIXEL", "parentCompany": "X (Twitter)" },
    "ads-twitter.com": { "category": "SOCIAL_PIXEL", "parentCompany": "X (Twitter)" },
    "t.co": { "category": "SOCIAL_PIXEL", "parentCompany": "X (Twitter)" },
    "linkedin.com": { "category": "SOCIAL_PIXEL", "parentCompany": "LinkedIn" },
    "licdn.com": { "category": "SOCIAL_PIXEL", "parentCompany": "LinkedIn" },
    "snap.com": { "category": "SOCIAL_PIXEL", "parentCompany": "Snapchat" },
    "sc-static.net": { "category": "SOCIAL_PIXEL", "parentCompany": "Snapchat" },
    "tiktok.com": { "category": "SOCIAL_PIXEL", "parentCompany": "TikTok" },
    "tiktokcdn.com": { "category": "SOCIAL_PIXEL", "parentCompany": "TikTok" },
    "acxiom.com": { "category": "DATA_BROKER", "parentCompany": "Acxiom" },
    "liveramp.com": { "category": "DATA_BROKER", "parentCompany": "LiveRamp" },
    "taboola.com": { "category": "AD_NETWORK", "parentCompany": "Taboola" },
    "outbrain.com": { "category": "AD_NETWORK", "parentCompany": "Outbrain" },
    "moatads.com": { "category": "ANALYTICS", "parentCompany": "Oracle" },
    "chartbeat.com": { "category": "ANALYTICS", "parentCompany": "Chartbeat" },
    "parsely.com": { "category": "ANALYTICS", "parentCompany": "Parse.ly" },
    "newrelic.com": { "category": "ANALYTICS", "parentCompany": "New Relic" },
    "indexexchange.com": { "category": "AD_NETWORK", "parentCompany": "Index Exchange" },
    "casalemedia.com": { "category": "AD_NETWORK", "parentCompany": "Index Exchange" },
    "sharethrough.com": { "category": "AD_NETWORK", "parentCompany": "Sharethrough" },
    "spotxchange.com": { "category": "AD_NETWORK", "parentCompany": "SpotX" }
  }
}
```

---

## 3. data/tracker-values.json

Maps domains and categories to per-visit dollar estimates.

```json
{
  "domains": {
    "doubleclick.net": 0.003,
    "googlesyndication.com": 0.003,
    "google-analytics.com": 0.0003,
    "googletagmanager.com": 0.0003,
    "googleadservices.com": 0.003,
    "connect.facebook.net": 0.004,
    "facebook.com": 0.004,
    "instagram.com": 0.004,
    "amazon-adsystem.com": 0.002,
    "criteo.com": 0.0015,
    "adnxs.com": 0.001,
    "quantserve.com": 0.0008,
    "bluekai.com": 0.0008,
    "demdex.net": 0.0008,
    "liveramp.com": 0.0008,
    "acxiom.com": 0.0008,
    "hotjar.com": 0.0003,
    "mixpanel.com": 0.0003,
    "segment.io": 0.0003,
    "ads-twitter.com": 0.001,
    "tiktok.com": 0.001,
    "licdn.com": 0.001,
    "taboola.com": 0.001,
    "outbrain.com": 0.001
  },
  "categoryDefaults": {
    "AD_NETWORK": 0.001,
    "DATA_BROKER": 0.0008,
    "ANALYTICS": 0.0003,
    "SOCIAL_PIXEL": 0.001
  },
  "parentCompanyMonthlyArpu": {
    "Google": 4.00,
    "Meta": 5.00,
    "Amazon": 2.90,
    "X (Twitter)": 0.80,
    "TikTok": 0.90,
    "LinkedIn": 1.20
  }
}
```

---

## 4. utils/storage.js

A clean wrapper around `chrome.storage.local`. All storage access in the app must go through this module — never call `chrome.storage.local` directly elsewhere.

```js
// utils/storage.js
// All functions are async and return Promises.

// Save a tracker event. Appends to the events array for that date.
export async function saveTrackerEvent(event) { }

// Get all tracker events for a given date string (YYYY-MM-DD)
export async function getEventsForDate(dateStr) { }

// Get all tracker events for the current calendar month
export async function getEventsForCurrentMonth() { }

// Get the cached AI summary for a domain, or null if not cached
export async function getCachedSummary(domain) { }

// Save an AI summary for a domain
export async function saveCachedSummary(domain, summary) { }

// Clear all stored data (for dev/testing)
export async function clearAllData() { }
```

**Storage key schema:**
- Events: `events_2026-04-04` → array of tracker event objects
- AI cache: `summary_nytimes.com` → string

**Important:** Before saving a tracker event, check if an event with the same `domain` and `parentSite` already exists for today. If it does, **do not save a duplicate.** One tracker per domain per site per day.

---

## 5. content/tracker-detector.js

This content script runs on every page. It detects which tracker domains make network requests and reports them to the background service worker.

**How to detect trackers in Manifest V3:**

Since content scripts can't directly intercept network requests, use `PerformanceObserver` to observe resource timing entries as they load. Match the resource URLs against the tracker list.

```js
// content/tracker-detector.js
// This script runs in the context of every web page.

(async () => {
  // 1. Load the tracker list from extension storage
  //    Use chrome.runtime.getURL to get the path to data/trackers.json
  //    Fetch it and parse it

  // 2. Extract the top-level domain of the current page (parentSite)
  //    e.g. "www.nytimes.com" → "nytimes.com"

  // 3. Set up a PerformanceObserver watching for "resource" entries
  //    For each resource URL:
  //      a. Extract its hostname
  //      b. Check if it matches any key in the tracker list
  //         (try exact match first, then check if hostname ENDS WITH any tracker domain)
  //      c. If match found, send a message to background service worker

  // 4. Also run once on existing performance entries (for resources that loaded before the observer started)

  // Message format to send to background:
  // chrome.runtime.sendMessage({
  //   type: "TRACKER_DETECTED",
  //   payload: {
  //     domain: "doubleclick.net",       // matched tracker domain
  //     category: "AD_NETWORK",
  //     parentCompany: "Google",
  //     parentSite: "nytimes.com",
  //     timestamp: Date.now(),
  //     date: "2026-04-04"
  //   }
  // })

  // 5. Deduplicate: track which domains have already been reported THIS page load
  //    in a local Set. Don't send the same domain twice per page load.
})();
```

**Domain matching logic:**
```js
// Given a URL hostname like "static.doubleclick.net"
// We want to match it against tracker domains like "doubleclick.net"
// Logic: for each tracker domain in the list, check if hostname === domain OR hostname.endsWith('.' + domain)
function matchTrackerDomain(hostname, trackerList) {
  for (const domain of Object.keys(trackerList)) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return { domain, ...trackerList[domain] };
    }
  }
  return null;
}
```

---

## 6. background/service-worker.js

Receives tracker events from content scripts, enriches them with dollar values, deduplicates, and saves them to storage.

```js
// background/service-worker.js

import { saveTrackerEvent } from '../utils/storage.js';
import { getTrackerValue } from '../utils/dollar-engine.js';

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRACKER_DETECTED') {
    handleTrackerDetected(message.payload, sender.tab);
  }
  // Must return true if sendResponse will be called asynchronously
  return true;
});

async function handleTrackerDetected(payload, tab) {
  // 1. Look up the dollar value for this tracker
  const estimatedValue = getTrackerValue(payload.domain, payload.category);

  // 2. Build the full tracker event object
  const event = {
    ...payload,
    estimatedValue,
  };

  // 3. Save to storage (storage.js handles deduplication)
  await saveTrackerEvent(event);

  // 4. Update the extension badge with today's tracker count for this tab
  await updateBadge(tab.id);
}

async function updateBadge(tabId) {
  // Get today's events, count unique tracker domains, show on badge
  // chrome.action.setBadgeText({ text: count.toString(), tabId })
  // chrome.action.setBadgeBackgroundColor({ color: '#FF3B30', tabId })
}
```