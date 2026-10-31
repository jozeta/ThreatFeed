import type { HashRoute } from '../hooks/useHashRoute';

/** The header's layout buttons have nothing to switch on My Feed's Vulns tab (CVE rows, not articles) */
export function layoutLocked(route: HashRoute): boolean {
  return route.page === 'feed' && route.sub === 'vulns';
}

/**
 * Whether the newspaper view groups stories into sections and folds related coverage into clusters.
 * The front page follows the saved settings; chronological views (Latest, My Feed) start with both
 * off, so stories run newest first, and their toggles only change that view (`local`).
 */
export function newspaperModes(
  chronological: boolean,
  saved: { sectionsEnabled?: boolean; clusteringEnabled?: boolean },
  local: { sections: boolean; clustering: boolean }
): { sections: boolean; clustering: boolean } {
  if (chronological) return local;
  return { sections: saved.sectionsEnabled !== false, clustering: Boolean(saved.clusteringEnabled) };
}

/**
 * How many items of a grid fit whole into `available` px of height: items fill `columns` per row,
 * each row is as tall as its tallest item, `gap` px between rows. Counts only whole rows (never a
 * cut card); a short last row counts when the items run out. 1px of slack absorbs sub-pixel rounding.
 * A row with no height isn't laid out (display: none), so it and the rows after it don't count.
 */
export function fitGridItems(available: number, itemHeights: number[], columns: number, gap: number): number {
  const cols = Math.max(1, Math.floor(columns));
  let used = 0;
  let count = 0;
  for (let i = 0; i < itemHeights.length; i += cols) {
    const row = itemHeights.slice(i, i + cols);
    const height = Math.max(...row);
    const next = used + (count > 0 ? gap : 0) + height;
    if (height <= 0 || next > available + 1) break;
    used = next;
    count += row.length;
  }
  return count;
}
