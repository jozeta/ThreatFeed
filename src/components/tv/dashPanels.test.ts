import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { LeakSiteVictim, MsrcData, RansomwareIntel, StatsData, VulnData } from '../../types';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../../services/npm/advisories';
import type { PackageResult } from '../../services/npm/match';
import { NpmCtx, npmPanels, ransomPanels, vulnNumberPanels, vulnPanels, VulnCtx, WATCHLIST_EMPTY } from './dashPanels';

// The number cards read the TV settings and the motion setting; reduced motion shows their final value at once
vi.mock('./useTvSettings', () => ({ useTvSettings: () => ({ speed: 'medium' }) }));
vi.mock('../Common/SidePanel', () => ({ useReducedMotion: () => true }));

const now = Date.parse('2026-10-30T12:00:00Z');
const H = 3600e3;
const ids = (p: { id: string }[]) => p.map(x => x.id);
const shapesOf = (p: { id: string; shapes: string[] }[]) => Object.fromEntries(p.map(x => [x.id, x.shapes.join(',')]));

const vulns = {
  kev: [{ cve: 'CVE-1', vendor: 'Acme', product: 'Widget', dateAdded: '2026-10-28', ransomware: true }],
  notable: [{ id: 'CVE-2', published: '2026-10-29T00:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Bad thing', products: ['Contoso Server'] }],
  exploits: { 'CVE-2': { pocs: 2 } },
} as unknown as VulnData;
const msrc = { months: [{ title: 'October 2026 Security Updates', cves: [{ severity: 'Critical', exploited: true, publiclyDisclosed: false }] }] } as unknown as MsrcData;
const ctx = (p: Partial<VulnCtx> = {}): VulnCtx => ({ vulns: null, msrc: null, stats: null, stackKeywords: [], watchedCves: [], now, ...p });

describe('vulnNumberPanels', () => {
  it('is the four Vulns number panels, all 1×1, in the dashboard order', () => {
    const p = vulnNumberPanels(ctx({ vulns, msrc }));
    expect(ids(p)).toEqual(['critical7d', 'kev7d', 'exploits7d', 'patchTuesday']);
    expect(p.every(x => x.shapes.join(',') === '1x1')).toBe(true);
  });
  it('has none without Vulns data, and no Patch Tuesday without MSRC', () => {
    expect(vulnNumberPanels(ctx())).toEqual([]);
    expect(ids(vulnNumberPanels(ctx({ vulns })))).toEqual(['critical7d', 'kev7d', 'exploits7d']);
  });
});

describe('vulnPanels', () => {
  it('has no panels without data', () => {
    expect(vulnPanels(ctx())).toEqual([]);
  });
  it('lists the panels with data in order; numbers 1×1, charts and lists wide', () => {
    const p = vulnPanels(ctx({ vulns, msrc }));
    expect(ids(p)).toEqual([
      'critical7d', 'kev7d', 'exploits7d', 'patchTuesday', 'exploitedNow',
      'topVendors', 'latestCritical', 'patchBreakdown', 'cvssSpread', 'kevRansomware', 'exploitSources', 'kevVendors',
    ]); // trend90 needs two weeks with data; no watchlist without a stack or followed CVEs; the sample has no EPSS, CWE, deadline or publication dates
    const s = shapesOf(p);
    expect(s.critical7d).toBe('1x1');
    expect(s.patchTuesday).toBe('1x1');
    expect(s.exploitedNow).toBe('2x1,2x2');
    expect(s.cvssSpread).toBe('2x1,2x2');
  });
  it('drops Patch Tuesday panels without MSRC data', () => {
    const p = ids(vulnPanels(ctx({ vulns })));
    expect(p).not.toContain('patchTuesday');
    expect(p).not.toContain('patchBreakdown');
  });
  it('skips the watchlist only when there is no stack and no followed CVE', () => {
    expect(ids(vulnPanels(ctx({ vulns })))).not.toContain('watchlist');
    expect(ids(vulnPanels(ctx({ vulns, stackKeywords: ['contoso'] })))).toContain('watchlist');
    expect(ids(vulnPanels(ctx({ vulns, watchedCves: ['CVE-9'] })))).toContain('watchlist');
  });
  it('shows the calm message when the stack is set but quiet', () => {
    const c = ctx({ vulns, stackKeywords: ['nothing-matches-this'] });
    const w = vulnPanels(c).find(x => x.id === 'watchlist')!;
    const html = renderToStaticMarkup(createElement(Fragment, null, w.render()));
    expect(html).toContain(WATCHLIST_EMPTY);
  });
  it('a panel computes its figures from fresh data when it mounts', () => {
    let current = ctx({ vulns, stackKeywords: ['nothing-matches-this'] });
    const w = vulnPanels(current, () => current).find(x => x.id === 'watchlist')!;
    current = ctx({ vulns, stackKeywords: ['contoso'] });
    const html = renderToStaticMarkup(createElement(Fragment, null, w.render()));
    expect(html).toContain('CVE-2');
    expect(html).not.toContain(WATCHLIST_EMPTY);
  });
});

