import { useState } from 'react';

/**
 * Incremental rendering for long article lists: shows `pageSize` items, then one more page
 * per showMore(). Rendering thousands of cards at once makes every state change slow.
 */
export function usePagedCount(total: number, pageSize: number, initialPages = 1) {
  const [pages, setPages] = useState(initialPages);
  const visibleCount = Math.min(Math.max(total, 0), pages * pageSize);

  return {
    visibleCount,
    hasMore: visibleCount < total,
    remaining: Math.max(total - visibleCount, 0),
    showMore: () => setPages((p) => p + 1),
  };
}
