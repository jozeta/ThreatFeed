import { describe, expect, it } from 'vitest';
import type { Article, CveRecord, Feed, KevEntry, LeakSiteVictim } from '../../types';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../npm/advisories';
import type { PackageResult } from '../npm/match';
import {
  criticalPerDayByCweFamily, cvssBands, epssHistogram, kevByVendor, malwarePerDay, myPackagesStatus, newestCriticalNpm,
  npmFixShare, npmPerDayBySeverity, npmSeverityShare, npmTopCwes, npmTopPackages, npmVulnVsMalware, storiesByCategory,
  storiesPerDayBySeverity, topVendorsThisWeek, victimsBySector, victimsPerDayTopGroups, groupShare,
} from './figures';

// Local noon, so the tests hold in any time zone
const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour);
const iso = (month: number, day: number, hour = 12) => at(month, day, hour).toISOString();
const NOW = at(11, 5).getTime();
const ymd = (month: number, day: number) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const kev = (cve: string, vendor: string, dateAdded: string, extra: Partial<KevEntry> = {}): KevEntry => ({
  cve, vendor, product: 'P', name: 'n', dateAdded, ransomware: false, cwes: [], ...extra,
});
const cve = (id: string, published: string, extra: Partial<CveRecord> = {}): CveRecord => ({ id, published, ...extra });
const victim = (id: string, group: string, discoveredAt: string, sector?: string): LeakSiteVictim => ({ id, victim: id, group, discoveredAt, sector });
const article = (id: string, publishedAt: string, extra: Partial<Article> = {}): Article => ({
  id, title: id, url: `https://example.com/${id}`, sourceId: 'f1', sourceName: 'F1', publishedAt, tags: [], categories: [],
  read: false, viewed: false, bookmarked: false, ...extra,
});
const feed = (id: string, category: string): Feed => ({ id, name: id, url: 'https://example.com', category, tags: [], enabled: true });
const adv = (id: string, severity: NpmAdvisory['severity'], published: string, extra: Partial<NpmAdvisory> = {}): NpmAdvisory => ({
  id, cves: [], summary: id, description: '', severity, cvss: [], cwes: [], ranges: [{ package: 'pkg', vulnerable: '< 2', patched: '2.0.0' }],
  published, updated: published, references: [], credits: [], url: 'https://github.com/advisories/' + id, ...extra,
});
const npm = (recent: NpmAdvisory[]): NpmAdvisoryData => ({ version: 1, generatedAt: '', updatedAt: '', recent, index: [] });
const malware = (entries: NpmMalwareData['entries']): NpmMalwareData => ({ version: 1, generatedAt: '', updatedAt: '', entries });

describe('kevByVendor', () => {
  it('counts entries in the window and folds the tail', () => {
    const list = [
      kev('1', 'A', ymd(11, 5)), kev('2', 'A', ymd(11, 1)), kev('3', 'B', ymd(10, 1)),
      kev('4', 'C', ymd(8, 7)), // 90-day window starts 2026-08-08: out
      kev('5', 'D', ymd(11, 6)), // future: out
    ];
    expect(kevByVendor(list, NOW)).toEqual([
      { label: 'A', value: 2, pct: 67 }, { label: 'B', value: 1, pct: 33 },
    ]);
    expect(kevByVendor(list, NOW, 1)).toEqual([{ label: 'A', value: 1, pct: 100 }]);
  });
  it('is empty for no input and does not mutate', () => {
    expect(kevByVendor([], NOW)).toEqual([]);
    const list = [kev('1', 'B', ymd(11, 5)), kev('2', 'A', ymd(11, 5)), kev('3', 'A', ymd(11, 4))];
    const copy = structuredClone(list);
    kevByVendor(list, NOW);
    expect(list).toEqual(copy);
  });
});

describe('cvssBands', () => {
  it('buckets by band, leaves unscored out and respects the window edges', () => {
    const list = [
      cve('a', iso(11, 5), { score: 9.8 }), cve('b', iso(11, 5), { score: 9 }), cve('c', iso(10, 7), { score: 7.5 }),
      cve('d', iso(10, 6), { score: 7.5 }), // 30 days back is out (window starts 10-07)
      cve('e', iso(11, 1), { score: 5 }), cve('f', iso(11, 1), { score: 0.1 }), cve('g', iso(11, 1)), cve('h', iso(11, 1), { score: 0 }),
    ];
    expect(cvssBands(list, NOW)).toEqual([
      { label: '9–10', value: 2 }, { label: '7–8.9', value: 1 }, { label: '4–6.9', value: 1 }, { label: '0.1–3.9', value: 1 },
    ]);
  });
  it('returns zero rows when empty', () => {
    expect(cvssBands([], NOW).map((r) => r.value)).toEqual([0, 0, 0, 0]);
  });
});