describe('vulnPanels · new panels', () => {
  const rich = {
    ...vulns,
    kev: [{ cve: 'CVE-1', vendor: 'Acme', product: 'Widget', dateAdded: '2026-10-28', dueDate: '2026-11-02', published: '2026-10-16T00:00:00Z', ransomware: false, cwes: [] }],
    notable: [{ id: 'CVE-2', published: '2026-10-29T00:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Bad thing', cwe: 'CWE-79' }],
    epssTop: [{ cve: 'CVE-1', epss: 0.973, percentile: 0.99 }],
    cweNames: { 'CWE-79': "Improper Neutralization ('Cross-site Scripting')" },
  } as unknown as VulnData;
  const html = (id: string) => renderToStaticMarkup(createElement(Fragment, null, vulnPanels(ctx({ vulns: rich })).find(x => x.id === id)!.render()));

  it('adds the five panels when the data has them; Time to KEV is a number, the rest wide', () => {
    const s = shapesOf(vulnPanels(ctx({ vulns: rich })));
    expect(s).toMatchObject({ epssTop: '2x1,2x2', timeToKev: '1x1', topCwes: '2x1,2x2', kevDue: '2x1,2x2', exploitSources: '2x1,2x2' });
  });
  it('renders their content', () => {
    expect(html('epssTop')).toContain('97%');
    expect(html('epssTop')).toContain('Acme Widget');
    expect(html('topCwes')).toContain('XSS');
    expect(html('kevDue')).toContain('due Mon 2 Nov');
    expect(html('exploitSources')).toContain('GitHub PoC');
  });
});

describe('ransomPanels', () => {
  const vic = (id: string, ago: number, extra: Partial<LeakSiteVictim> = {}): LeakSiteVictim =>
    ({ id, victim: id, group: 'lockbit', discoveredAt: new Date(now - ago).toISOString(), ...extra });

  it('has no panels without data', () => {
    expect(ransomPanels({ victims: [], stats: null, now })).toEqual([]);
  });
  it('leaves out panels whose data is empty', () => {
    const p = ids(ransomPanels({ victims: [vic('a', H), vic('b', 2 * H)], stats: null, now }));
    expect(p).toEqual(['victims24h', 'victims7d', 'groups7d', 'topGroups', 'latestVictims', 'newGroups', 'spotlight', 'weekday', 'hours', 'groupShare']);
    // no sector/country data, one day is not a chart yet, too few victims to move, no intel, no history before 30 days
  });
  it('includes sector, country and charts when the data has them', () => {
    const victims = [vic('a', H, { sector: 'Health', country: 'SE' }), vic('b', 26 * H, { sector: 'Tech', country: 'US' }), vic('c', 8 * 24 * H)];
    const p = ids(ransomPanels({ victims, stats: null as StatsData | null, now }));
    expect(p).toEqual(expect.arrayContaining(['topSector', 'topCountries', 'topSectors', 'daily30', 'weekly90', 'sectors30', 'hours']));
  });
  it('adds movers, new groups of 30 days and public reports when the data has them, all wide', () => {
    const D = 24 * H;
    const victims = [
      ...[1, 2, 3, 4].map(i => vic(`n${i}`, i * H, { group: 'risen' })),
      vic('old', 40 * D, { group: 'lockbit' }),
    ];
    const intel = { attacks: [{ id: 'x', victim: 'Oneonta City Schools', added: '2026-10-29', country: 'US', group: 'akira' }] } as unknown as RansomwareIntel;
    const p = ransomPanels({ victims, stats: null, now, intel });
    const s = shapesOf(p);
    expect(s).toMatchObject({ movers: '2x1,2x2', newGroups30: '2x1,2x2', attacks: '2x1,2x2', hours: '2x1,2x2' });
    const render = (id: string) => renderToStaticMarkup(createElement(Fragment, null, p.find(x => x.id === id)!.render()));
    expect(render('movers')).toContain('▲ 4');
    expect(render('attacks')).toContain('Oneonta City Schools');
    expect(render('attacks')).toContain('akira');
    expect(render('newGroups30')).toContain('risen');
    expect(ids(ransomPanels({ victims, stats: null, now }))).not.toContain('attacks');
  });
});

