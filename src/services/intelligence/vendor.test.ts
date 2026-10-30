import { describe, expect, it } from 'vitest';
import { canonicalVendor, ledByVendor, parseWikiSummary, vendorSummary, wikiTitle } from './vendor';
import { Article, CveRecord, KevEntry, MsrcData, VulnData } from '../../types';

const NOW = new Date('2026-10-30T12:00:00Z');

const kev = (cve: string, vendor: string, dateAdded: string, extra: Partial<KevEntry> = {}): KevEntry => ({
  cve, vendor, product: 'FortiOS', name: `${vendor} bug`, dateAdded, ransomware: false, cwes: [], ...extra,
});
const cve = (id: string, published: string, products: string[], score = 9.8): CveRecord => ({ id, published, score, products });
const article = (id: string, title: string, publishedAt: string, extra: Partial<Article> = {}): Article => ({
  id, title, url: `https://example.com/${id}`, sourceId: 'news', sourceName: 'News', publishedAt, tags: [], categories: [],
  read: false, viewed: false, bookmarked: false, ...extra,
});

const vulns = {
  updatedAt: NOW.toISOString(), nvd: null, advisories: [], epssTop: [],
  kev: [
    kev('CVE-2026-0001', 'Fortinet', '2026-10-25', { cvss: 9.8, ransomware: true }),
    kev('CVE-2026-0002', 'fortinet', '2026-09-15', { cvss: 7.5, product: 'FortiWeb' }),
    kev('CVE-2025-0003', 'Fortinet', '2025-01-10', { product: 'FortiOS' }),
    // Matched through NVD's product list rather than the catalog's vendor name
    kev('CVE-2026-0004', 'Unknown', '2026-10-20', { product: 'FortiManager', products: ['fortinet fortimanager'], cvss: 5.0 }),
    kev('CVE-2026-0005', 'Ivanti', '2026-10-28', { products: ['ivanti connect secure'] }),
    kev('CVE-2026-0006', 'Microsoft', '2026-10-01', { product: 'Windows' }),
    // Runs on a Fortinet product's platform list, but the vendor isn't the one leading the pair
    kev('CVE-2026-0007', 'Debian', '2026-10-02', { products: ['debian fortinet connector'] }),
    kev('CVE-2026-0008', 'Check Point', '2026-10-03', { product: 'Quantum' }),
    kev('CVE-2026-0009', 'Unknown', '2026-10-04', { products: ['checkpoint quantum security gateway'] }),
  ],
  notable: [
    cve('CVE-2026-1001', '2026-10-28T10:00:00Z', ['Fortinet FortiOS']),
    cve('CVE-2026-1002', '2026-09-01T10:00:00Z', ['Fortinet FortiOS']), // older than 14 days
    cve('CVE-2026-1003', '2026-10-29T10:00:00Z', ['Fortinetwork Router']), // not a whole-word match
  ],
  watchable: [cve('CVE-2026-1004', '2026-10-27T10:00:00Z', ['fortinet fortiweb'], 8.1)],
  exploits: { 'CVE-2026-0001': { pocs: 2 }, 'CVE-2026-1001': { nuclei: 'http/cves/x.yaml' }, 'CVE-2026-0005': { pocs: 1 } },
} as VulnData;

const articles = [
  article('a1', 'Fortinet patches FortiOS flaw', '2026-10-28T08:00:00Z'),
  article('a2', 'Old news', '2026-10-26T08:00:00Z', { description: 'Attackers hit fortinet appliances' }),
  article('a3', 'Fortinetwork is not a vendor', '2026-10-29T08:00:00Z'),
  article('a4', 'FG-IR-26-001 heap overflow', '2026-10-29T09:00:00Z', { sourceId: 'fortinet-psirt', sourceName: 'Fortinet PSIRT' }),
  article('a5', 'Microsoft Corporation earnings', '2026-10-29T09:00:00Z'),
];

describe('canonicalVendor', () => {
  it('maps the obvious aliases and trims everything else', () => {
    expect(canonicalVendor('Microsoft Corporation')).toBe('Microsoft');
    expect(canonicalVendor('apple inc.')).toBe('Apple');
    expect(canonicalVendor('Google LLC')).toBe('Google');
    expect(canonicalVendor('  Fortinet ')).toBe('Fortinet');
  });
});

describe('ledByVendor', () => {
  it('compares the leading vendor ignoring case, spaces, hyphens and underscores', () => {
    expect(ledByVendor('checkpoint quantum security gateway', 'Check Point')).toBe(true);
    expect(ledByVendor('Check Point Quantum', 'Check Point')).toBe(true);
    expect(ledByVendor('paloaltonetworks pan-os', 'Palo Alto Networks')).toBe(true);
    expect(ledByVendor('dlink dir-859', 'D-Link')).toBe(true);
    expect(ledByVendor('d_link dir-859', 'D-Link')).toBe(true);
  });

  it('needs a word boundary after the vendor and the vendor in front', () => {
    expect(ledByVendor('fortinetwork router', 'Fortinet')).toBe(false);
    expect(ledByVendor('debian debian linux', 'Linux')).toBe(false);
    expect(ledByVendor('fortinet', 'Fortinet')).toBe(true);
    expect(ledByVendor('', 'Fortinet')).toBe(false);
  });
});

