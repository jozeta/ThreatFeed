import { describe, expect, it } from 'vitest';
import { clusterArticles } from './clustering';
import { article } from '../../test/fixtures';
import { makeArticles } from '../../test/fixtures/articles2000';
import { MIN_COMPARABLE_TOKENS, hasCjk, wordTokens } from './titleTokens';
import type { Article, StoryCluster } from '../../types';

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

  it('does not merge katakana stories that share only ー', () => {
    expect(sizes(['サーバー攻撃の急増', 'ユーザー情報の流出'])).toEqual([1, 1]);
  });

  it('counts two-character CJK words as tokens', () => {
    expect(sizes(['Ivanti 悪用 確認', 'Citrix 悪用 確認'])).toEqual([2]);
  });
});

// The implementation before PERF-004 (pairwise scan of the 96h window, tokens rebuilt per call), kept as the
// reference the indexed version must match exactly.
function referenceCluster(articles: Article[]): StoryCluster[] {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
    'of', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'that', 'this',
    'it', 'its', 'as', 'new', 'security', 'cyber', 'report', 'warns', 'alert', 'reveals'
  ]);
  const tokensOf = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .flatMap(wordTokens)
        .filter(w => (w.length > 2 || hasCjk(w)) && !STOP_WORDS.has(w))
    );
  const jaccard = (setA: Set<string>, setB: Set<string>) => {
    if (setA.size < MIN_COMPARABLE_TOKENS || setB.size < MIN_COMPARABLE_TOKENS) return 0;
    let intersectionCount = 0;
    setA.forEach(item => {
      if (setB.has(item)) intersectionCount++;
    });
    const unionCount = setA.size + setB.size - intersectionCount;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
  };
  const WINDOW = 96 * 60 * 60 * 1000;

  if (!articles || articles.length === 0) return [];
  const clusters: StoryCluster[] = [];
  const assigned = new Set<string>();
  const metadata = articles
    .map(art => ({ article: art, tokens: tokensOf(art.title), cveSet: new Set(art.cves || []), pubTime: new Date(art.publishedAt).getTime() }))
    .sort((a, b) => (isNaN(a.pubTime) ? 1 : isNaN(b.pubTime) ? -1 : a.pubTime - b.pubTime));

  for (let i = 0; i < metadata.length; i++) {
    const itemA = metadata[i];
    if (assigned.has(itemA.article.id)) continue;
    assigned.add(itemA.article.id);
    const members = [itemA];
    if (!isNaN(itemA.pubTime)) {
      for (let j = i + 1; j < metadata.length; j++) {
        const itemB = metadata[j];
        if (isNaN(itemB.pubTime) || itemB.pubTime - itemA.pubTime > WINDOW) break;
        if (assigned.has(itemB.article.id)) continue;
        let matchedByCVE = false;
        for (const cve of itemA.cveSet) {
          if (itemB.cveSet.has(cve)) {
            matchedByCVE = true;
            break;
          }
        }
        const matchedByTitle =
          !matchedByCVE && itemA.article.sourceId !== itemB.article.sourceId && jaccard(itemA.tokens, itemB.tokens) >= 0.40;
        if (matchedByCVE || matchedByTitle) {
          members.push(itemB);
          assigned.add(itemB.article.id);
        }
      }
    }
    const cveCounts = new Map<string, number>();
    for (const m of members) for (const cve of m.cveSet) cveCounts.set(cve, (cveCounts.get(cve) || 0) + 1);
    const sharedCVEs = Array.from(cveCounts).filter(([, n]) => n >= 2).map(([cve]) => cve);
    const allMembers = members.map(m => m.article);
    allMembers.sort((a, b) => (b.severityScore || 0) + (b.image ? 10 : 0) - ((a.severityScore || 0) + (a.image ? 10 : 0)));
    const primary = allMembers[0];
    const related = allMembers.slice(1);
    clusters.push({ id: primary.id, primaryArticle: primary, relatedArticles: related, sharedCVEs, clusterSize: 1 + related.length });
  }
  return clusters;
}

/** Task 3's fixture plus what clustering also reads: a few sources, some CVEs, severity and images. */
function clusterFixture(n: number, seed: number): Article[] {
  let s = seed + 1;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return makeArticles(n, seed).map(a => ({
    ...a,
    sourceId: `s${Math.floor(rand() * 6)}`,
    cves: rand() < 0.15 ? [`CVE-2026-${Math.floor(rand() * 40)}`, ...(rand() < 0.3 ? [`CVE-2026-${Math.floor(rand() * 40)}`] : [])] : undefined,
    severityScore: Math.floor(rand() * 4) * 10,
    image: rand() < 0.3 ? 'https://example.com/i.png' : undefined,
  }));
}

/** Everything that defines the output: cluster ids, primaries, members and their order, shared CVEs. */
const shape = (clusters: StoryCluster[]) =>
  clusters.map(c => [c.id, c.primaryArticle.id, c.relatedArticles.map(r => r.id), c.sharedCVEs, c.clusterSize]);

describe('clusterArticles on 2,000 articles', () => {
  const fixture = clusterFixture(2000, 42);

  it('clustering matches the reference on 2,000 articles', () => {
    const expected = shape(referenceCluster(fixture));
    // The fixture really exercises both criteria: plenty of multi-article clusters
    expect(expected.filter(c => (c[4] as number) > 1).length).toBeGreaterThan(100);
    expect(shape(clusterArticles(fixture))).toEqual(expected);
    // Again with warm caches, and in other orders and seeds
    expect(shape(clusterArticles(fixture))).toEqual(expected);
    const reversed = [...fixture].reverse();
    expect(shape(clusterArticles(reversed))).toEqual(shape(referenceCluster(reversed)));
    for (const seed of [1, 7, 99]) {
      const other = clusterFixture(2000, seed);
      expect(shape(clusterArticles(other))).toEqual(shape(referenceCluster(other)));
    }
  });

  it('matches the reference at the similarity threshold (word sets of every size from a small vocabulary)', () => {
    const vocab = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
    let s = 12345;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const list = Array.from({ length: 1500 }, (_, i) =>
      article(`v${i}`, {
        sourceId: `s${i % 3}`,
        title: vocab.filter(() => rand() < 0.5).join(' '),
        publishedAt: new Date(Date.UTC(2026, 9, 1) + Math.floor(rand() * 20 * 86400000)).toISOString(),
        cves: rand() < 0.05 ? [`CVE-2026-${Math.floor(rand() * 10)}`] : undefined,
      })
    );
    expect(shape(clusterArticles(list))).toEqual(shape(referenceCluster(list)));
  });

  it('clustering is fast', () => {
    // Fresh objects, so the token cache is cold
    const cold = clusterFixture(2000, 3).map(a => ({ ...a }));
    const start = performance.now();
    clusterArticles(cold);
    expect(performance.now() - start).toBeLessThan(300);
  });
});
