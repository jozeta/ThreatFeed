import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../Common/SidePanel';
import { TvTileSize } from '../../types';
import { EngineItem, Rng, Slot, WallState, Swap, applySwap, initWall, nextDue, pageLabel, planSwap, prioritize as prioritizeItem, refill, shiftDue } from '../../services/tv/tileEngine';

export const SWAP_OUT_MS = 450;
export const REDUCED_OUT_MS = 200;
/** Signature-driven rebuilds of a non-empty wall wait this long for the data to settle. */
export const DATA_DEBOUNCE_MS = 2500;
/** Dispatched on window right after a swap lands: a quiet moment (no animation in flight) for an automatic reload */
export const TV_QUIET_EVENT = 'threatfeed:tv-quiet';

/**
 * Content by id for the next build: the new build's content, plus the kept content of every live item (on screen,
 * leaving or queued, e.g. a breaking item) that the new build lacks. An id in the new build always takes the new content;
 * what a tile already on screen shows is held per slot by pinSlots.
 */
export function keepLive<T>(next: Map<string, T>, kept: Map<string, T>, live: ReadonlySet<string>): Map<string, T> {
  for (const id of live) {
    const v = kept.get(id);
    if (v !== undefined && !next.has(id)) next.set(id, v);
  }
  return next;
}

/**
 * Content per slot on screen: a slot keeps what it showed when it first rendered (so a refill never changes a tile
 * mid-show); a new slot takes the current content of its item. Slots without content are left out.
 */
export function pinSlots<T>(pins: Map<string, T>, slots: Slot[], content: Map<string, T>): Map<string, T> {
  const next = new Map<string, T>();
  for (const t of slots) {
    const v = pins.get(t.key) ?? content.get(t.itemId);
    if (v !== undefined) next.set(t.key, v);
  }
  return next;
}

interface Options {
  /** Changes when the data behind `build` changes; rebuilds the wall until the first swap completes (or while it is empty/fallback): at once when empty, otherwise debounced by DATA_DEBOUNCE_MS and skipped when the first screen would hold the same items */
  signature?: string | number;
  outMs?: number;
  now?: () => number;
  rng?: Rng;
}

/**
 * A wall of tiles that swap one at a time. One timer is armed at a time, for the next due slot; a swap has an out phase
 * (`leaving`) and then lands. `build(full, live)` is told whether it starts a wall (initial build, rebuild) or refills one,
 * and the ids the live wall still references (pass them to keepLive): builds can run before React re-renders, so content
 * for those items must be kept even when the new build drops them. Render content per slot with pinSlots. Data that loads asynchronously needs a `signature` (an empty first build otherwise stays empty). The clock stops while the tab is hidden and resumes with every due time pushed back.
 */
