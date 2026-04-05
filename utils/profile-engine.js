// utils/profile-engine.js
// Behavioral profile reconstruction ("The Mirror" feature).
// Delegates to ONNX mirror model; falls back to keyword matching if model fails.

import { getEventsForCurrentMonth } from './storage.js';
import { classifyBrowsingHistory } from './mirror-model.js';

// Keyword fallback — used when ONNX inference fails
const SEGMENTS = {
  Parent:                 { keywords: ['baby', 'parent', 'kids', 'school', 'family'], weight: 1.2 },
  Homeowner:              { keywords: ['zillow', 'realestate', 'mortgage', 'home', 'rent', 'apartments'], weight: 1.3 },
  'Luxury Auto Intender': { keywords: ['bmw', 'mercedes', 'audi', 'tesla', 'car', 'auto'], weight: 1.1 },
  'Health Conscious':     { keywords: ['fitness', 'health', 'nutrition', 'gym', 'wellness'], weight: 1.0 },
  Investor:               { keywords: ['stocks', 'crypto', 'invest', 'finance', 'trading'], weight: 1.2 },
  Traveler:               { keywords: ['flight', 'hotel', 'booking', 'airbnb', 'travel'], weight: 1.1 },
  'News Reader':          { keywords: ['cnn', 'bbc', 'news', 'nytimes', 'washingtonpost', 'reuters'], weight: 0.9 },
  'Tech Enthusiast':      { keywords: ['tech', 'github', 'verge', 'wired', 'android', 'apple'], weight: 1.0 },
};

function keywordFallback(events) {
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
      if (config.keywords.some(kw => lower.includes(kw))) {
        score += count * config.weight;
        evidence.push(site);
      }
    }
    if (score > 0) {
      results.push({
        label,
        confidence: Math.min(95, Math.max(55, Math.round(score * 10))),
        evidence:   [...new Set(evidence)].slice(0, 3),
      });
    }
  }

  const sorted = results.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  if (sorted.length === 0) {
    return [{
      label:      'General Web User',
      confidence: 60,
      evidence:   Object.keys(siteCounts).slice(0, 3),
    }];
  }
  return sorted;
}

/**
 * Build behavioral profile from browsing history.
 * Tries ONNX model first; falls back to keyword matching.
 *
 * @returns {Promise<Array<{ label: string, confidence: number, evidence: string[] }>>}
 */
export async function buildBehaviorProfile() {
  const events = await getEventsForCurrentMonth();

  // Try ONNX model
  const modelResult = await classifyBrowsingHistory(events);
  if (modelResult && modelResult.length > 0) return modelResult;

  // Keyword fallback
  return keywordFallback(events);
}
