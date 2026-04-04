// utils/profile-engine.js
// Rule-based behavioral profile reconstruction ("The Mirror")

import { getEventsForCurrentMonth } from './storage.js';

/**
 * Define audience segments + signals
 */
const SEGMENTS = {
  Parent: {
    keywords: ['baby', 'parent', 'kids', 'school', 'family'],
    weight: 1.2,
  },
  Homeowner: {
    keywords: ['zillow', 'realestate', 'mortgage', 'home', 'rent', 'apartments'],
    weight: 1.3,
  },
  'Luxury Auto Intender': {
    keywords: ['bmw', 'mercedes', 'audi', 'tesla', 'car', 'auto'],
    weight: 1.1,
  },
  'Health Conscious': {
    keywords: ['fitness', 'health', 'nutrition', 'gym', 'wellness'],
    weight: 1.0,
  },
  Investor: {
    keywords: ['stocks', 'crypto', 'invest', 'finance', 'trading'],
    weight: 1.2,
  },
  Traveler: {
    keywords: ['flight', 'hotel', 'booking', 'airbnb', 'travel'],
    weight: 1.1,
  },
  'News Reader': {
    keywords: ['cnn', 'bbc', 'news', 'nytimes', 'washingtonpost', 'reuters'],
    weight: 0.9,
  },
  'Tech Enthusiast': {
    keywords: ['tech', 'github', 'verge', 'wired', 'android', 'apple'],
    weight: 1.0,
  },
};

/**
 * Build behavioral profile from browsing data
 */
export async function buildBehaviorProfile() {
  const events = await getEventsForCurrentMonth();

  const siteCounts = {};
  for (const e of events) {
    const site = e.parentSite || '';
    if (!site) continue;
    siteCounts[site] = (siteCounts[site] || 0) + 1;
  }

  const results = [];

  for (const [label, config] of Object.entries(SEGMENTS)) {
    let score = 0;
    const evidence = [];

    for (const [site, count] of Object.entries(siteCounts)) {
      const lower = site.toLowerCase();

      for (const keyword of config.keywords) {
        if (lower.includes(keyword)) {
          score += count * config.weight;
          evidence.push(site);
          break;
        }
      }
    }

    if (score > 0) {
      const confidence = Math.min(95, Math.max(55, Math.round(score * 10)));

      results.push({
        label,
        confidence,
        evidence: [...new Set(evidence)].slice(0, 3),
      });
    }
  }

  const finalResults = results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);

  // Fallback so The Mirror always shows something useful
  if (finalResults.length === 0) {
    const fallbackSites = Object.keys(siteCounts).slice(0, 3);

    return [
      {
        label: 'General Web User',
        confidence: 60,
        evidence: fallbackSites.length > 0 ? fallbackSites : ['Browsing history still too sparse'],
      },
    ];
  }

  return finalResults;
}