describe('epssHistogram', () => {
  it('buckets KEV EPSS scores and skips entries without one', () => {
    const list = [0, 0.005, 0.01, 0.2, 0.97, 1].map((epss, i) => kev(String(i), 'A', ymd(11, 1), { epss }));
    list.push(kev('none', 'A', ymd(11, 1)));
    expect(epssHistogram(list).map((b) => b.count)).toEqual([2, 1, 0, 1, 0, 0, 2]);
    expect(epssHistogram(list)[0]).toEqual({ from: 0, to: 0.01, count: 2 });
  });
  it('has the seven buckets even when empty', () => {
    expect(epssHistogram([])).toHaveLength(7);
  });
});

describe('criticalPerDayByCweFamily', () => {
  const list = [
    cve('1', iso(11, 5), { score: 9.8, cwe: 'CWE-79' }), cve('2', iso(11, 5), { score: 9.1, cwe: 'CWE-79' }),
    cve('3', iso(11, 4), { score: 9.9, cwe: 'CWE-89' }), cve('4', iso(11, 4), { severity: 'CRITICAL', cwe: 'CWE-78' }),
    cve('5', iso(11, 4), { score: 9.5, cwe: 'CWE-22' }), cve('6', iso(11, 4), { score: 9.5, cwe: 'CWE-20' }),
    cve('7', iso(11, 4), { score: 9.5 }), // no CWE
    cve('8', iso(11, 4), { score: 8.9, cwe: 'CWE-79' }), // not critical
  ];
  it('keeps the 4 biggest families and folds the rest into Other', () => {
    const days = criticalPerDayByCweFamily(list, NOW, 2);
    expect(days.map((d) => d.label)).toEqual([ymd(11, 4), ymd(11, 5)]);
    expect(days[0].short).toBe('11-04');
    const names = days[0].segments.map((s) => s.name);
    expect(names).toHaveLength(5);
    expect(names[4]).toBe('Other');
    expect(names[0]).toBe('XSS'); // CWE-79 has the most (2); the label comes from shortCwe
    const total = (d: (typeof days)[number]) => d.segments.reduce((n, s) => n + s.value, 0);
    expect(total(days[0])).toBe(5);
    expect(total(days[1])).toBe(2);
    expect(days[0].segments.find((s) => s.name === 'Other')?.value).toBe(2);
  });
  it('has no Other segment when there are 4 families or fewer, and covers every day when empty', () => {
    expect(criticalPerDayByCweFamily(list.slice(0, 3), NOW, 2)[0].segments.map((s) => s.name)).not.toContain('Other');
    const empty = criticalPerDayByCweFamily([], NOW, 3);
    expect(empty).toHaveLength(3);
    expect(empty[0].segments).toEqual([]);
  });
  it('excludes days outside the window', () => {
    expect(criticalPerDayByCweFamily(list, NOW, 1)[0].segments.reduce((n, s) => n + s.value, 0)).toBe(2);
  });
});

describe('ransomware', () => {
  const victims = [
    victim('1', 'lockbit', iso(11, 5), 'Healthcare'), victim('2', 'lockbit', iso(11, 4), 'Healthcare'), victim('3', 'Akira', iso(11, 4)),
    victim('4', 'Akira', iso(10, 6), 'Retail'), // 30 days back: out
  ];
  it('victimsBySector uses Unknown for a missing sector', () => {
    expect(victimsBySector(victims, NOW)).toEqual([{ label: 'Healthcare', value: 2, pct: 67 }, { label: 'Unknown', value: 1, pct: 33 }]);
    expect(victimsBySector([], NOW)).toEqual([]);
  });
  it('groupShare shows group display names and honours the window', () => {
    expect(groupShare(victims, NOW)).toEqual([{ label: 'Lockbit', value: 2, pct: 67 }, { label: 'Akira', value: 1, pct: 33 }]);
    expect(groupShare(victims, NOW, 31)[1].value).toBe(2);
  });
  it('victimsPerDayTopGroups stacks the top groups per day', () => {
    const days = victimsPerDayTopGroups(victims, NOW, 2, 1);
    expect(days.map((d) => d.label)).toEqual([ymd(11, 4), ymd(11, 5)]);
    expect(days[0].segments.map((s) => [s.name, s.value])).toEqual([['Lockbit', 1], ['Other', 1]]);
    expect(days[1].segments.map((s) => [s.name, s.value])).toEqual([['Lockbit', 1], ['Other', 0]]);
    const copy = structuredClone(victims);
    victimsPerDayTopGroups(victims, NOW);
    expect(victims).toEqual(copy);
  });
  it('is empty-safe', () => {
    expect(victimsPerDayTopGroups([], NOW, 3)).toHaveLength(3);
  });
});

