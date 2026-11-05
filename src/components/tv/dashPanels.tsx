import { ReactNode, useState } from 'react';
import { LeakSiteVictim, MsrcData, RansomwareIntel, StatsData, VulnData } from '../../types';
import { localDayKey } from '../../utils/date';
import { Figure, ransomDashboard, ransomExtras, vulnDashboard, vulnExtras } from '../../services/tv/dashboard';
import {
  criticalPerDayByCweFamily, epssHistogram, groupShare, kevByVendor, malwarePerDay, myPackagesStatus, newestCriticalNpm, npmFixShare,
  npmPerDayBySeverity, npmSeverityShare, npmTopCwes, npmTopPackages, npmVulnVsMalware, victimsBySector, victimsPerDayTopGroups,
} from '../../services/charts/figures';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../../services/npm/advisories';
import type { PackageResult } from '../../services/npm/match';
import type { BarBucket } from '../charts/StackedBars';
import type { Slice } from '../charts/chartData';
import { chartReady, DailyArea, DonutPanel, flagOf, HBarList, ListPanel, Panel, StackedPanel, StatCard, VBars, WeeklyBarsLine } from './dashParts';
import { NUMBER_SHAPES, PanelDef, WIDE_SHAPES } from './DashboardWall';
import { shortAge } from './TvTileCard';
import { WorldMap } from './WorldMap';

/**
 * The panel pools of the three dashboards, in show order (v1 panels first, then the new ones). A pool builder decides
 * which panels exist from the data it is given (once per cycle); each panel computes its own figures from `fresh()`
 * when it mounts, so every arrival shows the latest data.
 */

export interface VulnCtx {
  vulns: VulnData | null; msrc: MsrcData | null; stats: StatsData | null;
  stackKeywords: string[]; watchedCves: string[]; now: number;
  /** The npm advisories (data/npm-advisories.json), for the npm panels that join the Vulns pool */
  npm?: NpmAdvisoryData | null;
}
export interface RansomCtx {
  victims: LeakSiteVictim[]; stats: StatsData | null; now: number;
  /** Public attack reports and group intel (data/ransomware.json); loads after the victims */
  intel?: RansomwareIntel | null;
}
export interface NpmCtx {
  data: NpmAdvisoryData | null; malware: NpmMalwareData | null;
  /** The watched packages matched against the advisories; empty when none are watched */
  results: PackageResult[]; now: number;
}

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

const sum = (ns: number[]) => ns.reduce((n, v) => n + v, 0);
const dayTotals = (buckets: BarBucket[]) => buckets.map(b => sum(b.segments.map(s => s.value)));

/** Advisories published in the last 7 days, and the change from the 7 days before */
function npmWeek(data: NpmAdvisoryData, now: number): Figure {
  const days = dayTotals(npmPerDayBySeverity(data, now, 14));
  const week = sum(days.slice(7)), before = sum(days.slice(0, 7));
  return { value: week, delta: week - before };
}

/** CVEs NVD published per CVSS band over its window (every new CVE: vulns.json's lists hold only CVSS 7+) */
function cvssBandRows(v: VulnData | null) {
  const daily = v?.nvd?.daily ?? [];
  const total = (key: 'critical' | 'high' | 'medium' | 'low') => sum(daily.map(d => d[key]));
  return {
    days: daily.length,
    rows: [{ label: '9–10', n: total('critical') }, { label: '7–8.9', n: total('high') }, { label: '4–6.9', n: total('medium') }, { label: '0.1–3.9', n: total('low') }],
  };
}

