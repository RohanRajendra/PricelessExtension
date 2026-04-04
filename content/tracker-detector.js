// content/tracker-detector.js
// Runs in the context of every web page.
// Detects third-party tracker requests via PerformanceObserver and reports them
// to the background service worker.

(async () => {
  // 1. Load the tracker list from the extension's bundled data file
  let trackerList = {};
  try {
    const url = chrome.runtime.getURL('data/trackers.json');
    const response = await fetch(url);
    const json = await response.json();
    trackerList = json.trackers || {};
  } catch (err) {
    // If the tracker list can't be loaded, silently exit — don't break the page
    return;
  }

  // 2. Extract the top-level domain of the current page (parentSite)
  //    e.g. "www.nytimes.com" → "nytimes.com"
  function getParentSite(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }
  const parentSite = getParentSite(location.hostname);

  // 3. Helper: match a resource hostname against the tracker list
  //    Tries exact match first, then suffix match (e.g. "static.doubleclick.net" → "doubleclick.net")
  function matchTrackerDomain(hostname, trackerList) {
    for (const domain of Object.keys(trackerList)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { domain, ...trackerList[domain] };
      }
    }
    return null;
  }

  // 4. Track which domains have already been reported this page load to avoid duplicates
  const reportedDomains = new Set();

  // 5. Get today's date string in YYYY-MM-DD format
  function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 6. Process a resource URL entry — check if it's a tracker and report it
  function processResourceEntry(entry) {
    let hostname;
    try {
      hostname = new URL(entry.name).hostname;
    } catch {
      return; // Skip malformed URLs
    }

    // Skip resources from the same site (only care about third-party trackers)
    if (hostname === location.hostname || hostname.endsWith('.' + parentSite)) return;

    const match = matchTrackerDomain(hostname, trackerList);
    if (!match) return;

    // Deduplicate within this page load
    if (reportedDomains.has(match.domain)) return;
    reportedDomains.add(match.domain);

    // Send tracker event to background service worker
    chrome.runtime.sendMessage({
      type: 'TRACKER_DETECTED',
      payload: {
        domain: match.domain,
        category: match.category,
        parentCompany: match.parentCompany,
        parentSite,
        timestamp: Date.now(),
        date: getTodayDateStr(),
      },
    });
  }

  // 7. Observe new resource entries as they load
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      processResourceEntry(entry);
    }
  });
  observer.observe({ type: 'resource', buffered: false });

  // 8. Also process resources that already loaded before the observer started
  const existingEntries = performance.getEntriesByType('resource');
  for (const entry of existingEntries) {
    processResourceEntry(entry);
  }

  // 9. After a short delay, ask the service worker to fetch and summarize the privacy policy.
  //    Delay ensures trackers are detected first and the page has settled.
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'FETCH_POLICY_SUMMARY',
      payload: {
        domain: parentSite,
        baseUrl: `${location.protocol}//${location.hostname}`,
      },
    });
  }, 2000);
})();
