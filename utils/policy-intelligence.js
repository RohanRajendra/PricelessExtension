// utils/policy-intelligence.js
// Cross-site contradiction detection between cached Claude policy analysis
// and the actual trackers observed on the page.
// Pure logic — no external calls, no storage.

/**
 * Contradiction rule definitions.
 * Each rule describes a policy claim that contradicts a tracker category.
 */
const CONTRADICTION_RULES = [
  {
    policyClaim: 'claimsNoTracking',
    trackerCategory: 'AD_NETWORK',
    message: 'Policy claims no tracking — but ad network trackers were loaded on this page.',
    severity: 'high',
  },
  {
    policyClaim: 'claimsNoTracking',
    trackerCategory: 'ANALYTICS',
    message: 'Policy claims no tracking — but analytics trackers were loaded on this page.',
    severity: 'medium',
  },
  {
    policyClaim: 'claimsNoSelling',
    trackerCategory: 'DATA_BROKER',
    message: 'Policy claims data is not sold — but data broker trackers were loaded on this page.',
    severity: 'high',
  },
  {
    policyClaim: 'claimsNoTracking',
    trackerCategory: 'SOCIAL_PIXEL',
    message: 'Policy claims no tracking — but social media pixels were loaded on this page.',
    severity: 'medium',
  },
  {
    policyClaim: 'claimsLimitedSharing',
    trackerCategory: 'DATA_BROKER',
    message: 'Policy claims limited data sharing — but data brokers observed on this page suggest otherwise.',
    severity: 'medium',
  },
];

/**
 * Detect contradictions between a site's cached privacy policy claims
 * and the tracker events actually observed on the page.
 *
 * @param {object|null} summary - Claude policy analysis object from getCachedSummary()
 * @param {Array}       events  - tracker events for this page (from getTodayData())
 * @returns {Array<{ type: string, message: string, severity: 'high'|'medium', trackerCount: number }>}
 */
export function detectContradictions(summary, events) {
  if (!summary || typeof summary !== 'object') return [];
  if (!events || events.length === 0) return [];

  // Count trackers per category on this page
  const categoryCounts = {};
  for (const event of events) {
    const cat = event.category;
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const contradictions = [];
  const seen = new Set(); // deduplicate: one contradiction per (claim, category) pair

  for (const rule of CONTRADICTION_RULES) {
    const claimIsTrue     = summary[rule.policyClaim] === true;
    const trackersPresent = (categoryCounts[rule.trackerCategory] || 0) > 0;

    if (claimIsTrue && trackersPresent) {
      const key = `${rule.policyClaim}:${rule.trackerCategory}`;
      if (seen.has(key)) continue;
      seen.add(key);

      contradictions.push({
        type:         `${rule.policyClaim}_vs_${rule.trackerCategory}`,
        message:      rule.message,
        severity:     rule.severity,
        trackerCount: categoryCounts[rule.trackerCategory],
      });
    }
  }

  // Sort: high severity first
  return contradictions.sort((a, b) =>
    (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1)
  );
}
