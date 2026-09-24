import { Article, FilterState } from '../../types';

export function filterAndSortArticles(
  articles: Article[],
  filters: FilterState,
  hideReadArticles = false
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
        (article.author && article.author.toLowerCase().includes(q))
      );
    });
  }

  // 2. Category
  if (filters.selectedCategory) {
    result = result.filter(a =>
      a.categories.some(c => c.toLowerCase() === filters.selectedCategory?.toLowerCase())
    );
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

  // 8. Date Range
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
      case 'newest':
      default:
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
  });

  return result;
}
