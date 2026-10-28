import MiniSearch from 'minisearch';
import { Article } from '../../types';

export type SearchIndex = MiniSearch<Article>;

/** Full-text index: ranked, prefix and typo tolerant ("ransomwar", "fortigte" still match). */
export function buildSearchIndex(articles: Article[]): SearchIndex {
  const index = new MiniSearch<Article>({
    fields: ['title', 'description', 'tags', 'customTags', 'cves', 'sourceName', 'author'],
    storeFields: [],
    extractField: (doc, field) => {
      const value = (doc as any)[field];
      return Array.isArray(value) ? value.join(' ') : value ?? '';
    },
    searchOptions: {
      boost: { title: 3, cves: 3, tags: 1.5, customTags: 1.5 },
      prefix: true,
      fuzzy: term => (term.length >= 5 ? 0.2 : false), // short terms (CVE fragments, "APT") stay exact
      combineWith: 'AND',
    },
  });
  // Ids are unique after dedup, but guard anyway: MiniSearch throws on duplicates
  const seen = new Set<string>();
  index.addAll(articles.filter(a => !seen.has(a.id) && seen.add(a.id)));
  return index;
}

/** Article id -> relevance score for a query. */
export function searchScores(index: SearchIndex, query: string): Map<string, number> {
  return new Map(index.search(query.trim()).map(r => [String(r.id), r.score]));
}
