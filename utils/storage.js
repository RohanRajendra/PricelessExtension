// utils/storage.js
// All chrome.storage.local access must go through this module.
// All functions are async and return Promises.

// Storage key schema:
//   Events:    "events_2026-04-04" → array of tracker event objects
//   AI cache:  "summary_nytimes.com" → string

/**
 * Save a tracker event to storage for its date.
 * Deduplicates: one tracker domain per parentSite per day.
 * If an event with the same domain + parentSite already exists for today, it is not saved again.
 */
export async function saveTrackerEvent(event) {
  const key = `events_${event.date}`;
  const result = await chrome.storage.local.get(key);
  const events = result[key] || [];

  // Deduplicate: skip if same domain+parentSite already recorded today
  const alreadyExists = events.some(
    (e) => e.domain === event.domain && e.parentSite === event.parentSite
  );
  if (alreadyExists) return;

  events.push(event);
  await chrome.storage.local.set({ [key]: events });
}

/**
 * Get all tracker events for a given date string (YYYY-MM-DD).
 */
export async function getEventsForDate(dateStr) {
  const key = `events_${dateStr}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

/**
 * Get all tracker events for the current calendar month.
 * Iterates over each day of the current month and collects stored events.
 */
export async function getEventsForCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const keys = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    keys.push(`events_${dateStr}`);
  }

  const result = await chrome.storage.local.get(keys);
  const allEvents = [];
  for (const key of keys) {
    if (result[key]) {
      allEvents.push(...result[key]);
    }
  }
  return allEvents;
}

/**
 * Get the cached AI privacy policy summary for a domain, or null if not cached.
 */
export async function getCachedSummary(domain) {
  const key = `summary_${domain}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

/**
 * Save an AI privacy policy summary for a domain.
 */
export async function saveCachedSummary(domain, summary) {
  const key = `summary_${domain}`;
  await chrome.storage.local.set({ [key]: summary });
}

/**
 * Clear all stored extension data. For dev/testing only.
 */
export async function clearAllData() {
  await chrome.storage.local.clear();
}

// ===============================
// POLICY CHANGE DETECTION STORAGE
// ===============================

/**
 * Get the stored SHA-256 hash of a domain's privacy policy text, or null.
 */
export async function getPolicyHash(domain) {
  const result = await chrome.storage.local.get(`policy_hash_${domain}`);
  return result[`policy_hash_${domain}`] || null;
}

/**
 * Save the SHA-256 hash of a domain's privacy policy text.
 */
export async function savePolicyHash(domain, hash) {
  await chrome.storage.local.set({ [`policy_hash_${domain}`]: hash });
}

/**
 * Get the stored plain-English summary text for a domain (used as "before" context on change).
 */
export async function getPolicySummaryText(domain) {
  const result = await chrome.storage.local.get(`policy_text_${domain}`);
  return result[`policy_text_${domain}`] || null;
}

/**
 * Save the plain-English summary text for a domain.
 */
export async function savePolicySummaryText(domain, text) {
  await chrome.storage.local.set({ [`policy_text_${domain}`]: text });
}

// ===============================
// BLOCK MODE + SAVINGS STORAGE
// ===============================

/**
 * Get whether Block Mode is enabled
 */
export async function getBlockMode() {
  const result = await chrome.storage.local.get("blockModeEnabled");
  return result.blockModeEnabled || false;
}

/**
 * Set Block Mode state (true/false)
 */
export async function setBlockMode(enabled) {
  await chrome.storage.local.set({ blockModeEnabled: enabled });
}

/**
 * Get total blocked savings (in dollars)
 */
export async function getBlockedSavings() {
  const result = await chrome.storage.local.get("blockedSavings");
  return result.blockedSavings || 0;
}

/**
 * Increment blocked savings
 */
export async function addBlockedSavings(amount) {
  const current = await getBlockedSavings();
  const updated = current + amount;
  await chrome.storage.local.set({ blockedSavings: updated });
}

/**
 * Reset blocked savings (optional, useful for testing)
 */
export async function resetBlockedSavings() {
  await chrome.storage.local.set({ blockedSavings: 0 });
}