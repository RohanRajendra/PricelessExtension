// background/service-worker.js
// Integration hub — receives all messages from content scripts and popup,
// enriches tracker events, manages badge, and orchestrates the AI policy summary flow.

import {
  saveTrackerEvent,
  getEventsForDate,
  getCachedSummary,
  getBlockMode,
  setBlockMode,
  getBlockedSavings,
  addBlockedSavings,
} from '../utils/storage.js';

import { getTrackerValue, getTodayData } from '../utils/dollar-engine.js';
import { fetchPrivacyPolicyText, getPrivacySummary } from '../utils/claude-api.js';

const DNR_RULE_ID_START = 1000;
let blockedRuleValueMap = new Map();

/**
 * Load tracker definitions from extension data.
 */
async function loadTrackers() {
  const url = chrome.runtime.getURL('data/trackers.json');
  const response = await fetch(url);
  const data = await response.json();

  // 🔥 convert your map → array format expected by rest of code
  const trackersArray = Object.entries(data.trackers || {}).map(
    ([domain, info]) => ({
      domains: [domain],
      category: info.category || 'Advertising',
      parentCompany: info.parentCompany || 'Unknown',
    })
  );

  return trackersArray;
}

/**
 * Build dynamic DNR block rules from tracker definitions.
 */
async function buildDynamicBlockRules() {
  const trackers = await loadTrackers();
  blockedRuleValueMap = new Map();

  const rules = [];
  let ruleId = DNR_RULE_ID_START;

  for (const tracker of trackers) {
    const domains = tracker.domains || [];
    const category = tracker.category || 'Advertising';

    for (const domain of domains) {
      if (!domain) continue;

      const estimatedValue = getTrackerValue(domain, category);

      blockedRuleValueMap.set(ruleId, {
        domain,
        category,
        estimatedValue,
      });

      rules.push({
        id: ruleId,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: [
            'script',
            'image',
            'xmlhttprequest',
            'sub_frame',
            'ping',
            'font',
            'media',
            'stylesheet',
            'other',
          ],
        },
      });

      ruleId++;
    }
  }

  return rules;
}

/**
 * Enable block mode by replacing all current dynamic rules
 * with tracker-domain blocking rules.
 */
async function enableBlockMode() {
  const rules = await buildDynamicBlockRules();

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRuleIds,
    addRules: rules,
  });

  await setBlockMode(true);
}

/**
 * Disable block mode by removing all dynamic rules.
 */
async function disableBlockMode() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map((rule) => rule.id);

  if (existingRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
    });
  }

  blockedRuleValueMap = new Map();
  await setBlockMode(false);
}

/**
 * Ensure the service worker applies the correct rule state
 * after startup/reload.
 */
async function syncBlockModeState() {
  const enabled = await getBlockMode();

  if (enabled) {
    await enableBlockMode();
  } else {
    await disableBlockMode();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  syncBlockModeState().catch(console.error);
});

chrome.runtime.onStartup?.addListener(() => {
  syncBlockModeState().catch(console.error);
});

/**
 * Debug-only feedback event for matched DNR rules.
 * Works great for unpacked/dev mode and is enough for your hackathon demo.
 */
if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const ruleId = info.rule?.ruleId;
    if (!ruleId) return;

    if (blockedRuleValueMap.size === 0) {
      await buildDynamicBlockRules();
    }

    const ruleMeta = blockedRuleValueMap.get(ruleId);
    if (!ruleMeta) return;

    await addBlockedSavings(ruleMeta.estimatedValue || 0);
  });
}

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
        try {
          const { domain, baseUrl } = message.payload;

          const cached = await getCachedSummary(domain);
          if (cached) {
            sendResponse({ summary: cached });
            break;
          }

          const text = await fetchPrivacyPolicyText(baseUrl);
          if (!text) {
            sendResponse({ summary: null });
            break;
          }

          const summary = await getPrivacySummary(domain, text);
          sendResponse({ summary });
        } catch (error) {
          console.error('Policy summary failed:', error);
          sendResponse({ summary: null });
        }
        break;
      }

      // From popup: get all data needed to render the popup for a given domain
      case 'GET_PAGE_DATA': {
        const { domain } = message.payload;
        const { events, value } = await getTodayData(domain);
        const summary = await getCachedSummary(domain);
        const blockModeEnabled = await getBlockMode();
        const blockedSavings = await getBlockedSavings();

        sendResponse({
          pageData: { events, value },
          summary,
          blockModeEnabled,
          blockedSavings,
        });
        break;
      }

      // From popup: get current block mode state
      case 'GET_BLOCK_MODE': {
        const enabled = await getBlockMode();
        const blockedSavings = await getBlockedSavings();
        sendResponse({ enabled, blockedSavings });
        break;
      }

      // From popup: turn block mode on/off
      case 'SET_BLOCK_MODE': {
        const { enabled } = message.payload;

        if (enabled) {
          await enableBlockMode();
        } else {
          await disableBlockMode();
        }

        const blockedSavings = await getBlockedSavings();
        sendResponse({ ok: true, enabled, blockedSavings });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })().catch((error) => {
    console.error('Service worker error:', error);
    sendResponse({ error: error.message || 'Unexpected error' });
  });

  return true;
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