export function useLivingWall(build: (full: boolean, live: ReadonlySet<string>) => EngineItem[], size: TvTileSize, intervalMs: number, opts: Options = {}) {
  const buildRef = useRef(build);
  buildRef.current = build;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const generation = useRef(0); // bumped synchronously when the wall is replaced; timers of an older generation do nothing
  const now = () => (optsRef.current.now ?? Date.now)();
  const rng: Rng = () => (optsRef.current.rng ?? Math.random)();

  const [wall, setWallState] = useState<WallState>(() => initWall(build(true, new Set()), size, now(), intervalMs, rng));
  const wallRef = useRef(wall);
  /** Every item id the live wall state references (slots, leaving ones included, and queue), read at build time */
  const liveIds = (): ReadonlySet<string> => {
    const w = wallRef.current;
    return new Set([...w.slots.map(t => t.itemId), ...w.queue.map(q => q.item.id)]);
  };
  const callBuild = (full: boolean) => buildRef.current(full, liveIds());
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [epoch, setEpoch] = useState(0); // bumped when the wall is replaced, so the timer starts over
  const settled = useRef(false); // true once a swap has completed
  const prev = useRef({ size, intervalMs, signature: opts.signature });

  const setWall = (w: WallState) => {
    wallRef.current = w;
    setWallState(w);
  };

  /** Replaces the wall; priority items still waiting in the old queue keep their place at the front of the new one */
  const rebuild = (fresh: WallState) => {
    let next = fresh;
    for (const q of wallRef.current.queue) if (q.priority && !q.used) next = prioritizeItem(next, q.item);
    generation.current++;
    setWall(next);
    setLeaving(new Set());
    setEpoch(e => e + 1);
  };
  /** A signature-driven rebuild: skipped when the wall has settled (and is not a fallback) or the new first screen holds the same items. */
  const rebuildForData = () => {
    const w = wallRef.current;
    if (settled.current && w.slots.length > 0 && !w.fallback) return;
    const next = initWall(callBuild(true), w.requested, now(), intervalMs, rng, w.cycle + 1, w.seq);
    const ids = new Set(w.slots.map(t => t.itemId));
    if (w.slots.length > 0 && next.size === w.size && next.slots.length === ids.size && next.slots.every(t => ids.has(t.itemId))) return;
    rebuild(next);
  };
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearDebounce = () => {
    if (debounce.current !== undefined) clearTimeout(debounce.current);
    debounce.current = undefined;
  };
  useEffect(() => clearDebounce, []);

  useEffect(() => {
    const p = prev.current;
    const w = wallRef.current;
    const changed = p.size !== size || p.intervalMs !== intervalMs;
    const signed = p.signature !== opts.signature && (!settled.current || w.slots.length === 0 || w.fallback);
    prev.current = { size, intervalMs, signature: opts.signature };
    if (changed) {
      clearDebounce();
      settled.current = false;
      rebuild(initWall(callBuild(true), size, now(), intervalMs, rng, w.cycle + 1, w.seq));
      return;
    }
    if (!signed) return;
    clearDebounce();
    // An empty wall fills at once; otherwise data changes are debounced so live refreshes don't re-lay out the wall each time
    if (w.slots.length === 0) return rebuildForData();
    debounce.current = setTimeout(() => {
      debounce.current = undefined;
      rebuildForData();
    }, DATA_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, intervalMs, opts.signature]);

  useEffect(() => {
    const gen = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Swap | null = null; // the swap in its out phase
    let hiddenAt: number | null = null;
    const outMs = () => optsRef.current.outMs ?? (reducedRef.current ? REDUCED_OUT_MS : SWAP_OUT_MS);

    const land = () => {
      timer = undefined;
      if (!pending || gen !== generation.current) return;
      const next = applySwap(wallRef.current, pending);
      pending = null;
      settled.current = true;
      setWall(next);
      setLeaving(new Set());
      schedule();
      window.dispatchEvent(new Event(TV_QUIET_EVENT));
    };
    const fire = () => {
      timer = undefined;
      if (gen !== generation.current) return;
      let w = wallRef.current;
      const slot = nextDue(w);
      if (!slot) return;
      if (w.cursor >= w.queue.length) {
        w = refill(w, callBuild(false), now(), intervalMs, rng);
        setWall(w);
      }
      const swap = planSwap(w, slot.key, now(), intervalMs, rng);
      if (!swap.leaving.length) return schedule();
      pending = swap;
      setLeaving(new Set(swap.leaving));
      timer = setTimeout(land, outMs());
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (document.hidden) return; // resumed by visibilitychange
      const slot = nextDue(wallRef.current);
      if (slot) timer = setTimeout(fire, Math.max(0, slot.dueAt - now()));
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (hiddenAt === null) hiddenAt = now();
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        return;
      }
      const ms = hiddenAt === null ? 0 : Math.max(0, now() - hiddenAt);
      hiddenAt = null;
      if (ms > 0) {
        setWall(shiftDue(wallRef.current, ms));
        if (pending) pending = { ...pending, arriving: pending.arriving.map((t: Slot) => ({ ...t, dueAt: t.dueAt + ms })) };
      }
      if (pending) {
        timer = setTimeout(land, outMs());
      } else {
        schedule();
      }
    };

    if (document.hidden) hiddenAt = now();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, intervalMs]);

  /** Breaking items jump the queue: each takes the next due tile, in order, one per swap. Changes only the live wall state (no re-render) */
  const prioritize = useRef((list: EngineItem[]) => {
    let w = wallRef.current;
    for (const item of list) w = prioritizeItem(w, item);
    wallRef.current = w;
  }).current;

  /** Whether data changes are news to this wall: once it has settled (a swap landed) and is tiled; before that they are part of the starting build */
  const acceptsNews = useRef(() => settled.current && wallRef.current.slots.length > 0 && !wallRef.current.fallback).current;

  return { slots: wall.slots, size: wall.size, leaving, label: pageLabel(wall), fallback: wall.fallback, prioritize, acceptsNews };
}
