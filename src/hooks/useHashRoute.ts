import { useCallback, useSyncExternalStore } from 'react';
import { ActiveNavTab } from '../types';

/**
 * Hash routing: #/<page>[/<sub>][?key=value…], e.g. #/vulns/kev?vendor=Fortinet&cvss=9&cve=CVE-2026-1234.
 * Hashes work on GitHub Pages without server rewrites, and every view can be bookmarked or shared.
 * Page and tab changes add a history entry (so Back works); filter changes replace the current one.
 */
export interface HashRoute {
  page: ActiveNavTab;
  sub: string;
  params: URLSearchParams;
}

// URL slug for each page (the newspaper is the bare #/)
const SLUGS: Record<ActiveNavTab, string> = {
  newspaper: '', latest: 'latest', unread: 'unread', briefing: 'briefing', trends: 'trends', feed: 'feed', ransomware: 'ransomware', actors: 'actors',
  vulnerabilities: 'vulns', bookmarks: 'saved', sources: 'sources', health: 'health', settings: 'settings',
};
const PAGES = new Map(Object.entries(SLUGS).map(([page, slug]) => [slug, page as ActiveNavTab]));
const ROUTE_EVENT = 'threatfeed:route';

export function parseHash(hash: string): HashRoute {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [slug = '', sub = ''] = path.split('/').map(decodeURIComponent);
  return { page: PAGES.get(slug) ?? 'newspaper', sub, params: new URLSearchParams(query) };
}

export function buildHash(page: ActiveNavTab, sub = '', params?: URLSearchParams): string {
  const path = [SLUGS[page], sub].filter(Boolean).map(encodeURIComponent).join('/');
  const query = params?.toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

function go(hash: string, replace: boolean) {
  if (hash === window.location.hash || (hash === '#/' && !window.location.hash)) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) window.history.replaceState(window.history.state, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(ROUTE_EVENT)); // pushState doesn't fire hashchange
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
}

const getHash = () => window.location.hash;

export function useHashRoute(): [HashRoute, (page: ActiveNavTab, sub?: string, params?: URLSearchParams, replace?: boolean) => void] {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  const navigate = useCallback((page: ActiveNavTab, sub = '', params?: URLSearchParams, replace = false) => go(buildHash(page, sub, params), replace), []);
  return [parseHash(hash), navigate];
}

/**
 * One query parameter of the current route as state. Setting it to the default removes it from the URL.
 * Filter tweaks replace the history entry; pass `push` for changes Back should undo (e.g. opening a panel).
 */
export function useHashParam(key: string, fallback = ''): [string, (value: string, push?: boolean) => void] {
  const [route] = useHashRoute();
  const value = route.params.get(key) ?? fallback;
  const set = useCallback((next: string, push = false) => {
    const current = parseHash(window.location.hash);
    const params = new URLSearchParams(current.params);
    if (next === fallback || next === '') params.delete(key);
    else params.set(key, next);
    go(buildHash(current.page, current.sub, params), !push);
  }, [key, fallback]);
  return [value, set];
}
