// popup/views/Receipt.jsx
// Itemized view — every tracker on this page as a receipt line item.
// Props: { events: TrackerEvent[], value: { total, byCategory, trackerCount } }

import { formatDollarValue, getCategoryColor, getCategoryLabel } from '../../utils/dollar-engine.js';

export default function Receipt({ events, value }) {
  const total = value?.total ?? 0;

  // Sort by highest value first
  const sorted = [...events].sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0));

  // Today's date for the receipt header
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
  });

  return (
    <div className="px-4 py-4 flex flex-col">

      {/* Receipt header */}
      <div className="mb-3">
        <p className="text-[#FFE600] font-mono text-xs uppercase tracking-widest">// Itemized Receipt</p>
        <p className="text-[#555] font-mono text-xs mt-0.5">{dateStr}</p>
      </div>

      <div className="border-t border-dashed border-[#333]" />

      {/* Line items */}
      {sorted.length === 0 ? (
        <p className="text-[#555] text-xs font-mono text-center py-6">
          No trackers detected on this page.
        </p>
      ) : (
        <div className="flex flex-col">
          {sorted.map((event, i) => (
            <LineItem key={`${event.domain}-${i}`} event={event} />
          ))}
        </div>
      )}

      {/* Total line */}
      {sorted.length > 0 && (
        <>
          <div className="border-t-2 border-double border-[#444] mt-2 pt-3 flex items-center justify-between">
            <span className="text-[#F5F5F5] font-mono font-bold text-sm uppercase tracking-wider">
              Total
            </span>
            <span className="text-[#FFE600] font-mono font-bold text-sm">
              {formatDollarValue(total)}
            </span>
          </div>

          {/* IAB disclaimer */}
          <p className="text-[#444] font-mono text-[10px] mt-3 leading-relaxed">
            * Estimate based on IAB ARPU benchmarks.
          </p>
        </>
      )}
    </div>
  );
}

function LineItem({ event }) {
  const color = getCategoryColor(event.category);
  const label = getCategoryLabel(event.category);

  return (
    <div className="py-2 border-b border-dashed border-[#222]">
      {/* Domain */}
      <p className="text-[#F5F5F5] font-mono text-xs">{event.domain}</p>
      {/* Company · Category · Value */}
      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-[#666] text-xs">
            {event.parentCompany} · <span style={{ color }}>{label.toUpperCase()}</span>
          </span>
        </div>
        <span className="text-[#999] font-mono text-xs">
          {formatDollarValue(event.estimatedValue ?? 0)}
        </span>
      </div>
    </div>
  );
}
