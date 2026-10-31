import { useEffect, useRef } from 'react';
import { mainScriptName, nextNightly, RELOAD_MIN_GAP_MS, shouldReload } from '../../services/tv/reloadPolicy';
import { TV_QUIET_EVENT } from './useLivingWall';

const MIN = 60_000;
export const CHECK_EVERY_MS = 30 * MIN;
export const QUIET_WAIT_MS = 2 * MIN;
export const NIGHTLY_TICK_MS = MIN;
/** The last automatic reload ({ at, build }); in sessionStorage so the guard survives the reload itself */
export const RELOAD_KEY = 'threatfeed:tvReload';

interface Guard { at: number; build: string | null }

function readGuard(): Guard | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const g = raw ? (JSON.parse(raw) as Partial<Guard>) : null;
    return g && typeof g.at === 'number' ? { at: g.at, build: typeof g.build === 'string' ? g.build : null } : null;
  } catch {
    return null;
  }
}

function writeGuard(g: Guard): void {
  try { sessionStorage.setItem(RELOAD_KEY, JSON.stringify(g)); } catch { /* storage blocked: reload anyway */ }
}

/** The running page's main script name (null in dev, where there is no hashed bundle) */
function runningBuild(): string | null {
  return mainScriptName(Array.from(document.scripts, s => `<script src="${s.getAttribute('src') ?? ''}">`).join(''));
}

/** A swap in its out phase: reloading now would cut the animation */
const midSwap = () => document.querySelector('.tv-root [data-leaving]') !== null;

/**
 * Keeps an unattended TV screen current: every 30 minutes it compares the deployed index.html's main script with the
 * running one, and at 03:00 local it asks for the nightly reload. A reload waits for the next quiet moment (a swap has
 * just landed) or 2 minutes, never cuts a swap, and is guarded in sessionStorage (once per 10 minutes, never twice for
 * the same build). A failed check does nothing; the stale indicator covers that. Hidden tabs reload too (nothing shows).
 */
export function useAutoReload(reload: () => void = () => window.location.reload()): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const running = runningBuild();
    if (!running) return;
    let disposed = false;
    let checking = false;
    let waiting = false;
    let nightlyDue = false;
    const nightlyAt = nextNightly(Date.now()); // one shot: after the reload the new page computes the next night
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let onQuiet: (() => void) | null = null;

    const stopWaiting = () => {
      if (quietTimer !== undefined) clearTimeout(quietTimer);
      quietTimer = undefined;
      if (onQuiet) window.removeEventListener(TV_QUIET_EVENT, onQuiet);
      onQuiet = null;
    };
    const waitForQuiet = (build: string) => {
      waiting = true;
      const go = () => {
        stopWaiting();
        if (disposed) return;
        writeGuard({ at: Date.now(), build });
        reloadRef.current();
      };
      onQuiet = go;
      window.addEventListener(TV_QUIET_EVENT, go);
      quietTimer = setTimeout(() => {
        quietTimer = undefined;
        // A swap is mid-animation: its landing (the quiet event, still listened for) reloads within a second
        if (!midSwap()) go();
      }, QUIET_WAIT_MS);
    };

    const check = async () => {
      if (checking || waiting || disposed) return;
      checking = true;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok || disposed) return;
        const deployed = mainScriptName(await res.text());
        if (disposed || waiting) return;
        const guard = readGuard();
        const now = Date.now();
        // Reloaded minutes ago: this page is already fresh, so tonight's reload is done
        if (nightlyDue && guard && now - guard.at < RELOAD_MIN_GAP_MS) nightlyDue = false;
        if (deployed && shouldReload({ now, runningBuild: running, deployedBuild: deployed, lastReloadAt: guard?.at ?? null, lastReloadBuild: guard?.build ?? null, nightlyDue })) {
          waitForQuiet(deployed);
        }
      } catch {
        /* offline or blocked: try again at the next check */
      } finally {
        checking = false;
      }
    };

    const checkTimer = setInterval(() => { void check(); }, CHECK_EVERY_MS);
    const nightlyTimer = setInterval(() => {
      if (nightlyDue || Date.now() < nightlyAt) return;
      nightlyDue = true;
      void check();
    }, NIGHTLY_TICK_MS);

    return () => {
      disposed = true;
      clearInterval(checkTimer);
      clearInterval(nightlyTimer);
      stopWaiting();
    };
  }, []);
}
