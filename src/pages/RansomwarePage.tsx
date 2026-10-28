import React, { useMemo, useState } from 'react';
import { Article, LeakSiteVictim } from '../types';
import { useFeeds } from '../context/FeedContext';
import { ransomwareVictims } from '../services/intelligence/ransomware';
import { countryCodeFromName } from '../utils/countries';
import { VictimsTab } from './incidents/VictimsTab';
import { BreachesTab } from './incidents/BreachesTab';
import { IncidentNewsTab } from './incidents/IncidentNewsTab';
import { Skull, Database, Newspaper } from 'lucide-react';

type Tab = 'victims' | 'breaches' | 'news';

export const RansomwarePage: React.FC<{ onOpenArticle: (article: Article) => void }> = ({ onOpenArticle }) => {
  const { articles, incidents } = useFeeds();
  const [tab, setTab] = useState<Tab>('victims');

  // Structured victims come with the snapshot; without one, fall back to parsing the RSS feed
  const victims: LeakSiteVictim[] = useMemo(() => {
    if (incidents && incidents.victims.length > 0) return incidents.victims;
    return ransomwareVictims(articles).map((v) => ({
      id: v.id,
      victim: v.victim,
      group: v.group,
      country: countryCodeFromName(v.country),
      sector: v.sector,
      discoveredAt: v.publishedAt,
      url: v.url,
      description: v.description,
    }));
  }, [incidents, articles]);
  const structured = Boolean(incidents && incidents.victims.length > 0);
  const groupNames = useMemo(() => Array.from(new Set(victims.map((v) => v.group))).filter((g) => g.length >= 4), [victims]);
  const breaches = incidents?.breaches ?? [];

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'victims', label: 'Leak-site victims', icon: <Skull className="w-4 h-4" />, count: victims.length },
    { id: 'breaches', label: 'Data breaches', icon: <Database className="w-4 h-4" />, count: breaches.length },
    { id: 'news', label: 'Incident news', icon: <Newspaper className="w-4 h-4" /> },
  ];

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <Skull className="w-6 h-6 text-rose-500" />
          <span>Ransomware & Breaches</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          Who ransomware groups are posting on their leak sites, which breaches just surfaced, and how the news is covering them.
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
        <VictimsTab victims={victims} groups={incidents?.groups ?? {}} articles={articles} structured={structured} onOpenArticle={onOpenArticle} />
      )}
      {tab === 'breaches' && (breaches.length > 0
        ? <BreachesTab breaches={breaches} />
        : <p className="text-sm font-serif text-theme-text-muted">Breach data from Have I Been Pwned arrives with the server snapshot (Settings → Data Source).</p>)}
      {tab === 'news' && <IncidentNewsTab articles={articles} groupNames={groupNames} onOpenArticle={onOpenArticle} />}
    </div>
  );
};
