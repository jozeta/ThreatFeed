import { useEffect, useRef, useState } from 'react';
import { TvTileSize } from '../../types';
import { EngineItem, Rng, Slot, WallState, Swap, applySwap, initWall, nextDue, pageLabel, planSwap, refill, shiftDue } from '../../services/tv/tileEngine';

export const SWAP_OUT_MS = 450; // reduced motion: 200
const REDUCED_OUT_MS = 200;

interface Options {
  /** Changes when the data behind `build` changes; rebuilds the wall until the first swap completes (or while it is empty/fallback) */
  signature?: string | number;
  outMs?: number;
  now?: () => number;
  rng?: Rng;
}

const defaultOutMs = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? REDUCED_OUT_MS : SWAP_OUT_MS;

/**
 * A wall of tiles that swap one at a time. One timer is armed at a time, for the next due slot; a swap has an out phase
 * (`leaving`) and then lands. The clock stops while the tab is hidden and resumes with every due time pushed back.
 */
export function useLivingWall(build: () => EngineItem[], size: TvTileSize, intervalMs: number, opts: Options = {}) {
  const buildRef = useRef(build);
  buildRef.current = build;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const now = () => (optsRef.current.now ?? Date.now)();
  const rng: Rng = () => (optsRef.current.rng ?? Math.random)();

  const [wall, setWallState] = useState<WallState>(() => initWall(build(), size, now(), intervalMs, rng));
  const wallRef = useRef(wall);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [epoch, setEpoch] = useState(0); // bumped when the wall is replaced, so the timer starts over
  const settled = useRef(false); // true once a swap has completed
  const prev = useRef({ size, intervalMs, signature: opts.signature });

  const setWall = (w: WallState) => {
    wallRef.current = w;
    setWallState(w);
  };

  useEffect(() => {
    const p = prev.current;
    const w = wallRef.current;
    const changed = p.size !== size || p.intervalMs !== intervalMs;
    const signed = p.signature !== opts.signature && (!settled.current || w.slots.length === 0 || w.fallback);
    prev.current = { size, intervalMs, signature: opts.signature };
    if (!changed && !signed) return;
    setWall(initWall(buildRef.current(), size, now(), intervalMs, rng, w.cycle + 1, w.seq));
    setLeaving(new Set());
    setEpoch(e => e + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, intervalMs, opts.signature]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Swap | null = null; // the swap in its out phase
    let hiddenAt: number | null = null;
    const outMs = () => optsRef.current.outMs ?? defaultOutMs();

    const land = () => {
      timer = undefined;
      if (!pending) return;
      const next = applySwap(wallRef.current, pending);
      pending = null;
      settled.current = true;
      setWall(next);
      setLeaving(new Set());
      schedule();
    };
    const fire = () => {
      timer = undefined;
      let w = wallRef.current;
      const slot = nextDue(w);
      if (!slot) return;
      if (w.cursor >= w.queue.length) {
        w = refill(w, buildRef.current(), now(), intervalMs, rng);
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

  return { slots: wall.slots, leaving, label: pageLabel(wall), fallback: wall.fallback };
}
