// popup/App.jsx
// Root component — manages view state, fetches data from the service worker on mount.

import { useState, useEffect } from 'react';
import PriceTag from './views/PriceTag.jsx';
import Receipt from './views/Receipt.jsx';

export default function App() {
  const [view, setView] = useState('pricetag');
  const [pageData, setPageData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [currentDomain, setCurrentDomain] = useState('');
  const [loading, setLoading] = useState(true);

  const [blockModeEnabled, setBlockModeEnabled] = useState(false);
  const [blockedSavings, setBlockedSavings] = useState(0);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.url || !tab.url.startsWith('http')) {
        setLoading(false);
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      setCurrentDomain(domain);

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PAGE_DATA',
        payload: { domain },
      });

      setPageData(response?.pageData ?? null);
      setSummary(response?.summary ?? null);
      setBlockModeEnabled(Boolean(response?.blockModeEnabled));
      setBlockedSavings(Number(response?.blockedSavings ?? 0));
    } catch (error) {
      console.error('Failed to load popup data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshBlockModeState() {
    const state = await chrome.runtime.sendMessage({ type: 'GET_BLOCK_MODE' });
    setBlockModeEnabled(Boolean(state?.enabled));
    setBlockedSavings(Number(state?.blockedSavings ?? 0));
  }

  async function handleToggleBlockMode() {
    const nextEnabled = !blockModeEnabled;

    setToggleLoading(true);
    setToggleError('');

    // optimistic UI update so the button visibly changes
    setBlockModeEnabled(nextEnabled);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_BLOCK_MODE',
        payload: { enabled: nextEnabled },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      // always re-fetch actual state from background
      await refreshBlockModeState();
    } catch (error) {
      console.error('Failed to toggle block mode:', error);

      // revert optimistic state on failure
      setBlockModeEnabled(!nextEnabled);
      setToggleError(error.message || 'Toggle failed');
    } finally {
      setToggleLoading(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="flex flex-col h-full">
      <Header domain={currentDomain} />

      <BlockModeBanner
        enabled={blockModeEnabled}
        savings={blockedSavings}
        loading={toggleLoading}
        error={toggleError}
        onToggle={handleToggleBlockMode}
      />

      <ViewToggle view={view} onToggle={setView} />

      <div className="flex-1 overflow-y-auto">
        {view === 'pricetag' ? (
          <PriceTag
            pageData={pageData}
            summary={summary}
            domain={currentDomain}
          />
        ) : (
          <Receipt
            events={pageData?.events ?? []}
            value={pageData?.value}
          />
        )}
      </div>

      <Footer
        onOpenDashboard={() =>
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') })
        }
      />
    </div>
  );
}

function Header({ domain }) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-dashed border-[#333]">
      <div className="flex items-center justify-between">
        <span className="text-[#FFE600] font-bold text-lg tracking-wider">
          PRICELESS
        </span>
        <span className="text-[#666] text-xs font-mono truncate max-w-[180px]">
          {domain || 'no domain'}
        </span>
      </div>
    </div>
  );
}

function BlockModeBanner({ enabled, savings, loading, error, onToggle }) {
  return (
    <div className="px-4 py-3 border-b border-dashed border-[#333] bg-[#111]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-widest text-[#FFE600]">
            Block Mode
          </div>

          <div className="text-[11px] font-mono text-[#8A8A8A] mt-1">
            {enabled ? 'Trackers are being blocked' : 'Trackers are not being blocked'}
          </div>

          <div className="text-[11px] font-mono text-[#CFCFCF] mt-1">
            Savings avoided: ${Number(savings || 0).toFixed(2)}
          </div>

          {error ? (
            <div className="text-[11px] font-mono text-[#FF6B6B] mt-1">
              {error}
            </div>
          ) : null}
        </div>

        <button
          onClick={onToggle}
          disabled={loading}
          className={`shrink-0 px-3 py-2 rounded-full border text-[11px] font-mono uppercase tracking-widest transition-colors ${
            enabled
              ? 'border-[#FFE600] text-[#0A0A0A] bg-[#FFE600]'
              : 'border-[#444] text-[#BBB] bg-transparent hover:border-[#666]'
          } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {loading ? '...' : enabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

function ViewToggle({ view, onToggle }) {
  return (
    <div className="flex border-b border-dashed border-[#333]">
      {['pricetag', 'receipt'].map((v) => (
        <button
          key={v}
          onClick={() => onToggle(v)}
          className={`flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
            view === v
              ? 'text-[#FFE600] border-b-2 border-[#FFE600]'
              : 'text-[#666] hover:text-[#999]'
          }`}
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
    <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
      <span className="text-[#666] font-mono text-xs animate-pulse">
        SCANNING...
      </span>
    </div>
  );
}