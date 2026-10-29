import { describe, expect, it } from 'vitest';
import { buildWatchState, diffCveWatch } from './cveWatch';
import { Article, VulnData } from '../../types';

describe('diffCveWatch', () => {
  const base = { kev: false, epss: 0.02, articleIds: ['a1'] };

  it('treats the first sighting as the baseline', () => {
    expect(diffCveWatch('CVE-1', undefined, { kev: true, epss: 0.9, articleIds: ['a1', 'a2'] })).toEqual([]);
  });

  it('reports a KEV listing, an EPSS jump and new articles', () => {
    const changes = diffCveWatch('CVE-1', base, { kev: true, kevDateAdded: '2026-10-29', epss: 0.3, articleIds: ['a1', 'a2', 'a3'] });
    expect(changes.map(c => c.kind)).toEqual(['kev', 'epss', 'news']);
    expect(changes[0].text).toBe('added to CISA KEV on 2026-10-29');
    expect(changes[1].text).toBe('EPSS rose from 2.0% to 30%');
    expect(changes[2].text).toBe('2 new articles');
  });

  it('ignores small EPSS moves and falls', () => {
    expect(diffCveWatch('CVE-1', base, { ...base, epss: 0.035 })).toEqual([]); // under 2x
    expect(diffCveWatch('CVE-1', { ...base, epss: 0.005 }, { ...base, epss: 0.012 })).toEqual([]); // 2x but under 2 points
    expect(diffCveWatch('CVE-1', { ...base, epss: 0.5 }, { ...base, epss: 0.1 })).toEqual([]);
  });
});

describe('buildWatchState', () => {
  it('prefers live EPSS and finds KEV status and articles', () => {
    const vulns = { kev: [{ cve: 'CVE-1', dateAdded: '2026-10-28', epss: 0.4 }] } as unknown as VulnData;
    const articles = [{ id: 'a', cves: ['CVE-1'] }, { id: 'b', cves: ['CVE-2'] }] as Article[];
    expect(buildWatchState('CVE-1', vulns, {}, articles, new Map([['CVE-1', 0.5]]))).toEqual({ kev: true, kevDateAdded: '2026-10-28', epss: 0.5, articleIds: ['a'] });
    expect(buildWatchState('CVE-1', vulns, {}, articles, new Map())).toMatchObject({ epss: 0.4 });
  });
});
