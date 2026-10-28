import { Article, Feed, FilterState, ThreatSeverity } from '../../types';
import { checkWatchlistMatch } from '../intelligence/watchlist';

function normalizeCategory(str: string): string {
  return str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

const SEVERITY_WEIGHT: Record<ThreatSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export interface FilterExtras {
  // Relevance scores from the full-text index for filters.searchQuery; without it, a substring match is used
  searchScores?: Map<string, number> | null;
  // Hidden everywhere except bookmarks (same whole-word matching as the watchlist)
  mutedKeywords?: string[];
  // Feed categories left out (used for the newspaper front page)
  hiddenCategories?: string[];
}

export function filterAndSortArticles(
  articles: Article[],
  filters: FilterState,
  hideReadArticles = false,
  feeds: Feed[] = [],
  watchlistKeywords: string[] = [],
  extras: FilterExtras = {}
): Article[] {
  let result = [...articles];

  if (extras.mutedKeywords && extras.mutedKeywords.length > 0) {
    const muted = extras.mutedKeywords;
    result = result.filter(a => a.bookmarked || !checkWatchlistMatch(a, muted).matched);
  }

  if (extras.hiddenCategories && extras.hiddenCategories.length > 0) {
    const hidden = new Set(extras.hiddenCategories);
    const feedCategory = new Map(feeds.map(f => [f.id, f.category]));
    result = result.filter(a => !hidden.has(feedCategory.get(a.sourceId) || ''));
  }

  // Global hideReadArticles setting (or overridden by filter)
  if (hideReadArticles && filters.readStatus === 'all') {
    result = result.filter(a => !a.read);
  }

  // 1. Search Query
  const scores = filters.searchQuery.trim() ? extras.searchScores : null;
  if (scores) {
    result = result.filter(article => scores.has(article.id));
  } else if (filters.searchQuery.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    result = result.filter(article => {
      return (
        article.title.toLowerCase().includes(q) ||
        (article.description && article.description.toLowerCase().includes(q)) ||
        article.sourceName.toLowerCase().includes(q) ||
        article.tags.some(t => t.toLowerCase().includes(q)) ||
        article.categories.some(c => c.toLowerCase().includes(q)) ||
        (article.author && article.author.toLowerCase().includes(q)) ||
        (article.cves && article.cves.some(cve => cve.toLowerCase().includes(q)))
      );
    });
  }

  // 2. Category (normalized match against article categories, tags, or parent feed category)
  if (filters.selectedCategory) {
    const targetCat = normalizeCategory(filters.selectedCategory);
    const feedCategoryMap = new Map(feeds.map(f => [f.id, normalizeCategory(f.category)]));

    result = result.filter(a => {
      // Direct article categories match
      if (a.categories && a.categories.some(c => normalizeCategory(c) === targetCat)) return true;
      // Tags match
      if (a.tags && a.tags.some(t => normalizeCategory(t) === targetCat)) return true;
      // Parent feed category match
      const parentFeedCat = feedCategoryMap.get(a.sourceId);
      if (parentFeedCat && parentFeedCat === targetCat) return true;
      return false;
    });
  }

  // 3. Source
  if (filters.selectedSourceId) {
    result = result.filter(a => a.sourceId === filters.selectedSourceId);
  }

  // 4. Tag
  if (filters.selectedTag) {
    result = result.filter(a =>
      a.tags.some(t => t.toLowerCase() === filters.selectedTag?.toLowerCase()) ||
      (a.customTags && a.customTags.some(t => t.toLowerCase() === filters.selectedTag?.toLowerCase()))
    );
  }

  // 5. Read Status
  if (filters.readStatus === 'unread') {
    result = result.filter(a => !a.read);
  } else if (filters.readStatus === 'read') {
    result = result.filter(a => a.read);
  }

  // 6. Viewed Status
  if (filters.viewedStatus === 'unviewed') {
    result = result.filter(a => !a.viewed);
  } else if (filters.viewedStatus === 'viewed') {
    result = result.filter(a => a.viewed);
  }

  // 7. Bookmarks
  if (filters.bookmarkedOnly) {
    result = result.filter(a => a.bookmarked);
  }

  // 8. Watchlist Filter
  if (filters.watchlistOnly && watchlistKeywords.length > 0) {
    result = result.filter(a => checkWatchlistMatch(a, watchlistKeywords).matched);
  }

  // 9. Severity Filter
  if (filters.severityFilter && filters.severityFilter !== 'all') {
    const minWeight = SEVERITY_WEIGHT[filters.severityFilter] ?? 0;
    result = result.filter(a => {
      const artWeight = SEVERITY_WEIGHT[a.severity || 'info'] ?? 0;
      return artWeight >= minWeight;
    });
  }

  // 10. Date Range
  if (filters.dateRange !== 'all') {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    let threshold = 0;

    if (filters.dateRange === 'today') {
      threshold = now - oneDay;
    } else if (filters.dateRange === 'week') {
      threshold = now - 7 * oneDay;
    } else if (filters.dateRange === 'month') {
      threshold = now - 30 * oneDay;
    }

    result = result.filter(a => new Date(a.publishedAt).getTime() >= threshold);
  }

  // Sorting: parse each article's dates once instead of in every comparison
  const toTime = (iso?: string) => (iso ? new Date(iso).getTime() || 0 : 0);
  const keyOf = (a: Article): number => {
    switch (filters.sortBy) {
      case 'oldest':
        return -toTime(a.publishedAt);
      case 'recently_read':
        return toTime(a.readAt);
      case 'recently_viewed':
        return toTime(a.viewedAt);
      default:
        return toTime(a.publishedAt);
    }
  };
  const keys = new Map(result.map(a => [a.id, keyOf(a)]));
  const published = new Map(result.map(a => [a.id, toTime(a.publishedAt)]));

  result.sort((a, b) => {
    if (filters.sortBy === 'relevance' && scores) {
      const diff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return published.get(b.id)! - published.get(a.id)!;
    }
    if (filters.sortBy === 'severity') {
      const scoreDiff = (b.severityScore ?? 0) - (a.severityScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return published.get(b.id)! - published.get(a.id)!;
    }
    return keys.get(b.id)! - keys.get(a.id)!;
  });

  return result;
}

