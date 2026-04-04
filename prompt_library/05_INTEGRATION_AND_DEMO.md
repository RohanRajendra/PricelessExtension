# Priceless — Integration, Testing & Demo Prep

## Service Worker — Full Message Handler

The background service worker needs to handle all message types from the popup and content scripts. This is the integration hub — implement all handlers here.

```js
// background/service-worker.js — complete message handler

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      // From content script: a tracker was detected on the page
      case 'TRACKER_DETECTED': {
        await handleTrackerDetected(message.payload, sender.tab);
        sendResponse({ ok: true });
        break;
      }

      // From content script: fetch and summarize the privacy policy for this domain
      case 'FETCH_POLICY_SUMMARY': {
        const { domain, baseUrl } = message.payload;
        // 1. Check cache first (getCachedSummary)
        // 2. If not cached: fetchPrivacyPolicyText(baseUrl)
        // 3. If text found: getPrivacySummary(domain, text)
        // 4. Cache and respond
        // 5. If anything fails: respond with null
        const cached = await getCachedSummary(domain);
        if (cached) { sendResponse({ summary: cached }); break; }

        const text = await fetchPrivacyPolicyText(baseUrl);
        if (!text) { sendResponse({ summary: null }); break; }

        const summary = await getPrivacySummary(domain, text);
        sendResponse({ summary });
        break;
      }

      // From popup: get all data needed to render the popup for a given domain
      case 'GET_PAGE_DATA': {
        const { domain } = message.payload;
        const { events, value } = await getTodayData(domain);
        const summary = await getCachedSummary(domain);
        sendResponse({ pageData: { events, value }, summary });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();

  return true; // Keep message channel open for async response
});
```

---

## Content Script — Full Implementation

After detecting trackers, the content script should also trigger the privacy policy fetch. Here is the complete flow:

```js
// content/tracker-detector.js — full implementation notes

// After the PerformanceObserver is set up and initial resources are scanned:
// 1. Wait 2 seconds (let the page settle and trackers fire)
// 2. Send FETCH_POLICY_SUMMARY message:

setTimeout(() => {
  const domain = window.location.hostname.replace('www.', '');
  const baseUrl = window.location.origin;

  chrome.runtime.sendMessage({
    type: 'FETCH_POLICY_SUMMARY',
    payload: { domain, baseUrl }
  });
}, 2000);
```

---

## Demo Seed Data

**Critical for the hackathon.** If a judge runs the extension on a fresh browser, there will be no monthly data. Seed realistic data so the dashboard always has something to show.

Create a file `utils/seed-data.js` that can be called once to populate storage with realistic demo data:

```js
// utils/seed-data.js
// Call this from a dev tools console or a test button in the dashboard EmptyState component.
// import { saveTrackerEvent } from './storage.js';

export async function seedDemoData() {
  const today = new Date();
  const sites = [
    { site: 'nytimes.com', trackers: ['doubleclick.net', 'connect.facebook.net', 'google-analytics.com', 'quantserve.com', 'scorecardresearch.com'] },
    { site: 'reddit.com', trackers: ['doubleclick.net', 'google-analytics.com', 'amazon-adsystem.com'] },
    { site: 'cnn.com', trackers: ['doubleclick.net', 'googlesyndication.com', 'connect.facebook.net', 'krxd.net', 'scorecardresearch.com', 'outbrain.com'] },
    { site: 'espn.com', trackers: ['doubleclick.net', 'googlesyndication.com', 'connect.facebook.net', 'adnxs.com'] },
    { site: 'weather.com', trackers: ['doubleclick.net', 'connect.facebook.net', 'amazon-adsystem.com', 'criteo.com', 'quantserve.com'] },
    { site: 'github.com', trackers: ['google-analytics.com'] },
    { site: 'linkedin.com', trackers: ['connect.facebook.net', 'google-analytics.com', 'ads-twitter.com', 'licdn.com'] },
    { site: 'youtube.com', trackers: ['doubleclick.net', 'googlesyndication.com', 'google-analytics.com'] },
  ];

  // Generate events spread across the current month
  const trackerData = /* load from trackers.json */ {};
  const daysInMonth = today.getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
    const dateStr = date.toISOString().split('T')[0];

    // Visit 3-5 random sites per day
    const dailySites = sites.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3) + 3);

    for (const { site, trackers } of dailySites) {
      for (const trackerDomain of trackers) {
        const trackerInfo = trackerData[trackerDomain] ?? { category: 'AD_NETWORK', parentCompany: 'Unknown' };
        const value = getTrackerValue(trackerDomain, trackerInfo.category);

        await saveTrackerEvent({
          domain: trackerDomain,
          category: trackerInfo.category,
          parentCompany: trackerInfo.parentCompany,
          parentSite: site,
          estimatedValue: value,
          timestamp: date.getTime(),
          date: dateStr,
        });
      }
    }
  }

  console.log('Priceless: Demo data seeded successfully.');
}
```

