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
