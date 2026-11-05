import { MsrcData, StatsData, VulnData } from '../../types';
import type { NpmAdvisoryData } from '../../services/npm/advisories';
import { localDayKey } from '../../utils/date';
import { vulnDashboard, vulnExtras } from '../../services/tv/dashboard';
import { criticalPerDayByCweFamily, epssHistogram, kevByVendor, npmSeverityShare } from '../../services/charts/figures';
import { AddPanel, dayLabel, dayTotals, memoLast, plural, pool, shortDate, sum } from './dashPool';
import { chartReady, DonutPanel, HBarList, ListPanel, StackedPanel, StatCard, VBars, WeeklyBarsLine } from './dashParts';
import { PanelDef } from './DashboardWall';
import { NpmSeverityDonut, NpmWeekCard, npmWeek } from './npmPanels';
import { shortAge } from './TvTileCard';

export interface VulnCtx {
  vulns: VulnData | null; msrc: MsrcData | null; stats: StatsData | null;
  stackKeywords: string[]; watchedCves: string[]; now: number;
  /** The npm advisories (data/npm-advisories.json), for the npm panels that join the Vulns pool */
  npm?: NpmAdvisoryData | null;
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

const Score = ({ score }: { score?: number }) => <span className="tv-score">{score !== undefined ? score.toFixed(1) : '—'}</span>;
const PILL: Record<string, string> = { KEV: 'tv-kev', PoC: 'tv-poc', Followed: 'tv-followed' };
const EXPLOIT = '#fbbf24';
const KEV = '#fb923c';

export const WATCHLIST_EMPTY = 'Nothing new for your vendors';
const SEVERITY_COLOR: Record<string, string> = { Critical: '#ef4444', Important: '#fb923c', Moderate: '#fbbf24', Low: '#64748b' };

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
