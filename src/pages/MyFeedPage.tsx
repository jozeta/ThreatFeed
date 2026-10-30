import React, { useMemo } from 'react';
import { Article, VulnData } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { useVulns } from '../hooks/useVulns';
import { AlertRow, useAlertFeed } from '../hooks/useAlertFeed';
import { buildHash, useHashParam, useHashRoute } from '../hooks/useHashRoute';
import { usePagedCount } from '../hooks/usePagedCount';
import { ListArticle } from '../components/ArticleCard/ListArticle';
import { NewspaperView } from '../components/Newspaper/NewspaperView';
import { ListThumbnailView } from '../components/Layouts/ListThumbnailView';
import { EmptyState } from '../components/Common/EmptyState';
import { EntityLink, EntityText } from '../components/EntityText';
import { LoadMoreButton } from '../components/Common/LoadMoreButton';
import { ExploitBadges, SeverityPill } from './vulns/shared';
import { formatRelativeTime } from '../utils/date';
import { Inbox, CheckCheck, SlidersHorizontal, Newspaper, ShieldAlert } from 'lucide-react';

const SUBS = ['news', 'vulns'] as const;
type Sub = (typeof SUBS)[number];

const PAGE_SIZE = 50;

const NewTag: React.FC = () => (
  <span className="px-1.5 py-0.5 rounded bg-theme-accent text-white text-[10px] font-mono font-bold uppercase tracking-wider flex-shrink-0">New</span>
);

/** Names of the rules behind a row, as small labels */
const RuleLabels: React.FC<{ row: AlertRow }> = ({ row }) => (
  <span className="flex flex-wrap gap-1">
    {[...new Set(row.matches.map((m) => m.ruleName))].map((name) => (
      <span key={name} className="px-1.5 py-0.5 rounded bg-theme-surface border border-theme-border text-[10px] font-mono text-theme-text-muted">{name}</span>
    ))}
  </span>
);

/** What the app knows about a CVE for the row: vendor/product, score and KEV status */
function cveFacts(cve: string, vulns: VulnData | null) {
  const kev = vulns?.kev.find((k) => k.cve === cve);
  const record = vulns?.notable.find((r) => r.id === cve) ?? vulns?.watchable?.find((r) => r.id === cve);
  const score = kev?.cvss ?? record?.score;
  return {
    inKev: Boolean(kev),
    vendor: kev?.vendor,
    product: kev?.product,
    score,
    severity: record?.severity,
    exploit: vulns?.exploits?.[cve],
  };
}

