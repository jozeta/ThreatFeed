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
  it('accepts empty', () => {
    const r = ransomExtras([], null, now);
    expect(r.weekly90.every(w => w.count === 0)).toBe(true);
    expect(r.spotlight).toBeNull();
    expect(r.newGroups).toEqual([]);
  });
});
