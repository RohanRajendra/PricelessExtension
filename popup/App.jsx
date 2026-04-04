// popup/App.jsx
// Root component — manages view state, fetches data from the service worker on mount.

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
    loadData();
  }, []);

  async function loadData() {
    // Get the currently active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      setLoading(false);
      return;
    }

    // Skip non-http pages (chrome://, about:, etc.)
    if (!tab.url.startsWith('http')) {
      setLoading(false);
      return;
    }

    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, '');
    setCurrentDomain(domain);

    // Ask service worker for today's tracker data + cached policy summary for this domain
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_DATA',
      payload: { domain },
    });

    setPageData(response?.pageData ?? null);
    setSummary(response?.summary ?? null);
    setLoading(false);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="flex flex-col h-full">
      <Header domain={currentDomain} />
      <ViewToggle view={view} onToggle={setView} />
      <div className="flex-1 overflow-y-auto">
        {view === 'pricetag'
          ? <PriceTag pageData={pageData} summary={summary} domain={currentDomain} />
          : <Receipt events={pageData?.events ?? []} value={pageData?.value} />
        }
      </div>
      <Footer onOpenDashboard={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') })} />
    </div>
  );
}

function Header({ domain }) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-dashed border-[#333]">
      <div className="flex items-center justify-between">
        <span className="text-[#FFE600] font-bold text-lg tracking-wider">PRICELESS</span>
        <span className="text-[#666] text-xs font-mono truncate max-w-[180px]">{domain || 'no domain'}</span>
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
          className={`flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-colors
            ${view === v
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
      <span className="text-[#666] font-mono text-xs animate-pulse">SCANNING...</span>
    </div>
  );
}
