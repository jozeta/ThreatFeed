import React, { useMemo } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useTrends } from '../hooks/useVulns';
import { useHashParam, useHashRoute } from '../hooks/useHashRoute';
import { useOpenTrending } from '../hooks/useOpenTrending';
import {
  historyStart, PERIOD_DAYS, rankTrends, risers, TREND_KIND_LABELS, TrendKind, TrendPeriod, TrendRow, trendsVocab, weekTrendDays,
} from '../services/intelligence/trends';
import { groupDisplayName } from '../utils/countries';
import { Sparkline } from '../components/Common/Sparkline';
import { SectionTitle } from './incidents/shared';
import { CvePanelHost } from './vulns/CvePanelHost';
import { TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';

const TOP = 25;
const RISERS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIODS: { id: TrendPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];
const KINDS: { id: TrendKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cve', label: 'CVEs' },
  { id: 'ransomware', label: 'Ransomware' },
  { id: 'actor', label: 'Actors' },
  { id: 'product', label: 'Products' },
  { id: 'vendor', label: 'Vendors' },
];
const PERIOD_TEXT: Record<TrendPeriod, { now: string; before: string }> = {
  week: { now: 'this week', before: 'the week before' },
  month: { now: 'in the last 30 days', before: 'the 30 days before' },
  year: { now: 'in the last 52 weeks', before: 'the 52 weeks before' },
};

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex-shrink-0 ${
    active ? 'bg-theme-accent text-white font-bold shadow-sm' : 'bg-theme-surface text-theme-text-muted hover:text-theme-text border border-theme-border'
  }`;

const KindBadge: React.FC<{ kind: TrendKind }> = ({ kind }) => (
  <span className="px-1 rounded border border-theme-border text-[9px] font-bold uppercase text-theme-text-muted flex-shrink-0">{TREND_KIND_LABELS[kind]}</span>
);

/** Change against the previous period; a dash while the history doesn't reach back that far */
const Change: React.FC<{ row: TrendRow }> = ({ row }) => {
  if (row.change === null) return <span className="text-theme-text-muted" title="No history for the period before yet">–</span>;
  if (row.change === 0) return <span className="text-theme-text-muted" title={`${row.previous} the period before`}>±0</span>;
  const up = row.change > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-rose-500 font-bold' : 'text-theme-text-muted'}`} title={`${row.previous} the period before`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(row.change)}
    </span>
  );
};

/**
 * What the news has been talking about: CVEs, ransomware groups, threat actors, products and vendors ranked
 * by articles over the last week, month or year, from the two-year history the snapshot keeps (data/trends.json).
 * The week also counts this browser's own feeds and articles newer than the snapshot.
 */
