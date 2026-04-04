// utils/seed-data.js
// Populates chrome.storage.local with realistic demo data for the hackathon demo.
// Call seedDemoData() from the dashboard EmptyState "Load Demo Data" button.

import { saveTrackerEvent } from './storage.js';
import { getTrackerValue } from './dollar-engine.js';
import trackers from '../data/trackers.json';

const SITES = [
  {
    site: 'nytimes.com',
    trackers: ['doubleclick.net', 'connect.facebook.net', 'google-analytics.com', 'quantserve.com', 'scorecardresearch.com'],
  },
  {
    site: 'reddit.com',
    trackers: ['doubleclick.net', 'google-analytics.com', 'amazon-adsystem.com'],
  },
  {
    site: 'cnn.com',
    trackers: ['doubleclick.net', 'googlesyndication.com', 'connect.facebook.net', 'krxd.net', 'scorecardresearch.com', 'outbrain.com'],
  },
  {
    site: 'espn.com',
    trackers: ['doubleclick.net', 'googlesyndication.com', 'connect.facebook.net', 'adnxs.com'],
  },
  {
    site: 'weather.com',
    trackers: ['doubleclick.net', 'connect.facebook.net', 'amazon-adsystem.com', 'criteo.com', 'quantserve.com'],
  },
  {
    site: 'github.com',
    trackers: ['google-analytics.com'],
  },
  {
    site: 'linkedin.com',
    trackers: ['connect.facebook.net', 'google-analytics.com', 'ads-twitter.com', 'licdn.com'],
  },
  {
    site: 'youtube.com',
    trackers: ['doubleclick.net', 'googlesyndication.com', 'google-analytics.com'],
  },
];

/**
 * Seed storage with realistic demo data spread across the current month.
 * Each day visits 3–5 random sites. Safe to call multiple times — storage.js deduplicates.
 */
export async function seedDemoData() {
  const today = new Date();
  const daysInMonth = today.getDate(); // only seed up to today, not future dates

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
    const dateStr = date.toISOString().split('T')[0];
    const timestamp = date.getTime();

    // Visit 3–5 random sites per day
    const shuffled = [...SITES].sort(() => Math.random() - 0.5);
    const dailySites = shuffled.slice(0, Math.floor(Math.random() * 3) + 3);

    for (const { site, trackers: trackerDomains } of dailySites) {
      for (const domain of trackerDomains) {
        const trackerInfo = trackers.trackers[domain] ?? { category: 'AD_NETWORK', parentCompany: 'Unknown' };
        const estimatedValue = getTrackerValue(domain, trackerInfo.category);

        await saveTrackerEvent({
          domain,
          category: trackerInfo.category,
          parentCompany: trackerInfo.parentCompany,
          parentSite: site,
          estimatedValue,
          timestamp,
          date: dateStr,
        });
      }
    }
  }

  console.log('Priceless: Demo data seeded successfully.');
}