const DAY = 864e5;
const vulnData = memoLast((c: VulnCtx) => {
  const kev = c.vulns?.kev ?? [];
  const kev90 = kev.filter(k => k.dateAdded >= localDayKey(c.now - 90 * DAY));
  return {
    d: vulnDashboard(c.vulns, c.msrc, c.stats, c.now),
    x: vulnExtras(c.vulns, c.msrc, c.stackKeywords, c.watchedCves, c.now),
    c: {
      kevVendors: kevByVendor(kev, c.now, 90),
      cvssBands: cvssBandRows(c.vulns),
      epss: epssHistogram(kev90),
      criticalByCwe: criticalPerDayByCweFamily(c.vulns?.notable ?? [], c.now, 30),
      npmWeek: c.npm ? npmWeek(c.npm, c.now) : null,
      npmSeverity: c.npm ? npmSeverityShare(c.npm, c.now) : [],
    },
  };
});
const ransomData = memoLast((c: RansomCtx) => ({
  d: ransomDashboard(c.victims, c.stats, c.now),
  x: ransomExtras(c.victims, c.stats, c.now, c.intel?.attacks),
  c: {
    sectors: victimsBySector(c.victims, c.now),
    groups: groupShare(c.victims, c.now),
    groupsDaily: victimsPerDayTopGroups(c.victims, c.now),
  },
}));
const NO_NPM: NpmAdvisoryData = { version: 1, generatedAt: '', updatedAt: '', recent: [], index: [] };
const npmData = memoLast((c: NpmCtx) => {
  const data = c.data ?? NO_NPM;
  return {
    week: npmWeek(data, c.now),
    daily: npmPerDayBySeverity(data, c.now),
    severity: npmSeverityShare(data, c.now),
    kinds: npmVulnVsMalware(data, c.malware, c.now),
    packages: npmTopPackages(data, c.now),
    cwes: npmTopCwes(data, c.now),
    mine: myPackagesStatus(c.results),
    critical: newestCriticalNpm(data),
    malware7d: c.malware ? malwarePerDay(c.malware, c.now, 7) : null,
    fix: npmFixShare(data, c.now),
  };
});

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
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "3 Aug", or with the weekday "Mon 3 Aug" (UTC); a YYYY-MM-DD day or a full timestamp */
const shortDate = (iso: string, weekday = false) => {
  const t = Date.parse(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(t)) return '';
  const d = new Date(t);
  return `${weekday ? WEEKDAY[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const EXPLOIT = '#fbbf24';
const KEV = '#fb923c';

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
  const { out, add, first: { d, x, c } } = pool(ctx, fresh, vulnData);
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
  add('epssTop', true, x.epssTop.length > 0, ({ x }) => (
    <ListPanel
      label="Highest exploitation odds · recent CVEs"
      items={x.epssTop}
      row={it => (
        <>
          <span className="tv-row-main">{it.cve}{it.title ? ` · ${it.title}` : ''}</span>
          <b className="tv-row-meta" style={{ color: EXPLOIT }}>{Math.round(it.epss * 100)}%</b>
        </>
      )}
    />
  ));
  add('timeToKev', false, !!x.timeToKev, ({ x: { timeToKev: t } }) => (
    <StatCard
      label="Disclosure to KEV · median"
      value={t?.medianDays ?? 0}
      color={KEV}
      note={t ? `days · ${plural(t.count, 'CVE')} · last 90 days` : 'No data yet'}
    />
  ));
  add('topCwes', true, x.topCwes.length > 0, ({ x }) => {
    const label = new Map(x.topCwes.map(c => [c.cwe, c.label]));
    return (
      <HBarList
        label="Top weakness types · critical CVEs · 30 days"
        data={x.topCwes.map(c => [c.cwe, c.count] as [string, number])}
        color="#38bdf8"
        format={cwe => <span title={cwe}>{label.get(cwe) ?? cwe}</span>}
      />
    );
  });
  add('kevDue', true, x.kevDue.length > 0, ({ x }, now) => (
    <ListPanel
      label="CISA deadlines this week"
      items={x.kevDue}
      row={it => (
        <>
          <span className="tv-row-main">{it.cve} {'·'} {it.title}</span>
          <span className="tv-row-meta" style={it.dueDate === localDayKey(now) ? { color: KEV, fontWeight: 700 } : undefined}>
            due {shortDate(it.dueDate, true)}
          </span>
        </>
      )}
    />
  ));
  add('exploitSources', true, x.exploitSources.msf + x.exploitSources.nuclei + x.exploitSources.poc > 0, ({ x: { exploitSources: e } }) => (
    <HBarList
      label="Exploits by source · CVEs of the last 30 days"
      data={[['Metasploit', e.msf], ['Nuclei template', e.nuclei], ['GitHub PoC', e.poc]]}
      color={EXPLOIT}
    />
  ));
  add('kevVendors', true, c.kevVendors.length > 0, ({ c }) => <DonutPanel label="Added to KEV by vendor · 90 days" data={c.kevVendors} />);
  add('cvssBands', true, c.cvssBands.rows.some(r => r.n > 0), ({ c: { cvssBands: b } }) => (
    <VBars label={`New CVEs by CVSS band · ${plural(b.days, 'day')}`} data={b.rows} color={i => BAND_COLORS[i]} />
  ));
  add('epssKev', true, c.epss.some(b => b.count > 0), ({ c }) => (
    <VBars label="EPSS of KEV entries · added in 90 days" data={c.epss.map(b => ({ label: `${pct(b.from)}–${pct(b.to)}%`, n: b.count }))} color={EXPLOIT} />
  ));
  add('criticalByCwe', true, chartReady(dayTotals(c.criticalByCwe).map(n => [n])), ({ c }) => (
    <StackedPanel label="Critical CVEs per day by weakness · 30 days" buckets={c.criticalByCwe} axis={dayLabel} />
  ));
  add('npmWeek', false, !!c.npmWeek, ({ c }) => <NpmWeekCard figure={c.npmWeek ?? { value: 0 }} />);
  add('npmSeverity', true, c.npmSeverity.length > 0, ({ c }) => <NpmSeverityDonut data={c.npmSeverity} />);
  return out;
}

/** CVSS 9–10, 7–8.9, 4–6.9 and 0.1–3.9, as the Vulns panels colour severities */
const BAND_COLORS = ['#ef4444', '#fb923c', '#fbbf24', '#64748b'];
const pct = (v: number) => Math.round(v * 100);
const dayLabel = (b: BarBucket) => shortDate(b.label);
// npm donut colours by slice label: severities as the per-day bars' fills (SEVERITY_DOT), package statuses as their badges
const NPM_SEVERITY_HEX: Record<string, string> = { Critical: '#e11d48', High: '#f97316', Medium: '#f59e0b', Low: '#10b981', Unknown: '#94a3b8' };
const NPM_KIND_HEX: Record<string, string> = { Vulnerabilities: '#f59e0b', Malware: '#e11d48', 'Fix available': '#10b981', 'No fix': '#e11d48' };
const NPM_STATUS_HEX: Record<string, string> = { Affected: '#e11d48', Unknown: '#f59e0b', 'No version': '#f97316', Clean: '#10b981' };
const NpmWeekCard = ({ figure }: { figure: Figure }) => <StatCard label="npm advisories · 7 days" figure={figure} color="#f59e0b" />;
const NpmSeverityDonut = ({ data }: { data: Slice[] }) => <DonutPanel label="npm advisories by severity · 30 days" data={data} colors={NPM_SEVERITY_HEX} />;

const PURPLE = '#a855f7';
/** 24 values don't fit above 24 narrow bars: show the peak and every 3rd hour (the labelled ones) */
const peakOrEvery3 = (hours: number[]) => {
  const peak = hours.indexOf(Math.max(...hours));
  return (i: number) => i === peak || i % 3 === 0;
};

export function ransomPanels(ctx: RansomCtx, fresh: () => RansomCtx = () => ctx): PanelDef[] {
  const { out, add, first: { d, x, c } } = pool(ctx, fresh, ransomData);
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
  add('countryMap', true, Object.keys(x.countries7d).length > 0, ({ x }) => (
    <WorldMap label="Victims by country · 7 days" counts={x.countries7d} />
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
  add('movers', true, x.movers.risers.length + x.movers.fallers.length > 0, ({ x: { movers: m } }) => (
    <ListPanel
      label="Rising & falling groups · this week vs last"
      items={[...m.risers, ...m.fallers]}
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">{g.before} {'→'} {g.week}</span>
          <b className="tv-row-meta" style={{ color: g.change > 0 ? '#f87171' : '#34d399', minWidth: '3.5vw', textAlign: 'right' }}>
            {g.change > 0 ? '▲' : '▼'} {Math.abs(g.change)}
          </b>
        </>
      )}
    />
  ));
  add('sectors30', true, x.sectors30.length > 0, ({ x }) => <HBarList label="Sectors · 30 days" data={x.sectors30} color="#818cf8" />);
  add('hours', true, x.hours.some(n => n > 0), ({ x }) => (
    <VBars
      label="Busiest hours · leak-site posts by hour (UTC) · 14 days"
      data={x.hours.map((n, h) => ({ label: h % 3 === 0 ? String(h).padStart(2, '0') : '\u00a0', n }))}
      color={PURPLE}
      showValue={peakOrEvery3(x.hours)}
    />
  ));
  add('attacks', true, x.attacks.length > 0, ({ x }) => (
    <ListPanel
      label="Publicly reported attacks · 14 days"
      items={x.attacks}
      row={a => (
        <>
          <span className="tv-row-main">{a.victim}</span>
          <span className="tv-row-meta">
            {a.group ? `${a.group} · ` : ''}{a.country ? `${flagOf(a.country)} · ` : ''}{shortDate(a.added)}
          </span>
        </>
      )}
    />
  ));
  add('newGroups30', true, x.newGroups30.length > 0, ({ x }) => (
    <ListPanel
      label="New groups · 30 days"
      items={x.newGroups30}
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">first {shortDate(g.firstSeen)} {'·'} {plural(g.victims, 'victim')}</span>
        </>
      )}
    />
  ));
  // A sector donut of nothing but "Unknown" says nothing
  add('sectorShare', true, c.sectors.some(s => !s.other && s.label !== 'Unknown'), ({ c }) => <DonutPanel label="Victims by sector · 30 days" data={c.sectors} />);
  add('groupShare', true, c.groups.length > 0, ({ c }) => <DonutPanel label="Group share · victims · 30 days" data={c.groups} />);
  add('groupsDaily', true, chartReady(dayTotals(c.groupsDaily).map(n => [n])), ({ c }) => (
    <StackedPanel label="Victims per day · top 5 groups · 30 days" buckets={c.groupsDaily} axis={dayLabel} />
  ));
  return out;
}

/** The newest critical npm advisory: package and fix, the summary (as text), ids and age */
function NewestNpm({ a, now }: { a: NpmAdvisory; now: number }) {
  const r = a.ranges[0];
  return (
    <Panel label="Newest critical npm advisory">
      {r && (
        <div className="tv-panel-sub">
          <b style={{ color: '#e7ebf0' }}>{r.package}</b> {r.vulnerable} {'·'} {r.patched ? `fixed in ${r.patched}` : 'no fix yet'}
          {a.ranges.length > 1 ? ` · +${a.ranges.length - 1} more` : ''}
        </div>
      )}
      <div className="tv-stat">
        <div className="tv-big tv-big-text tv-big-text-long" style={{ color: '#fca5a5' }} title={a.summary}>{a.summary}</div>
        <span className="tv-delta">{a.id}{a.cves.length ? ` · ${a.cves.join(', ')}` : ''} {'·'} {shortAge(a.published, now)} ago</span>
      </div>
    </Panel>
  );
}

/**
 * The npm dashboard; no panels without the advisories (the malware count also needs the malware file). The two number
 * panels let the Medium and Large grids tile (each needs two 1×1 cells) instead of falling back to full-height columns.
 */
export function npmPanels(ctx: NpmCtx, fresh: () => NpmCtx = () => ctx): PanelDef[] {
  if (!ctx.data) return [];
  const { out, add, first: f } = pool(ctx, fresh, npmData);
  add('npmWeek', false, true, d => <NpmWeekCard figure={d.week} />);
  add('npmDaily', true, chartReady(dayTotals(f.daily).map(n => [n])), d => (
    <StackedPanel label="npm advisories per day by severity · 30 days" buckets={d.daily} axis={dayLabel} />
  ));
  add('npmSeverity', true, f.severity.length > 0, d => <NpmSeverityDonut data={d.severity} />);
  add('npmKinds', true, f.kinds.length > 0, d => <DonutPanel label="Vulnerabilities vs malware · 7 days" data={d.kinds} colors={NPM_KIND_HEX} />);
  add('npmTopPackages', true, f.packages.length > 0, d => (
    <HBarList label="Most affected packages · 30 days" data={d.packages.map(r => [r.label, r.value] as [string, number])} color="#f59e0b" format={name => <span title={name}>{name}</span>} />
  ));
  add('npmTopCwes', true, f.cwes.length > 0, d => (
    <HBarList label="Top weakness types · npm · 30 days" data={d.cwes.map(r => [r.label, r.value] as [string, number])} color="#38bdf8" format={name => <span title={name}>{name}</span>} />
  ));
  add('npmMine', true, f.mine.length > 0, d => <DonutPanel label="My packages" data={d.mine} colors={NPM_STATUS_HEX} />);
  add('npmNewestCritical', true, !!f.critical, (d, now) => (d.critical ? <NewestNpm a={d.critical} now={now} /> : <Panel label="Newest critical npm advisory"><div className="tv-note">Nothing to show yet</div></Panel>));
  add('npmMalware7d', false, !!f.malware7d, d => (
    <StatCard label="Malware releases · 7 days" value={sum(d.malware7d ?? [])} color="#f43f5e" note="npm malware advisories" spark={d.malware7d ?? undefined} />
  ));
  add('npmFixShare', true, f.fix.length > 0, d => <DonutPanel label="Advisories with a fix · 30 days" data={d.fix} colors={NPM_KIND_HEX} />);
  return out;
}