export const TrendsPage: React.FC<{ onOpenArticle: (article: Article) => void; onSearch: (query: string) => void }> = ({ onOpenArticle, onSearch }) => {
  const { articles, feeds, incidents } = useFeeds();
  const history = useTrends();
  const [, navigate] = useHashRoute();
  const [periodParam, setPeriod] = useHashParam('period', 'week');
  const [kindParam, setKind] = useHashParam('kind', 'all');
  const [cve, setCve] = useHashParam('cve');
  const period: TrendPeriod = periodParam === 'month' || periodParam === 'year' ? periodParam : 'week';
  const kind = KINDS.some((k) => k.id === kindParam) ? (kindParam as TrendKind | 'all') : 'all';
  const { open: openActor } = useOpenTrending(onSearch);

  // Leak-site group names as the history spells them, back to the Ransomware page's group keys
  const groupKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of incidents?.victims ?? []) map.set(groupDisplayName(v.group).toLowerCase(), v.group.toLowerCase());
    return map;
  }, [incidents]);

  // The week's vocabulary: vendors as the history has them (the KEV catalog itself is in vulns.json, which this
  // page doesn't need), so it is only rebuilt when the history or the leak-site groups change
  const weekVocab = useMemo(() => {
    const vendors = new Set<string>();
    for (const counts of Object.values(history?.days ?? {})) for (const k of Object.keys(counts)) if (k.startsWith('vendor:')) vendors.add(k.slice(7));
    return trendsVocab((incidents?.victims ?? []).map((v) => v.group), [...vendors]);
  }, [history, incidents]);
  const customSources = useMemo(() => new Set(feeds.filter((f) => f.isCustom).map((f) => f.id)), [feeds]);

  const view = useMemo(
    () => (period === 'week' ? { days: weekTrendDays(history, articles, weekVocab, customSources) } : { days: history?.days ?? {}, weeks: history?.weeks }),
    [period, history, articles, weekVocab, customSources]
  );

  const rows = useMemo(() => rankTrends(view, period, kind), [view, period, kind]);
  const rising = useMemo(() => risers(rows, RISERS), [rows]);

  // Like the adaptive activity chart: say how much history there is while it covers less than the period
  const since = historyStart(view);
  const coveredDays = since ? Math.floor(Date.now() / DAY_MS) - Math.floor(Date.parse(`${since}T00:00:00Z`) / DAY_MS) + 1 : 0;
  const periodDays = PERIOD_DAYS[period];

  const openRow = (r: TrendRow) => {
    if (r.kind === 'cve') return setCve(r.name, true);
    if (r.kind === 'ransomware') {
      const group = groupKeys.get(r.name.toLowerCase()) ?? r.name.toLowerCase();
      return navigate('ransomware', 'groups', new URLSearchParams({ group }));
    }
    // Actors open their profile when one matches; products and vendors search (vendors get a panel later)
    void openActor(r);
  };
  const clickHint = (r: TrendRow) => (r.kind === 'cve' ? 'Open the CVE' : r.kind === 'ransomware' ? 'Open the group' : r.kind === 'actor' ? 'Open the actor profile or search' : 'Search');

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <TrendingUp className="w-6 h-6 text-theme-accent" />
          <span>Trends</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          Which CVEs, ransomware groups, threat actors, products and vendors the news has been covering, and how that is changing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 mb-6">
        <div className="flex gap-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} className={chipClass(period === p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none min-w-0" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={chipClass(kind === k.id)}>{k.label}</button>
          ))}
        </div>
      </div>

      {since && coveredDays < periodDays && (
        <p className="mb-4 text-[11px] font-mono text-theme-text-muted">History since {since}: {coveredDays} of {periodDays} days so far</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm font-serif text-theme-text-muted">
          {period !== 'week' && !history
            ? 'The trends history arrives with the server snapshot (Settings → Data Source).'
            : 'Nothing mentioned in this period yet.'}
        </p>
      ) : (
        <div className="space-y-8">
          {rising.length > 0 && (
            <section>
              <SectionTitle>Biggest risers</SectionTitle>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {rising.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => openRow(r)}
                    title={`${r.count} articles ${PERIOD_TEXT[period].now}, ${r.previous} ${PERIOD_TEXT[period].before}. ${clickHint(r)}.`}
                    className="flex-shrink-0 flex flex-col gap-1 px-3 py-2 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-left text-xs font-mono transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {kind === 'all' && <KindBadge kind={r.kind} />}
                      <span className="font-bold text-theme-text truncate max-w-[10rem]">{r.name}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Sparkline values={r.series} width={48} height={14} className="text-theme-accent" />
                      <span className="text-rose-500 font-bold">+{r.change}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Most mentioned {PERIOD_TEXT[period].now}</SectionTitle>
            <ol className="divide-y divide-theme-border/60 text-xs font-mono">
              {rows.slice(0, TOP).map((r, i) => (
                <li key={r.key} className="flex items-center gap-2 sm:gap-3 py-2">
                  <span className="w-5 text-right text-theme-text-muted flex-shrink-0">{i + 1}</span>
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <button onClick={() => openRow(r)} title={clickHint(r)} className="text-theme-text font-bold hover:underline hover:text-theme-accent text-left truncate">{r.name}</button>
                    {kind === 'all' && <KindBadge kind={r.kind} />}
                  </span>
                  <Sparkline values={r.series} width={64} height={16} className="text-theme-accent flex-shrink-0 hidden min-[360px]:block" />
                  <span className="w-8 text-right font-bold text-theme-text flex-shrink-0" title={`Articles ${PERIOD_TEXT[period].now}`}>{r.count}</span>
                  <span className="w-10 text-right flex-shrink-0"><Change row={r} /></span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] font-serif text-theme-text-muted">
              Counts are articles per {period === 'year' ? 'week' : 'day'} in the sparklines; leak-site posts are left out (see the Ransomware page), and vendors
              only count in security coverage. The change compares with {PERIOD_TEXT[period].before}.
            </p>
          </section>
        </div>
      )}

      {cve && <CvePanelHost cve={cve} articles={articles} onOpenArticle={(a) => { setCve(''); onOpenArticle(a); }} onClose={() => setCve('')} />}
    </div>
  );
};
