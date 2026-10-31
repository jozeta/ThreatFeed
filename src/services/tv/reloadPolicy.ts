/** When an unattended TV screen reloads itself: a new deployed version, or the nightly reload at 03:00 */

const MIN = 60_000;
/** Never reload more often than this, whatever the reason */
export const RELOAD_MIN_GAP_MS = 10 * MIN;
export const NIGHTLY_HOUR = 3;

/** The built site's hashed main script name (`index-<hash>.js`) in an index.html, null when there is none (dev) */
export function mainScriptName(html: string): string | null {
  const m = /<script\b[^>]*\bsrc="[^"]*\/assets\/(index-[A-Za-z0-9_-]+\.js)"/.exec(html);
  return m ? m[1] : null;
}

/** The next local NIGHTLY_HOUR:00 strictly after `now` */
export function nextNightly(now: number): number {
  const d = new Date(now);
  d.setHours(NIGHTLY_HOUR, 0, 0, 0);
  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
    d.setHours(NIGHTLY_HOUR, 0, 0, 0); // a DST change in between keeps it at 03:00
  }
  return d.getTime();
}

export interface ReloadState {
  now: number;
  /** The main script of the running page (null in dev: never reload) */
  runningBuild: string | null;
  /** The main script in the freshly fetched index.html (null when the check failed: do nothing) */
  deployedBuild: string | null;
  /** The last reload this tab made (kept in sessionStorage across the reload) */
  lastReloadAt: number | null;
  lastReloadBuild: string | null;
  nightlyDue: boolean;
}

/** Reload for a new build (never twice for the same one) or the nightly reload; never within 10 minutes of the last one */
export function shouldReload(s: ReloadState): boolean {
  if (!s.runningBuild || !s.deployedBuild) return false;
  if (s.lastReloadAt !== null && s.now - s.lastReloadAt < RELOAD_MIN_GAP_MS) return false;
  const newBuild = s.deployedBuild !== s.runningBuild && s.deployedBuild !== s.lastReloadBuild;
  return newBuild || s.nightlyDue;
}
