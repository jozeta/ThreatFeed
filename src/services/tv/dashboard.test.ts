import { describe, expect, it } from 'vitest';
import { ransomDashboard, ransomExtras, vulnDashboard, vulnExtras } from './dashboard';
import { LeakSiteVictim, StatsData, StatsDay, VulnData } from '../../types';

const now = Date.parse('2026-10-30T12:00:00Z');
const H = 3600e3;
const vic = (id: string, ago: number, extra: Partial<LeakSiteVictim> = {}): LeakSiteVictim =>
  ({ id, victim: id, group: 'a', discoveredAt: new Date(now - ago).toISOString(), ...extra });
const day = (p: Partial<StatsDay> = {}): StatsDay => ({ crit: [], high: [], kev: [], exploits: [], victims: [], groups: {}, countries: {}, sectors: {}, ...p });
const stats = (days: Record<string, StatsDay>): StatsData => ({ version: 1, generatedAt: '', days });
const four = [vic('1', 1 * H), vic('2', 2 * H), vic('3', 20 * H), vic('4', 72 * H)];

describe('ransomDashboard', () => {
  it('counts 24h and 7d, delta only with history', () => {
    const r = ransomDashboard(four, null, now);
    expect(r.victims24h.value).toBe(3);
    expect(r.victims7d.value).toBe(4);
    expect(r.victims7d.delta).toBeUndefined();
    const s = stats({ '2026-10-20': day({ victims: ['x', 'y'] }) });
    expect(ransomDashboard(four, s, now).victims7d.delta).toBe(2);
  });
  it('top sector share and null', () => {
    const v = [vic('1', H, { sector: 'Health' }), vic('2', H, { sector: 'Health' }), vic('3', H, { sector: 'Tech' })];
    expect(ransomDashboard(v, null, now).topSector).toEqual({ name: 'Health', share: 67 });
    expect(ransomDashboard(four, null, now).topSector).toBeNull();
  });
  it('daily is 30 zero-filled days; new groups', () => {
    const v = [vic('1', H, { group: 'new' }), vic('2', 10 * 24 * H, { group: 'old' }), vic('3', H, { group: 'old' })];
    const r = ransomDashboard(v, null, now);
    expect(r.daily).toHaveLength(30);
    expect(r.daily[29]).toEqual({ day: '2026-10-30', count: 2 });
    expect(r.daily[0].count).toBe(0);
    expect(r.groups7d).toEqual({ value: 2, newThisWeek: 1 });
  });
  it('accepts null/empty', () => {
    const r = ransomDashboard([], null, now);
    expect(r.victims7d.value).toBe(0);
    expect(r.latest).toEqual([]);
  });
});