describe('news', () => {
  const feeds = [feed('f1', 'Vendor Advisories'), feed('f2', 'News')];
  const list = [
    article('a', iso(11, 5), { sourceId: 'f1', severity: 'critical' }),
    article('b', iso(11, 5), { sourceId: 'f2', severity: 'info' }),
    article('c', iso(11, 3), { sourceId: 'gone', categories: ['Research'], severity: 'high' }),
    article('d', iso(11, 3), { sourceId: 'gone' }),
    article('e', iso(10, 29)), // 7 days back is out
  ];
  it('storiesByCategory uses the feed category, then the article category, then Uncategorized', () => {
    expect(storiesByCategory(list, feeds, NOW)).toEqual([
      { label: 'News', value: 1, pct: 25 }, { label: 'Research', value: 1, pct: 25 },
      { label: 'Uncategorized', value: 1, pct: 25 }, { label: 'Vendor Advisories', value: 1, pct: 25 },
    ]);
    expect(storiesByCategory(list, feeds, NOW, 8).reduce((n, s) => n + s.value, 0)).toBe(5);
    expect(storiesByCategory([], feeds, NOW)).toEqual([]);
  });
  it('storiesPerDayBySeverity maps info and missing severity to Unrated', () => {
    const days = storiesPerDayBySeverity(list, NOW, 3);
    expect(days.map((d) => d.label)).toEqual([ymd(11, 3), ymd(11, 4), ymd(11, 5)]);
    const row = (i: number) => Object.fromEntries(days[i].segments.map((s) => [s.name, s.value]));
    expect(row(0)).toEqual({ Critical: 0, High: 1, Medium: 0, Low: 0, Unrated: 1 });
    expect(row(1)).toEqual({ Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0 });
    expect(row(2)).toEqual({ Critical: 1, High: 0, Medium: 0, Low: 0, Unrated: 1 });
  });
  it('topVendorsThisWeek ranks vendors named in the week, skipping ambiguous names and old stories', () => {
    const stories = [
      article('1', iso(11, 5), { title: 'Fortinet patches FortiOS bug' }),
      article('2', iso(11, 4), { title: 'Fortinet and Cisco under attack' }),
      article('3', iso(11, 4), { title: 'Cisco fixes flaw' }),
      article('4', iso(11, 3), { title: 'Fortinet again' }),
      article('5', iso(10, 20), { title: 'Cisco old news' }),
      article('6', iso(11, 4), { title: 'Progress on the roadmap' }),
    ];
    expect(topVendorsThisWeek(stories, NOW, ['Fortinet', 'Cisco', 'Progress'])).toEqual([
      { label: 'Fortinet', value: 3 }, { label: 'Cisco', value: 2 },
    ]);
    expect(topVendorsThisWeek([], NOW, ['Cisco'])).toEqual([]);
  });
});

