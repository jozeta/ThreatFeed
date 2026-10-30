import { ActiveNavTab } from '../../types';
import { closeAllPanels, PANEL_PARAMS, parseHash, setHashParams } from '../../hooks/useHashRoute';

export type TvKind = 'tv' | 'dash';

const AVAILABLE: Partial<Record<ActiveNavTab, TvKind[]>> = {
  newspaper: ['tv'], latest: ['tv'], briefing: ['tv'], ransomware: ['tv', 'dash'], vulnerabilities: ['dash'],
};

/** The full-screen modes a page offers */
export function tvAvailable(page: ActiveNavTab): TvKind[] {
  return AVAILABLE[page] ?? [];
}

/** The mode the URL asks for (?tv=1 or ?dash=1), null when absent or not offered on this page */
export function tvFromParams(page: ActiveNavTab, params: URLSearchParams): TvKind | null {
  const offered = tvAvailable(page);
  if (params.get('tv') === '1' && offered.includes('tv')) return 'tv';
  if (params.get('dash') === '1' && offered.includes('dash')) return 'dash';
  return null;
}

/** Enters a mode with a history entry (Back leaves it), closing any panels, and asks for full screen where allowed */
export function enterTv(kind: TvKind): void {
  const push = () => setHashParams({ [kind]: '1' }, true);
  if (PANEL_PARAMS.some((key) => parseHash(window.location.hash).params.has(key))) {
    // Closing panels may go Back, which lands later: add the entry once the hash has settled
    const done = () => { cleanup(); push(); };
    const cleanup = () => {
      window.removeEventListener('popstate', done);
      window.removeEventListener('threatfeed:route', done);
    };
    window.addEventListener('popstate', done);
    window.addEventListener('threatfeed:route', done);
    closeAllPanels();
  } else {
    push();
  }
  try {
    const request = document.documentElement.requestFullscreen?.();
    request?.catch(() => { /* stays an overlay */ });
  } catch { /* no fullscreen here (iOS, kiosk) */ }
}

/** Leaves the mode in place (no history entry) and full screen if active */
export function exitTv(): void {
  setHashParams({ tv: '', dash: '' });
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  } catch { /* ignore */ }
}

export const tvKindNow = (): TvKind | null => {
  const route = parseHash(window.location.hash);
  return tvFromParams(route.page, route.params);
};
