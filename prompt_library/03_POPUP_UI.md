# Priceless — Popup UI Spec

## Overview

The popup opens when the user clicks the extension icon. It has two views that the user can toggle between:

- **View 1: Price Tag** — the default view, showing the current page's data value
- **View 2: The Receipt** — itemized list of every tracker on this page

The popup is fixed at **360px wide × 520px tall** (standard extension popup size).

---

## Design Language

This is the most important design instruction. **Make it look like a thermal receipt.**

- Dark background: `#0A0A0A`
- Primary text: `#F5F5F5`
- Accent / highlight: `#FFE600` (yellow — the "price tag" color)
- Category colors: red (Ad Network), orange (Data Broker), yellow (Analytics), green (Social Pixel)
- Font: monospace for line items and dollar amounts (`font-mono`). Sans-serif for labels.
- Use dashed borders (`border-dashed`) to reinforce the receipt metaphor
- The total line at the bottom should look like a receipt total — bold, larger, underlined above

Think: gas station receipt meets surveillance capitalism. Functional, cold, a little unsettling.

---

## popup/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Priceless</title>
  <link rel="stylesheet" href="../styles/tailwind.css" />
</head>
<body class="bg-[#0A0A0A] text-[#F5F5F5] w-[360px] h-[520px] overflow-hidden">
  <div id="root"></div>
  <script type="module" src="./index.jsx"></script>
</body>
</html>
```

---

## popup/App.jsx

The root component. Manages which view is active, fetches data on mount, passes it down.

```jsx
// popup/App.jsx

import { useState, useEffect } from 'react';
import PriceTag from './views/PriceTag.jsx';
import Receipt from './views/Receipt.jsx';

export default function App() {
  const [view, setView] = useState('pricetag'); // 'pricetag' | 'receipt'
  const [pageData, setPageData] = useState(null);   // { events, value }
  const [summary, setSummary] = useState(null);     // AI policy summary string
  const [currentDomain, setCurrentDomain] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Get the current active tab's URL/domain
    // 2. Send message to service worker: { type: 'GET_PAGE_DATA', payload: { domain } }
    // 3. Service worker responds with { events, value, summary }
    // 4. Set state accordingly
    // 5. Set loading to false
    loadData();
  }, []);

  async function loadData() {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) { setLoading(false); return; }

    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');
    setCurrentDomain(domain);

    // Request data from service worker
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_DATA',
      payload: { domain }
    });

    setPageData(response?.pageData ?? null);
    setSummary(response?.summary ?? null);
    setLoading(false);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Header domain={currentDomain} />

      {/* View toggle */}
      <ViewToggle view={view} onToggle={setView} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'pricetag'
          ? <PriceTag pageData={pageData} summary={summary} domain={currentDomain} />
          : <Receipt events={pageData?.events ?? []} value={pageData?.value} />
        }
      </div>

      {/* Footer */}
      <Footer onOpenDashboard={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') })} />
    </div>
  );
}

function Header({ domain }) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-dashed border-[#333]">
      <div className="flex items-center justify-between">
        <span className="text-[#FFE600] font-bold text-lg tracking-wider">PRICELESS</span>
        <span className="text-[#666] text-xs font-mono">{domain || 'no domain'}</span>
      </div>
    </div>
  );
}

function ViewToggle({ view, onToggle }) {
  return (
    <div className="flex border-b border-dashed border-[#333]">
      {['pricetag', 'receipt'].map(v => (
        <button
          key={v}
          onClick={() => onToggle(v)}
          className={`flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-colors
            ${view === v ? 'text-[#FFE600] border-b-2 border-[#FFE600]' : 'text-[#666] hover:text-[#999]'}`}
        >
          {v === 'pricetag' ? '// Price Tag' : '// Receipt'}
        </button>
      ))}
    </div>
  );
}

function Footer({ onOpenDashboard }) {
  return (
    <div className="px-4 py-3 border-t border-dashed border-[#333]">
      <button
        onClick={onOpenDashboard}
        className="w-full text-xs font-mono text-[#666] hover:text-[#FFE600] transition-colors text-center"
      >
        VIEW MONTHLY STATEMENT →
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[#666] font-mono text-xs animate-pulse">SCANNING...</span>
    </div>
  );
}
```

---

## popup/views/PriceTag.jsx

The default popup view. The hero number. The thing people screenshot.

```jsx
// popup/views/PriceTag.jsx
// Props: { pageData, summary, domain }

// Layout (top to bottom):
//
// ┌─────────────────────────────────┐
// │  THIS PAGE IS WORTH             │
// │                                 │
// │         $0.021                  │  ← big yellow number, monospace
// │                                 │
// │  to advertisers. You got $0.00  │  ← small grey text
// ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
// │  TRACKERS DETECTED: 14          │
// │  [red bar][orange][yellow][grn] │  ← category breakdown bar
// │  ■ Ad Network    9              │
// │  ■ Data Broker   2              │
// │  ■ Analytics     2              │
// │  ■ Social Pixel  1              │
// ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
// │  POLICY SUMMARY                 │
// │  "They collect browsing         │
// │   history and sell it to        │
// │   40+ ad partners."             │
// └─────────────────────────────────┘

export default function PriceTag({ pageData, summary, domain }) {
  const total = pageData?.value?.total ?? 0;
  const byCategory = pageData?.value?.byCategory ?? {};
  const trackerCount = pageData?.value?.trackerCount ?? 0;
  const events = pageData?.events ?? [];

  // Implement this component fully.
  // Use formatDollarValue() from dollar-engine for the main number.
  // Use getCategoryColor() and getCategoryLabel() for the breakdown.
  // The category bar should be a horizontal div with 4 colored segments,
  //   each segment's width proportional to count in that category.
  // If trackerCount === 0, show: "No trackers detected on this page."
}
```

---

## popup/views/Receipt.jsx

The itemized view. Every tracker on this page as a line item, like a receipt.

```jsx
// popup/views/Receipt.jsx
// Props: { events: TrackerEvent[], value: { total, byCategory, trackerCount } }

// Layout:
//
// ┌─────────────────────────────────┐
// │  // ITEMIZED RECEIPT            │
// │  nytimes.com · Apr 04 2026      │
// ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
// │  doubleclick.net                │
// │  Google · AD NETWORK  $0.0030   │
// │                                 │
// │  connect.facebook.net           │
// │  Meta · SOCIAL PIXEL  $0.0040   │
// │                                 │
// │  ... more items                 │
// ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
// │  TOTAL              $0.0210     │  ← bold, larger
// ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
// │  * Estimate based on IAB ARPU   │  ← tiny grey disclaimer
// └─────────────────────────────────┘

export default function Receipt({ events, value }) {
  // Sort events: highest value first
  // Each line item:
  //   - Top line: domain name (font-mono, white)
  //   - Bottom line: parentCompany · CATEGORY (colored dot)  $0.003 (font-mono, right-aligned)
  // Dashed separator between items
  // Total line with border-t border-double (receipt total style)
  // Disclaimer in tiny grey text at the bottom

  // If no events: show "No trackers detected on this page."
}
```