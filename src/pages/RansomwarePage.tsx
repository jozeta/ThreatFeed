import React, { useMemo } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useRansomwareIntel } from '../hooks/useVulns';
import { setHashParams, useHashRoute } from '../hooks/useHashRoute';
import { useLeakSiteVictims } from '../hooks/useLeakSiteVictims';
import { VictimsTab } from './incidents/VictimsTab';
import { BreachesTab } from './incidents/BreachesTab';
import { IncidentNewsTab } from './incidents/IncidentNewsTab';
import { PublicReportsTab } from './incidents/PublicReportsTab';
import { PaymentsTab } from './incidents/PaymentsTab';
import { GroupsTab } from './incidents/GroupsTab';
import { Skull, Database, Newspaper, Megaphone, Bitcoin, Users } from 'lucide-react';

const TABS = ['victims', 'groups', 'reports', 'breaches', 'payments', 'news'] as const;
type Tab = (typeof TABS)[number];

export const RansomwarePage: React.FC<{ onOpenArticle: (article: Article) => void }> = ({ onOpenArticle }) => {
  const { articles, incidents } = useFeeds();
  const intel = useRansomwareIntel();

  // The tab lives in the URL (#/ransomware/reports) like the Vulns page
  const [route, navigate] = useHashRoute();
  const tab: Tab = (TABS as readonly string[]).includes(route.sub) ? (route.sub as Tab) : 'victims';
  const setTab = (t: Tab) => navigate('ransomware', t === 'victims' ? '' : t);
  // A group opens the app's group panel (?group=<name>), which any page can link to
  const openGroup = (g: string) => setHashParams({ group: g.toLowerCase() }, true);

  // Structured victims come with the snapshot; without one, they're parsed from the RSS feed
  const { victims, structured } = useLeakSiteVictims();
  const groupNames = useMemo(() => Array.from(new Set(victims.map((v) => v.group))).filter((g) => g.length >= 4), [victims]);
  const breaches = incidents?.breaches ?? [];

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'victims', label: 'Leak-site victims', icon: <Skull className="w-4 h-4" />, count: victims.length },
    { id: 'groups', label: 'Groups', icon: <Users className="w-4 h-4" />, count: new Set(victims.map((v) => v.group.toLowerCase())).size },
    { id: 'reports', label: 'Public reports', icon: <Megaphone className="w-4 h-4" />, count: intel?.attacks.length },
    { id: 'breaches', label: 'Data breaches', icon: <Database className="w-4 h-4" />, count: breaches.length },
    { id: 'payments', label: 'Ransom payments', icon: <Bitcoin className="w-4 h-4" /> },
    { id: 'news', label: 'Incident news', icon: <Newspaper className="w-4 h-4" /> },
  ];
  const noData = (what: string) => (
    <p className="text-sm font-serif text-theme-text-muted">{what} arrives with the server snapshot (Settings → Data Source).</p>
  );

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <Skull className="w-6 h-6 text-rose-500" />
          <span>Ransomware & Breaches</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          Who ransomware groups are posting on their leak sites, how they operate, which attacks made the news, which breaches just surfaced, and what victims paid.
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

      {tab === 'victims' && (
        <VictimsTab victims={victims} structured={structured} intel={intel} />
      )}
      {tab === 'groups' && <GroupsTab victims={victims} intel={intel} onOpenGroup={openGroup} />}
      {tab === 'reports' && (intel?.attacks.length ? <PublicReportsTab attacks={intel.attacks} /> : noData('Public attack reports'))}
      {tab === 'breaches' && (breaches.length > 0 ? <BreachesTab breaches={breaches} /> : noData('Breach data from Have I Been Pwned'))}
      {tab === 'payments' && (intel?.payments?.families.length ? <PaymentsTab families={intel.payments.families} updatedAt={intel.payments.updatedAt} /> : noData('Ransom payment data'))}
      {tab === 'news' && <IncidentNewsTab articles={articles} groupNames={groupNames} onOpenArticle={onOpenArticle} />}
    </div>
  );
};
