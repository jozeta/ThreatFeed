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

export function filterAndSortArticles(
  articles: Article[],
  filters: FilterState,
  hideReadArticles = false,
  feeds: Feed[] = [],
  watchlistKeywords: string[] = []
): Article[] {
  let result = [...articles];

  // Global hideReadArticles setting (or overridden by filter)
  if (hideReadArticles && filters.readStatus === 'all') {
    result = result.filter(a => !a.read);
  }

  // 1. Search Query
  if (filters.searchQuery.trim()) {
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

  // Sorting
  result.sort((a, b) => {
    switch (filters.sortBy) {
      case 'oldest':
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      case 'recently_read':
        return (new Date(b.readAt || 0).getTime()) - (new Date(a.readAt || 0).getTime());
      case 'recently_viewed':
        return (new Date(b.viewedAt || 0).getTime()) - (new Date(a.viewedAt || 0).getTime());
      case 'severity': {
        const scoreDiff = (b.severityScore ?? 0) - (a.severityScore ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      case 'newest':
      default:
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
  });

  return result;
}

