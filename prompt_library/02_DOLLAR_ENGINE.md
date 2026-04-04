# Priceless — Dollar Engine & Claude API Spec

## 1. utils/dollar-engine.js

This module contains all dollar value calculation logic. It is the single source of truth for any number with a `$` sign in the app. Import and use these functions everywhere — never calculate values inline in components.

```js
// utils/dollar-engine.js

import trackerValues from '../data/tracker-values.json';
import { getEventsForDate, getEventsForCurrentMonth } from './storage.js';

/**
 * Get the estimated dollar value for a single tracker domain + category.
 * Checks specific domain first, falls back to category default.
 *
 * @param {string} domain - e.g. "doubleclick.net"
 * @param {string} category - e.g. "AD_NETWORK"
 * @returns {number} - dollar value e.g. 0.003
 */
export function getTrackerValue(domain, category) { }

/**
 * Calculate the total estimated value and breakdown for a given array of tracker events.
 * Used for the per-page receipt and the popup price tag.
 *
 * @param {TrackerEvent[]} events
 * @returns {{
 *   total: number,                        // total dollar value, rounded to 4 decimal places
 *   byCategory: {                         // breakdown by category
 *     AD_NETWORK: number,
 *     DATA_BROKER: number,
 *     ANALYTICS: number,
 *     SOCIAL_PIXEL: number
 *   },
 *   trackerCount: number                  // total number of unique trackers
 * }}
 */
export function calculatePageValue(events) { }

/**
 * Calculate the monthly statement — all data needed for the dashboard.
 * Reads from storage internally.
 *
 * @returns {Promise<{
 *   totalValue: number,                   // total $ this month
 *   byPlatform: { [company: string]: number },  // e.g. { Google: 12.4, Meta: 8.2 }
 *   byCategory: { [category: string]: number }, // e.g. { AD_NETWORK: 15.1, ... }
 *   topSites: [{ site: string, value: number }], // top 5 sites by value extracted, sorted desc
 *   totalTrackerEvents: number,           // total tracker events this month
 *   uniqueTrackerDomains: number          // unique tracker domains seen this month
 * }>}
 */
export async function getMonthlyStatement() { }

/**
 * Get today's tracker events and their calculated value.
 * Used by the popup to show current-page data.
 * Filters by parentSite if provided.
 *
 * @param {string} [parentSite] - filter to a specific site e.g. "nytimes.com"
 * @returns {Promise<{ events: TrackerEvent[], value: ReturnType<calculatePageValue> }>}
 */
export async function getTodayData(parentSite) { }

/**
 * Format a dollar value for display.
 * Values < $0.01 → "$0.003" (4 decimal places)
 * Values >= $0.01 → "$0.04" (2 decimal places)
 * Values >= $1.00 → "$4.20" (2 decimal places)
 *
 * @param {number} value
 * @returns {string}
 */
export function formatDollarValue(value) { }

/**
 * Get the color associated with a tracker category.
 * Used consistently across all UI components.
 *
 * @param {string} category
 * @returns {string} - Tailwind color class or hex
 */
export function getCategoryColor(category) {
  const colors = {
    AD_NETWORK:   '#FF3B30',  // red
    DATA_BROKER:  '#FF9500',  // orange
    ANALYTICS:    '#FFCC00',  // yellow
    SOCIAL_PIXEL: '#30D158',  // green
  };
  return colors[category] || '#8E8E93';
}

/**
 * Get a human-readable label for a tracker category.
 *
 * @param {string} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  const labels = {
    AD_NETWORK:   'Ad Network',
    DATA_BROKER:  'Data Broker',
    ANALYTICS:    'Analytics',
    SOCIAL_PIXEL: 'Social Pixel',
  };
  return labels[category] || category;
}
```

---

## 2. utils/claude-api.js

Calls the Claude API to summarize a site's privacy policy in plain English. Results are cached in `chrome.storage.local` — never call the API twice for the same domain.