Add a **"Load Demo Data"** button to the `EmptyState` component in the dashboard that calls `seedDemoData()`. This is your safety net during the demo.

---

## Testing Checklist

Before the demo run, verify each of these manually:

### Extension Basics
- [ ] Extension loads in Chrome (`chrome://extensions` → Load unpacked)
- [ ] No errors in the service worker console
- [ ] Icon appears in the toolbar

### Tracker Detection
- [ ] Visit nytimes.com — badge count increases
- [ ] Visit reddit.com — different tracker count
- [ ] Visit a simple static site — badge shows 0 or low count
- [ ] Reload a page — count does NOT double (deduplication working)

### Popup
- [ ] Opens without error
- [ ] Price Tag view shows a dollar value for nytimes.com
- [ ] Category breakdown bar appears with colored segments
- [ ] Receipt view shows itemized tracker list
- [ ] Domain names on receipt are real (not undefined)
- [ ] Dollar values on receipt are non-zero
- [ ] Total matches sum of line items
- [ ] AI summary appears within 3–5 seconds on first visit, instantly on repeat visits
- [ ] "VIEW MONTHLY STATEMENT" button opens dashboard in new tab

### Dashboard
- [ ] Hero number is visible and non-zero
- [ ] Platform breakdown shows Google and Meta prominently
- [ ] Top sites list shows real sites visited
- [ ] "$0.00 received" is visible in red

### Edge Cases
- [ ] Opening popup on a chrome:// page shows graceful empty state
- [ ] Opening popup before any browsing shows graceful empty state
- [ ] Opening dashboard on fresh install shows Empty State with "Load Demo Data" button
- [ ] Rapidly visiting multiple sites doesn't crash the service worker

---

## Demo Script (2 Minutes — Practice This)

**Setup:** Have nytimes.com open in a tab before the demo starts. Have the dashboard preloaded with seed data.

```
[0:00] "Every time you open a browser, you walk into a marketplace.
        You are not the customer. You are the product."

[0:10] Click extension icon on nytimes.com.
       "Priceless shows you what you're actually worth — right now, on this page."
       Point to the price tag number. Let it land.

[0:20] "Fourteen trackers. Four ad networks. Two data brokers.
        All fired before you finished reading the headline."
       Expand to Receipt view.

[0:35] "And here's what they're collecting."
       Point to the AI summary — read it aloud slowly.

[0:45] "Now let's zoom out."
       Click VIEW MONTHLY STATEMENT.

[0:50] Dashboard opens. Hero number is center screen.
       "This month — $47. You received zero."
       Pause. Let the number breathe.

[1:00] Scroll to platform breakdown.
       "Google alone made eighteen dollars from your browsing this month.
        You use Google Search for free. Now you know the price."

[1:15] Point to top sites.
       "These are the five sites that sold you the most."

[1:25] "Priceless doesn't block anything. It doesn't change your behavior.
        It just shows you the receipt you were never meant to see.
        You've always been the product. Now you know the price."

[1:35] Q&A
```

---

## Anticipated Judge Questions & Answers

**"How accurate are the dollar figures?"**
> "They're estimates based on publicly reported ARPU data from Google and Meta's investor filings and IAB ad revenue benchmarks. We scale to per-visit values based on tracker density. We're transparent that these are estimates — but the point isn't the exact number. The point is the number exists, it's non-zero, and you never knew it."

**"How is this different from uBlock Origin?"**
> "uBlock blocks silently. You never know what was blocked or what it was worth. Priceless doesn't block anything — it witnesses. It shows you the receipt. The goal is to make the invisible economy of your data emotionally legible, not just technically blocked."

**"Does this extension collect your data?"**
> "No. Everything is stored locally on your device using Chrome's storage API. Nothing leaves your browser. We are not going to harvest your data to explain who's harvesting your data — that would make us the villain of our own story."

**"How does the AI summary work?"**
> "We fetch the site's privacy policy, strip the legalese, and use Claude to summarize it in one sentence. The result is cached locally so we never call the API twice for the same domain."

**"What would the next version look like?"**
> "The Dial — a graduated control that lets you decide how much of yourself to give away. Witness mode, where you just see everything. Whisper mode, where you block the worst actors. Fortress mode. Ghost mode. The point is that privacy should be a spectrum you control, not a binary decision someone else makes for you."
```