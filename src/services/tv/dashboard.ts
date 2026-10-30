import { LeakSiteVictim, MsrcData, StatsData, VulnData } from '../../types';

/** The figures the TV dashboards show. Live data is unioned with the stats history so counts never drop when live data is shallower. */

export interface Figure { value: number; delta?: number } // delta omitted when the previous window has no history
export interface VulnDashboardData {
  critical7d: Figure; kev7d: Figure; exploits7d: Figure;
  patchTuesday: { total: number; critical: number; zeroDays: number; month: string } | null;
  exploitedNow: { cve: string; score?: number; title: string; tag: 'KEV' | 'PoC' }[];
  /** critical is null for weeks before any critical-CVE data exists (no bar, rather than a misleading zero) */
  weekly: { week: string; critical: number | null; kev: number }[];
}
export interface RansomDashboardData {
  victims24h: Figure; victims7d: Figure; groups7d: { value: number; newThisWeek: number };
  topSector: { name: string; share: number } | null;
  topGroups: [string, number][]; topCountries: [string, number][];
  daily: { day: string; count: number }[];
  latest: LeakSiteVictim[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayOf = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return isNaN(t) ? '' : dayKey(t);
};
/** UTC day keys from `from` days ago through `to` days ago (inclusive), newest offset = `to`. */
const dayRange = (now: number, from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; i >= to; i--) out.push(dayKey(now - i * DAY_MS));
  return out;
};
const isCritical = (r: { severity?: string; score?: number }) => r.severity === 'CRITICAL' || (r.score ?? 0) >= 9;

type ListName = 'crit' | 'kev' | 'exploits' | 'victims';

/** Per UTC day: the union of live ids and stats ids. */
function idsByDay(live: Map<string, string[]>, stats: StatsData | null, list: ListName): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const put = (d: string, ids: string[]) => {
    let s = out.get(d);
    if (!s) out.set(d, (s = new Set()));
    for (const id of ids) s.add(id);
  };
  for (const [d, ids] of live) put(d, ids);
  if (stats) for (const [d, day] of Object.entries(stats.days)) put(d, day[list] ?? []);
  return out;
}
const countIn = (byDay: Map<string, Set<string>>, days: string[]) => {
  const all = new Set<string>();
  for (const d of days) byDay.get(d)?.forEach(id => all.add(id));
  return all.size;
};
const statsHas = (stats: StatsData | null, days: string[]) => !!stats && days.some(d => d in stats.days);
const group = (pairs: [string, string][]) => {
  const m = new Map<string, string[]>();
  for (const [d, id] of pairs) if (d) (m.get(d) ?? m.set(d, []).get(d)!).push(id);
  return m;
};

function figure(byDay: Map<string, Set<string>>, now: number, liveOldest: string, stats: StatsData | null, span = 7): Figure {
  const cur = dayRange(now, span - 1, 0);
  const prev = dayRange(now, span * 2 - 1, span);
  const value = countIn(byDay, cur);
  const hasHistory = statsHas(stats, prev) || (liveOldest !== '' && liveOldest <= prev[0]);
  return hasHistory ? { value, delta: value - countIn(byDay, prev) } : { value };
}
const minDay = (days: Iterable<string>) => {
  let m = '';
  for (const d of days) if (d && (m === '' || d < m)) m = d;
  return m;
};