describe('vulnDashboard', () => {
  it('lists exploited now with KEV first, 13 weeks', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'Acme', product: 'Widget', dateAdded: '2026-10-28' }],
      notable: [{ id: 'CVE-2', published: '2026-10-29T00:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Bad thing' }],
      exploits: { 'CVE-2': { pocs: 2 } },
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, null, now);
    expect(r.exploitedNow.map(e => [e.cve, e.tag])).toEqual([['CVE-1', 'KEV'], ['CVE-2', 'PoC']]);
    expect(r.exploitedNow[0].title).toBe('Acme Widget');
    expect(r.weekly).toHaveLength(13);
    expect(r.weekly[12].week).toBe('2026-10-26');
    expect(r.weekly[12]).toMatchObject({ critical: 1, kev: 1 });
    expect(r.critical7d.value).toBe(1);
  });
  it('leaves weeks before any critical data without a bar, keeping the KEV line', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'A', product: 'B', dateAdded: '2026-08-12' }],
      notable: [{ id: 'CVE-2', published: '2026-10-20T00:00:00Z', score: 9.8, severity: 'CRITICAL' }],
      exploits: {},
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, null, now);
    // Oldest critical is Tue 2026-10-20, so the week of 10-19 has data and earlier weeks do not
    expect(r.weekly.map(w => w.critical === null)).toEqual([...Array(11).fill(true), false, false]);
    expect(r.weekly.find(w => w.week === '2026-08-10')).toMatchObject({ critical: null, kev: 1 });
    expect(r.weekly[11]).toMatchObject({ week: '2026-10-19', critical: 1 });
    // Stats history with an earlier non-empty crit list moves the start back
    const s = stats({ '2026-09-01': day({ crit: ['CVE-9'] }) });
    const r2 = vulnDashboard(v, null, s, now);
    expect(r2.weekly.filter(w => w.critical === null)).toHaveLength(4);
    expect(r2.weekly[4]).toMatchObject({ week: '2026-08-31', critical: 1 });
  });
  it('hides the exploits delta when notable is shallow even with a deep KEV catalog', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'A', product: 'B', dateAdded: '2022-01-05' }, { cve: 'CVE-3', vendor: 'A', product: 'B', dateAdded: '2026-10-29' }],
      notable: [{ id: 'CVE-2', published: '2026-10-28T00:00:00Z', score: 9.8, severity: 'CRITICAL' }],
      exploits: { 'CVE-2': { pocs: 1 }, 'CVE-3': { pocs: 1 } },
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, stats({}), now);
    expect(r.exploits7d.value).toBe(2);
    expect(r.exploits7d.delta).toBeUndefined();
  });
  it('accepts null', () => {
    const r = vulnDashboard(null, null, null, now);
    expect(r.critical7d.value).toBe(0);
    expect(r.patchTuesday).toBeNull();
    expect(r.exploitedNow).toEqual([]);
    expect(r.weekly).toHaveLength(13);
  });
  it('summarises the latest patch month', () => {
    const msrc = { months: [{ id: '2026-Oct', title: 'October 2026 Security Updates', released: '', cves: [
      { cve: 'a', title: '', severity: 'Critical', exploited: true }, { cve: 'b', title: '', severity: 'Important', exploited: false }] }] };
    expect(vulnDashboard(null, msrc as any, null, now).patchTuesday).toEqual({ total: 2, critical: 1, zeroDays: 1, month: 'October 2026' });
  });
});

