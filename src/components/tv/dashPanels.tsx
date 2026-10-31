import { ReactNode, useState } from 'react';
import { LeakSiteVictim, MsrcData, StatsData, VulnData } from '../../types';
import { ransomDashboard, ransomExtras, vulnDashboard, vulnExtras } from '../../services/tv/dashboard';
import { chartReady, DailyArea, flagOf, HBarList, ListPanel, StatCard, VBars, WeeklyBarsLine } from './dashParts';
import { NUMBER_SHAPES, PanelDef, WIDE_SHAPES } from './DashboardWall';
import { shortAge } from './TvTileCard';

/**
 * The panel pools of the two dashboards, in show order (v1 panels first, then the new ones). A pool builder decides
 * which panels exist from the data it is given (once per cycle); each panel computes its own figures from `fresh()`
 * when it mounts, so every arrival shows the latest data.
 */

export interface VulnCtx {
  vulns: VulnData | null; msrc: MsrcData | null; stats: StatsData | null;
  stackKeywords: string[]; watchedCves: string[]; now: number;
}
export interface RansomCtx { victims: LeakSiteVictim[]; stats: StatsData | null; now: number }

/** Remembers the last result while the inputs are the same objects and the clock is within the same 5 s */
function memoLast<C extends { now: number }, R>(compute: (c: C) => R): (c: C) => R {
  let keys: unknown[] = [];
  let last: R;
  return c => {
    const next = [...Object.values(c).filter(v => typeof v === 'object'), Math.floor(c.now / 5000)];
    if (next.length !== keys.length || next.some((v, i) => v !== keys[i])) {
      keys = next;
      last = compute(c);
    }
    return last;
  };
}

const vulnData = memoLast((c: VulnCtx) => ({
  d: vulnDashboard(c.vulns, c.msrc, c.stats, c.now),
  x: vulnExtras(c.vulns, c.msrc, c.stackKeywords, c.watchedCves, c.now),
}));
const ransomData = memoLast((c: RansomCtx) => ({
  d: ransomDashboard(c.victims, c.stats, c.now),
  x: ransomExtras(c.victims, c.stats, c.now),
}));

/** Computes its data once, when it mounts (a panel remounts on every arrival) */
function OnArrival<T>({ compute, view }: { compute: () => T; view: (data: T) => ReactNode }) {
  const [data] = useState(compute);
  return <>{view(data)}</>;
}

function pool<C extends { now: number }, D>(ctx: C, fresh: () => C, data: (c: C) => D) {
  const out: PanelDef[] = [];
  const add = (id: string, wide: boolean, has: boolean, view: (d: D, now: number) => ReactNode) => {
    if (!has) return;
    out.push({
      id,
      weight: 1,
      shapes: wide ? WIDE_SHAPES : NUMBER_SHAPES,
      render: () => (
        <OnArrival
          compute={() => { const c = fresh(); return { d: data(c), now: c.now }; }}
          view={({ d, now }) => view(d, now)}
        />
      ),
    });
  };
  return { out, add, first: data(ctx) };
}

