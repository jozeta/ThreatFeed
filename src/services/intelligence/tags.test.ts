import { describe, expect, it } from 'vitest';
import { cweOfTag, dailyCounts, tagMatches } from './tags';
import { Article, CveRecord, KevEntry, VulnData } from '../../types';

const NOW = new Date('2026-10-30T12:00:00Z').getTime();

const kev = (cve: string, dateAdded: string, extra: Partial<KevEntry> = {}): KevEntry => ({
  cve, vendor: 'Acme', product: 'Gateway', name: 'Acme Gateway bug', dateAdded, ransomware: false, cwes: [], ...extra,
});
const cve = (id: string, published: string, extra: Partial<CveRecord> = {}): CveRecord => ({ id, published, score: 9.8, ...extra });
const article = (id: string, publishedAt: string, extra: Partial<Article> = {}): Article => ({
  id, title: `Story ${id}`, url: `https://example.com/${id}`, sourceId: 'news', sourceName: 'News', publishedAt, tags: [], categories: [],
  read: false, viewed: false, bookmarked: false, ...extra,
});

const vulns = {
  updatedAt: '2026-10-30T00:00:00Z', nvd: null, advisories: [], epssTop: [],
  kev: [
    kev('CVE-2026-0001', '2026-10-20', { cwes: ['CWE-79'], description: 'A cross-site scripting flaw' }),
    kev('CVE-2026-0002', '2026-10-25', { ransomware: true, name: 'Acme Gateway Remote Code Execution' }),
    kev('CVE-2026-0003', '2026-09-01', { products: ['acme ransomware shield'] }),
    // Listed in KEV and among the notable CVEs: shown once, as the KEV entry
    kev('CVE-2026-0004', '2026-10-01', { cwes: ['CWE-79'] }),
  ],
  notable: [
    cve('CVE-2026-1001', '2026-10-28T10:00:00Z', { cwe: 'CWE-79', description: 'Stored XSS in a widget' }),
    cve('CVE-2026-1002', '2026-10-27T10:00:00Z', { description: 'Ransomware operators exploit this remote code execution bug' }),
    cve('CVE-2026-0004', '2026-09-20T10:00:00Z', { cwe: 'CWE-79' }),
    cve('CVE-2026-1003', '2026-10-26T10:00:00Z', { cwe: 'CWE-89', description: 'Ransomwarelike text is no whole word' }),
  ],
  watchable: [cve('CVE-2026-2001', '2026-10-29T10:00:00Z', { cwe: 'CWE-79', score: 7.5 })],
  cweNames: { 'CWE-79': 'Cross-site Scripting', 'CWE-89': 'SQL Injection' },
} as VulnData;

const articles = [
  article('a1', '2026-10-28T08:00:00Z', { tags: ['Ransomware', 'CVE'] }),
  article('a2', '2026-10-29T08:00:00Z', { categories: ['ransomware'] }),
  article('a3', '2026-10-27T08:00:00Z', { customTags: ['RANSOMWARE'] }),
  article('a4', '2026-10-29T09:00:00Z', { tags: ['Malware'], title: 'Ransomware in the title only' }),
  // A publisher's "Trojan" category is the Malware threat topic
  article('a5', '2026-10-26T09:00:00Z', { categories: ['Trojan'] }),
  article('a6', '2026-10-25T09:00:00Z', { tags: ['Web Security'], cves: ['CVE-2026-1001'] }),
];

describe('tagMatches', () => {
  it('finds articles whose tags, categories or custom tags carry the tag, any case, newest first', () => {
    expect(tagMatches('Ransomware', articles, vulns).articles.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
    expect(tagMatches('#ransomware', articles, vulns).articles.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
  });

  it('leaves out leak-site victim posts, which the Ransomware page already lists', () => {
    const withPosts = [
      ...articles,
      article('leak1', '2026-10-30T08:00:00Z', { tags: ['Ransomware'], sourceId: 'ransomware-live', title: 'Shiba has just published a new victim : Acme' }),
      article('leak2', '2026-10-30T09:00:00Z', { tags: ['Ransomware'], title: 'Qilin has just published a new victim : Example Corp' }),
    ];
    expect(tagMatches('Ransomware', withPosts, vulns).articles.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
  });

  it('matches by threat topic, so a publisher keyword finds articles with its normalized tag and back', () => {
    expect(tagMatches('Malware', articles, vulns).articles.map((a) => a.id)).toEqual(['a4', 'a5']);
    expect(tagMatches('trojan', articles, vulns).articles.map((a) => a.id)).toEqual(['a4', 'a5']);
  });

  it('finds KEV entries and notable or watchable CVEs whose text matches the tag as a whole word', () => {
    const ids = tagMatches('Ransomware', articles, vulns).vulns.map((v) => v.cve);
    // Name, product, description; known ransomware use counts too. "Ransomwarelike" doesn't.
    expect(ids).toEqual(['CVE-2026-1002', 'CVE-2026-0002', 'CVE-2026-0003']);
    expect(tagMatches('remote code execution', articles, vulns).vulns.map((v) => v.cve)).toEqual(['CVE-2026-1002', 'CVE-2026-0002']);
  });

  it('lists every CVE with the CWE for a CWE id or name, KEV entries once, and the articles about them', () => {
    const byId = tagMatches('cwe-79', articles, vulns);
    expect(byId.cwe).toBe('CWE-79');
    expect(byId.vulns.map((v) => v.cve)).toEqual(['CVE-2026-2001', 'CVE-2026-1001', 'CVE-2026-0001', 'CVE-2026-0004']);
    expect(byId.vulns.find((v) => v.cve === 'CVE-2026-0004')?.kev).toBe(true);
    expect(byId.articles.map((a) => a.id)).toEqual(['a6']);
    expect(tagMatches('Cross-site Scripting', articles, vulns).vulns.map((v) => v.cve)).toEqual(byId.vulns.map((v) => v.cve));
  });

  it('copes with no vulnerability data and blank tags', () => {
    expect(tagMatches('Ransomware', articles, null).vulns).toEqual([]);
    expect(tagMatches('  ', articles, vulns)).toEqual({ articles: [], vulns: [] });
  });
});

describe('cweOfTag', () => {
  it('reads a CWE id, or a CWE name the snapshot knows', () => {
    expect(cweOfTag('CWE-89', {})).toBe('CWE-89');
    expect(cweOfTag('sql injection', vulns.cweNames)).toBe('CWE-89');
    expect(cweOfTag('Ransomware', vulns.cweNames)).toBeUndefined();
  });
});

describe('dailyCounts', () => {
  it('counts articles per day over the window, oldest day first, today last', () => {
    const counts = dailyCounts(articles, 5, NOW);
    expect(counts).toEqual([1, 1, 1, 2, 0]); // Oct 26 … Oct 30; a6 on Oct 25 is outside
  });
});
