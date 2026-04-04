# Priceless — Monthly Statement Dashboard Spec

## Overview

The dashboard opens in a new browser tab when the user clicks "VIEW MONTHLY STATEMENT" in the popup footer. It shows the big picture — everything collected this month, in dollar terms.

This is the **hero screen of the demo.** This is what judges will screenshot. Make it land hard.

File: `dashboard/index.html` + `dashboard/Dashboard.jsx`

---

## dashboard/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Priceless — Monthly Statement</title>
  <link rel="stylesheet" href="../styles/tailwind.css" />
</head>
<body class="bg-[#0A0A0A] text-[#F5F5F5] min-h-screen">
  <div id="root"></div>
  <script type="module" src="./index.jsx"></script>
</body>
</html>
```

---

## dashboard/Dashboard.jsx

### Layout (full page, scrollable)

```
┌──────────────────────────────────────────────────────┐
│  PRICELESS               // MONTHLY STATEMENT        │  ← header
│  April 2026                                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  THIS MONTH, ADVERTISERS MADE AN ESTIMATED     │  │
│  │                                                │  │
│  │              $47.23                            │  │  ← HERO NUMBER, massive
│  │                                                │  │
│  │  from your data.    YOU RECEIVED: $0.00        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ── BY PLATFORM ──────────────────────────────────   │
│                                                      │
│  Google      ████████████████████░░░░  $18.40       │
│  Meta        ████████████░░░░░░░░░░░░  $12.20       │
│  Amazon      ████████░░░░░░░░░░░░░░░░  $8.10        │
│  Other       █████░░░░░░░░░░░░░░░░░░░  $8.53        │
│                                                      │
│  ── BY TYPE ───────────────────────────────────────  │
│                                                      │
│  [donut chart or bar chart of category breakdown]    │
│  AD_NETWORK 58%  DATA_BROKER 18%                     │
│  ANALYTICS 14%   SOCIAL_PIXEL 10%                    │
│                                                      │
│  ── TOP SITES THAT SOLD YOU ───────────────────────  │
│                                                      │
│  1. nytimes.com              $8.21  ████████         │
│  2. reddit.com               $6.44  ██████           │
│  3. cnn.com                  $5.90  █████            │
│  4. weather.com              $4.10  ████             │
│  5. espn.com                 $3.80  ███              │
│                                                      │
│  ── STATS ─────────────────────────────────────────  │
│  Total tracker events: 1,240                         │
│  Unique tracker domains: 87                          │
│                                                      │
│  * Estimates based on IAB ARPU benchmarks            │
└──────────────────────────────────────────────────────┘
```

---

## Component Implementation

```jsx
// dashboard/Dashboard.jsx

import { useState, useEffect } from 'react';
import { getMonthlyStatement, formatDollarValue, getCategoryColor, getCategoryLabel } from '../utils/dollar-engine.js';

export default function Dashboard() {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMonthlyStatement().then(data => {
      setStatement(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingScreen />;
  if (!statement || statement.totalValue === 0) return <EmptyState />;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
      <DashboardHeader />
      <HeroNumber value={statement.totalValue} />
      <PlatformBreakdown byPlatform={statement.byPlatform} total={statement.totalValue} />
      <CategoryBreakdown byCategory={statement.byCategory} total={statement.totalValue} />
      <TopSites sites={statement.topSites} />
      <StatsRow events={statement.totalTrackerEvents} domains={statement.uniqueTrackerDomains} />
      <Disclaimer />
    </div>
  );
}
```

---

## Sub-Components

### HeroNumber
```jsx
// The most important component in the app.
// Renders the total monthly value as a massive number.
// Below it: "from your data. YOU RECEIVED: $0.00"
// The "$0.00" should be in red — #FF3B30

function HeroNumber({ value }) {
  return (
    <div className="border border-dashed border-[#FFE600] rounded p-8 text-center space-y-4">
      <p className="text-[#666] text-sm font-mono uppercase tracking-widest">
        This month, advertisers made an estimated
      </p>
      <p className="text-[#FFE600] font-mono font-bold"
         style={{ fontSize: '4rem', lineHeight: 1 }}>
        {formatDollarValue(value)}
      </p>
      <p className="text-[#999] text-sm font-mono">
        from your data.{' '}
        <span className="text-white">YOU RECEIVED:</span>{' '}
        <span className="text-[#FF3B30] font-bold">$0.00</span>
      </p>
    </div>
  );
}
```

### PlatformBreakdown
```jsx
// Horizontal bar chart showing value by parent company.
// Each platform gets a row:
//   [company name]  [filled bar proportional to value]  [$X.XX]
// Bar fill color: #FFE600 on #1A1A1A background
// Sort by value descending
// Show top 6 platforms, group rest as "Other"

function PlatformBreakdown({ byPlatform, total }) { }
```

### CategoryBreakdown
```jsx
// Show category split as a simple horizontal stacked bar
// + legend below with percentages
// Colors: use getCategoryColor() for each category
// Labels: use getCategoryLabel()

function CategoryBreakdown({ byCategory, total }) { }
```

### TopSites
```jsx
// List of top 5 sites by value extracted
// Each row:
//   [rank]  [domain]  [relative bar]  [$value]
// Bar width proportional to value relative to #1 site
// Domain in monospace, value in monospace right-aligned

function TopSites({ sites }) { }
```

### StatsRow
```jsx
// Simple two-stat row at the bottom
// "X tracker events recorded" and "X unique tracker domains"
// Separated by a vertical divider, centered in the row

function StatsRow({ events, domains }) { }
```

### EmptyState
```jsx
// Shown when no data has been collected yet (fresh install)
// Message: "No data collected yet. Browse the web and come back."
// Subtext: "Priceless tracks data silently as you browse."

function EmptyState() { }
```

---

## Important Notes for Claude Code

1. **All data comes from `getMonthlyStatement()`** — do not make additional storage calls inside dashboard components.

2. **Use real data if available, seed data for the demo otherwise.** If `getMonthlyStatement()` returns zero totals (fresh install), the dashboard should detect this and offer to load a demo dataset so the hackathon demo doesn't fall flat. Seed data should look realistic — 20–30 days of browsing, $40–60 total, Google and Meta as top platforms.

3. **The hero number must be the largest text on the page** — prioritize this visually above everything else.

4. **No charts library required** — build the bars manually with divs and Tailwind width classes. Keep it simple. A `w-[60%]` yellow div on a dark background is enough for the hackathon.

5. **Month label** in the header should be the actual current month: `new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })`.