export function vulnDashboard(v: VulnData | null, msrc: MsrcData | null, stats: StatsData | null, now: number): VulnDashboardData {
  const notable = v?.notable ?? [];
  const kev = v?.kev ?? [];
  const exploitInfo = v?.exploits ?? {};
  const hasExploit = (id: string) => {
    const e = exploitInfo[id];
    return !!e && (!!e.msf?.length || !!e.nuclei || (e.pocs ?? 0) > 0);
  };

  const critLive = group(notable.filter(isCritical).map(r => [dayOf(r.published), r.id]));
  const kevLive = group(kev.map(k => [dayOf(k.dateAdded), k.cve]));
  const pubDay = new Map(notable.map(r => [r.id, dayOf(r.published)]));
  const kevDay = new Map(kev.map(k => [k.cve, dayOf(k.dateAdded)]));
  const exploitLive = group(Object.keys(exploitInfo).filter(hasExploit).map(id => [pubDay.get(id) || kevDay.get(id) || '', id]));

  const crit = idsByDay(critLive, stats, 'crit');
  const kevs = idsByDay(kevLive, stats, 'kev');
  const expl = idsByDay(exploitLive, stats, 'exploits');
  const notableOldest = minDay(notable.map(r => dayOf(r.published)));
  const kevOldest = minDay(kevDay.values());

  const last = msrc?.months?.[0];
  const patchTuesday = last
    ? {
        total: last.cves.length,
        critical: last.cves.filter(c => c.severity === 'Critical').length,
        zeroDays: last.cves.filter(c => c.exploited).length,
        month: last.title.replace(/\s*Security Updates\s*$/i, ''),
      }
    : null;

  // Exploited now: KEV added within 30 days, then notable CVEs with a public exploit
  const cutoff = dayKey(now - 29 * DAY_MS);
  const scoreOf = new Map(notable.map(r => [r.id, r.score]));
  const items = new Map<string, VulnDashboardData['exploitedNow'][number]>();
  for (const k of kev) {
    const d = dayOf(k.dateAdded);
    if (d && d >= cutoff && d <= dayKey(now)) items.set(k.cve, { cve: k.cve, score: scoreOf.get(k.cve), title: `${k.vendor} ${k.product}`.trim(), tag: 'KEV' });
  }
  for (const r of notable) {
    if (!items.has(r.id) && hasExploit(r.id)) items.set(r.id, { cve: r.id, score: r.score, title: (r.description ?? r.id).slice(0, 60), tag: 'PoC' });
  }
  const exploitedNow = [...items.values()]
    .sort((a, b) => (a.tag === b.tag ? 0 : a.tag === 'KEV' ? -1 : 1) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  // 13 weeks ending with the current one, Monday start (UTC)
  const today = new Date(now);
  const monday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - ((today.getUTCDay() + 6) % 7) * DAY_MS;
  const weekly: VulnDashboardData['weekly'] = [];
  const critStart = minDay([
    ...(notableOldest ? [notableOldest] : []),
    ...(stats ? Object.entries(stats.days).filter(([, d]) => (d.crit ?? []).length > 0).map(([k]) => k) : []),
  ]);
  for (let w = 12; w >= 0; w--) {
    const start = monday - w * 7 * DAY_MS;
    const days = Array.from({ length: 7 }, (_, i) => dayKey(start + i * DAY_MS));
    // A week that ends before the first day with critical data has no real count, only a missing history
    const critical = critStart !== '' && days[6] < critStart ? null : countIn(crit, days);
    weekly.push({ week: days[0], critical, kev: countIn(kevs, days) });
  }

  return {
    critical7d: figure(crit, now, notableOldest, stats),
    kev7d: figure(kevs, now, kevOldest, stats),
    exploits7d: figure(expl, now, notableOldest, stats),
    patchTuesday,
    exploitedNow,
    weekly,
  };
}

type Tally = Record<string, number>;
const top = (t: Map<string, number>, n = 5): [string, number][] =>
  [...t].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

export function ransomDashboard(victims: LeakSiteVictim[], stats: StatsData | null, now: number): RansomDashboardData {
  const vic = idsByDay(group(victims.map(x => [dayOf(x.discoveredAt), x.id])), stats, 'victims');
  const liveOldest = minDay(victims.map(x => dayOf(x.discoveredAt)));

  // per-day tallies: live counts merged with stats counts, larger per key
  type Kind = 'groups' | 'countries' | 'sectors';
  const tallies = new Map<string, Record<Kind, Tally>>();
  const slot = (d: string) => tallies.get(d) ?? tallies.set(d, { groups: {}, countries: {}, sectors: {} }).get(d)!;
  const liveT = new Map<string, Record<Kind, Tally>>();
  for (const x of victims) {
    const d = dayOf(x.discoveredAt);
    if (!d) continue;
    const t = liveT.get(d) ?? liveT.set(d, { groups: {}, countries: {}, sectors: {} }).get(d)!;
    if (x.group) t.groups[x.group] = (t.groups[x.group] ?? 0) + 1;
    if (x.country) t.countries[x.country] = (t.countries[x.country] ?? 0) + 1;
    if (x.sector) t.sectors[x.sector] = (t.sectors[x.sector] ?? 0) + 1;
  }
  const kinds: Kind[] = ['groups', 'countries', 'sectors'];
  const merge = (d: string, src: Partial<Record<Kind, Tally>> | undefined) => {
    if (!src) return;
    const s = slot(d);
    for (const k of kinds) for (const [name, n] of Object.entries(src[k] ?? {})) s[k][name] = Math.max(s[k][name] ?? 0, n);
  };
  for (const [d, t] of liveT) merge(d, t);
  if (stats) for (const [d, day] of Object.entries(stats.days)) merge(d, day);

  const sum = (days: string[], kind: Kind) => {
    const m = new Map<string, number>();
    for (const d of days) for (const [name, n] of Object.entries(tallies.get(d)?.[kind] ?? {})) m.set(name, (m.get(name) ?? 0) + n);
    return m;
  };

  const week = dayRange(now, 6, 0);
  const before = dayRange(now, 30, 7);
  const groups7 = sum(week, 'groups');
  const groupsBefore = sum(before, 'groups');
  const sectors = sum(week, 'sectors');
  const sectorTotal = [...sectors.values()].reduce((a, b) => a + b, 0);
  const topSec = top(sectors, 1)[0];

  const inWindow = (from: number, to: number) =>
    victims.filter(x => { const t = Date.parse(x.discoveredAt); return t > now - to && t <= now - from; }).length;
  const v24 = inWindow(0, DAY_MS);
  const victims24h: Figure = liveOldest !== '' && Date.parse(minDay([liveOldest]) + 'T00:00:00Z') <= now - 2 * DAY_MS
    ? { value: v24, delta: v24 - inWindow(DAY_MS, 2 * DAY_MS) }
    : { value: v24 };

  return {
    victims24h,
    victims7d: figure(vic, now, liveOldest, stats),
    groups7d: { value: groups7.size, newThisWeek: [...groups7.keys()].filter(g => !groupsBefore.has(g)).length },
    topSector: topSec && sectorTotal > 0 ? { name: topSec[0], share: Math.round((topSec[1] / sectorTotal) * 100) } : null,
    topGroups: top(groups7),
    topCountries: top(sum(week, 'countries')),
    daily: dayRange(now, 29, 0).map(day => ({ day, count: vic.get(day)?.size ?? 0 })),
    latest: [...victims].sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt)).slice(0, 6),
  };
}
