import { useCallback, useSyncExternalStore } from 'react';
import { ActiveNavTab } from '../types';

/**
 * Hash routing: #/<page>[/<sub>][?key=value…], e.g. #/vulns/kev?kevVendor=Fortinet&cvss=9&cve=CVE-2026-1234.
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
  newspaper: '', latest: 'latest', unread: 'unread', briefing: 'briefing', feed: 'feed', ransomware: 'ransomware',
  vulnerabilities: 'vulns', bookmarks: 'saved', sources: 'sources', health: 'health', settings: 'settings',
};
const PAGES = new Map(Object.entries(SLUGS).map(([page, slug]) => [slug, page as ActiveNavTab]));
const ROUTE_EVENT = 'threatfeed:route';

function splitHash(hash: string) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [slug = '', sub = ''] = path.split('/').map(decodeURIComponent);
  return { slug, sub, query };
}

/**
 * An unknown or removed page (#/trends, #/actors) is the newspaper with that page's parameters, so an old
 * #/actors?actor=G0007 link still opens the actor panel, now over the newspaper
 */
export function parseHash(hash: string): HashRoute {
  const { slug, sub, query } = splitHash(hash);
  const page = PAGES.get(slug);
  return { page: page ?? 'newspaper', sub: page ? sub : '', params: new URLSearchParams(query) };
}

/** The newspaper's hash for an unknown or removed page's, or null when the hash already names a page */
export function canonicalHash(hash: string): string | null {
  if (PAGES.has(splitHash(hash).slug)) return null;
  const route = parseHash(hash);
  return buildHash(route.page, route.sub, route.params);
}

export function buildHash(page: ActiveNavTab, sub = '', params?: URLSearchParams): string {
  const path = [SLUGS[page], sub].filter(Boolean).map(encodeURIComponent).join('/');
  const query = params?.toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

function go(hash: string, replace: boolean, state: unknown = null) {
  if (hash === window.location.hash || (hash === '#/' && !window.location.hash)) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) window.history.replaceState(window.history.state, '', url);
  else window.history.pushState(state, '', url);
  window.dispatchEvent(new Event(ROUTE_EVENT)); // pushState doesn't fire hashchange
}

/** Sets (or, with an empty value, removes) query parameters of the current route, from outside a component */
export function setHashParams(changes: Record<string, string>, push = false, state: unknown = null) {
  const current = parseHash(window.location.hash);
  const params = new URLSearchParams(current.params);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  go(buildHash(current.page, current.sub, params), !push, state);
}

// The detail panels' parameters, which App opens over any page
export const PANEL_PARAMS = ['actor', 'malware', 'group', 'vendor', 'cve', 'tag'] as const;
export type PanelParam = (typeof PANEL_PARAMS)[number];

/**
 * Each open panel's place in the stack: the order its parameter comes in the URL, so the panel opened last sits
 * on top, and a shared or reloaded link stacks the same way whichever panel's data loads first
 */
export function panelLevels(params: URLSearchParams): Partial<Record<PanelParam, number>> {
  const levels: Partial<Record<PanelParam, number>> = {};
  let level = 0;
  for (const key of params.keys()) if ((PANEL_PARAMS as readonly string[]).includes(key) && !(key in levels)) levels[key as PanelParam] = level++;
  return levels;
}

/** The params with `key` set to `value` and moved to the end, so its panel goes on top of the others */
export function withPanelOnTop(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(key);
  next.append(key, value);
  return next;
}

/**
 * A panel's parameter as its host should get it, or '' to show no panel: trimmed, at most 200 characters, and
 * for ?cve= an upper-cased CVE id (so a mistyped link can't put junk on the watchlist)
 */
export function panelParam(key: PanelParam, raw: string | null): string {
  const value = raw?.trim() ?? '';
  if (!value || value.length > 200) return '';
  if (key !== 'cve') return value;
  const id = value.toUpperCase();
  return /^CVE-\d{4}-\d{4,}$/.test(id) ? id : '';
}

