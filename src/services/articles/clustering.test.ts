import { describe, expect, it } from 'vitest';
import { clusterArticles } from './clustering';
import { article } from '../../test/fixtures';

const t0 = Date.parse('2026-10-20T00:00:00Z');
const at = (h: number) => new Date(t0 + h * 3600e3).toISOString();

describe('clusterArticles', () => {
  const clusters = clusterArticles([
    article('a', { sourceId: 's1', title: 'Ivanti VPN flaw exploited', publishedAt: at(0), cves: ['CVE-2026-1', 'CVE-2026-9'] }),
    article('b', { sourceId: 's2', title: 'Attackers hit Ivanti gateways', publishedAt: at(10), cves: ['CVE-2026-1'] }),
    article('c', { sourceId: 's3', title: 'Unrelated Chrome update', publishedAt: at(5) }),
    article('d', { sourceId: 's2', title: 'Ivanti VPN flaw exploited widely', publishedAt: at(200), cves: ['CVE-2026-1'] }),
  ]);

  it('clusters by shared CVE within the 96h window', () => {
    const pair = clusters.find(c => c.clusterSize === 2)!;
    expect([pair.primaryArticle.id, ...pair.relatedArticles.map(r => r.id)].sort()).toEqual(['a', 'b']);
  });

  it('only lists CVEs shared by two or more members', () => {
    expect(clusters.find(c => c.clusterSize === 2)!.sharedCVEs).toEqual(['CVE-2026-1']);
  });

  it('does not cluster outside the window', () => {
    expect(clusters.find(c => c.primaryArticle.id === 'd')!.clusterSize).toBe(1);
  });
});

describe('clusterArticles with non-Latin titles', () => {
  const sizes = (titles: string[]) =>
    clusterArticles(titles.map((title, i) => article(`n${i}`, { sourceId: `s${i}`, title, publishedAt: at(i) })))
      .map(c => c.clusterSize).sort();

  it('does not merge different Russian stories sharing only Latin words', () => {
    expect(sizes(['Уязвимость в Cisco IOS XE', 'Атака шифровальщика на Cisco завершена'])).toEqual([1, 1]);
  });

  it('does not merge different Japanese stories sharing only a Latin word', () => {
    expect(sizes(['Ivanti製品の脆弱性に関する注意喚起', 'Ivantiを狙うランサムウェア攻撃'])).toEqual([1, 1]);
  });

  it('merges near-identical Russian titles', () => {
    expect(sizes(['Критическая уязвимость в Cisco IOS XE', 'Критическая уязвимость в Cisco IOS XE найдена'])).toEqual([2]);
  });

  it('merges near-identical Japanese titles', () => {
    expect(sizes(['Ivanti製品の脆弱性に関する注意喚起', 'Ivanti製品の脆弱性に関する注意喚起について'])).toEqual([2]);
  });

  it('keeps accented Swedish words whole', () => {
    expect(sizes(['Sårbarhet utnyttjas aktivt', 'Sårbarhet utnyttjas aktivt idag'])).toEqual([2]);
  });
});
