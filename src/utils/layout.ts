import type { HashRoute } from '../hooks/useHashRoute';

/** The header's layout buttons have nothing to switch on My Feed's Vulns tab (CVE rows, not articles) */
export function layoutLocked(route: HashRoute): boolean {
  return route.page === 'feed' && route.sub === 'vulns';
}