/**
 * What a panel's history entry knows, so closing it can go Back instead of adding to the history: the panel it
 * opened, the hash it was opened from (without that panel's key), and how many such entries in a row lead back
 * to a hash without them
 */
interface PanelEntryState { panel: PanelParam; from: string; depth: number }

const isPanelParam = (key: string): key is PanelParam => (PANEL_PARAMS as readonly string[]).includes(key);
function hashWithout(keys: readonly string[]) {
  const route = parseHash(window.location.hash);
  for (const key of keys) route.params.delete(key);
  return buildHash(route.page, route.sub, route.params);
}

/**
 * How many entries Back can undo here, each one a panel opened: 0 when this entry didn't open a panel (a deep
 * link, a shared URL) or its hash changed since, other than by raising a panel already open
 */
function panelDepth(): number {
  const s = window.history.state as Partial<PanelEntryState> | null;
  if (!s || typeof s.panel !== 'string' || !isPanelParam(s.panel) || typeof s.from !== 'string' || typeof s.depth !== 'number') return 0;
  return hashWithout([s.panel]) === s.from ? s.depth : 0;
}

// Going Back lands later (popstate); closes asked for meanwhile wait for it, so each sees the hash it closes on
let backPending = false;
const afterBack: (() => void)[] = [];
function back(steps: number, then?: () => void) {
  backPending = true;
  if (then) afterBack.push(then);
  window.history.go(-steps);
}
const onPopState = () => {
  backPending = false;
  afterBack.splice(0).forEach((run) => run());
};
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
  import.meta.hot?.dispose(() => window.removeEventListener('popstate', onPopState));
}

// Each panel's open count, so a link to a panel that is already open can still raise it over the reader (usePanelLevels)
let opens: Partial<Record<PanelParam, number>> = {};
const openListeners = new Set<() => void>();
export const panelOpens = {
  get: () => opens,
  subscribe(listener: () => void) {
    openListeners.add(listener);
    return () => { openListeners.delete(listener); };
  },
};

/**
 * Opens a panel over the current page and any panels already open, with a history entry so Back closes it. One
 * already open showing the same thing is raised to the top in place instead, adding no entry.
 */
export function openPanel(key: PanelParam, value: string) {
  const current = parseHash(window.location.hash);
  const hash = buildHash(current.page, current.sub, withPanelOnTop(current.params, key, value));
  opens = { ...opens, [key]: (opens[key] ?? 0) + 1 };
  openListeners.forEach((l) => l());
  if (current.params.get(key) === value) return go(hash, true);
  // `from` leaves out this key, so one that showed something else still closes Back to it
  const state: PanelEntryState = { panel: key, from: hashWithout([key]), depth: panelDepth() + 1 };
  go(hash, false, state);
}

/**
 * Closes a panel (its ✕, Escape, the backdrop). The panel on top that this app opened goes Back through its own
 * entry, so Back afterwards doesn't bring it again; a deep-linked one, or one under another, is removed in place.
 */
export function closePanel(key: PanelParam) {
  if (backPending) return void afterBack.push(() => closePanel(key));
  const s = window.history.state as Partial<PanelEntryState> | null;
  if (s?.panel === key && panelDepth() > 0) return back(1);
  setHashParams({ [key]: '' });
}

/** Closes every panel at once (reading an article from one): Back to before the first this app opened, then any deep-linked ones in place */
export function closeAllPanels() {
  if (backPending) return void afterBack.push(closeAllPanels);
  const depth = panelDepth();
  if (depth > 0) return back(depth, closeAllPanels);
  go(hashWithout(PANEL_PARAMS), true);
}

/** Rewrites an unknown or removed page's hash in place (no history entry), e.g. #/actors?actor=G0007 to #/?actor=G0007 */
export function redirectRemovedPage() {
  const hash = canonicalHash(window.location.hash);
  if (hash) go(hash, true);
}

/** Moves to a page from outside a component (a history entry, like a page change through the navigation) */
export const goToPage = (page: ActiveNavTab, sub = '', params?: URLSearchParams) => go(buildHash(page, sub, params), false);

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
