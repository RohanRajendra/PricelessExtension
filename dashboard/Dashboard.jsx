// dashboard/Dashboard.jsx
// Full-page monthly statement. Opens in a new tab from the popup footer.
// All data comes from getMonthlyStatement() — no additional storage calls in sub-components.

import { useState, useEffect } from 'react';
import {
  getMonthlyStatement,
  formatDollarValue,
  getCategoryColor,
  getCategoryLabel,
} from '../utils/dollar-engine.js';
import { seedDemoData } from '../utils/seed-data.js';

// ---------------------------------------------------------------------------
// Root Dashboard component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMonthlyStatement().then((data) => {
      setStatement(data);
      setLoading(false);
    });
  }, []);

  async function loadDemoData() {
    await seedDemoData();
    const data = await getMonthlyStatement();
    setStatement(data);
  }

  if (loading) return <LoadingScreen />;
  if (!statement || statement.totalValue === 0) return <EmptyState onLoadDemo={loadDemoData} />;

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DashboardHeader() {
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return (
    <div className="border-b border-dashed border-[#333] pb-4">
      <div className="flex items-center justify-between">
        <span className="text-[#FFE600] font-bold text-xl tracking-wider">PRICELESS</span>
        <span className="text-[#555] font-mono text-xs uppercase tracking-widest">// Monthly Statement</span>
      </div>
      <p className="text-[#444] font-mono text-xs mt-1">{monthLabel}</p>
    </div>
  );
}

function HeroNumber({ value }) {
  return (
    <div className="border border-dashed border-[#FFE600] rounded p-8 text-center space-y-4">
      <p className="text-[#666] text-sm font-mono uppercase tracking-widest">
        This month, advertisers made an estimated
      </p>
      <p
        className="text-[#FFE600] font-mono font-bold"
        style={{ fontSize: '4rem', lineHeight: 1 }}
      >
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

function PlatformBreakdown({ byPlatform, total }) {
  if (!byPlatform || total === 0) return null;

  // Sort by value desc, group tail as "Other" after top 6
  const sorted = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 6);
  const otherValue = sorted.slice(6).reduce((sum, [, v]) => sum + v, 0);
  if (otherValue > 0) top.push(['Other', otherValue]);

  return (
    <section>
      <SectionHeading>By Platform</SectionHeading>
      <div className="flex flex-col gap-3 mt-4">
        {top.map(([company, value]) => {
          const pct = Math.round((value / total) * 100);
          return (
            <div key={company} className="flex items-center gap-3">
              <span className="text-[#999] font-mono text-xs w-28 flex-shrink-0 truncate">{company}</span>
              <div className="flex-1 bg-[#1A1A1A] rounded-sm h-2 overflow-hidden">
                <div
                  className="h-full bg-[#FFE600] rounded-sm"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[#F5F5F5] font-mono text-xs w-14 text-right flex-shrink-0">
                {formatDollarValue(value)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CategoryBreakdown({ byCategory, total }) {
  if (!byCategory || total === 0) return null;

  const CATEGORIES = ['AD_NETWORK', 'DATA_BROKER', 'ANALYTICS', 'SOCIAL_PIXEL'];
  const entries = CATEGORIES.filter((cat) => byCategory[cat] > 0).map((cat) => ({
    cat,
    value: byCategory[cat],
    pct: Math.round((byCategory[cat] / total) * 100),
  }));

  return (
    <section>
      <SectionHeading>By Type</SectionHeading>
      {/* Stacked bar */}
      <div className="flex h-3 w-full rounded-sm overflow-hidden gap-px mt-4">
        {entries.map(({ cat, pct }) => (
          <div
            key={cat}
            style={{ width: `${pct}%`, backgroundColor: getCategoryColor(cat) }}
            title={`${getCategoryLabel(cat)}: ${pct}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {entries.map(({ cat, pct }) => (
          <div key={cat} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: getCategoryColor(cat) }}
            />
            <span className="text-[#777] text-xs">
              {getCategoryLabel(cat)}{' '}
              <span className="text-[#999] font-mono">{pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopSites({ sites }) {
  if (!sites || sites.length === 0) return null;

  const maxValue = sites[0]?.value ?? 1;

  return (
    <section>
      <SectionHeading>Top Sites That Sold You</SectionHeading>
      <div className="flex flex-col gap-3 mt-4">
        {sites.map(({ site, value }, i) => {
          const pct = Math.round((value / maxValue) * 100);
          return (
            <div key={site} className="flex items-center gap-3">
              <span className="text-[#444] font-mono text-xs w-4 flex-shrink-0">{i + 1}.</span>
              <span className="text-[#F5F5F5] font-mono text-xs w-32 flex-shrink-0 truncate">{site}</span>
              <div className="flex-1 bg-[#1A1A1A] rounded-sm h-2 overflow-hidden">
                <div
                  className="h-full bg-[#444] rounded-sm"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[#FFE600] font-mono text-xs w-14 text-right flex-shrink-0">
                {formatDollarValue(value)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatsRow({ events, domains }) {
  return (
    <section>
      <div className="border border-dashed border-[#222] rounded p-5 flex items-center justify-around">
        <Stat value={events?.toLocaleString() ?? '0'} label="Tracker Events" />
        <div className="w-px h-8 bg-[#333]" />
        <Stat value={domains?.toLocaleString() ?? '0'} label="Unique Domains" />
      </div>
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-[#FFE600] font-mono font-bold text-2xl">{value}</p>
      <p className="text-[#555] text-xs uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="text-[#333] font-mono text-xs pb-8">
      * Estimates based on IAB ARPU benchmarks.
    </p>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#444] font-mono text-xs uppercase tracking-widest">── {children}</span>
      <div className="flex-1 border-t border-dashed border-[#222]" />
    </div>
  );
}

function EmptyState({ onLoadDemo }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <DashboardHeader />
      <div className="mt-16 text-center space-y-4">
        <p className="text-[#F5F5F5] font-mono text-sm">No data collected yet.</p>
        <p className="text-[#555] font-mono text-xs">Browse the web and come back.</p>
        <p className="text-[#333] text-xs mt-2">Priceless tracks data silently as you browse.</p>
        <button
          onClick={onLoadDemo}
          className="mt-6 px-6 py-2 border border-dashed border-[#FFE600] text-[#FFE600] font-mono text-xs
                     uppercase tracking-widest hover:bg-[#FFE600] hover:text-[#0A0A0A] transition-colors"
        >
          Load Demo Data
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
      <span className="text-[#666] font-mono text-xs animate-pulse">LOADING STATEMENT...</span>
    </div>
  );
}
