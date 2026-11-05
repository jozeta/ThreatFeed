import { describe, expect, it } from 'vitest';
import type { Article, KevEntry, LeakSiteVictim, MsrcData, NpmAdvisory, NpmAdvisoryData, VulnData } from '../../types';
import { newsCandidates, normalizeUrl, npmCandidates, ransomwareCandidates, vulnCandidates } from './candidates';

const now = Date.parse('2026-11-03T12:00:00Z');
const site = 'https://jozeta.github.io/ThreatFeed/';
const day = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(now - d * day).toISOString();

const article = (id: string, over: Partial<Article> = {}): Article => ({
  id, title: 'Title', url: `https://example.com/${id}`, sourceId: id, sourceName: `Outlet ${id}`,
  publishedAt: ago(1), tags: [], categories: [], read: false, viewed: false, bookmarked: false, ...over,
});

const story = 'Hackers exploit Fortinet firewall zero-day flaw';
const cluster = [
  article('a', { title: story, severity: 'high', severityScore: 70, description: '<p>High one</p>' }),
  article('b', { title: `${story} attacks`, severity: 'critical', severityScore: 90, description: '<p>Critical <b>one</b></p>' }),
  article('c', { title: `${story} warns`, severity: 'low', severityScore: 10 }),
  article('d', { title: 'Completely unrelated gardening headline', severity: 'low', severityScore: 5 }),
];

const victim = (id: string, d: number): LeakSiteVictim => ({
  id, victim: 'Acme  Corp', group: 'Qilin', country: 'SE', sector: 'Manufacturing', discoveredAt: ago(d),
  url: `https://www.ransomware.live/id/${id}`,
});

const kev: KevEntry = {
  cve: 'CVE-2026-1', vendor: 'Fortinet', product: 'FortiOS', name: 'FortiOS RCE', dateAdded: ago(2).slice(0, 10),
  dueDate: '2026-11-20', ransomware: true, cwes: [], cvss: 9.8, epss: 0.5,
};

const vulns: VulnData = {
  updatedAt: ago(0), kev: [kev, { ...kev, cve: 'CVE-2025-9', dateAdded: '2025-01-01' }], nvd: null,
  notable: [
    { id: 'CVE-2026-2', published: ago(1), score: 9.8, assigner: 'Acme', description: '<p>Bad bug</p>' },
    { id: 'CVE-2026-3', published: ago(1), score: 8.0 },
  ],
  advisories: [], epssTop: [],
  exploits: {
    'CVE-2026-1': { pocs: 3, pocUrls: ['https://github.com/x/poc'], msf: ['exploit/a'] },
    'CVE-2026-77': { pocs: 2, msf: ['exploit/b'] },
  },
};

const msrc: MsrcData = {
  months: [{
    id: '2026-Oct', title: 'October 2026 Security Updates', released: ago(5),
    cves: [
      { cve: 'CVE-1', title: 't', severity: 'Critical', exploited: true, publiclyDisclosed: false, products: [] },
      { cve: 'CVE-2', title: 't', severity: 'Important', exploited: false, publiclyDisclosed: true, products: [] },
      { cve: 'CVE-3', title: 't', severity: 'Important', exploited: false, publiclyDisclosed: false, products: [] },
    ],
  }],
};