describe('vulnExtras', () => {
  const kevE = (cve: string, vendor: string, product: string, dateAdded: string, extra: object = {}) => ({ cve, vendor, product, dateAdded, ransomware: false, ...extra });
  const base = (over: object = {}) => ({
    kev: [kevE('CVE-F', 'Fortinet', 'FortiOS', '2026-10-28', { epss: 0.9 }), kevE('CVE-N', 'Fortinetwork', 'Thing', '2026-10-28'), kevE('CVE-R', 'Acme', 'Widget', '2026-10-25', { ransomware: true })],
    notable: [
      { id: 'CVE-C1', published: '2026-10-29T00:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Remote code in Contoso', products: ['contoso server'] },
      { id: 'CVE-C2', published: '2026-10-10T00:00:00Z', score: 10, severity: 'CRITICAL', description: 'Old' },
      { id: 'CVE-C3', published: '2026-09-01T00:00:00Z', score: 9.9, severity: 'CRITICAL', description: 'Too old' },
    ],
    watchable: [{ id: 'CVE-W', published: '2026-10-20T00:00:00Z', score: 7.5 }, { id: 'CVE-W2', published: '2026-08-20T00:00:00Z', score: 8.5 }],
    epssTop: [{ cve: 'CVE-X', epss: 0.5, percentile: 0.9 }],
    exploits: {},
    ...over,
  }) as unknown as VulnData;

  it('watchlist is null without stack and followed', () => {
    expect(vulnExtras(base(), null, [], [], now).watchlist).toBeNull();
    expect(vulnExtras(null, null, [], [], now).watchlist).toBeNull();
  });
  it('matches stack keywords as whole words', () => {
    const w = vulnExtras(base(), null, ['Fortinet'], [], now).watchlist!;
    expect(w.map(x => x.cve)).toEqual(['CVE-F']);
    expect(w[0]).toMatchObject({ tags: ['KEV'], epss: 0.9, title: 'Fortinet FortiOS' });
    expect(vulnExtras(base(), null, ['contoso'], [], now).watchlist!.map(x => x.cve)).toEqual(['CVE-C1']);
  });
  it('followed CVEs come first and survive missing data', () => {
    const w = vulnExtras(base(), null, ['Fortinet'], ['CVE-GONE', 'CVE-F'], now).watchlist!;
    expect(w.map(x => x.cve)).toEqual(['CVE-GONE', 'CVE-F']);
    expect(w[1].tags).toEqual(['Followed', 'KEV']);
    expect(w[0]).toEqual({ cve: 'CVE-GONE', title: 'CVE-GONE', tags: ['Followed'] });
    expect(vulnExtras(base(), null, [], ['CVE-X'], now).watchlist![0].epss).toBe(0.5);
  });
  it('limits stack candidates to the last 30 days but always keeps followed CVEs', () => {
    const v = base({
      kev: [kevE('CVE-OLD', 'Fortinet', 'FortiOS', '2026-04-14'), kevE('CVE-NEW', 'Fortinet', 'FortiGate', '2026-10-25'), kevE('CVE-2020', 'Other', 'Thing', '2020-01-01')],
      notable: [],
      exploits: { 'CVE-OLD': { pocs: 3 } },
    });
    expect(vulnExtras(v, null, ['Fortinet'], [], now).watchlist!.map(x => x.cve)).toEqual(['CVE-NEW']);
    expect(vulnExtras(v, null, ['Fortinet'], ['CVE-2020'], now).watchlist!.map(x => x.cve)).toEqual(['CVE-2020', 'CVE-NEW']);
  });
  it('cvssSpread buckets whole scores and skips old CVEs', () => {
    const v = base({ notable: [...base().notable, { id: 'CVE-T', published: '2026-10-29T00:00:00Z', score: 10.0 }] });
    expect(vulnExtras(v, null, [], [], now).cvssSpread).toEqual([
      { score: 7, count: 1 }, { score: 8, count: 0 }, { score: 9, count: 1 }, { score: 10, count: 2 },
    ]);
  });
  it('top vendors and latest critical', () => {
    const v = base({
      kev: [kevE('CVE-C1', 'Contoso', 'S', '2026-10-28')],
      notable: [...base().notable, { id: 'CVE-P', published: '2026-10-28T00:00:00Z', score: 9.1, products: ['globex thing'] }],
    });
    const r = vulnExtras(v, null, [], [], now);
    expect(r.topVendors).toEqual([['Contoso', 1], ['globex', 1]]);
    expect(r.latestCritical.map(c => c.cve)).toEqual(['CVE-C1', 'CVE-P', 'CVE-C2', 'CVE-C3']);
  });
  it('patchBreakdown counts by severity', () => {
    const c = (severity: string, exploited = false, publiclyDisclosed = false) => ({ cve: 'x', title: '', severity, exploited, publiclyDisclosed });
    const msrc = { months: [{ id: 'm', title: 'October 2026 Security Updates', released: '', cves: [c('Critical', true), c('Important', false, true), c('Moderate'), c('Low'), c('Important')] }] };
    expect(vulnExtras(null, msrc as any, [], [], now).patchBreakdown).toEqual({ month: 'October 2026', critical: 1, important: 2, moderate: 1, low: 1, exploited: 1, disclosed: 1 });
    expect(vulnExtras(null, null, [], [], now).patchBreakdown).toBeNull();
  });
  it('kevRansomware lists only ransomware entries', () => {
    expect(vulnExtras(base(), null, [], [], now).kevRansomware).toEqual([{ cve: 'CVE-R', title: 'Acme Widget', dateAdded: '2026-10-25' }]);
  });
});

