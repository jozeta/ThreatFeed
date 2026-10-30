import React, { useMemo, useState } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useVulns } from '../hooks/useVulns';
import { buildHash } from '../hooks/useHashRoute';
import { useOpenTrending } from '../hooks/useOpenTrending';
import { useSettings } from '../context/SettingsContext';
import { EntityLink, EntityText } from '../components/EntityText';
import { buildBriefing, briefingToMarkdown, BriefingStory } from '../services/intelligence/briefing';
import { downloadText } from '../services/intelligence/iocExport';
import { SeverityBadge, CveChip } from '../components/Common/ThreatBadges';
import { Sparkline } from '../components/Common/Sparkline';
import { formatRelativeTime } from '../utils/date';
import { ClipboardList, Copy, Check, Download, ShieldAlert, Target, Layers, Skull, TrendingUp, Server, Database } from 'lucide-react';

interface BriefingPageProps {
  onOpenArticle: (article: Article) => void;
  onSearch: (query: string) => void;
}

const WINDOWS = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

const Section: React.FC<{ icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }> = ({ icon, title, count, children }) => (
  <section className="pt-6">
    <h2 className="flex items-center gap-2 pb-2 mb-3 border-b-2 border-theme-accent font-mono text-xs font-black uppercase tracking-widest text-theme-text">
      {icon}
      <span>{title}</span>
      {count !== undefined && <span className="ml-1 px-1.5 rounded-full bg-theme-surface border border-theme-border text-theme-text-muted">{count}</span>}
    </h2>
    {children}
  </section>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="text-xs font-serif italic text-theme-text-muted">{text}</p>;

export const BriefingPage: React.FC<BriefingPageProps> = ({ onOpenArticle, onSearch }) => {
  const { articles, cveIntel, incidents } = useFeeds();
  const vulns = useVulns();
  const { settings } = useSettings();
  const { open: openTrending, clickHint } = useOpenTrending(onSearch);
  const [windowHours, setWindowHours] = useState(24);
  const [copied, setCopied] = useState(false);

  const briefing = useMemo(
    () => buildBriefing(articles, cveIntel, settings.watchlistKeywords, settings.stackKeywords, windowHours, Date.now(), incidents, vulns),
    [articles, cveIntel, settings.watchlistKeywords, settings.stackKeywords, windowHours, incidents, vulns]
  );

  const stackVulnCount = briefing.stackVulns.kev.length + briefing.stackVulns.cves.length + briefing.stackVulns.advisories.length;
  const markdown = () => briefingToMarkdown(briefing);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => downloadText(`threatfeed-briefing-${briefing.generatedAt.slice(0, 10)}.md`, markdown(), 'text/markdown');

  const storyRow = (s: BriefingStory, terms: string[] = []) => {
    const p = s.cluster.primaryArticle;
    return (
      <li key={s.cluster.id} className="py-2.5 flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <SeverityBadge severity={p.severity} score={p.severityScore} />
          <button onClick={() => onOpenArticle(p)} className="text-left font-serif font-bold text-theme-text hover:text-theme-accent transition-colors leading-snug">
            {p.title}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-theme-text-muted pl-1">
          <span>{p.sourceName}</span>
          {s.cluster.clusterSize > 1 && <span className="text-theme-accent">+{s.cluster.clusterSize - 1} sources</span>}
          <span>· {formatRelativeTime(p.publishedAt)}</span>
          {terms.length > 0 && <span className="text-amber-500">· {terms.slice(0, 3).join(', ')}</span>}
          {(p.cves || []).slice(0, 3).map((cve) => <CveChip key={cve} cve={cve} />)}
        </div>
      </li>
    );
  };

  const ransomwareTotal = briefing.ransomware.count;

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-theme-accent" />
            <span>Daily Briefing</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            {briefing.articleCount} articles in the last {WINDOWS.find((w) => w.hours === windowHours)?.label}: what matters, most severe first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              onClick={() => setWindowHours(w.hours)}
              className={`px-2.5 py-1.5 rounded border transition-colors ${windowHours === w.hours ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-surface border-theme-border text-theme-text-muted hover:text-theme-text'}`}
            >
              {w.label}
            </button>
          ))}
          <button onClick={handleCopy} className="px-3 py-1.5 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
          </button>
          <button onClick={handleDownload} className="px-3 py-1.5 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            <span>Download .md</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10">
        <div className="lg:col-span-2">
          <Section icon={<ShieldAlert className="w-4 h-4 text-rose-500" />} title="Critical & High Severity" count={briefing.topStories.length}>
            {briefing.topStories.length ? <ul className="divide-y divide-theme-border/60">{briefing.topStories.map((s) => storyRow(s))}</ul> : <Empty text="No critical or high severity stories in this window." />}
          </Section>

          <Section icon={<Target className="w-4 h-4 text-amber-500" />} title="Watchlist Hits" count={briefing.watchlist.length}>
            {briefing.watchlist.length ? <ul className="divide-y divide-theme-border/60">{briefing.watchlist.map((s) => storyRow(s, s.watchlistTerms))}</ul> : <Empty text="Nothing matched your watchlist." />}
          </Section>

          <Section icon={<Server className="w-4 h-4 text-theme-accent" />} title="Relevant to Your Stack" count={briefing.stack.length}>
            {settings.stackKeywords.length === 0
              ? <Empty text='Add the products you run under Settings → "My Stack" to see stories that affect you.' />
              : briefing.stack.length ? <ul className="divide-y divide-theme-border/60">{briefing.stack.map((s) => storyRow(s, s.stackTerms))}</ul> : <Empty text="No stories mention your stack." />}
          </Section>

          <Section icon={<ShieldAlert className="w-4 h-4 text-rose-500" />} title="Vulnerabilities in Your Stack" count={stackVulnCount}>
            {settings.stackKeywords.length === 0
              ? <Empty text='Add the products you run under Settings → "My Stack" to see new KEV entries, critical CVEs and advisories that affect them.' />
              : !vulns
                ? <Empty text="Vulnerability data arrives with the server snapshot." />
                : stackVulnCount === 0
                  ? <Empty text="Nothing new for your stack in this window." />
                  : (
                    <ul className="divide-y divide-theme-border/60 text-xs">
                      {briefing.stackVulns.kev.map((k) => (
                        <li key={k.cve} className="py-2">
                          <a href={buildHash('vulnerabilities', 'kev', new URLSearchParams({ cve: k.cve }))} className="font-mono font-bold text-theme-accent hover:underline">{k.cve}</a>
                          <span className="ml-1.5 px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">added to KEV</span>
                          <p className="font-serif text-theme-text mt-0.5"><EntityText text={k.name} /></p>
                          <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">{k.terms.join(', ')}</p>
                        </li>
                      ))}
                      {briefing.stackVulns.cves.map((r) => (
                        <li key={r.id} className="py-2">
                          <a href={buildHash('vulnerabilities', 'new', new URLSearchParams({ cve: r.id }))} className="font-mono font-bold text-theme-accent hover:underline">{r.id}</a>
                          <span className="ml-1.5 font-mono text-rose-500 font-bold">CVSS {r.score}</span>
                          <p className="font-serif text-theme-text mt-0.5 line-clamp-2"><EntityText text={r.description ?? ''} /></p>
                          <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">{r.terms.join(', ')}</p>
                        </li>
                      ))}
                      {briefing.stackVulns.advisories.map((a) => (
                        <li key={a.id} className="py-2">
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-mono font-bold text-theme-accent hover:underline">{a.id}</a>
                          <span className="ml-1.5 font-mono text-theme-text-muted">{a.severity} · {a.ecosystem}/{a.package}</span>
                          <p className="font-serif text-theme-text mt-0.5"><EntityText text={a.summary} /></p>
                          <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">{a.terms.join(', ')}</p>
                        </li>
                      ))}
                    </ul>
                  )}
          </Section>
        </div>

        <div>
          <Section icon={<Layers className="w-4 h-4 text-rose-500" />} title="New in CISA KEV" count={briefing.newKev.length}>
            {Object.keys(cveIntel).length === 0
              ? <Empty text="KEV data arrives with the server snapshot (Settings → Data Source)." />
              : briefing.newKev.length ? (
                <ul className="space-y-2">
                  {briefing.newKev.map((k) => (
                    <li key={k.cve} className="text-xs font-serif">
                      <div className="flex items-center gap-2"><CveChip cve={k.cve} /><span className="font-mono text-theme-text-muted">added {k.intel.kevDateAdded}</span></div>
                      {k.intel.kevName && <p className="text-theme-text mt-0.5"><EntityText text={k.intel.kevName} /></p>}
                    </li>
                  ))}
                </ul>
              ) : <Empty text="No CVEs added to KEV in the past week appear in this window." />}
          </Section>

          <Section icon={<Skull className="w-4 h-4 text-rose-500" />} title="Ransomware Activity" count={ransomwareTotal}>
            {ransomwareTotal ? (
              <ul className="space-y-1 text-xs font-mono">
                {briefing.ransomware.byGroup.slice(0, 10).map(([group, n]) => (
                  <li key={group} className="flex items-center gap-2">
                    <span className="w-28 truncate text-theme-text"><EntityLink entity={{ kind: 'group', id: group.toLowerCase() }}>{group}</EntityLink></span>
                    <span className="h-1.5 rounded bg-rose-500/70" style={{ width: `${(n / briefing.ransomware.byGroup[0][1]) * 100}px` }} />
                    <span className="text-theme-text-muted">{n}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty text="No new leak-site victims in this window." />}
          </Section>

          <Section icon={<Database className="w-4 h-4 text-rose-500" />} title="New Breaches (HIBP)" count={briefing.breaches.length}>
            {briefing.breaches.length ? (
              <ul className="space-y-2 text-xs">
                {briefing.breaches.slice(0, 8).map((b) => (
                  <li key={b.name}>
                    <span className="font-serif font-bold text-theme-text">{b.title}</span>{' '}
                    <span className="font-mono text-rose-500">{b.records.toLocaleString('en-US')} accounts</span>
                    <p className="font-mono text-[11px] text-theme-text-muted">{b.dataClasses.slice(0, 4).join(', ')}</p>
                  </li>
                ))}
              </ul>
            ) : <Empty text={incidents ? 'No breaches added to Have I Been Pwned in this window.' : 'Breach data arrives with the server snapshot.'} />}
          </Section>

          <Section icon={<TrendingUp className="w-4 h-4 text-theme-accent" />} title="Trending This Week" count={briefing.trending.length}>
            {briefing.trending.length ? (
              <ul className="space-y-1.5 text-xs font-mono">
                {briefing.trending.map((t) => (
                  <li key={`${t.kind}:${t.name}`}>
                    <button onClick={() => void openTrending(t)} className="w-full flex items-center gap-2 hover:text-theme-accent transition-colors text-left" title={`${t.name}: click to ${clickHint(t)}`}>
                      <span className="flex-1 truncate text-theme-text">{t.name}</span>
                      <span className="text-[10px] uppercase text-theme-text-muted">{t.kind}</span>
                      <Sparkline values={t.daily} className="text-theme-accent" />
                      <span className="w-6 text-right">{t.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <Empty text="Not enough repeated mentions yet." />}
          </Section>
        </div>
      </div>
    </div>
  );
};
