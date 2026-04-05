// popup/views/PriceTag.jsx
// Default popup view — hero dollar number, tracker breakdown, and AI policy intelligence.
// Props: { pageData, summary, contradictions, domain }

import { formatDollarValue, formatDollarRange, getCategoryColor, getCategoryLabel } from '../../utils/dollar-engine.js';

const CATEGORIES = ['AD_NETWORK', 'DATA_BROKER', 'ANALYTICS', 'SOCIAL_PIXEL'];

const CONSENT_VERDICT_COLORS = {
  TRANSPARENT:            '#30D158',
  MINOR_PATTERNS:         '#FFCC00',
  MODERATE_DARK_PATTERNS: '#FF9500',
  CONSENT_THEATER:        '#FF3B30',
};

const CONSENT_VERDICT_LABELS = {
  TRANSPARENT:            'Transparent',
  MINOR_PATTERNS:         'Minor Dark Patterns',
  MODERATE_DARK_PATTERNS: 'Moderate Dark Patterns',
  CONSENT_THEATER:        'Consent Theater',
};

export default function PriceTag({ pageData, summary, contradictions = [] }) {
  const value        = pageData?.value ?? {};
  const total        = value.total        ?? 0;
  const totalLow     = value.totalLow     ?? null;
  const totalHigh    = value.totalHigh    ?? null;
  const trackerCount = value.trackerCount ?? 0;
  const events       = pageData?.events   ?? [];

  // Normalise summary — may be object (new schema) or string (legacy cache)
  const summaryObj      = summary && typeof summary === 'object' ? summary : null;
  const summaryText     = summaryObj?.plainEnglishTakeaway ?? (typeof summary === 'string' ? summary : null);
  const policyChanged   = summaryObj?.policyChanged  === true;
  const changeSummary   = summaryObj?.changeSummary  ?? null;
  const consentScore    = summaryObj?.consentScore   ?? null;
  const consentVerdict  = summaryObj?.consentVerdict ?? null;

  const categoryCount = {};
  for (const event of events) {
    categoryCount[event.category] = (categoryCount[event.category] || 0) + 1;
  }

  // Show range only when both low and high are meaningful and differ
  const hasRange = totalLow != null && totalHigh != null && Math.abs(totalHigh - totalLow) > 0.000001;

  return (
    <div className="px-4 py-4 flex flex-col gap-4">

      {/* ── Hero value ────────────────────────────────────────────── */}
      <div className="text-center py-2">
        <p className="text-[#666] text-xs uppercase tracking-widest mb-1">
          YOU ARE THE PRODUCT. PRICE TAG:
        </p>
        <p className="text-[#FFE600] font-mono font-bold text-5xl leading-none">
          {formatDollarValue(total)}
        </p>

        {hasRange && (
          <p className="text-[#666] font-mono text-xs mt-1.5">
            range: {formatDollarRange(totalLow, totalHigh)}
          </p>
        )}

        <p className="text-[#444] text-xs font-mono mt-2">to advertisers. You got $0.00</p>
      </div>

      <div className="border-t border-dashed border-[#333]" />

      {/* ── Policy change alert ───────────────────────────────────── */}
      {policyChanged && changeSummary && (
        <PolicyChangeAlert changeSummary={changeSummary} />
      )}

      {/* ── Contradiction alerts ──────────────────────────────────── */}
      {contradictions.length > 0 && (
        <ContradictionAlerts contradictions={contradictions} />
      )}

      {/* ── Trackers ─────────────────────────────────────────────── */}
      {trackerCount === 0 ? (
        <p className="text-[#555] text-xs font-mono text-center py-2">
          No trackers detected on this page.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[#999] text-xs uppercase tracking-widest">Trackers Detected</span>
            <span className="text-[#F5F5F5] font-mono font-bold text-sm">{trackerCount}</span>
          </div>

          <CategoryBar categoryCount={categoryCount} trackerCount={trackerCount} />

          <div className="flex flex-col gap-1">
            {CATEGORIES.filter(cat => categoryCount[cat] > 0).map(cat => (
              <div key={cat} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: getCategoryColor(cat) }} />
                  <span className="text-[#999] text-xs">{getCategoryLabel(cat)}</span>
                </div>
                <span className="text-[#F5F5F5] font-mono text-xs">{categoryCount[cat]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-dashed border-[#333]" />

      {/* ── Policy summary ────────────────────────────────────────── */}
      <div>
        <p className="text-[#666] text-xs uppercase tracking-widest mb-2">Policy Summary</p>
        <p className="text-[#AAA] text-xs leading-relaxed font-mono">
          {summaryText || 'Analyzing privacy policy…'}
        </p>
      </div>

      {/* ── Consent theater score ─────────────────────────────────── */}
      {consentScore != null && consentVerdict && consentVerdict !== 'TRANSPARENT' && (
        <ConsentTheaterCard score={consentScore} verdict={consentVerdict} />
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PolicyChangeAlert({ changeSummary }) {
  return (
    <div className="border border-dashed border-[#FFCC00] rounded p-3 flex gap-2">
      <span className="text-[#FFCC00] font-mono text-xs flex-shrink-0">!</span>
      <div>
        <p className="text-[#FFCC00] font-mono text-xs font-bold uppercase tracking-widest">
          Policy Updated
        </p>
        <p className="text-[#AAA] font-mono text-xs mt-1 leading-relaxed">
          {changeSummary}
        </p>
      </div>
    </div>
  );
}

function ContradictionAlerts({ contradictions }) {
  return (
    <div className="flex flex-col gap-2">
      {contradictions.map((c, i) => (
        <div
          key={i}
          className="border border-dashed rounded p-3 flex gap-2"
          style={{ borderColor: c.severity === 'high' ? '#FF3B30' : '#FF9500' }}
        >
          <span
            className="font-mono text-xs flex-shrink-0"
            style={{ color: c.severity === 'high' ? '#FF3B30' : '#FF9500' }}
          >
            ✗
          </span>
          <p
            className="font-mono text-xs leading-relaxed"
            style={{ color: c.severity === 'high' ? '#FF6B6B' : '#FFB347' }}
          >
            {c.message}
          </p>
        </div>
      ))}
    </div>
  );
}

function ConsentTheaterCard({ score, verdict }) {
  const color = CONSENT_VERDICT_COLORS[verdict] ?? '#8E8E93';
  const label = CONSENT_VERDICT_LABELS[verdict] ?? verdict;

  return (
    <div className="border border-dashed border-[#333] rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[#666] text-xs uppercase tracking-widest">Cookie Consent UX</p>
        <p className="font-mono text-xs font-bold" style={{ color }}>{label}</p>
      </div>
      <div className="w-full bg-[#1A1A1A] h-1.5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[#555] font-mono text-[10px]">
        Dark pattern score: {score}/100
      </p>
    </div>
  );
}

function CategoryBar({ categoryCount, trackerCount }) {
  if (trackerCount === 0) return null;
  return (
    <div className="flex h-2 w-full rounded-sm overflow-hidden gap-px">
      {CATEGORIES.map(cat => {
        const count = categoryCount[cat] || 0;
        if (count === 0) return null;
        return (
          <div
            key={cat}
            title={`${getCategoryLabel(cat)}: ${count}`}
            style={{ width: `${(count / trackerCount) * 100}%`, backgroundColor: getCategoryColor(cat) }}
          />
        );
      })}
    </div>
  );
}