```js
// utils/claude-api.js

import { getCachedSummary, saveCachedSummary } from './storage.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// IMPORTANT: For the hackathon prototype, the API key is hardcoded here.
// In production this would never be done — it would live server-side.
const API_KEY = '__PASTE_API_KEY_HERE__';

const SYSTEM_PROMPT = `You are a privacy policy analyst. Your job is to read excerpts from website privacy policies and explain them in plain English to everyday users.

Rules:
- Respond with exactly ONE sentence, maximum 25 words
- Be specific about what data is collected and what happens to it
- Use plain language — no legal terms
- If the excerpt doesn't contain enough information, say: "Policy details unclear from available text."
- Never say "I" or "the policy states" — just state the facts directly

Example good responses:
- "They collect your browsing history, location, and purchase behavior, then sell it to over 40 advertising partners."
- "They track which pages you visit and share that data with Google and Meta for ad targeting."
- "They collect your email and usage patterns to send targeted ads and share with third-party analytics firms."`;

/**
 * Get a plain-English summary of a domain's privacy policy.
 * Returns cached result if available. Otherwise fetches and calls Claude.
 *
 * @param {string} domain - e.g. "nytimes.com"
 * @param {string} policyText - raw text from the privacy policy page (max 3000 chars used)
 * @returns {Promise<string>} - one sentence summary
 */
export async function getPrivacySummary(domain, policyText) {
  // 1. Check cache first
  const cached = await getCachedSummary(domain);
  if (cached) return cached;

  // 2. Trim policy text to 3000 chars to stay within token limits
  const trimmedText = policyText.slice(0, 3000);

  // 3. Call Claude API
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Privacy policy excerpt:\n\n${trimmedText}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.content[0]?.text?.trim() ?? 'Unable to summarize policy.';

    // 4. Cache and return
    await saveCachedSummary(domain, summary);
    return summary;

  } catch (err) {
    console.error('Priceless: Claude API call failed', err);
    return 'Unable to retrieve privacy policy summary.';
  }
}

/**
 * Attempt to find and fetch the privacy policy for the current page's domain.
 * Called from the content script context via chrome.runtime.sendMessage.
 *
 * Tries common privacy policy URL patterns:
 * /privacy, /privacy-policy, /legal/privacy, /policies/privacy
 *
 * @param {string} baseUrl - e.g. "https://www.nytimes.com"
 * @returns {Promise<string|null>} - plain text of the policy, or null if not found
 */
export async function fetchPrivacyPolicyText(baseUrl) {
  const paths = [
    '/privacy',
    '/privacy-policy',
    '/legal/privacy',
    '/policies/privacy',
    '/about/privacy',
    '/legal/privacy-policy',
  ];

  for (const path of paths) {
    try {
      const res = await fetch(baseUrl + path, {
        method: 'GET',
        signal: AbortSignal.timeout(4000), // don't wait more than 4 seconds
      });
      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags to get plain text
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length > 200) return plain; // must have meaningful content
      }
    } catch {
      // try next path
    }
  }

  return null;
}
```

---

## How the AI Feature Flows End-to-End

This is the full flow from page load to summary appearing in the popup. Implement it exactly in this order.

```
1. User visits nytimes.com
2. content/tracker-detector.js fires
3. After trackers are detected, the content script also sends a message:
   chrome.runtime.sendMessage({ type: 'FETCH_POLICY_SUMMARY', payload: { domain: 'nytimes.com', baseUrl: 'https://www.nytimes.com' } })
4. background/service-worker.js receives this message
5. Service worker calls fetchPrivacyPolicyText('https://www.nytimes.com')
6. Service worker calls getPrivacySummary('nytimes.com', policyText)
7. Summary is cached in chrome.storage.local as 'summary_nytimes.com'
8. When popup opens, it requests the summary via chrome.runtime.sendMessage({ type: 'GET_SUMMARY', payload: { domain: 'nytimes.com' } })
9. Service worker retrieves from cache and sends back
10. Popup displays the summary
```

**Fallback:** If no policy is found or the API fails, display: *"Privacy policy unavailable."* Never show an error state — just this neutral string.