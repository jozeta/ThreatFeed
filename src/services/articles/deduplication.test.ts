import { describe, expect, it } from 'vitest';
import { deduplicateArticles } from './deduplication';
import { article } from '../../test/fixtures';
import { makeArticles } from '../../test/fixtures/articles2000';
import { MIN_COMPARABLE_TOKENS, wordTokens } from './titleTokens';
import type { Article } from '../../types';

const when = '2026-10-20T00:00:00Z';
const a = (id: string, title: string) => article(id, { title, publishedAt: when });
const ids = (list: ReturnType<typeof deduplicateArticles>) => list.map(x => x.id);

describe('deduplicateArticles', () => {
  it('drops a syndicated English duplicate', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti VPN zero-day exploited in the wild'),
      a('2', 'Ivanti VPN zero-day exploited in the wild!'),
    ]);
    expect(ids(out)).toEqual(['1']);
  });

  it('keeps different Japanese stories that only share a Latin word', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti製品の脆弱性に関する注意喚起'),
      a('2', 'Ivantiを狙うランサムウェア攻撃'),
    ]);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('keeps different Russian stories that only share a Latin phrase', () => {
    const out = deduplicateArticles([
      a('1', 'Уязвимость в Cisco IOS XE'),
      a('2', 'Атака на Cisco IOS XE завершена'),
    ]);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('still drops an identical non-Latin title', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti製品の脆弱性に関する注意喚起'),
      a('2', 'Ivanti製品の脆弱性に関する注意喚起'),
    ]);
    expect(ids(out)).toEqual(['1']);
  });

  it('keeps accented Swedish words whole', () => {
    const out = deduplicateArticles([
      a('1', 'Sårbarhet i Ivanti utnyttjas aktivt'),
      a('2', 'Sårbarhet i Ivanti utnyttjas aktivt.'),
      a('3', 'Srbarhet i Ivanti utnyttjas aktivt'),
    ]);
    expect(ids(out)).toEqual(['1', '3']);
  });

  it('does not fuzzy-compare titles with fewer than two tokens', () => {
    const out = deduplicateArticles([a('1', '速報'), a('2', 'ニュース'), a('3', '!!!'), a('4', '???')]);
    expect(ids(out)).toEqual(['1', '2', '3', '4']);
  });

  it('still dedupes by id and url', () => {
    const out = deduplicateArticles([
      article('1', { title: '速報', publishedAt: when, url: 'https://x/1' }),
      article('1', { title: 'other', publishedAt: when, url: 'https://x/2' }),
      article('2', { title: 'another', publishedAt: when, url: 'https://x/1' }),
    ]);
    expect(ids(out)).toEqual(['1']);
  });
});

describe('deduplicateArticles with long-vowel marks and combining marks', () => {
  it('keeps different katakana stories that share only ー', () => {
    const out = deduplicateArticles([a('1', 'サーバー攻撃の急増'), a('2', 'ユーザー情報の流出')]);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('keeps combining marks, so a decomposed accent is not silently dropped', () => {
    const out = deduplicateArticles([
      a('1', 'Sa\u030Arbarhet i Ivanti utnyttjas aktivt'),
      a('2', 'Sarbarhet i Ivanti utnyttjas aktivt'),
    ]);
    expect(ids(out)).toEqual(['1', '2']);
  });
});

// The implementation before PERF-001 (bucketed linear scan, word sets rebuilt per call), kept as the
// reference the indexed version must match exactly.
function referenceDedup(articles: Article[]): Article[] {
  const TITLE_SIMILARITY_THRESHOLD = 0.82;
  const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const titleWordSet = (title: string) => {
    const cleaned = title.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    return new Set(cleaned ? cleaned.split(' ').flatMap(wordTokens) : []);
  };
  const jaccard = (w1: Set<string>, w2: Set<string>) => {
    if (w1.size === 0 || w2.size === 0) return 0;
    let intersection = 0;
    for (const word of w1) if (w2.has(word)) intersection++;
    const union = w1.size + w2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  };

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: Article[] = [];
  const byDay = new Map<number, { words: Set<string>; pubTime: number }[]>();

  for (const article of articles) {
    if (seenIds.has(article.id)) continue;
    if (article.url && seenUrls.has(article.url)) continue;
    const words = titleWordSet(article.title || '');
    const pubTime = new Date(article.publishedAt).getTime();
    const hasDate = !isNaN(pubTime);
    if (hasDate && words.size >= MIN_COMPARABLE_TOKENS) {
      const day = Math.floor(pubTime / DAY_MS);
      let isDuplicateTitle = false;
      for (let d = day - 2; d <= day + 2 && !isDuplicateTitle; d++) {
        const bucket = byDay.get(d);
        if (!bucket) continue;
        isDuplicateTitle = bucket.some(
          existing =>
            Math.abs(existing.pubTime - pubTime) < DUPLICATE_WINDOW_MS &&
            jaccard(existing.words, words) > TITLE_SIMILARITY_THRESHOLD
        );
      }
      if (isDuplicateTitle) continue;
      const bucket = byDay.get(day);
      if (bucket) bucket.push({ words, pubTime });
      else byDay.set(day, [{ words, pubTime }]);
    }
    seenIds.add(article.id);
    if (article.url) seenUrls.add(article.url);
    deduped.push(article);
  }
  return deduped;
}

describe('deduplicateArticles on 2,000 articles', () => {
  const fixture = makeArticles(2000, 42);

  it('dedup matches the reference on 2,000 articles', () => {
    const expected = ids(referenceDedup(fixture));
    // The fixture really exercises the fuzzy check: a good share is dropped
    expect(expected.length).toBeLessThan(1900);
    expect(ids(deduplicateArticles(fixture))).toEqual(expected);
    // Again with warm caches, and in other orders
    expect(ids(deduplicateArticles(fixture))).toEqual(expected);
    const reversed = [...fixture].reverse();
    expect(ids(deduplicateArticles(reversed))).toEqual(ids(referenceDedup(reversed)));
    for (const seed of [1, 7, 99]) {
      const other = makeArticles(2000, seed);
      expect(ids(deduplicateArticles(other))).toEqual(ids(referenceDedup(other)));
    }
  });

  it('matches the reference at the similarity threshold (word sets of every size from a small vocabulary)', () => {
    const vocab = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j10', 'k11', 'l12'];
    let s = 12345;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const list = Array.from({ length: 1500 }, (_, i) =>
      article(`v${i}`, {
        title: vocab.filter(() => rand() < 0.7).join(' '),
        publishedAt: new Date(Date.UTC(2026, 9, 1) + Math.floor(rand() * 5 * 86400000)).toISOString(),
      })
    );
    expect(ids(deduplicateArticles(list))).toEqual(ids(referenceDedup(list)));
  });

  it('dedup is fast', () => {
    // Fresh objects, so the word-set cache is cold
    const cold = makeArticles(2000, 3).map(a => ({ ...a }));
    const start = performance.now();
    deduplicateArticles(cold);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