describe('feed candidates', () => {
  it('news keeps one critical/high item per cluster with a deterministic lead', () => {
    const out = newsCandidates(cluster, now, site);
    expect(out).toHaveLength(1);
    expect(out[0].guid).toBe('news:b');
    expect(out[0].feed).toBe('news');
    expect(out[0].description).toContain('Also covered by 2 other outlets');
    expect(out[0].keys).toEqual(expect.arrayContaining(['a:a', 'a:b', 'a:c']));
  });

  it('ransomware news ignores severity and needs the Ransomware tag', () => {
    const low = article('r', { severity: 'low', tags: ['ransomware'] });
    const out = ransomwareCandidates([low, article('s', { severity: 'low' })], [], now, site);
    expect(out).toHaveLength(1);
    expect(out[0].feed).toBe('ransomware');
    expect(out[0].categories.slice(0, 2)).toEqual(['news', 'ransomware']);
    expect(ransomwareCandidates([article('s', { severity: 'low' })], [], now, site)).toHaveLength(0);
  });

  it('victims within 7 days, with title parts', () => {
    const out = ransomwareCandidates([], [victim('v1', 2), victim('v2', 9)], now, site);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Victim: Acme  Corp (Qilin · SE · Manufacturing)');
    expect(out[0].keys).toEqual(['v:qilin|acme corp']);
    expect(out[0].description).toContain('Group: Qilin.');
  });

  it('kev and critical CVEs', () => {
    const out = vulnCandidates(vulns, null, now, site);
    const kevItem = out.find((c) => c.guid === 'kev:CVE-2026-1')!;
    const cveItem = out.find((c) => c.guid === 'cve:CVE-2026-2')!;
    expect([kevItem.rank, cveItem.rank]).toEqual([0, 1]);
    expect(kevItem.keys).toEqual(['c:CVE-2026-1']);
    expect(cveItem.keys).toEqual(['c:CVE-2026-2']);
    expect(kevItem.categories).toEqual(['kev', 'CVE-2026-1', 'cvss-9', 'ransomware']);
    expect(out.some((c) => c.guid === 'kev:CVE-2025-9' || c.guid === 'cve:CVE-2026-3')).toBe(false);
  });

  it('exploits only for KEV or critical CVEs, one per kind, marked baseline', () => {
    const out = vulnCandidates(vulns, null, now, site).filter((c) => c.kind === 'exploit');
    expect(out.map((c) => c.guid).sort()).toEqual(['exploit:CVE-2026-1:metasploit', 'exploit:CVE-2026-1:poc']);
    expect(out.every((c) => c.baseline)).toBe(true);
    expect(out.find((c) => c.guid.endsWith(':poc'))!.description).toContain('https://github.com/x/poc');
  });

  it('patch tuesday month in the window', () => {
    const out = vulnCandidates(null, msrc, now, site);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Patch Tuesday October 2026: 3 CVEs, 1 exploited');
    expect(out[0].keys).toEqual(['p:2026-Oct']);
  });

  it('descriptions are at most 400 characters and end with a Source line', () => {
    const long = article('l', { severity: 'critical', severityScore: 99, description: 'word '.repeat(200) });
    const all = [
      ...newsCandidates([...cluster, long], now, site),
      ...ransomwareCandidates([], [{ ...victim('v1', 1), description: 'word '.repeat(200) }], now, site),
      ...vulnCandidates(vulns, msrc, now, site),
    ];
    expect(all.length).toBeGreaterThan(5);
    for (const c of all) {
      expect(c.description.length).toBeLessThanOrEqual(400);
      expect(c.description).toMatch(/Source: .*https?:\/\/\S+$/);
    }
  });

  it('keeps descriptions within 400 characters with very long urls and names', () => {
    const url = `https://example.com/p?${'utm_x=1&'.repeat(70)}`;
    const news = newsCandidates([article('u', { url, severity: 'high', severityScore: 80, description: 'Some summary' })], now, site);
    const longKev = vulnCandidates({ ...vulns, kev: [{ ...kev, name: 'Very long name '.repeat(60) }] }, null, now, site)
      .find((c) => c.kind === 'kev')!;
    for (const c of [...news, longKev]) {
      expect(c.description.length).toBeLessThanOrEqual(400);
      expect(c.description).toContain('Source: ');
    }
    expect(longKev.description).toContain('Source: CISA KEV https://www.cisa.gov');
  });

  describe('npm advisories', () => {
    const advisory = (id: string, over: Partial<NpmAdvisory> = {}): NpmAdvisory => ({
      id, cves: ['CVE-2026-77'], summary: 'Prototype pollution in lodash-ish', description: 'long text', severity: 'high', cvss: [],
      cwes: [], ranges: [{ package: 'lodash-ish', vulnerable: '< 4.2.0', patched: '4.2.0' }, { package: 'lodash-ish-cli', vulnerable: '< 1.0.0' }],
      published: ago(1), updated: ago(1), references: [], credits: [], url: `https://github.com/advisories/${id}`, ...over,
    });
    const data = (recent: NpmAdvisory[]): NpmAdvisoryData => ({ version: 1, generatedAt: ago(0), updatedAt: ago(0), recent, index: [] });

    it('builds one candidate per reviewed advisory in the window', () => {
      const out = npmCandidates(data([
        advisory('GHSA-aaaa-bbbb-cccc'),
        advisory('GHSA-dddd-eeee-ffff', { withdrawn: ago(0) }),
        advisory('GHSA-gggg-hhhh-iiii', { published: ago(30) }),
      ]), now, site);
      expect(out).toHaveLength(1);
      const c = out[0];
      expect(c).toMatchObject({
        feed: 'npm', kind: 'npm', guid: 'npm:GHSA-aaaa-bbbb-cccc', title: 'npm high: lodash-ish — Prototype pollution in lodash-ish',
        link: `${site}#/vulns/npm?advisory=GHSA-aaaa-bbbb-cccc`, sourceTime: ago(1), keys: ['n:GHSA-aaaa-bbbb-cccc'],
        categories: ['npm', 'high', 'CVE-2026-77', 'lodash-ish', 'lodash-ish-cli'],
      });
      expect(c.description).toContain('lodash-ish < 4.2.0, patched in 4.2.0');
      expect(c.description).toContain('lodash-ish-cli < 1.0.0, no patched version');
      expect(c.description).toContain('CVE-2026-77');
      expect(c.description.length).toBeLessThanOrEqual(400);
      expect(c.description).toMatch(/Source: GitHub Advisory Database https:\/\/github\.com\/advisories\/GHSA-aaaa-bbbb-cccc$/);
    });

    it('is empty without data', () => {
      expect(npmCandidates(null, now, site)).toEqual([]);
    });

    it('keeps a long range list within 400 characters', () => {
      const ranges = Array.from({ length: 30 }, (_, i) => ({ package: `pkg-${i}-${'x'.repeat(40)}`, vulnerable: '< 1.0.0', patched: '1.0.0' }));
      const [c] = npmCandidates(data([advisory('GHSA-aaaa-bbbb-cccc', { ranges })]), now, site);
      expect(c.description.length).toBeLessThanOrEqual(400);
      expect(c.description).toMatch(/Source: GitHub Advisory Database /);
    });
  });

  it('normalizes urls', () => {
    expect(normalizeUrl('https://Example.COM/a/?utm_source=x&id=1#top')).toBe('https://example.com/a/?id=1');
    expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a');
  });
});
