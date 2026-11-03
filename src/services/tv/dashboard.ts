import { LeakSiteVictim, MsrcData, PublicAttack, StatsData, VulnData } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { localDayKey } from '../../utils/date';

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

/** A CVE counts as exploitable when it has a Metasploit module, a nuclei template or a public PoC. */
const exploitTest = (v: VulnData | null) => (id: string) => {
  const e = v?.exploits?.[id];
  return !!e && (!!e.msf?.length || !!e.nuclei || (e.pocs ?? 0) > 0);
};

/** Monday-start UTC week day keys, the current week last. */
const weekStarts = (now: number, weeks: number) => {
  const today = new Date(now);
  const monday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - ((today.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: weeks }, (_, i) => {
    const start = monday - (weeks - 1 - i) * 7 * DAY_MS;
    return Array.from({ length: 7 }, (_, d) => dayKey(start + d * DAY_MS));
  });
};

export function vulnDashboard(v: VulnData | null, msrc: MsrcData | null, stats: StatsData | null, now: number): VulnDashboardData {
  const notable = v?.notable ?? [];
  const kev = v?.kev ?? [];
  const exploitInfo = v?.exploits ?? {};
  const hasExploit = exploitTest(v);

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
  const weekly: VulnDashboardData['weekly'] = [];
  const critStart = minDay([
    ...(notableOldest ? [notableOldest] : []),
    ...(stats ? Object.entries(stats.days).filter(([, d]) => (d.crit ?? []).length > 0).map(([k]) => k) : []),
  ]);
  for (const days of weekStarts(now, 13)) {
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

type Kind = 'groups' | 'countries' | 'sectors';
/** Per-day group/country/sector tallies: live counts merged with stats counts (larger per key), summed over a day range. */
function victimTallies(victims: LeakSiteVictim[], stats: StatsData | null) {
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

  return (days: string[], kind: Kind) => {
    const m = new Map<string, number>();
    for (const d of days) for (const [name, n] of Object.entries(tallies.get(d)?.[kind] ?? {})) m.set(name, (m.get(name) ?? 0) + n);
    return m;
  };
}

export function ransomDashboard(victims: LeakSiteVictim[], stats: StatsData | null, now: number): RansomDashboardData {
  const vic = idsByDay(group(victims.map(x => [dayOf(x.discoveredAt), x.id])), stats, 'victims');
  const liveOldest = minDay(victims.map(x => dayOf(x.discoveredAt)));

  const sum = victimTallies(victims, stats);
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

export interface VulnExtras {
  watchlist: { cve: string; score?: number; title: string; tags: ('KEV' | 'PoC' | 'Followed')[]; epss?: number }[] | null;
  topVendors: [string, number][];
  latestCritical: { cve: string; score?: number; title: string; published: string }[];
  patchBreakdown: { month: string; critical: number; important: number; moderate: number; low: number; exploited: number; disclosed: number } | null;
  cvssSpread: { score: number; count: number }[];
  kevRansomware: { cve: string; title: string; dateAdded: string }[];
  /** The highest EPSS scores among CVEs published or added to KEV in the last 90 days (else the global top list); title from KEV/notable when known */
  epssTop: { cve: string; epss: number; title?: string }[];
  /** Median whole days from CVE publication to KEV listing, over KEV entries added in the last 90 days */
  timeToKev: { medianDays: number; count: number } | null;
  /** Most common weaknesses among critical (CVSS >= 9) CVEs published in the last 30 days */
  topCwes: { cwe: string; label: string; count: number }[];
  /** CISA remediation deadlines from today through the next 6 days, soonest first */
  kevDue: { cve: string; title: string; dueDate: string }[];
  /** CVEs published in the last 30 days with a Metasploit module / Nuclei template / GitHub PoC */
  exploitSources: { msf: number; nuclei: number; poc: number };
}
export interface RansomExtras {
  topSectors: [string, number][];
  /** Victim totals per country code over the last 7 days (every country, not just the top ones) */
  countries7d: Record<string, number>;
  newGroups: { group: string; victims: number }[];
  spotlight: { group: string; count: number; victims: LeakSiteVictim[] } | null;
  weekday: { day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; count: number }[];
  /** count is null for weeks that end before the first day with any victim data (no bar, rather than a misleading zero) */
  weekly90: { week: string; count: number | null }[];
  /** Biggest changes in victims, this week vs the week before (groups with < 3 victims in both weeks are left out) */
  movers: { risers: Mover[]; fallers: Mover[] };
  sectors30: [string, number][];
  /** Leak-site posts per UTC hour (index 0–23) over the last 14 days */
  hours: number[];
  /** Publicly reported attacks of the last 14 days, newest first */
  attacks: PublicAttack[];
  /** Groups whose first victim is within the last 30 days, newest first */
  newGroups30: { group: string; firstSeen: string; victims: number }[];
}
export interface Mover { group: string; week: number; before: number; change: number }

const shortTitle = (r: { id: string; description?: string }) => (r.description ?? r.id).slice(0, 60);

/** Short names for the weaknesses that top the charts (NVD names run to 70 characters; a TV bar label fits about 17) */
const CWE_SHORT: Record<string, string> = {
  'CWE-20': 'Input validation', 'CWE-22': 'Path traversal', 'CWE-59': 'Link following', 'CWE-74': 'Injection',
  'CWE-77': 'Command injection', 'CWE-78': 'OS cmd injection', 'CWE-79': 'XSS', 'CWE-89': 'SQL injection',
  'CWE-94': 'Code injection', 'CWE-119': 'Memory corruption', 'CWE-120': 'Buffer overflow', 'CWE-121': 'Stack overflow',
  'CWE-122': 'Heap overflow', 'CWE-125': 'OOB read', 'CWE-190': 'Integer overflow', 'CWE-200': 'Info exposure',
  'CWE-269': 'Privileges', 'CWE-284': 'Access control', 'CWE-285': 'Authorization', 'CWE-287': 'Improper auth',
  'CWE-288': 'Auth bypass', 'CWE-306': 'Missing auth', 'CWE-352': 'CSRF', 'CWE-400': 'Resource limits',
  'CWE-416': 'Use after free', 'CWE-434': 'File upload', 'CWE-476': 'NULL dereference', 'CWE-502': 'Deserialization',
  'CWE-601': 'Open redirect', 'CWE-611': 'XXE', 'CWE-639': 'IDOR', 'CWE-787': 'OOB write',
  'CWE-798': 'Hard-coded creds', 'CWE-862': 'Missing authz', 'CWE-863': 'Incorrect authz', 'CWE-918': 'SSRF',
};

/** A CWE label short enough for a bar: a known short name, else the NVD name without asides, cut at a word; the id when nameless */
export function shortCwe(cwe: string, name?: string): string {
  if (CWE_SHORT[cwe]) return CWE_SHORT[cwe];
  if (!name) return cwe;
  const alias = /\('([^']+)'\)/.exec(name)?.[1];
  if (alias) return alias;
  const plain = name.replace(/\s*\([^)]*\)/g, '').trim() || name;
  if (plain.length <= 18) return plain;
  const cut = plain.slice(0, 18);
  const at = cut.lastIndexOf(' ');
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`;
}
const NO_CWE = new Set(['NVD-CWE-noinfo', 'NVD-CWE-Other']);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function vulnExtras(v: VulnData | null, msrc: MsrcData | null, stackKeywords: string[], watchedCves: string[], now: number): VulnExtras {
  const notable = v?.notable ?? [];
  const kev = v?.kev ?? [];
  const hasExploit = exploitTest(v);
  const today = dayKey(now);
  const since30 = dayKey(now - 29 * DAY_MS);
  const since7 = dayKey(now - 6 * DAY_MS);
  const recent = (iso: string | undefined, since: string) => { const d = dayOf(iso); return d !== '' && d >= since && d <= today; };

  // Watchlist: stack matches among fresh KEV / exploitable / critical CVEs, plus every followed CVE
  const stack = stackKeywords.map(k => k.trim()).filter(Boolean);
  const kevById = new Map(kev.map(k => [k.cve, k]));
  const noteById = new Map(notable.map(r => [r.id, r]));
  const epssTop = new Map((v?.epssTop ?? []).map(e => [e.cve, e.epss]));
  const watchById = new Map((v?.watchable ?? []).map(r => [r.id, r]));
  type Item = NonNullable<VulnExtras['watchlist']>[number];
  const describe = (cve: string): Item => {
    const k = kevById.get(cve);
    const n = noteById.get(cve);
    const tags: Item['tags'] = [];
    if (k) tags.push('KEV');
    if (hasExploit(cve)) tags.push('PoC');
    return {
      cve,
      score: n?.score ?? k?.cvss,
      title: k ? `${k.vendor} ${k.product}`.trim() : n ? shortTitle(n) : cve,
      tags,
      epss: k?.epss ?? n?.epss ?? epssTop.get(cve),
    };
  };
  const followed = [...new Set(watchedCves)];
  let watchlist: VulnExtras['watchlist'] = null;
  if (stack.length > 0 || followed.length > 0) {
    const out = new Map<string, Item>();
    for (const cve of followed) {
      const it = describe(cve);
      out.set(cve, { ...it, tags: ['Followed', ...it.tags] });
    }
    if (stack.length > 0) {
      const matches = (text: string) => stack.some(t => containsTerm(text, t));
      for (const k of kev) {
        if (out.has(k.cve) || !recent(k.dateAdded, since30)) continue;
        if (matches([k.vendor, k.product, ...(k.products ?? [])].join(' ; '))) out.set(k.cve, describe(k.cve));
      }
      for (const r of notable) {
        if (out.has(r.id) || !(recent(r.published, since30) && (hasExploit(r.id) || (r.score ?? 0) >= 9))) continue;
        if (matches([...(r.products ?? []), r.description ?? ''].join(' ; '))) out.set(r.id, describe(r.id));
      }
    }
    watchlist = [...out.values()]
      .sort((a, b) => Number(b.tags.includes('Followed')) - Number(a.tags.includes('Followed')) || (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 8);
  }

  // Critical CVEs: newest first, and the vendors behind the last 7 days
  const criticals = notable.filter(r => (r.score ?? 0) >= 9);
  const vendorOf = (id: string, products?: string[]) => kevById.get(id)?.vendor || products?.[0]?.trim().split(/\s+/)[0] || '';
  const vendors = new Map<string, number>();
  for (const r of criticals) {
    if (!recent(r.published, since7)) continue;
    const name = vendorOf(r.id, r.products);
    if (name) vendors.set(name, (vendors.get(name) ?? 0) + 1);
  }
  const latestCritical = [...criticals]
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, 8)
    .map(r => ({ cve: r.id, score: r.score, title: shortTitle(r), published: r.published }));

  const last = msrc?.months?.[0];
  const sev = (s: string) => last!.cves.filter(c => c.severity === s).length;
  const patchBreakdown = last
    ? {
        month: last.title.replace(/\s*Security Updates\s*$/i, ''),
        critical: sev('Critical'), important: sev('Important'), moderate: sev('Moderate'), low: sev('Low'),
        exploited: last.cves.filter(c => c.exploited).length,
        disclosed: last.cves.filter(c => c.publiclyDisclosed).length,
      }
    : null;

  const spread = new Map([7, 8, 9, 10].map(s => [s, 0]));
  const seen = new Set<string>();
  for (const r of [...notable, ...(v?.watchable ?? [])]) {
    if (seen.has(r.id) || r.score === undefined || r.score < 7 || !recent(r.published, since30)) continue;
    seen.add(r.id);
    const b = Math.min(10, Math.floor(r.score));
    spread.set(b, (spread.get(b) ?? 0) + 1);
  }

  const kevRansomware = kev
    .filter(k => k.ransomware)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, 8)
    .map(k => ({ cve: k.cve, title: `${k.vendor} ${k.product}`.trim(), dateAdded: k.dateAdded }));

  // Highest exploitation odds now: CVEs published or added to KEV in the last 90 days, by EPSS (KEV, then NVD, then
  // the global top list); the global top list only when none of them has a score
  const since90 = dayKey(now - 89 * DAY_MS);
  const titled = (cve: string, epss: number) => {
    const k = kevById.get(cve);
    const n = noteById.get(cve);
    const title = k ? `${k.vendor} ${k.product}`.trim() : n ? shortTitle(n) : undefined;
    return title ? { cve, epss, title } : { cve, epss };
  };
  const recentIds = new Set<string>();
  for (const r of [...notable, ...(v?.watchable ?? [])]) if (recent(r.published, since90)) recentIds.add(r.id);
  for (const k of kev) if (recent(k.dateAdded, since90) || recent(k.published, since90)) recentIds.add(k.cve);
  const epssOf = (cve: string) => kevById.get(cve)?.epss ?? noteById.get(cve)?.epss ?? watchById.get(cve)?.epss ?? epssTop.get(cve);
  const byEpss = (a: { cve: string; epss: number }, b: { cve: string; epss: number }) => b.epss - a.epss || b.cve.localeCompare(a.cve, undefined, { numeric: true });
  const recentScored = [...recentIds].flatMap(cve => { const e = epssOf(cve); return e === undefined ? [] : [{ cve, epss: e }]; });
  const epssTopList = (recentScored.length ? recentScored : (v?.epssTop ?? []).map(e => ({ cve: e.cve, epss: e.epss })))
    .sort(byEpss)
    .slice(0, 8)
    .map(e => titled(e.cve, e.epss));

  // Time to KEV: whole UTC days from publication to listing, never negative (NVD sometimes publishes after CISA lists)
  const lags: number[] = [];
  for (const k of kev) {
    const pub = dayOf(k.published);
    if (!pub || !recent(k.dateAdded, since90)) continue;
    lags.push(Math.max(0, Math.round((Date.parse(dayOf(k.dateAdded)) - Date.parse(pub)) / DAY_MS)));
  }
  const timeToKev = lags.length ? { medianDays: median(lags), count: lags.length } : null;

  const cwes = new Map<string, number>();
  for (const r of notable) if (r.cwe && !NO_CWE.has(r.cwe) && (r.score ?? 0) >= 9 && recent(r.published, since30)) cwes.set(r.cwe, (cwes.get(r.cwe) ?? 0) + 1);
  const topCwes = top(cwes).map(([cwe, count]) => ({ cwe, label: shortCwe(cwe, v?.cweNames?.[cwe]), count }));

  // CISA due dates are calendar dates, so the window is in the viewer's local days (not the UTC day buckets)
  const dueFrom = localDayKey(now);
  const dueBy = localDayKey(now + 6 * DAY_MS);
  const kevDue = kev
    .filter(k => !!k.dueDate && k.dueDate >= dueFrom && k.dueDate <= dueBy)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.cve.localeCompare(b.cve))
    .slice(0, 8)
    .map(k => ({ cve: k.cve, title: `${k.vendor} ${k.product}`.trim(), dueDate: k.dueDate! }));

  // Exploit sources: every CVE with a known publication date in the last 30 days (notable, watchable, KEV)
  const published = new Map<string, string>();
  for (const r of [...notable, ...(v?.watchable ?? [])]) published.set(r.id, r.published);
  for (const k of kev) if (k.published && !published.has(k.cve)) published.set(k.cve, k.published);
  const exploitSources = { msf: 0, nuclei: 0, poc: 0 };
  for (const [id, e] of Object.entries(v?.exploits ?? {})) {
    if (!recent(published.get(id), since30)) continue;
    if (e.msf?.length) exploitSources.msf++;
    if (e.nuclei) exploitSources.nuclei++;
    if ((e.pocs ?? 0) > 0) exploitSources.poc++;
  }

  return {
    watchlist,
    topVendors: top(vendors),
    latestCritical,
    patchBreakdown,
    cvssSpread: [...spread].map(([score, count]) => ({ score, count })),
    kevRansomware,
    epssTop: epssTopList,
    timeToKev,
    topCwes,
    kevDue,
    exploitSources,
  };
}

/** Top 3 risers and fallers by absolute change; groups need at least 3 victims in one of the two weeks */
function movers(week: Map<string, number>, before: Map<string, number>): RansomExtras['movers'] {
  const all: Mover[] = [];
  for (const group of new Set([...week.keys(), ...before.keys()])) {
    const w = week.get(group) ?? 0, b = before.get(group) ?? 0;
    if (w < 3 && b < 3) continue;
    all.push({ group, week: w, before: b, change: w - b });
  }
  const by = (a: Mover, b: Mover) => Math.abs(b.change) - Math.abs(a.change) || a.group.localeCompare(b.group);
  return { risers: all.filter(m => m.change > 0).sort(by).slice(0, 3), fallers: all.filter(m => m.change < 0).sort(by).slice(0, 3) };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function ransomExtras(victims: LeakSiteVictim[], stats: StatsData | null, now: number, attacks: PublicAttack[] = []): RansomExtras {
  const vic = idsByDay(group(victims.map(x => [dayOf(x.discoveredAt), x.id])), stats, 'victims');
  const sum = victimTallies(victims, stats);

  const week = dayRange(now, 6, 0);
  const groups7 = sum(week, 'groups');
  const groupsBefore = sum(dayRange(now, 29, 7), 'groups');
  const topGroup = top(groups7, 1)[0];
  const weekSet = new Set(week);
  // The first day with any victim data, live or stats
  const start = minDay([...vic].filter(([, ids]) => ids.size > 0).map(([d]) => d));

  const spotlight = topGroup
    ? {
        group: topGroup[0],
        count: topGroup[1],
        victims: victims
          .filter(x => x.group === topGroup[0] && weekSet.has(dayOf(x.discoveredAt)))
          .sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt))
          .slice(0, 5),
      }
    : null;

  const hours = new Array<number>(24).fill(0);
  for (const x of victims) {
    const t = Date.parse(x.discoveredAt);
    if (t > now - 14 * DAY_MS && t <= now) hours[new Date(t).getUTCHours()]++;
  }
  const since14 = dayKey(now - 13 * DAY_MS);

  // New groups · 30 days: first day with a victim per group, over every day of history; only meaningful when the
  // history reaches back before the window (otherwise every group would look new)
  const month = dayRange(now, 29, 0);
  const firstSeen = new Map<string, string>();
  for (const d of [...vic.keys()].sort()) for (const g of sum([d], 'groups').keys()) if (!firstSeen.has(g)) firstSeen.set(g, d);
  const groups30 = sum(month, 'groups');
  const newGroups30 = start !== '' && start < month[0]
    ? [...firstSeen]
        .filter(([, d]) => d >= month[0] && d <= month[29])
        .map(([group, d]) => ({ group, firstSeen: d, victims: groups30.get(group) ?? 0 }))
        .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.victims - a.victims || a.group.localeCompare(b.group))
    : [];

  const perWeekday = new Array<number>(7).fill(0);
  for (const d of dayRange(now, 27, 0)) perWeekday[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] += vic.get(d)?.size ?? 0;

  return {
    topSectors: top(sum(week, 'sectors')),
    countries7d: Object.fromEntries(sum(week, 'countries')),
    newGroups: [...groups7]
      .filter(([g]) => !groupsBefore.has(g))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g, n]) => ({ group: g, victims: n })),
    spotlight,
    weekday: WEEKDAYS.map((day, i) => ({ day, count: perWeekday[i] })),
    weekly90: weekStarts(now, 13).map(days => ({ week: days[0], count: start !== '' && days[6] < start ? null : countIn(vic, days) })),
    movers: movers(groups7, sum(dayRange(now, 13, 7), 'groups')),
    sectors30: top(sum(dayRange(now, 29, 0), 'sectors'), 6),
    hours,
    attacks: attacks
      .filter(a => { const d = dayOf(a.added); return d !== '' && d >= since14 && d <= dayKey(now); })
      .sort((a, b) => b.added.localeCompare(a.added) || a.victim.localeCompare(b.victim))
      .slice(0, 6),
    newGroups30,
  };
}
