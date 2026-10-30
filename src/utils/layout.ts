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