describe('ransomExtras', () => {
  const D = 24 * H;
  it('newGroups excludes a group seen 10 days ago', () => {
    const v = [vic('1', H, { group: 'fresh' }), vic('2', H, { group: 'old' }), vic('3', 10 * D, { group: 'old' })];
    expect(ransomExtras(v, null, now).newGroups).toEqual([{ group: 'fresh', victims: 1 }]);
  });
  it('sectors, spotlight and shapes', () => {
    const v = [1, 2, 3, 4, 5, 6, 7].map(i => vic(String(i), i * H, { group: 'big', sector: 'Health' })).concat([vic('o', H, { group: 'small', sector: 'Tech' })]);
    const r = ransomExtras(v, null, now);
    expect(r.topSectors[0]).toEqual(['Health', 7]);
    expect(r.spotlight!.group).toBe('big');
    expect(r.spotlight!.count).toBe(7);
    expect(r.spotlight!.victims.map(x => x.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(r.weekday.map(w => w.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(r.weekday.find(w => w.day === 'Fri')!.count).toBe(8);
    expect(r.weekly90).toHaveLength(13);
    expect(r.weekly90[12]).toEqual({ week: '2026-10-26', count: 8 });
  });
  it('weekly90 has no count for weeks before the first victim day, live or stats', () => {
    const v = [vic('a', H), vic('b', 15 * 24 * H)]; // 2026-10-30 and 2026-10-15
    const live = ransomExtras(v, null, now).weekly90;
    expect(live.slice(0, 10).every(w => w.count === null)).toBe(true);
    expect(live[10]).toEqual({ week: '2026-10-12', count: 1 }); // the week holding the first day
    expect(live[11]).toEqual({ week: '2026-10-19', count: 0 }); // a real zero after history starts
    expect(live[12]).toEqual({ week: '2026-10-26', count: 1 });
    const s = stats({ '2026-09-02': day({ victims: ['x'] }) });
    const withStats = ransomExtras(v, s, now).weekly90;
    expect(withStats.findIndex(w => w.count !== null)).toBe(withStats.findIndex(w => w.week === '2026-08-31'));
    expect(withStats[4]).toEqual({ week: '2026-08-31', count: 1 });
    expect(withStats[5]).toEqual({ week: '2026-09-07', count: 0 });
  });
  it('countries7d sums by country over 7 days and excludes older victims', () => {
    const v = [vic('1', H, { country: 'US' }), vic('2', 2 * H, { country: 'US' }), vic('3', 3 * D, { country: 'DE' }), vic('4', 10 * D, { country: 'DE' }), vic('5', H)];
    expect(ransomExtras(v, null, now).countries7d).toEqual({ US: 2, DE: 1 });
  });
  it('accepts empty', () => {
    const r = ransomExtras([], null, now);
    expect(r.countries7d).toEqual({});
    expect(r.weekly90.every(w => w.count === 0)).toBe(true);
    expect(r.spotlight).toBeNull();
    expect(r.newGroups).toEqual([]);
  });
});

describe('vulnExtras · new panels', () => {
  const kevE = (cve: string, dateAdded: string, extra: object = {}) => ({ cve, vendor: 'Acme', product: cve, dateAdded, ransomware: false, cwes: [], ...extra });
  const rec = (id: string, published: string, extra: object = {}) => ({ id, published, score: 9.8, severity: 'CRITICAL', description: `Desc ${id}`, ...extra });
  const v = (over: object) => ({ kev: [], notable: [], epssTop: [], exploits: {}, ...over }) as unknown as VulnData;

  it('epssTop: ranks CVEs published or added to KEV in the last 90 days by EPSS, max 8, titled when known', () => {
    const r = vulnExtras(v({
      kev: [
        kevE('CVE-2026-1', '2026-10-01', { epss: 0.9 }), // added to KEV recently
        kevE('CVE-2014-1', '2020-01-01', { epss: 0.99, published: '2014-01-01T00:00:00Z' }), // old on both counts: left out
        kevE('CVE-2026-2', '2025-01-01', { epss: 0.5, published: '2026-09-01T00:00:00Z' }), // KEV entry published recently
      ],
      notable: [rec('CVE-2026-3', '2026-10-20T00:00:00Z', { epss: 0.7 }), rec('CVE-2026-4', '2026-10-20T00:00:00Z')], // 4: score from the top list
      watchable: [rec('CVE-2026-5', '2026-10-21T00:00:00Z', { epss: 0.1, score: 7.5 }), rec('CVE-2026-6', '2026-10-21T00:00:00Z', { score: 7.5 })], // 6: no score at all
      epssTop: [{ cve: 'CVE-2026-4', epss: 0.8, percentile: 1 }, { cve: 'CVE-2010-9', epss: 1, percentile: 1 }],
    }), null, [], [], now).epssTop;
    expect(r.map(e => [e.cve, e.epss])).toEqual([['CVE-2026-1', 0.9], ['CVE-2026-4', 0.8], ['CVE-2026-3', 0.7], ['CVE-2026-2', 0.5], ['CVE-2026-5', 0.1]]);
    expect(r[0].title).toBe('Acme CVE-2026-1');
    expect(r[2].title).toBe('Desc CVE-2026-3');
    const many = Array.from({ length: 10 }, (_, i) => rec(`CVE-2026-${i + 10}`, '2026-10-20T00:00:00Z', { epss: 0.5 }));
    const m = vulnExtras(v({ notable: many }), null, [], [], now).epssTop;
    expect(m).toHaveLength(8);
    expect(m[0].cve).toBe('CVE-2026-19'); // ties: the newest CVE first
  });
  it('epssTop: falls back to the global top list when no recent CVE has a score', () => {
    const epss = Array.from({ length: 10 }, (_, i) => ({ cve: `CVE-${i}`, epss: i / 10, percentile: 0.9 }));
    const r = vulnExtras(v({ epssTop: epss, kev: [kevE('CVE-9', '2020-01-01')] }), null, [], [], now).epssTop;
    expect(r).toHaveLength(8);
    expect(r.map(e => e.cve).slice(0, 3)).toEqual(['CVE-9', 'CVE-8', 'CVE-7']);
    expect(r[0]).toEqual({ cve: 'CVE-9', epss: 0.9, title: 'Acme CVE-9' });
    expect(r[1].title).toBeUndefined();
  });
  it('epssTop: empty without data', () => {
    expect(vulnExtras(null, null, [], [], now).epssTop).toEqual([]);
  });

  it('timeToKev: median days from publication to KEV over entries added in the last 90 days', () => {
    const kev = [
      kevE('A', '2026-10-20', { published: '2026-10-10T08:00:00Z' }), // 10
      kevE('B', '2026-10-01', { published: '2026-09-01T00:00:00Z' }), // 30
      kevE('C', '2026-09-15', { published: '2026-09-13T00:00:00Z' }), // 2
      kevE('D', '2026-10-25'), // no published date: left out
      kevE('E', '2026-07-01', { published: '2026-06-01T00:00:00Z' }), // older than 90 days: left out
      kevE('F', '2026-10-28', { published: '2026-10-29T00:00:00Z' }), // published after listing: counts as 0
    ];
    expect(vulnExtras(v({ kev }), null, [], [], now).timeToKev).toEqual({ medianDays: 6, count: 4 }); // 0 2 10 30
    expect(vulnExtras(v({ kev: kev.slice(0, 3) }), null, [], [], now).timeToKev).toEqual({ medianDays: 10, count: 3 });
  });
  it('timeToKev: null when nothing qualifies', () => {
    expect(vulnExtras(v({ kev: [kevE('E', '2026-07-01', { published: '2026-06-01T00:00:00Z' })] }), null, [], [], now).timeToKev).toBeNull();
    expect(vulnExtras(null, null, [], [], now).timeToKev).toBeNull();
  });

  it('topCwes: most common CWE among critical CVEs of the last 30 days, top 5, short names', () => {
    const notable = [
      rec('1', '2026-10-29T00:00:00Z', { cwe: 'CWE-79' }), rec('2', '2026-10-28T00:00:00Z', { cwe: 'CWE-79' }),
      rec('3', '2026-10-28T00:00:00Z', { cwe: 'CWE-287' }), rec('4', '2026-10-28T00:00:00Z', { cwe: 'NVD-CWE-noinfo' }),
      rec('5', '2026-09-01T00:00:00Z', { cwe: 'CWE-89' }), // older than 30 days
      rec('6', '2026-10-27T00:00:00Z', { cwe: 'CWE-1' }), rec('7', '2026-10-27T00:00:00Z', { cwe: 'CWE-2' }),
      rec('8', '2026-10-27T00:00:00Z', { cwe: 'CWE-3' }), rec('9', '2026-10-27T00:00:00Z', { cwe: 'CWE-4' }),
      rec('10', '2026-10-27T00:00:00Z', { cwe: 'CWE-89', score: 8.8 }), rec('11', '2026-10-27T00:00:00Z', { cwe: 'CWE-89', score: 8.8 }), // not critical
    ];
    const cweNames = {
      'CWE-79': "Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')",
      'CWE-287': 'Improper Authentication',
      'CWE-1': 'Use of a Very Long Weakness Name That Goes On (and has a parenthetical)',
      'CWE-3': "Weakness ('Alias')",
    };
    const r = vulnExtras(v({ notable, cweNames }), null, [], [], now).topCwes;
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ cwe: 'CWE-79', label: 'XSS', count: 2 }); // a known short name
    expect(r[1]).toEqual({ cwe: 'CWE-1', label: 'Use of a Very…', count: 1 }); // cut at a word, asides dropped
    expect(r.find(c => c.cwe === 'CWE-287')!.label).toBe('Improper auth');
    expect(r.find(c => c.cwe === 'CWE-2')!.label).toBe('CWE-2'); // no name known
    expect(r.find(c => c.cwe === 'CWE-3')!.label).toBe('Alias'); // the quoted alias of an older-style name
    expect(r.map(c => c.cwe)).not.toContain('CWE-89');
    expect(r.map(c => c.cwe)).not.toContain('NVD-CWE-noinfo');
  });
  it('topCwes: empty without data', () => {
    expect(vulnExtras(null, null, [], [], now).topCwes).toEqual([]);
  });

  it('kevDue: deadlines from today through the next 6 days, soonest first, max 8', () => {
    const kev = [
      kevE('LATE', '2026-10-01', { dueDate: '2026-11-06' }), // 7 days out: outside the week
      kevE('PAST', '2026-10-01', { dueDate: '2026-10-29' }),
      kevE('TODAY', '2026-10-01', { dueDate: '2026-10-30' }),
      kevE('LAST', '2026-10-01', { dueDate: '2026-11-05' }),
      kevE('MID', '2026-10-01', { dueDate: '2026-11-02' }),
      kevE('NONE', '2026-10-01'),
    ];
    const r = vulnExtras(v({ kev }), null, [], [], now).kevDue;
    expect(r.map(k => k.cve)).toEqual(['TODAY', 'MID', 'LAST']);
    expect(r[1]).toEqual({ cve: 'MID', title: 'Acme MID', dueDate: '2026-11-02' });
    const many = Array.from({ length: 10 }, (_, i) => kevE(`K${i}`, '2026-10-01', { dueDate: '2026-11-01' }));
    expect(vulnExtras(v({ kev: many }), null, [], [], now).kevDue).toHaveLength(8);
  });
  it('kevDue: empty when nothing is due', () => {
    expect(vulnExtras(null, null, [], [], now).kevDue).toEqual([]);
  });

  it('exploitSources: counts Metasploit, Nuclei and GitHub PoC over CVEs of the last 30 days', () => {
    const r = vulnExtras(v({
      notable: [rec('N1', '2026-10-29T00:00:00Z'), rec('N2', '2026-10-20T00:00:00Z'), rec('OLD', '2026-09-01T00:00:00Z')],
      watchable: [rec('W1', '2026-10-25T00:00:00Z', { score: 7.5 })],
      kev: [kevE('K1', '2026-10-25', { published: '2026-10-24T00:00:00Z' })],
      exploits: {
        N1: { msf: ['exploit/x'], nuclei: 'n.yaml', pocs: 3 },
        N2: { pocs: 1 },
        W1: { nuclei: 'w.yaml' },
        K1: { msf: ['exploit/y'] },
        OLD: { msf: ['exploit/z'], pocs: 2 },
        UNKNOWN: { pocs: 5 }, // no publication date known
      },
    }), null, [], [], now).exploitSources;
    expect(r).toEqual({ msf: 2, nuclei: 2, poc: 2 });
  });
  it('exploitSources: zero without data', () => {
    expect(vulnExtras(null, null, [], [], now).exploitSources).toEqual({ msf: 0, nuclei: 0, poc: 0 });
  });
});

describe('ransomExtras · new panels', () => {
  const D = 24 * H;
  const many = (g: string, n: number, from: number) => Array.from({ length: n }, (_, i) => vic(`${g}-${from}-${i}`, from + i * H, { group: g }));

  it('movers: risers and fallers by change, this week vs the week before, ignoring small groups', () => {
    const v = [
      ...many('up', 6, H), ...many('up', 1, 8 * D),
      ...many('up2', 3, H),
      ...many('down', 1, H), ...many('down', 5, 8 * D),
      ...many('tiny', 2, H), // < 3 in both weeks
      ...many('flat', 4, H), ...many('flat', 4, 8 * D),
      ...many('ancient', 9, 20 * D), // outside both weeks
    ];
    const r = ransomExtras(v, null, now).movers;
    expect(r.risers).toEqual([{ group: 'up', week: 6, before: 1, change: 5 }, { group: 'up2', week: 3, before: 0, change: 3 }]);
    expect(r.fallers).toEqual([{ group: 'down', week: 1, before: 5, change: -4 }]);
  });
  it('movers: keeps the top 3 each way', () => {
    const v = [5, 6, 7, 8].flatMap(n => many(`g${n}`, n, H));
    expect(ransomExtras(v, null, now).movers.risers.map(m => m.group)).toEqual(['g8', 'g7', 'g6']);
  });
  it('movers: empty without data', () => {
    expect(ransomExtras([], null, now).movers).toEqual({ risers: [], fallers: [] });
  });

  it('sectors30: top 6 sectors over 30 days, older excluded', () => {
    const v = [
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => vic(`s${i}`, H, { sector: s })),
      vic('a2', 20 * D, { sector: 'A' }), vic('old', 40 * D, { sector: 'G' }), vic('old2', 40 * D, { sector: 'G' }),
    ];
    const r = ransomExtras(v, null, now).sectors30;
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual(['A', 2]);
    expect(r.map(s => s[0])).not.toContain('G');
  });
  it('sectors30: empty without data', () => {
    expect(ransomExtras([], null, now).sectors30).toEqual([]);
  });

  it('hours: posts by UTC hour over the last 14 days', () => {
    const at = (iso: string) => ({ id: iso, victim: iso, group: 'a', discoveredAt: iso });
    const v = [at('2026-10-30T03:10:00Z'), at('2026-10-29T03:59:00Z'), at('2026-10-20T23:00:00Z'), at('2026-10-10T03:00:00Z')];
    const r = ransomExtras(v, null, now).hours;
    expect(r).toHaveLength(24);
    expect(r[3]).toBe(2); // the one from 10-10 is older than 14 days
    expect(r[23]).toBe(1);
    expect(r.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it('hours: all zero without data', () => {
    expect(ransomExtras([], null, now).hours).toEqual(new Array(24).fill(0));
  });

  it('attacks: public reports of the last 14 days, newest first, max 6', () => {
    const atk = (id: string, added: string) => ({ id, victim: id, added, country: 'US' });
    const list = [atk('old', '2026-10-10'), atk('a', '2026-10-28'), atk('b', '2026-10-29'), ...Array.from({ length: 6 }, (_, i) => atk(`x${i}`, '2026-10-20'))];
    const r = ransomExtras([], null, now, list).attacks;
    expect(r).toHaveLength(6);
    expect(r.slice(0, 2).map(a => a.id)).toEqual(['b', 'a']);
    expect(r.map(a => a.id)).not.toContain('old');
  });
  it('attacks: empty without intel', () => {
    expect(ransomExtras([], null, now).attacks).toEqual([]);
  });

  it('newGroups30: groups first seen in the last 30 days (live and stats), newest first', () => {
    const v = [
      vic('1', H, { group: 'fresh' }), vic('2', 2 * H, { group: 'fresh' }),
      vic('3', 20 * D, { group: 'month' }), vic('4', H, { group: 'month' }),
      vic('5', 40 * D, { group: 'old' }), vic('6', H, { group: 'old' }),
      vic('7', 5 * D, { group: 'stats-old' }),
    ];
    const s = stats({ '2026-09-01': day({ victims: ['x'], groups: { 'stats-old': 1 } }) });
    expect(ransomExtras(v, s, now).newGroups30).toEqual([
      { group: 'fresh', firstSeen: '2026-10-30', victims: 2 },
      { group: 'month', firstSeen: '2026-10-10', victims: 2 },
    ]);
  });
  it('newGroups30: empty when history does not reach back past the 30 days (everyone would look new)', () => {
    expect(ransomExtras([vic('1', H, { group: 'a' }), vic('2', 20 * D, { group: 'b' })], null, now).newGroups30).toEqual([]);
    expect(ransomExtras([], null, now).newGroups30).toEqual([]);
  });
});
