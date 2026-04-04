// popup/views/PriceTag.jsx
// Default popup view — hero dollar number, tracker count, category breakdown, AI policy summary.
// Props: { pageData, summary, domain }

import { formatDollarValue, getCategoryColor, getCategoryLabel } from '../../utils/dollar-engine.js';

const CATEGORIES = ['AD_NETWORK', 'DATA_BROKER', 'ANALYTICS', 'SOCIAL_PIXEL'];

export default function PriceTag({ pageData, summary, domain }) {
  const total = pageData?.value?.total ?? 0;
  const byCategory = pageData?.value?.byCategory ?? {};
  const trackerCount = pageData?.value?.trackerCount ?? 0;
  const events = pageData?.events ?? [];

  // Count trackers per category
  const categoryCount = {};
  for (const event of events) {
    categoryCount[event.category] = (categoryCount[event.category] || 0) + 1;
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">

      {/* Hero value */}
      <div className="text-center py-2">
        <p className="text-[#666] text-xs uppercase tracking-widest mb-1">This page is worth</p>
        <p className="text-[#FFE600] font-mono font-bold text-5xl leading-none">
          {formatDollarValue(total)}
        </p>
        <p className="text-[#444] text-xs font-mono mt-2">to advertisers. You got $0.00</p>
      </div>

      {/* Dashed divider */}
      <div className="border-t border-dashed border-[#333]" />

      {trackerCount === 0 ? (
        <p className="text-[#555] text-xs font-mono text-center py-2">
          No trackers detected on this page.
        </p>
      ) : (
        <>
          {/* Tracker count */}
          <div className="flex items-center justify-between">
            <span className="text-[#999] text-xs uppercase tracking-widest">Trackers Detected</span>
            <span className="text-[#F5F5F5] font-mono font-bold text-sm">{trackerCount}</span>
          </div>

          {/* Category breakdown bar */}
          <CategoryBar categoryCount={categoryCount} trackerCount={trackerCount} />

          {/* Category legend */}
          <div className="flex flex-col gap-1">
            {CATEGORIES.filter((cat) => categoryCount[cat] > 0).map((cat) => (
              <div key={cat} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: getCategoryColor(cat) }}
                  />
                  <span className="text-[#999] text-xs">{getCategoryLabel(cat)}</span>
                </div>
                <span className="text-[#F5F5F5] font-mono text-xs">{categoryCount[cat]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dashed divider */}
      <div className="border-t border-dashed border-[#333]" />

      {/* AI Policy Summary */}
      <div>
        <p className="text-[#666] text-xs uppercase tracking-widest mb-2">Policy Summary</p>
        <p className="text-[#AAA] text-xs leading-relaxed font-mono">
          {summary || 'Analyzing privacy policy…'}
        </p>
      </div>

    </div>
  );
}

/**
 * Horizontal bar showing category proportions by tracker count.
 */
function CategoryBar({ categoryCount, trackerCount }) {
  if (trackerCount === 0) return null;

  return (
    <div className="flex h-2 w-full rounded-sm overflow-hidden gap-px">
      {CATEGORIES.map((cat) => {
        const count = categoryCount[cat] || 0;
        if (count === 0) return null;
        const pct = (count / trackerCount) * 100;
        return (
          <div
            key={cat}
            title={`${getCategoryLabel(cat)}: ${count}`}
            style={{
              width: `${pct}%`,
              backgroundColor: getCategoryColor(cat),
            }}
          />
        );
      })}
    </div>
  );
}
