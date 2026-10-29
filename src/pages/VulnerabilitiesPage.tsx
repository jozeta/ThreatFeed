import React, { useMemo, useState } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { formatRelativeTime } from '../utils/date';
import { KevTab } from './vulns/KevTab';
import { NewCvesTab } from './vulns/NewCvesTab';
import { ExploitTab } from './vulns/ExploitTab';
import { OpenSourceTab } from './vulns/OpenSourceTab';
import { VulnNewsTab } from './vulns/VulnNewsTab';
import { CvePanel } from './vulns/CvePanel';
import { articlesByCve } from './vulns/shared';
import { ShieldAlert, Flame, FilePlus2, Gauge, Package, Newspaper } from 'lucide-react';

type Tab = 'kev' | 'new' | 'epss' | 'oss' | 'news';

export const VulnerabilitiesPage: React.FC<{ onOpenArticle: (article: Article) => void }> = ({ onOpenArticle }) => {
  const { articles, feeds, vulns } = useFeeds();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>('kev');
  const [openCve, setOpenCve] = useState<string | null>(null);

  const news = useMemo(() => articlesByCve(articles), [articles]);
  const kevIds = useMemo(() => new Set(vulns?.kev.map((k) => k.cve) ?? []), [vulns]);
  // Vendors hidden in Settings drop out of the KEV views (but a CVE still counts as "in KEV" elsewhere)
  const kev = useMemo(() => {
    const hidden = new Set(settings.hiddenVulnVendors);
    return (vulns?.kev ?? []).filter((k) => !hidden.has(k.vendor));
  }, [vulns, settings.hiddenVulnVendors]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'kev', label: 'Known exploited (KEV)', icon: <Flame className="w-4 h-4" />, count: kev.length },
    { id: 'new', label: 'New CVEs', icon: <FilePlus2 className="w-4 h-4" />, count: vulns?.nvd?.total },
    { id: 'epss', label: 'Exploit prediction', icon: <Gauge className="w-4 h-4" /> },
    { id: 'oss', label: 'Open source', icon: <Package className="w-4 h-4" />, count: vulns?.advisories.length },
    { id: 'news', label: 'Vulnerability news', icon: <Newspaper className="w-4 h-4" /> },
  ];

  const noData = (what: string) => (
    <p className="text-sm font-serif text-theme-text-muted">{what} arrives with the server snapshot (Settings → Data Source). Refresh once a snapshot is available.</p>
  );

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-rose-500" />
          <span>Vulnerabilities & KEV</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          What attackers are exploiting (CISA KEV), what is likely next (EPSS), what was just disclosed (NVD, GitHub) and how the news is covering it.
          {vulns && <span className="font-mono text-[11px]"> · data updated {formatRelativeTime(vulns.updatedAt)}</span>}
        </p>
      </div>

      <div className="flex gap-1 mt-6 mb-6 border-b border-theme-border overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-theme-accent text-theme-text' : 'border-transparent text-theme-text-muted hover:text-theme-text'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined && <span className="px-1.5 rounded-full bg-theme-surface border border-theme-border text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'kev' && (vulns?.kev.length ? <KevTab kev={kev} hiddenVendorCount={settings.hiddenVulnVendors.length} news={news} onOpenCve={setOpenCve} /> : noData('The CISA KEV catalog'))}
      {tab === 'new' && (vulns?.nvd ? <NewCvesTab stats={vulns.nvd} notable={vulns.notable} kevIds={kevIds} news={news} onOpenCve={setOpenCve} /> : noData('NVD data'))}
      {tab === 'epss' && (vulns?.epssTop.length ? <ExploitTab epssTop={vulns.epssTop} kev={vulns.kev} kevVisible={kev} news={news} onOpenCve={setOpenCve} /> : noData('EPSS data'))}
      {tab === 'oss' && (vulns?.advisories.length ? <OpenSourceTab advisories={vulns.advisories} onOpenCve={setOpenCve} /> : noData('GitHub advisory data'))}
      {tab === 'news' && <VulnNewsTab articles={articles} feeds={feeds} kevIds={kevIds} onOpenArticle={onOpenArticle} />}

      {openCve && (
        <CvePanel
          cve={openCve}
          vulns={vulns}
          news={news.get(openCve) ?? []}
          onOpenArticle={(a) => { setOpenCve(null); onOpenArticle(a); }}
          onClose={() => setOpenCve(null)}
        />
      )}
    </div>
  );
};
