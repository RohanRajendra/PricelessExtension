// utils/dollar-engine.js
// Single source of truth for all dollar value calculations.
// Import and use these functions everywhere — never calculate values inline in components.

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
export function getTrackerValue(domain, category) {
  if (trackerValues.domains[domain] !== undefined) {
    return trackerValues.domains[domain];
  }
  return trackerValues.categoryDefaults[category] ?? 0;
}

/**
 * Calculate the total estimated value and breakdown for a given array of tracker events.
 * Used for the per-page receipt and the popup price tag.
 *
 * @param {TrackerEvent[]} events
 * @returns {{
 *   total: number,
 *   byCategory: { AD_NETWORK: number, DATA_BROKER: number, ANALYTICS: number, SOCIAL_PIXEL: number },
 *   trackerCount: number
 * }}
 */
export function calculatePageValue(events) {
  const byCategory = {
    AD_NETWORK: 0,
    DATA_BROKER: 0,
    ANALYTICS: 0,
    SOCIAL_PIXEL: 0,
  };

  let total = 0;

  for (const event of events) {
    const value = event.estimatedValue ?? 0;
    total += value;
    if (byCategory[event.category] !== undefined) {
      byCategory[event.category] += value;
    }
  }

  return {
    total: Math.round(total * 10000) / 10000,
    byCategory,
    trackerCount: events.length,
  };
}

/**
 * Calculate the monthly statement — all data needed for the dashboard.
 *
 * @returns {Promise<{
 *   totalValue: number,
 *   byPlatform: { [company: string]: number },
 *   byCategory: { [category: string]: number },
 *   topSites: [{ site: string, value: number }],
 *   totalTrackerEvents: number,
 *   uniqueTrackerDomains: number
 * }>}
 */
export async function getMonthlyStatement() {
  const events = await getEventsForCurrentMonth();

  const byPlatform = {};
  const byCategory = {};
  const bySite = {};
  const uniqueDomains = new Set();
  let totalValue = 0;

  for (const event of events) {
    const value = event.estimatedValue ?? 0;
    totalValue += value;

    // By platform (parent company)
    const company = event.parentCompany || 'Other';
    byPlatform[company] = (byPlatform[company] || 0) + value;

    // By category
    const cat = event.category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + value;

    // By site
    const site = event.parentSite || 'unknown';
    bySite[site] = (bySite[site] || 0) + value;

    uniqueDomains.add(event.domain);
  }

  // Top 5 sites by value, sorted descending
  const topSites = Object.entries(bySite)
    .map(([site, value]) => ({ site, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    totalValue: Math.round(totalValue * 10000) / 10000,
    byPlatform,
    byCategory,
    topSites,
    totalTrackerEvents: events.length,
    uniqueTrackerDomains: uniqueDomains.size,
  };
}

/**
 * Get today's tracker events and their calculated value.
 * Optionally filter by parentSite (for per-page popup view).
 *
 * @param {string} [parentSite] - filter to a specific site e.g. "nytimes.com"
 * @returns {Promise<{ events: TrackerEvent[], value: ReturnType<typeof calculatePageValue> }>}
 */
export async function getTodayData(parentSite) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let events = await getEventsForDate(dateStr);

  if (parentSite) {
    events = events.filter((e) => e.parentSite === parentSite);
  }

  return {
    events,
    value: calculatePageValue(events),
  };
}

/**
 * Format a dollar value for display.
 * Values < $0.01  → 4 decimal places  e.g. "$0.0030"
 * Values >= $0.01 → 2 decimal places  e.g. "$0.04"
 * Values >= $1.00 → 2 decimal places  e.g. "$4.20"
 *
 * @param {number} value
 * @returns {string}
 */
export function formatDollarValue(value) {
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Get the hex color associated with a tracker category.
 * Used consistently across all UI components.
 *
 * @param {string} category
 * @returns {string} hex color
 */
export function getCategoryColor(category) {
  const colors = {
    AD_NETWORK:   '#FF3B30', // red
    DATA_BROKER:  '#FF9500', // orange
    ANALYTICS:    '#FFCC00', // yellow
    SOCIAL_PIXEL: '#30D158', // green
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
