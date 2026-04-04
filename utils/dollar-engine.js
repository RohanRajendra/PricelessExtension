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
 * Get annual projection from current month total and elapsed days.
 *
 * @param {number} monthTotal
 * @returns {number}
 */
export function getAnnualProjection(monthTotal) {
  const today = new Date();
  const elapsedDays = today.getDate(); // 1..31
  if (!elapsedDays || monthTotal <= 0) return 0;

  const projected = (monthTotal / elapsedDays) * 365;
  return Math.round(projected * 100) / 100;
}

/**
 * Convert a dollar amount into relatable consumer equivalents.
 *
 * @param {number} amount
 * @returns {{
 *   chatgptMonths: number,
 *   netflixMonths: number,
 *   spotifyMonths: number,
 *   coffeeCups: number
 * }}
 */
export function getConsumerEquivalents(amount) {
  const benchmarks = {
    chatgptPlusMonthly: 20,
    netflixMonthly: 15.49,
    spotifyMonthly: 11.99,
    coffee: 5,
  };

  return {
    chatgptMonths: Math.floor(amount / benchmarks.chatgptPlusMonthly),
    netflixMonths: Math.floor(amount / benchmarks.netflixMonthly),
    spotifyMonths: Math.floor(amount / benchmarks.spotifyMonthly),
    coffeeCups: Math.floor(amount / benchmarks.coffee),
  };
}

/**
 * Bucket annual extraction into an exposure tier.
 *
 * @param {number} annualValue
 * @returns {{ label: string, description: string, color: string }}
 */
export function getExposureTier(annualValue) {
  if (annualValue < 100) {
    return {
      label: 'Low Exposure',
      description: 'Your current browsing pattern shows relatively limited monetization.',
      color: '#30D158',
    };
  }

  if (annualValue < 300) {
    return {
      label: 'Moderate Exposure',
      description: 'Your browsing behavior is generating meaningful commercial value.',
      color: '#FFCC00',
    };
  }

  if (annualValue < 700) {
    return {
      label: 'High Exposure',
      description: 'Advertisers and brokers are extracting substantial value from your activity.',
      color: '#FF9500',
    };
  }

  return {
    label: 'Extreme Exposure',
    description: 'Your browsing pattern is highly monetizable across the ad-tech ecosystem.',
    color: '#FF3B30',
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
 *   uniqueTrackerDomains: number,
 *   annualProjection: number,
 *   consumerEquivalents: {
 *     chatgptMonths: number,
 *     netflixMonths: number,
 *     spotifyMonths: number,
 *     coffeeCups: number
 *   },
 *   exposureTier: {
 *     label: string,
 *     description: string,
 *     color: string
 *   }
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

    const company = event.parentCompany || 'Other';
    byPlatform[company] = (byPlatform[company] || 0) + value;

    const cat = event.category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + value;

    const site = event.parentSite || 'unknown';
    bySite[site] = (bySite[site] || 0) + value;

    uniqueDomains.add(event.domain);
  }

  const roundedTotal = Math.round(totalValue * 10000) / 10000;

  const topSites = Object.entries(bySite)
    .map(([site, value]) => ({ site, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const annualProjection = getAnnualProjection(roundedTotal);
  const consumerEquivalents = getConsumerEquivalents(annualProjection);
  const exposureTier = getExposureTier(annualProjection);

  return {
    totalValue: roundedTotal,
    byPlatform,
    byCategory,
    topSites,
    totalTrackerEvents: events.length,
    uniqueTrackerDomains: uniqueDomains.size,
    annualProjection,
    consumerEquivalents,
    exposureTier,
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
    AD_NETWORK: '#FF3B30',
    DATA_BROKER: '#FF9500',
    ANALYTICS: '#FFCC00',
    SOCIAL_PIXEL: '#30D158',
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
    AD_NETWORK: 'Ad Network',
    DATA_BROKER: 'Data Broker',
    ANALYTICS: 'Analytics',
    SOCIAL_PIXEL: 'Social Pixel',
  };
  return labels[category] || category;
}