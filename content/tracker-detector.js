// content/tracker-detector.js
// Runs in the context of every web page.
// Detects third-party tracker requests via PerformanceObserver and reports them
// to the background service worker.
// Now also detects: page category, device type, and cookie consent dark patterns.

(async () => {
  // 1. Load tracker list
  let trackerList = {};
  try {
    const url      = chrome.runtime.getURL('data/trackers.json');
    const response = await fetch(url);
    const json     = await response.json();
    trackerList    = json.trackers || {};
  } catch {
    return;
  }

  // 2. Extract parent site
  function getParentSite(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }
  const parentSite = getParentSite(location.hostname);
  const isMobile   = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // 3. Detect page category from title + meta keywords + hostname
  function getPageCategory() {
    const signals = [
      document.title,
      document.querySelector('meta[name="keywords"]')?.getAttribute('content') || '',
      location.hostname,
      document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    ].join(' ').toLowerCase();

    const CATEGORY_KEYWORDS = {
      finance:       ['bank', 'invest', 'stock', 'finance', 'fund', 'crypto', 'trading', 'mortgage', 'loan', 'insurance'],
      health:        ['health', 'medical', 'doctor', 'fitness', 'wellness', 'diet', 'nutrition', 'pharma', 'hospital'],
      travel:        ['travel', 'flight', 'hotel', 'booking', 'airbnb', 'vacation', 'trip', 'expedia', 'airlines'],
      shopping:      ['shop', 'buy', 'cart', 'checkout', 'store', 'amazon', 'ebay', 'retail', 'product', 'sale'],
      tech:          ['tech', 'software', 'github', 'developer', 'coding', 'android', 'apple', 'computer', 'startup'],
      news:          ['news', 'politics', 'breaking', 'election', 'world', 'opinion', 'editorial', 'journalist'],
      entertainment: ['movie', 'music', 'game', 'video', 'stream', 'netflix', 'youtube', 'spotify', 'tv', 'entertainment'],
    };

    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => signals.includes(kw))) return cat;
    }
    return 'other';
  }
  const pageCategory = getPageCategory();

  // 4. Detect cookie consent dark patterns
  function detectConsentTheater() {
    const BANNER_SELECTORS = [
      '#CybotCookiebotDialog',
      '#onetrust-banner-sdk',
      '.cc-banner',
      '#cookie-banner',
      '#cookie-consent',
      '[class*="cookie-consent"]',
      '[class*="cookie-banner"]',
      '[id*="gdpr"]',
      '[class*="gdpr"]',
      '[aria-label*="cookie"]',
      '[aria-label*="consent"]',
    ];

    let banner = null;
    for (const sel of BANNER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) { banner = el; break; }
      } catch { /* invalid selector */ }
    }

    // Also detect by text content heuristic if no selector matched
    if (!banner) {
      const allDivs = document.querySelectorAll('div, section, aside');
      for (const el of allDivs) {
        const text = el.textContent.toLowerCase();
        if ((text.includes('cookie') || text.includes('consent')) &&
            (text.includes('accept') || text.includes('agree')) &&
            el.offsetHeight > 30 && el.offsetWidth > 100) {
          banner = el;
          break;
        }
      }
    }

    if (!banner) return { score: 0, verdict: 'TRANSPARENT' };

    let score = 0;

    // Pre-checked opt-in boxes (+20)
    const checkedBoxes = banner.querySelectorAll('input[type="checkbox"]:checked');
    if (checkedBoxes.length > 0) score += 20;

    // No visible reject/decline button at top level (+25)
    const bannerText   = banner.textContent.toLowerCase();
    const hasReject    = bannerText.includes('reject') || bannerText.includes('decline') || bannerText.includes('refuse');
    const hasAcceptAll = bannerText.includes('accept all') || bannerText.includes('agree');
    if (hasAcceptAll && !hasReject) score += 25;

    // Accept is a prominent button, no equally prominent reject (+15)
    const buttons = Array.from(banner.querySelectorAll('button, a[role="button"], [class*="btn"]'));
    const acceptBtns = buttons.filter(b => {
      const t = b.textContent.toLowerCase();
      return t.includes('accept') || t.includes('agree') || t.includes('allow');
    });
    const rejectBtns = buttons.filter(b => {
      const t = b.textContent.toLowerCase();
      return t.includes('reject') || t.includes('decline') || t.includes('refuse');
    });
    if (acceptBtns.length > 0 && rejectBtns.length === 0) score += 15;

    // Deceptive language: only "manage preferences" / "customize" but no direct reject (+20)
    const hasManageOnly = bannerText.includes('manage') || bannerText.includes('customis') || bannerText.includes('customiz');
    if (hasManageOnly && !hasReject) score += 20;

    // Verdict
    let verdict;
    if (score === 0)       verdict = 'TRANSPARENT';
    else if (score <= 30)  verdict = 'MINOR_PATTERNS';
    else if (score <= 60)  verdict = 'MODERATE_DARK_PATTERNS';
    else                   verdict = 'CONSENT_THEATER';

    return { score, verdict };
  }

  // 5. Tracker matching helpers
  function matchTrackerDomain(hostname) {
    for (const domain of Object.keys(trackerList)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { domain, ...trackerList[domain] };
      }
    }
    return null;
  }

  const reportedDomains = new Set();

  function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 6. Process each resource entry
  function processResourceEntry(entry) {
    let hostname;
    try {
      hostname = new URL(entry.name).hostname;
    } catch {
      return;
    }

    if (hostname === location.hostname || hostname.endsWith('.' + parentSite)) return;

    const match = matchTrackerDomain(hostname);
    if (!match) return;
    if (reportedDomains.has(match.domain)) return;
    reportedDomains.add(match.domain);

    chrome.runtime.sendMessage({
      type: 'TRACKER_DETECTED',
      payload: {
        domain:        match.domain,
        category:      match.category,
        parentCompany: match.parentCompany,
        parentSite,
        timestamp:     Date.now(),
        date:          getTodayDateStr(),
        pageCategory,
        isMobile,
      },
    });
  }

  // 7. Observe resources
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) processResourceEntry(entry);
  });
  observer.observe({ type: 'resource', buffered: false });

  for (const entry of performance.getEntriesByType('resource')) {
    processResourceEntry(entry);
  }

  // 8. Detect consent patterns (run at idle so it doesn't delay page load)
  let consentData = { score: 0, verdict: 'TRANSPARENT' };
  requestIdleCallback
    ? requestIdleCallback(() => { consentData = detectConsentTheater(); })
    : setTimeout(() => { consentData = detectConsentTheater(); }, 500);

  // 9. After page settles, send policy summary request with consent context
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'FETCH_POLICY_SUMMARY',
      payload: {
        domain:        parentSite,
        baseUrl:       `${location.protocol}//${location.hostname}`,
        consentScore:  consentData.score,
        consentVerdict: consentData.verdict,
      },
    });
  }, 2000);
})();
