import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { LeakSiteVictim, MsrcData, StatsData, VulnData } from '../../types';
import { ransomPanels, vulnPanels, VulnCtx, WATCHLIST_EMPTY } from './dashPanels';

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

describe('vulnPanels', () => {
  it('has no panels without data', () => {
    expect(vulnPanels(ctx())).toEqual([]);
  });
  it('lists the panels with data in order; numbers 1×1, charts and lists wide', () => {
    const p = vulnPanels(ctx({ vulns, msrc }));
    expect(ids(p)).toEqual([
      'critical7d', 'kev7d', 'exploits7d', 'patchTuesday', 'exploitedNow',
      'topVendors', 'latestCritical', 'patchBreakdown', 'cvssSpread', 'kevRansomware',
    ]); // trend90 needs two weeks with data; no watchlist without a stack or followed CVEs
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

describe('ransomPanels', () => {
  const vic = (id: string, ago: number, extra: Partial<LeakSiteVictim> = {}): LeakSiteVictim =>
    ({ id, victim: id, group: 'lockbit', discoveredAt: new Date(now - ago).toISOString(), ...extra });

  it('has no panels without data', () => {
    expect(ransomPanels({ victims: [], stats: null, now })).toEqual([]);
  });
  it('leaves out panels whose data is empty', () => {
    const p = ids(ransomPanels({ victims: [vic('a', H), vic('b', 2 * H)], stats: null, now }));
    expect(p).toEqual(['victims24h', 'victims7d', 'groups7d', 'topGroups', 'latestVictims', 'newGroups', 'spotlight', 'weekday']);
    // no sector/country data, and one day is not a chart yet
  });
  it('includes sector, country and charts when the data has them', () => {
    const victims = [vic('a', H, { sector: 'Health', country: 'SE' }), vic('b', 26 * H, { sector: 'Tech', country: 'US' }), vic('c', 8 * 24 * H)];
    const p = ids(ransomPanels({ victims, stats: null as StatsData | null, now }));
    expect(p).toEqual(expect.arrayContaining(['topSector', 'topCountries', 'topSectors', 'daily30', 'weekly90']));
  });
});
