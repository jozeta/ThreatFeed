import { ActiveNavTab } from '../../types';
import { closeAllPanels, PANEL_PARAMS, parseHash, setHashParams } from '../../hooks/useHashRoute';

const TV_MARK = 'tvEntry';

export type TvKind = 'tv' | 'dash';

/** Set once a TV session has been left; the full-screen change that follows must not leave (go back) a second time */
let exited = false;

/** Starts a new TV session for exitTv's once-only guard (enterTv and every TvShell mount call it) */
export function resetTvExit(): void {
  exited = false;
}

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
  resetTvExit();
  // The pushed entry is marked, so exitTv can tell it from one reached by a shared link or a reload-less edit
  const push = () => {
    const prev = window.history.state;
    setHashParams({ [kind]: '1' }, true, { ...(prev && typeof prev === 'object' ? prev : {}), [TV_MARK]: true });
  };
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

/** Leaves the mode: back over the entry enterTv pushed (so Back doesn't land on a duplicate), else in place. Also leaves full screen. Runs at most once per TV session */
export function exitTv(): void {
  if (exited) return;
  exited = true;
  const state = window.history.state;
  if (state && typeof state === 'object' && (state as Record<string, unknown>)[TV_MARK] === true) window.history.back();
  else setHashParams({ tv: '', dash: '' });
  leaveFullscreen();
}

/** Leaves full screen if active; never throws. Shared by exitTv and the shell's unmount (Back, a hash edit) */
export function leaveFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
  } catch { /* ignore */ }
}

export const tvKindNow = (): TvKind | null => {
  const route = parseHash(window.location.hash);
  return tvFromParams(route.page, route.params);
};
