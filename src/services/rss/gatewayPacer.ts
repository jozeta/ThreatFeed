/**
 * Shared pacing for public CORS gateways (corsfix, rss2json, ...), which rate-limit per client.
 *
 * All refresh workers go through one gate per gateway, so a 429 seen by one worker slows
 * every worker down instead of each of them hammering the gateway until it fails too:
 * - requests are spaced at least `spacingMs` apart (adaptive: doubles on rate limiting,
 *   shrinks 10% per success),
 * - a 429 pauses the gateway entirely until its cooldown ends (Retry-After if the gateway
 *   sends one, otherwise exponential backoff with jitter).
 */

const MIN_SPACING_MS = 100;
const MAX_SPACING_MS = 2000;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

interface GatewayState {
  nextAllowedAt: number;
  cooldownUntil: number;
  spacingMs: number;
  consecutiveRateLimits: number;
}

const states = new Map<string, GatewayState>();

function stateFor(gateway: string): GatewayState {
  let state = states.get(gateway);
  if (!state) {
    state = { nextAllowedAt: 0, cooldownUntil: 0, spacingMs: MIN_SPACING_MS, consecutiveRateLimits: 0 };
    states.set(gateway, state);
  }
  return state;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Waits until this gateway may receive another request, then claims the slot.
 * Re-checks after every sleep: a 429 seen by another worker meanwhile extends the wait.
 */
export async function acquireGatewaySlot(gateway: string): Promise<void> {
  const state = stateFor(gateway);
  for (;;) {
    const now = Date.now();
    const wait = Math.max(state.cooldownUntil, state.nextAllowedAt) - now;
    if (wait <= 0) {
      state.nextAllowedAt = now + state.spacingMs;
      return;
    }
    await sleep(wait);
  }
}

/** Parses a Retry-After header (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (!isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Records a 429 and returns how long the gateway is now paused for. */
export function reportRateLimited(gateway: string, retryAfterMs?: number): number {
  const state = stateFor(gateway);
  state.spacingMs = Math.min(MAX_SPACING_MS, state.spacingMs * 2);
  const backoff = retryAfterMs ?? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** state.consecutiveRateLimits);
  state.consecutiveRateLimits++;
  // Jitter so workers released together don't hit the gateway in the same instant
  const pause = Math.min(MAX_BACKOFF_MS, backoff) + Math.random() * 250;
  state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + pause);
  return pause;
}

/** A timeout from an overloaded gateway: slow down, but don't pause it. */
export function reportSlow(gateway: string): void {
  const state = stateFor(gateway);
  state.spacingMs = Math.min(MAX_SPACING_MS, state.spacingMs * 1.5);
}

export function reportSuccess(gateway: string): void {
  const state = stateFor(gateway);
  state.consecutiveRateLimits = 0;
  state.spacingMs = Math.max(MIN_SPACING_MS, state.spacingMs * 0.9);
}

/** For tests and diagnostics. */
export function resetGatewayPacing(): void {
  states.clear();
}