const VulnRow: React.FC<{ row: AlertRow; vulns: VulnData | null; onOpen: () => void }> = ({ row, vulns, onOpen }) => {
  const facts = cveFacts(row.ref, vulns);
  // Watched events carry the change in their title; a plain CVE match just repeats vendor and product
  const events = row.matches.filter((m) => m.itemId.includes('#'));
  return (
    <article
      onClick={onOpen}
      className="cursor-pointer flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-theme-border/60 hover:bg-theme-surface/80 transition-colors"
    >
      <div className="flex items-center gap-2 flex-wrap sm:w-64 flex-shrink-0">
        {row.isNew && <NewTag />}
        <span className="font-mono font-bold text-sm text-theme-accent">{row.ref}</span>
        {facts.inKev && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">KEV</span>}
        <ExploitBadges info={facts.exploit} />
      </div>
      <div className="min-w-0 flex-grow space-y-1">
        <div className="font-serif text-sm text-theme-text">
          {events.length > 0
            ? events.map((m) => <p key={m.itemId}><EntityText text={m.title} /></p>)
            : <p className="truncate">{facts.vendor ? <><EntityLink entity={{ kind: 'vendor', id: facts.vendor }}>{facts.vendor}</EntityLink> {facts.product}</> : <EntityText text={row.matches[0].title} />}</p>}
        </div>
        <RuleLabels row={row} />
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 font-mono text-xs text-theme-text-muted">
        {facts.score !== undefined && <SeverityPill severity={facts.severity} score={facts.score} />}
        <time>{formatRelativeTime(row.firstMatchedAt)}</time>
      </div>
    </article>
  );
};

export const MyFeedPage: React.FC<{ onOpenArticle: (article: Article) => void }> = ({ onOpenArticle }) => {
  const { articles } = useFeeds();
  const vulns = useVulns();
  const { settings } = useSettings();
  const feed = useAlertFeed();

  // Sub-tab, rule filter and open CVE live in the URL (#/feed/vulns?rule=…&cve=…)
  const [route, navigate] = useHashRoute();
  const sub: Sub = (SUBS as readonly string[]).includes(route.sub) ? (route.sub as Sub) : 'news';
  const [ruleParam, setRuleParam] = useHashParam('rule');
  // The CVE panel itself is the app's, over any page
  const [, setCveParam] = useHashParam('cve');
  const openCve = (cve: string) => setCveParam(cve, true);

  const articleById = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  // Articles that have aged out of the store can no longer be opened, so their rows are dropped
  const allRows = sub === 'news' ? feed.news.filter((r) => articleById.has(r.ref)) : feed.vulns;
  const chips = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of allRows) for (const m of row.matches) byId.set(m.ruleId, m.ruleName);
    return [...byId];
  }, [allRows]);
  const rows = ruleParam ? allRows.filter((r) => r.matches.some((m) => m.ruleId === ruleParam)) : allRows;
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(rows.length, PAGE_SIZE);
  // News follows the header's layout buttons; the compact list keeps the per-row NEW tags and rule names
  const newsLayout = sub === 'news' && rows.length > 0 ? settings.layout : 'list';
  const layoutArticles = useMemo(
    () => (newsLayout === 'list' ? [] : rows.map((r) => articleById.get(r.ref)!)),
    [newsLayout, rows, articleById]
  );

  const subTabs: { id: Sub; label: string; icon: React.ReactNode }[] = [
    { id: 'news', label: 'News', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'vulns', label: 'Vulns', icon: <ShieldAlert className="w-4 h-4" /> },
  ];
  const chipClass = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex-shrink-0 ${
      active ? 'bg-theme-accent text-white font-bold shadow-sm' : 'bg-theme-surface text-theme-text-muted hover:text-theme-text border border-theme-border'
    }`;

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Inbox className="w-6 h-6 text-theme-accent" />
            <span>My Feed</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">Everything your alert rules have matched, newest first.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => void feed.markSeen(sub)}
            disabled={feed.newCount[sub] === 0}
            className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent disabled:opacity-50 disabled:hover:border-theme-border transition-colors font-mono text-xs flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all seen</span>
          </button>
          <a
            href={buildHash('settings', 'alert-rules')}
            className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors font-mono text-xs flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Manage rules</span>
          </a>
        </div>
      </div>

      <div className="flex gap-1 mt-6 mb-4 border-b border-theme-border overflow-x-auto" role="tablist">
        {subTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={sub === t.id}
            onClick={() => navigate('feed', t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
              sub === t.id ? 'border-theme-accent text-theme-text' : 'border-transparent text-theme-text-muted hover:text-theme-text'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {feed.newCount[t.id] > 0 && <span className="px-1.5 rounded-full bg-theme-accent text-white text-[10px]">{feed.newCount[t.id]} new</span>}
          </button>
        ))}
      </div>

      {chips.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-3">
          <button onClick={() => setRuleParam('')} className={chipClass(!ruleParam)}>All</button>
          {chips.map(([id, name]) => (
            <button key={id} onClick={() => setRuleParam(id)} className={chipClass(ruleParam === id)}>{name}</button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message="Nothing matched yet"
          subtext="Matches from your alert rules show up here. Add or tune rules in Settings → Alert Rules."
        />
      ) : newsLayout !== 'list' ? (
        // The layout views bring their own page padding; cancel ours so the widths line up
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          {newsLayout === 'newspaper'
            ? <NewspaperView articles={layoutArticles} isLoading={false} onOpenArticle={onOpenArticle} chronological />
            : <ListThumbnailView articles={layoutArticles} isLoading={false} onOpenArticle={onOpenArticle} />}
        </div>
      ) : (
        <div className="rounded-lg border border-theme-border bg-theme-card overflow-hidden">
          {rows.slice(0, visibleCount).map((row) => {
            if (row.kind === 'vulns') return <VulnRow key={row.ref} row={row} vulns={vulns} onOpen={() => openCve(row.ref)} />;
            const article = articleById.get(row.ref)!;
            return (
              <div key={row.ref}>
                <ListArticle article={article} onOpen={() => onOpenArticle(article)} />
                <div className="flex items-center gap-2 px-4 pb-2 -mt-1 border-b border-theme-border/60">
                  {row.isNew && <NewTag />}
                  <RuleLabels row={row} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {hasMore && newsLayout === 'list' && <LoadMoreButton remaining={remaining} onClick={showMore} />}

    </div>
  );
};