describe('ransomPanels · busiest hours', () => {
  it('shows the value of the peak hour and every 3rd hour only', () => {
    const at = (h: number, n: number) => Array.from({ length: n }, (_, i) =>
      ({ id: `${h}-${i}`, victim: 'v', group: 'g', discoveredAt: `2026-10-29T${String(h).padStart(2, '0')}:10:00Z` }) as LeakSiteVictim);
    const victims = [...at(0, 2), ...at(1, 4), ...at(5, 9), ...at(6, 3)];
    const p = ransomPanels({ victims, stats: null, now }).find(x => x.id === 'hours')!;
    const html = renderToStaticMarkup(createElement(Fragment, null, p.render()));
    const values = [...html.matchAll(/class="tv-vbar-n">([^<]*)</g)].map(m => m[1]);
    expect(values.slice(0, 7)).toEqual(['2', ' ', ' ', '0', ' ', '9', '3']); // 5 is the peak
  });
});

const npmAdv = (id: string, severity: NpmAdvisory['severity'], published: string, extra: Partial<NpmAdvisory> = {}): NpmAdvisory => ({
  id, cves: [], summary: `Summary of ${id}`, description: '', severity, cvss: [], cwes: [{ id: 'CWE-79', name: 'XSS' }],
  ranges: [{ package: 'left-pad', vulnerable: '< 2', patched: '2.0.0' }],
  published, updated: published, references: [], credits: [], url: 'https://github.com/advisories/' + id, ...extra,
});
const npmData = (recent: NpmAdvisory[]): NpmAdvisoryData => ({ version: 1, generatedAt: '', updatedAt: '', recent, index: [] });
const npmMalware = (entries: NpmMalwareData['entries']): NpmMalwareData => ({ version: 1, generatedAt: '', updatedAt: '', entries });
const advisories = npmData([
  npmAdv('GHSA-aaaa-aaaa-aaaa', 'critical', '2026-10-29T08:00:00Z'),
  npmAdv('GHSA-bbbb-bbbb-bbbb', 'high', '2026-10-28T08:00:00Z', { ranges: [{ package: 'qs', vulnerable: '< 6' }] }),
  npmAdv('GHSA-cccc-cccc-cccc', 'critical', '2026-10-20T08:00:00Z', { withdrawn: '2026-10-21T00:00:00Z' }),
]);
const mal = npmMalware([['GHSA-mmmm-mmmm-mmmm', 'evil-pkg', '>= 0', '2026-10-29T09:00:00Z']]);
const result = (status: PackageResult['status']): PackageResult =>
  ({ entry: { name: 'lodash', version: '4.17.15' }, status, advisories: [], malware: false, malwareCheckedDays: 30, osv: 'off' }) as unknown as PackageResult;
const npmCtx = (p: Partial<NpmCtx> = {}): NpmCtx => ({ data: advisories, malware: mal, results: [], now, ...p });
const render = (p: { render: () => unknown }) => renderToStaticMarkup(createElement(Fragment, null, p.render() as never));

