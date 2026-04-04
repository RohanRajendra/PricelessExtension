// background/service-worker.js
// Integration hub — receives all messages from content scripts and popup,
// enriches tracker events, manages badge, and orchestrates the AI policy summary flow.

import { saveTrackerEvent, getEventsForDate, getCachedSummary } from '../utils/storage.js';
import { getTrackerValue, getTodayData } from '../utils/dollar-engine.js';
import { fetchPrivacyPolicyText, getPrivacySummary } from '../utils/claude-api.js';

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

        // Return cached result immediately if we have one
        const cached = await getCachedSummary(domain);
        if (cached) { sendResponse({ summary: cached }); break; }

        // Fetch policy text and summarize via Claude
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

/**
 * Enrich a raw tracker payload with dollar value, save it, and update the badge.
 */
async function handleTrackerDetected(payload, tab) {
  const estimatedValue = getTrackerValue(payload.domain, payload.category);

  await saveTrackerEvent({
    ...payload,
    estimatedValue,
  });

  if (tab?.id) {
    await updateBadge(tab.id, payload.date);
  }
}

/**
 * Update the extension badge with today's unique tracker count for the given tab.
 */
async function updateBadge(tabId, dateStr) {
  const events = await getEventsForDate(dateStr);
  const count = events.length;

  chrome.action.setBadgeText({
    text: count > 0 ? count.toString() : '',
    tabId,
  });
  chrome.action.setBadgeBackgroundColor({
    color: '#FF3B30',
    tabId,
  });
}
