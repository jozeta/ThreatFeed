import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { LeakSiteVictim, MsrcData, RansomwareIntel, StatsData, VulnData } from '../../types';
import { ransomPanels, vulnNumberPanels, vulnPanels, VulnCtx, WATCHLIST_EMPTY } from './dashPanels';

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
      'topVendors', 'latestCritical', 'patchBreakdown', 'cvssSpread', 'kevRansomware', 'exploitSources',
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
    expect(p).toEqual(['victims24h', 'victims7d', 'groups7d', 'topGroups', 'latestVictims', 'newGroups', 'spotlight', 'weekday', 'hours']);
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