describe('npmPanels', () => {
  it('lists the npm panels when the data exists; the two counts are numbers, the rest wide', () => {
    const p = npmPanels(npmCtx({ results: [result('affected')] }));
    expect(ids(p)).toEqual([
      'npmWeek', 'npmDaily', 'npmSeverity', 'npmKinds', 'npmTopPackages', 'npmTopCwes', 'npmMine', 'npmNewestCritical', 'npmMalware7d', 'npmFixShare',
    ]);
    const s = shapesOf(p);
    expect(s.npmMalware7d).toBe('1x1');
    expect(s.npmWeek).toBe('1x1');
    expect(p.filter(x => !['npmMalware7d', 'npmWeek'].includes(x.id)).every(x => x.shapes.join(',') === '2x1,2x2')).toBe(true);
  });
  it('npm data missing → no npm panels', () => {
    expect(npmPanels(npmCtx({ data: null }))).toEqual([]);
    expect(npmPanels(npmCtx({ data: null, malware: null }))).toEqual([]);
  });
  it('has "My packages" only when packages are watched', () => {
    expect(ids(npmPanels(npmCtx()))).not.toContain('npmMine');
    expect(ids(npmPanels(npmCtx({ results: [result('not-affected')] })))).toContain('npmMine');
  });
  it('skips the malware count without the malware file, and the newest critical without a critical advisory', () => {
    expect(ids(npmPanels(npmCtx({ malware: null })))).not.toContain('npmMalware7d');
    const noCritical = npmData([npmAdv('GHSA-dddd-dddd-dddd', 'high', '2026-10-29T08:00:00Z')]);
    expect(ids(npmPanels(npmCtx({ data: noCritical })))).not.toContain('npmNewestCritical');
  });
  it('renders its figures: severity legend with shares, packages, malware count, advisory text as text', () => {
    const p = npmPanels(npmCtx({ results: [result('affected')] }));
    const html = (id: string) => render(p.find(x => x.id === id)!);
    expect(html('npmSeverity')).toContain('Critical');
    expect(html('npmSeverity')).toContain('50%');
    expect(html('npmSeverity')).toMatch(/aria-label="[^"]*Critical 1 \(50%\)/);
    expect(html('npmTopPackages')).toContain('left-pad');
    expect(html('npmMine')).toContain('Affected');
    expect(html('npmMalware7d')).toContain('Malware');
    expect(html('npmNewestCritical')).toContain('GHSA-aaaa-aaaa-aaaa');
    expect(html('npmDaily')).toContain('High');
    expect(html('npmWeek')).toMatch(/class="tv-big"[^>]*>2</); // both advisories that aren't withdrawn are from this week
    const evil = npmData([npmAdv('GHSA-eeee-eeee-eeee', 'critical', '2026-10-29T08:00:00Z', { summary: '<b>x</b>' })]);
    const tile = render(npmPanels(npmCtx({ data: evil })).find(x => x.id === 'npmNewestCritical')!);
    expect(tile).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(tile).not.toContain('<b>x</b>');
  });
  it('a panel computes its figures from fresh data when it mounts', () => {
    let current = npmCtx();
    const p = npmPanels(current, () => current).find(x => x.id === 'npmNewestCritical')!;
    current = npmCtx({ data: npmData([npmAdv('GHSA-ffff-ffff-ffff', 'critical', '2026-10-30T08:00:00Z')]) });
    const html = render(p);
    expect(html).toContain('GHSA-ffff-ffff-ffff');
    expect(html).not.toContain('GHSA-aaaa-aaaa-aaaa');
  });
});

describe('vulnPanels · charts', () => {
  const chartVulns = {
    ...vulns,
    kev: [
      { cve: 'CVE-1', vendor: 'Acme', product: 'Widget', dateAdded: '2026-10-28', ransomware: false, cwes: [], epss: 0.42 },
      { cve: 'CVE-3', vendor: 'Contoso', product: 'Server', dateAdded: '2026-10-20', ransomware: false, cwes: [], epss: 0.004 },
    ],
    notable: [
      { id: 'CVE-2', published: '2026-10-29T08:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Bad thing', cwe: 'CWE-79' },
      { id: 'CVE-4', published: '2026-10-27T08:00:00Z', score: 9.1, severity: 'CRITICAL', description: 'Worse thing', cwe: 'CWE-89' },
    ],
    nvd: { from: '2026-10-01', to: '2026-10-30', total: 30, cwes: [], assigners: [], daily: [
      { date: '2026-10-28', total: 10, critical: 2, high: 3, medium: 4, low: 1, unscored: 0 },
      { date: '2026-10-29', total: 20, critical: 1, high: 5, medium: 6, low: 0, unscored: 8 },
    ] },
  } as unknown as VulnData;

  it('adds KEV by vendor, CVSS bands, the EPSS histogram, critical per day by weakness and the npm panels, all wide but the npm count', () => {
    const p = vulnPanels(ctx({ vulns: chartVulns, npm: advisories }));
    expect(ids(p)).toEqual(expect.arrayContaining(['kevVendors', 'cvssBands', 'epssKev', 'criticalByCwe', 'npmWeek', 'npmSeverity']));
    expect(shapesOf(p)).toMatchObject({
      kevVendors: '2x1,2x2', cvssBands: '2x1,2x2', epssKev: '2x1,2x2', criticalByCwe: '2x1,2x2', npmWeek: '1x1', npmSeverity: '2x1,2x2',
    });
  });
  it('leaves the npm panels out without npm data', () => {
    const p = ids(vulnPanels(ctx({ vulns: chartVulns })));
    expect(p).not.toContain('npmWeek');
    expect(p).not.toContain('npmSeverity');
  });
  it('renders their figures', () => {
    const p = vulnPanels(ctx({ vulns: chartVulns, npm: advisories }));
    const html = (id: string) => render(p.find(x => x.id === id)!);
    expect(html('kevVendors')).toContain('Contoso');
    expect(html('cvssBands')).toMatch(/class="tv-vbar-n">3</); // 9–10: 2 + 1
    expect(html('epssKev')).toContain('30–50%');
    expect(html('criticalByCwe')).toContain('XSS');
    expect(html('npmWeek')).toContain('npm advisories');
  });
});