const Score = ({ score }: { score?: number }) => <span className="tv-score">{score !== undefined ? score.toFixed(1) : '—'}</span>;
const PILL: Record<string, string> = { KEV: 'tv-kev', PoC: 'tv-poc', Followed: 'tv-followed' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3 Aug" (UTC) */
const shortDate = (iso: string) => {
  const t = Date.parse(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

export const WATCHLIST_EMPTY = 'Nothing new for your vendors';
const SEVERITY_COLOR: Record<string, string> = { Critical: '#ef4444', Important: '#fb923c', Moderate: '#fbbf24', Low: '#64748b' };

type AddPanel<D> = (id: string, wide: boolean, has: boolean, view: (d: D, now: number) => ReactNode) => void;
type VulnD = ReturnType<typeof vulnData>;

/** The four Vulns number panels (also mixed into the Latest TV wall) */
function addVulnNumbers(add: AddPanel<VulnD>, d: VulnD['d'], any: boolean) {
  add('critical7d', false, any, ({ d }) => <StatCard label="Critical CVEs · 7 days" figure={d.critical7d} color="#f87171" />);
  add('kev7d', false, any, ({ d }) => <StatCard label="Added to CISA KEV · 7 days" figure={d.kev7d} color="#fb923c" />);
  add('exploits7d', false, any, ({ d }) => <StatCard label="Public exploits · 7 days" figure={d.exploits7d} color="#fbbf24" />);
  add('patchTuesday', false, !!d.patchTuesday, ({ d: { patchTuesday: pt } }) => (
    <StatCard
      label={pt ? `Patch Tuesday · ${pt.month}` : 'Patch Tuesday'}
      value={pt?.total ?? 0}
      color="#e7ebf0"
      note={pt ? `${pt.critical} critical · ${plural(pt.zeroDays, 'zero-day')}` : 'No data yet'}
    />
  ));
}

/** Just the Vulns number panels (1×1), for mixed mode; none without Vulns data */
export function vulnNumberPanels(ctx: VulnCtx, fresh: () => VulnCtx = () => ctx): PanelDef[] {
  const { out, add, first: { d } } = pool(ctx, fresh, vulnData);
  addVulnNumbers(add, d, !!ctx.vulns || !!ctx.stats);
  return out;
}

export function vulnPanels(ctx: VulnCtx, fresh: () => VulnCtx = () => ctx): PanelDef[] {
  const { out, add, first: { d, x } } = pool(ctx, fresh, vulnData);
  const any = !!ctx.vulns || !!ctx.stats;

  addVulnNumbers(add, d, any);
  add('exploitedNow', true, d.exploitedNow.length > 0, ({ d }) => (
    <ListPanel
      label="Exploited right now"
      items={d.exploitedNow}
      empty="No exploited CVEs right now"
      row={it => (
        <>
          <span className="tv-row-main"><Score score={it.score} /> {it.title}</span>
          <span className={`tv-pill ${PILL[it.tag]}`}>{it.tag}</span>
        </>
      )}
    />
  ));
  add('trend90', true, chartReady(d.weekly.map(w => [w.critical ?? 0, w.kev])), ({ d }) => (
    <WeeklyBarsLine label="Critical & exploited · last 90 days (weekly)" weekly={d.weekly} />
  ));
  add('watchlist', true, x.watchlist !== null, ({ x }) => (
    <ListPanel
      label="Watchlist · your stack & followed CVEs"
      items={x.watchlist ?? []}
      empty={WATCHLIST_EMPTY}
      row={it => (
        <>
          <span className="tv-row-main"><Score score={it.score} /> {it.cve} {'·'} {it.title}</span>
          {it.tags.map(t => <span key={t} className={`tv-pill ${PILL[t]}`}>{t === 'Followed' ? '★' : t}</span>)}
          {it.epss !== undefined && <span className="tv-epss">EPSS {Math.round(it.epss * 100)}%</span>}
        </>
      )}
    />
  ));
  add('topVendors', true, x.topVendors.length > 0, ({ x }) => (
    <HBarList label="Top vendors · critical CVEs · 7 days" data={x.topVendors} color="#ef4444" />
  ));
  add('latestCritical', true, x.latestCritical.length > 0, ({ x }, now) => (
    <ListPanel
      label="Latest critical CVEs"
      items={x.latestCritical}
      row={it => (
        <>
          <span className="tv-row-main"><Score score={it.score} /> {it.cve} {'·'} {it.title}</span>
          <span className="tv-row-meta">{shortAge(it.published, now)}</span>
        </>
      )}
    />
  ));
  add('patchBreakdown', true, !!x.patchBreakdown, ({ x: { patchBreakdown: pb } }) => {
    const rows = pb ? ([['Critical', pb.critical], ['Important', pb.important], ['Moderate', pb.moderate], ['Low', pb.low]] as [string, number][]) : [];
    return (
      <HBarList
        label={pb ? `Patch Tuesday · ${pb.month} by severity` : 'Patch Tuesday'}
        data={rows.filter(r => r[1] > 0)}
        color={name => SEVERITY_COLOR[name] ?? '#64748b'}
        note={pb && <span className="tv-delta"><b style={{ color: '#fb923c' }}>{pb.exploited} exploited</b> {'·'} {pb.disclosed} publicly disclosed</span>}
      />
    );
  });
  add('cvssSpread', true, x.cvssSpread.some(b => b.count > 0), ({ x }) => (
    <VBars
      label="CVSS spread · CVEs of the last 30 days"
      data={x.cvssSpread.map(b => ({ label: b.score === 10 ? '10' : `${b.score}.x`, n: b.count }))}
      color={i => (x.cvssSpread[i].score >= 9 ? '#ef4444' : '#f59e0b')}
    />
  ));
  add('kevRansomware', true, x.kevRansomware.length > 0, ({ x }) => (
    <ListPanel
      label="KEV used by ransomware"
      items={x.kevRansomware}
      row={it => (
        <>
          <span className="tv-row-main">{it.cve} {'·'} {it.title}</span>
          <span className="tv-row-meta">{shortDate(it.dateAdded)}</span>
        </>
      )}
    />
  ));
  return out;
}

const PURPLE = '#a855f7';

export function ransomPanels(ctx: RansomCtx, fresh: () => RansomCtx = () => ctx): PanelDef[] {
  const { out, add, first: { d, x } } = pool(ctx, fresh, ransomData);
  const any = ctx.victims.length > 0 || !!ctx.stats;

  add('victims24h', false, any, ({ d }) => <StatCard label="Victims · 24 h" figure={d.victims24h} versus="vs yesterday" color="#c084fc" />);
  add('victims7d', false, any, ({ d }) => <StatCard label="Victims · 7 days" figure={d.victims7d} color="#c084fc" />);
  add('groups7d', false, any, ({ d }) => (
    <StatCard label="Active groups · 7 days" value={d.groups7d.value} color="#e7ebf0" note={`${d.groups7d.newThisWeek} new this week`} />
  ));
  add('topSector', false, !!d.topSector, ({ d }) => (
    <StatCard label="Most hit sector" text={d.topSector?.name ?? '—'} color="#e7ebf0" note={d.topSector ? `${d.topSector.share}% of victims` : 'No data yet'} />
  ));
  add('topGroups', true, d.topGroups.length > 0, ({ d }) => <HBarList label="Top groups · 7 days" data={d.topGroups} color={PURPLE} />);
  add('daily30', true, chartReady(d.daily.map(p => [p.count])), ({ d }) => <DailyArea label="Victims per day · 30 days" daily={d.daily} color={PURPLE} />);
  add('topCountries', true, d.topCountries.length > 0, ({ d }) => (
    <HBarList label="Top countries · 7 days" data={d.topCountries} color="#6366f1" format={c => <>{flagOf(c)} {c.toUpperCase()}</>} />
  ));
  add('latestVictims', true, d.latest.length > 0, ({ d }, now) => (
    <ListPanel
      label="Latest victims"
      items={d.latest}
      row={v => (
        <>
          <span className="tv-row-main">{v.victim}</span>
          <span className="tv-row-meta">{v.group} {'·'} {shortAge(v.discoveredAt, now)}</span>
        </>
      )}
    />
  ));
  add('topSectors', true, x.topSectors.length > 0, ({ x }) => <HBarList label="Top sectors · 7 days" data={x.topSectors} color="#818cf8" />);
  add('newGroups', true, x.newGroups.length > 0, ({ x }) => (
    <ListPanel
      label="New groups this week"
      items={x.newGroups}
      empty="No new groups this week"
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">{plural(g.victims, 'victim')}</span>
        </>
      )}
    />
  ));
  add('spotlight', true, !!x.spotlight, ({ x: { spotlight: s } }, now) => (
    <ListPanel
      label={s ? `Group spotlight · ${s.group}` : 'Group spotlight'}
      head={s && <div className="tv-panel-sub"><b style={{ color: '#c084fc' }}>{plural(s.count, 'victim')}</b> this week · the most active group</div>}
      items={s?.victims ?? []}
      row={v => (
        <>
          <span className="tv-row-main">{v.country ? `${flagOf(v.country)} ` : ''}{v.victim}</span>
          <span className="tv-row-meta">{shortAge(v.discoveredAt, now)}</span>
        </>
      )}
    />
  ));
  add('weekday', true, x.weekday.some(w => w.count > 0), ({ x }) => (
    <VBars label="Victims by weekday · last 4 weeks" data={x.weekday.map(w => ({ label: w.day, n: w.count }))} color={PURPLE} />
  ));
  add('weekly90', true, chartReady(x.weekly90.map(w => [w.count ?? 0])), ({ x }) => (
    <VBars label="Victims · 90 days (weekly)" data={x.weekly90.map(w => ({ label: shortDate(w.week), n: w.count }))} color={PURPLE} />
  ));
  return out;
}