describe('npm', () => {
  const data = npm([
    adv('G1', 'critical', iso(11, 5), { cwes: [{ id: 'CWE-79', name: 'XSS' }], ranges: [{ package: 'a', vulnerable: '<1', patched: '1.0.0' }] }),
    adv('G2', 'high', iso(11, 4), { cwes: [{ id: 'CWE-79', name: 'XSS' }, { id: 'CWE-1333', name: 'Inefficient Regular Expression Complexity' }], ranges: [{ package: 'a', vulnerable: '<2' }, { package: 'b', vulnerable: '<2', patched: '2.0.0' }] }),
    adv('G3', 'high', iso(11, 4), { withdrawn: iso(11, 5), cwes: [{ id: 'CWE-79', name: 'XSS' }] }),
    adv('G4', 'unknown', iso(11, 1), { ranges: [{ package: 'a', vulnerable: '<2' }] }),
    adv('G5', 'critical', iso(10, 6)), // out of the 30-day window
  ]);
  it('npmPerDayBySeverity stacks by severity and drops withdrawn advisories', () => {
    const days = npmPerDayBySeverity(data, NOW, 5);
    expect(days.map((d) => d.label)).toEqual([ymd(11, 1), ymd(11, 2), ymd(11, 3), ymd(11, 4), ymd(11, 5)]);
    const row = (i: number) => Object.fromEntries(days[i].segments.map((s) => [s.name, s.value]));
    expect(row(0)).toEqual({ Critical: 0, High: 0, Medium: 0, Low: 0, Unknown: 1 });
    expect(row(3)).toEqual({ Critical: 0, High: 1, Medium: 0, Low: 0, Unknown: 0 });
    expect(row(4).Critical).toBe(1);
  });
  it('npmSeverityShare', () => {
    expect(npmSeverityShare(data, NOW)).toEqual([
      { label: 'Critical', value: 1, pct: 34 }, { label: 'High', value: 1, pct: 33 }, { label: 'Unknown', value: 1, pct: 33 },
    ]);
    expect(npmSeverityShare(data, NOW, 31).find((s) => s.label === 'Critical')?.value).toBe(2);
  });
  it('npmVulnVsMalware counts distinct malware advisories per day', () => {
    const mal = malware([['M1', 'x', '>= 0', iso(11, 5)], ['M1', 'y', '>= 0', iso(11, 5)], ['M2', 'z', '>= 0', iso(11, 4)], ['M3', 'w', '>= 0', iso(10, 1)]]);
    const days = npmVulnVsMalware(data, mal, NOW, 2);
    expect(days.map((d) => d.segments.map((s) => [s.name, s.value]))).toEqual([
      [['Vulnerabilities', 1], ['Malware', 1]],
      [['Vulnerabilities', 1], ['Malware', 1]],
    ]);
    expect(npmVulnVsMalware(data, null, NOW, 1)[0].segments[1].value).toBe(0);
  });
  it('npmTopPackages counts each advisory once per package', () => {
    expect(npmTopPackages(data, NOW)).toEqual([{ label: 'a', value: 3 }, { label: 'b', value: 1 }]);
    expect(npmTopPackages(npm([]), NOW)).toEqual([]);
  });
  it('npmTopCwes uses short names', () => {
    // G1 and G2 carry CWE-79 (G3 is withdrawn); CWE-1333 appears once, under its own name
    expect(npmTopCwes(data, NOW)).toEqual([{ label: 'XSS', value: 2 }, { label: 'Inefficient…', value: 1 }]);
  });
  it('npmFixShare treats an advisory as fixed only when every range has a patch', () => {
    expect(npmFixShare(data, NOW)).toEqual([{ label: 'No fix', value: 2, pct: 67 }, { label: 'Fix available', value: 1, pct: 33 }]);
  });
  it('newestCriticalNpm ignores withdrawn and non-critical advisories', () => {
    const d = npm([adv('A', 'critical', iso(11, 1)), adv('B', 'critical', iso(11, 3), { withdrawn: iso(11, 4) }), adv('C', 'high', iso(11, 5)), adv('D', 'critical', iso(11, 2))]);
    expect(newestCriticalNpm(d)?.id).toBe('D');
    expect(newestCriticalNpm(npm([]))).toBeNull();
  });
  it('malwarePerDay counts distinct advisories per day, oldest first', () => {
    const mal = malware([['M1', 'x', '>= 0', iso(11, 5)], ['M1', 'y', '>= 0', iso(11, 5)], ['M2', 'z', '>= 0', iso(11, 3)], ['M3', 'w', '>= 0', iso(10, 29)]]);
    expect(malwarePerDay(mal, NOW, 3)).toEqual([1, 0, 1]);
    expect(malwarePerDay(null, NOW, 3)).toEqual([0, 0, 0]);
  });
  it('does not mutate its inputs', () => {
    const copy = structuredClone(data);
    npmPerDayBySeverity(data, NOW); npmTopCwes(data, NOW); npmFixShare(data, NOW); npmTopPackages(data, NOW);
    expect(data).toEqual(copy);
  });
  it('myPackagesStatus counts each status', () => {
    const r = (status: PackageResult['status']) => ({ status }) as PackageResult;
    expect(myPackagesStatus([r('affected'), r('not-affected'), r('not-affected'), r('no-version'), r('unknown')])).toEqual([
      { label: 'Clean', value: 2, pct: 40 }, { label: 'Affected', value: 1, pct: 20 }, { label: 'No version', value: 1, pct: 20 }, { label: 'Unknown', value: 1, pct: 20 },
    ]);
    expect(myPackagesStatus([])).toEqual([]);
  });
});