describe('ransomPanels · charts', () => {
  const vic = (id: string, ago: number, extra: Partial<LeakSiteVictim> = {}): LeakSiteVictim =>
    ({ id, victim: id, group: 'lockbit', discoveredAt: new Date(now - ago).toISOString(), ...extra });

  it('adds victims by sector, group share and victims per day of the top groups when the data has them', () => {
    const victims = [vic('a', H, { sector: 'Health' }), vic('b', 26 * H, { sector: 'Tech', group: 'akira' }), vic('c', 50 * H)];
    const p = ransomPanels({ victims, stats: null, now });
    expect(shapesOf(p)).toMatchObject({ sectorShare: '2x1,2x2', groupShare: '2x1,2x2', groupsDaily: '2x1,2x2' });
    const html = (id: string) => render(p.find(x => x.id === id)!);
    expect(html('sectorShare')).toContain('Health');
    expect(html('groupShare')).toContain('Akira');
    expect(html('groupsDaily')).toContain('Lockbit');
  });
  it('has no sector donut when no victim has a sector', () => {
    expect(ids(ransomPanels({ victims: [vic('a', H), vic('b', 26 * H)], stats: null, now }))).not.toContain('sectorShare');
  });
});

/** Legend entries (label → swatch colour) of a donut or stacked panel */
const legendColors = (html: string) =>
  Object.fromEntries([...html.matchAll(/<i style="background:(#[0-9a-f]{6})"><\/i>(?:<span[^>]*>)?([^<]+)/g)].map(m => [m[2], m[1]]));

describe('TV chart colours', () => {
  it('the severity donut and the per-day stacked bars agree per severity, in hex (no theme classes)', () => {
    const data = npmData([
      npmAdv('GHSA-1111-1111-1111', 'critical', '2026-10-29T08:00:00Z'), npmAdv('GHSA-2222-2222-2222', 'high', '2026-10-28T08:00:00Z'),
      npmAdv('GHSA-3333-3333-3333', 'medium', '2026-10-28T09:00:00Z'), npmAdv('GHSA-4444-4444-4444', 'low', '2026-10-27T08:00:00Z'),
      npmAdv('GHSA-5555-5555-5555', 'unknown', '2026-10-27T09:00:00Z'),
    ]);
    const p = npmPanels(npmCtx({ data }));
    const donut = legendColors(render(p.find(x => x.id === 'npmSeverity')!));
    const stacked = legendColors(render(p.find(x => x.id === 'npmDaily')!));
    expect(Object.keys(donut).sort()).toEqual(['Critical', 'High', 'Low', 'Medium', 'Unknown']);
    expect(stacked).toEqual(donut);
    expect(donut.Unknown).toBe('#94a3b8');
    // one source for page and TV: the page's NpmTab and per-day bars use the same hex
    expect(donut).toMatchObject({ Medium: '#fbbf24', Low: '#0ea5e9' });
    expect(render(p.find(x => x.id === 'npmDaily')!)).not.toMatch(/dark:|fill-/);
  });
  it('"Unknown" and "Other" are grey, and rank colours go to real categories only', () => {
    const vic = (id: string, sector?: string): LeakSiteVictim => ({ id, victim: id, group: 'lockbit', discoveredAt: new Date(now - H).toISOString(), sector });
    const victims = [vic('a'), vic('b'), vic('c'), vic('d', 'Health'), vic('e', 'Health'), vic('f', 'Tech')];
    const colors = legendColors(render(ransomPanels({ victims, stats: null, now }).find(x => x.id === 'sectorShare')!));
    expect(colors).toEqual({ Unknown: '#94a3b8', Health: '#e11d48', Tech: '#f97316' });
    const mine = legendColors(render(npmPanels(npmCtx({ results: [result('affected'), result('unknown')] })).find(x => x.id === 'npmMine')!));
    expect(mine).toEqual({ Affected: '#e11d48', 'Check manually': '#94a3b8' });
  });
  it('names the advisory slice of the malware donut for what it counts (published or updated)', () => {
    const html = render(npmPanels(npmCtx()).find(x => x.id === 'npmKinds')!);
    expect(html).toContain('New or updated advisories');
    expect(html).not.toContain('>Vulnerabilities<');
  });
});