describe('vendorSummary', () => {
  const s = vendorSummary('Fortinet', vulns, articles, undefined, NOW);

  it('matches KEV entries on the vendor (any case) and on NVD products', () => {
    expect(s.kevTotal).toBe(4);
    expect(s.recentKev.map((k) => k.cve)).toEqual(['CVE-2026-0001', 'CVE-2026-0004', 'CVE-2026-0002', 'CVE-2025-0003']);
    expect(s.kevVendor).toBe('Fortinet');
  });

  it('counts the 30 and 90-day windows, ransomware and CVSS', () => {
    expect(s.kevLast30).toBe(2);
    expect(s.kevLast90).toBe(3);
    expect(s.ransomwareLinked).toBe(1);
    expect(s.maxCvss).toBe(9.8);
    expect(s.avgCvss).toBeCloseTo(7.4, 1);
    expect(s.cvssBands.find((b) => b.id === 'critical')?.count).toBe(1);
    expect(s.cvssBands.find((b) => b.id === 'unscored')?.count).toBe(1);
  });

  it('buckets 12 months of KEV additions', () => {
    expect(s.kevPerMonth).toHaveLength(12);
    expect(s.kevPerMonth[11]).toEqual({ month: '2026-10', total: 2, ransomware: 1 });
  });

  it('ranks products with the catalog vendor kept for the KEV filter', () => {
    expect(s.topProducts[0]).toEqual({ product: 'FortiOS', vendor: 'Fortinet', count: 2 });
  });

  it('lists new critical and high CVEs from the last 14 days, whole-word product matches only', () => {
    expect(s.newCves.map((c) => c.id)).toEqual(['CVE-2026-1001', 'CVE-2026-1004']);
    expect(s.exploitsPublic).toBe(2);
  });

  it('separates advisory feeds from news mentions, newest first', () => {
    expect(s.newsMentions.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(s.advisoryFeedArticles.map((a) => a.id)).toEqual(['a4']);
    expect(s.patchTuesday).toBeUndefined();
  });

  it('resolves aliases and adds the latest Patch Tuesday for Microsoft', () => {
    const msrc: MsrcData = {
      months: [
        { id: '2026-Oct', title: 'October 2026 Security Updates', released: '2026-10-13T07:00:00Z', cves: [
          { cve: 'CVE-2026-2001', title: 'A', severity: 'Critical', impact: 'Remote Code Execution', exploited: true, publiclyDisclosed: false, products: [] },
          { cve: 'CVE-2026-2002', title: 'B', severity: 'Important', exploited: false, publiclyDisclosed: true, products: [] },
        ] },
        { id: '2026-Sep', title: 'September 2026 Security Updates', released: '2026-09-09T07:00:00Z', cves: [] },
      ],
    };
    const ms = vendorSummary('Microsoft Corporation', vulns, articles, msrc, NOW);
    expect(ms.name).toBe('Microsoft');
    expect(ms.kevTotal).toBe(1);
    expect(ms.newsMentions.map((a) => a.id)).toEqual(['a5']);
    expect(ms.patchTuesday).toEqual({ id: '2026-Oct', title: 'October 2026', released: '2026-10-13', total: 2, critical: 1, exploited: 1, disclosed: 1, rce: 1 });
  });

  it('matches NVD vendor spellings without spaces', () => {
    expect(vendorSummary('Check Point', vulns, [], undefined, NOW).recentKev.map((k) => k.cve)).toEqual(['CVE-2026-0009', 'CVE-2026-0008']);
  });

  it('copes with no data at all', () => {
    const empty = vendorSummary('Nobody', null, [], undefined, NOW);
    expect(empty).toMatchObject({ kevTotal: 0, avgCvss: undefined, maxCvss: undefined, newCves: [], newsMentions: [] });
  });
});

describe('Wikipedia summary', () => {
  it('builds titles, preferring the company article for ambiguous names', () => {
    expect(wikiTitle('Palo Alto Networks')).toBe('Palo_Alto_Networks');
    expect(wikiTitle('Apple')).toBe('Apple_Inc.');
  });

  it('keeps plain text, safe thumbnails and Wikipedia links only', () => {
    const page = {
      type: 'standard', title: 'Fortinet', description: 'American cybersecurity company', extract: 'Fortinet is a company.',
      extract_html: '<p onclick="x">Fortinet</p>',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/a.png' },
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Fortinet' } },
    };
    expect(parseWikiSummary(page)).toEqual({
      title: 'Fortinet', description: 'American cybersecurity company', extract: 'Fortinet is a company.',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/a.png', url: 'https://en.wikipedia.org/wiki/Fortinet',
    });
    const odd = parseWikiSummary({ ...page, thumbnail: { source: 'https://evil.example/a.png' }, content_urls: { desktop: { page: 'javascript:alert(1)' } } });
    expect(odd?.thumbnail).toBeUndefined();
    expect(odd?.url).toBe('https://en.wikipedia.org/wiki/Fortinet');
  });

  it('drops disambiguation pages and articles that are not about a company or product', () => {
    expect(parseWikiSummary({ type: 'disambiguation', title: 'Oracle', extract: 'Oracle may refer to:' })).toBeNull();
    expect(parseWikiSummary({ type: 'standard', title: 'Apple', description: 'Edible fruit', extract: 'An apple is a round, edible fruit.' })).toBeNull();
    expect(parseWikiSummary(null)).toBeNull();
  });
});
