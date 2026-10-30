import { useEffect, useRef, useState } from 'react';

export const OUT_MS = 600;

interface Options<T> {
  now?: () => number;
  /** How long a set takes to leave (default OUT_MS) */
  outMs?: (set: T) => number;
  /** Changes when the data behind `build` changes; until the first transition (or while there is nothing to show) it rebuilds at once */
  signature?: string | number;
  /** Identity of a set, so a rebuilt single set with the same content is left alone */
  setKey?: (set: T) => string;
}

interface State<T> {
  sets: T[];
  index: number;
  phase: 'in' | 'out';
  cycle: number;
}

/**
 * Cycles through sets: each stays up for intervalMs, leaves during an 'out' phase, then the next comes 'in'.
 * `build` runs at mount and each time the rotation wraps to the first set, so a set never changes while on screen.
 * The clock stops while the tab is hidden and resumes with the time that was left.
 */
export function useRotation<T>(build: () => T[], intervalMs: number, opts: Options<T> = {}): State<T> {
  const buildRef = useRef(build);
  buildRef.current = build;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [state, setState] = useState<State<T>>(() => ({ sets: build(), index: 0, phase: 'in', cycle: 0 }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const settled = useRef(false); // true once a set has been shown and left
  const firstSignature = useRef(opts.signature);

  useEffect(() => {
    if (opts.signature === firstSignature.current) return;
    firstSignature.current = opts.signature;
    const s = stateRef.current;
    if (settled.current && s.sets.length > 0) return;
    const sets = buildRef.current();
    const next = { sets, index: 0, phase: 'in' as const, cycle: s.cycle + 1 };
    stateRef.current = next;
    setState(next);
  }, [opts.signature]);

  useEffect(() => {
    const now = () => (optsRef.current.now ?? Date.now)();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stage: 'wait' | 'out' = 'wait';
    let deadline = 0;
    let remaining = intervalMs;
    let pending: T[] | null = null; // a changed single set, shown once the old one has left

    const commit = (next: State<T>) => {
      stateRef.current = next;
      setState(next);
    };
    const arm = (ms: number) => {
      remaining = ms;
      deadline = now() + ms;
      if (document.hidden) return; // resumed by visibilitychange
      timer = setTimeout(fire, ms);
    };
    const fire = () => {
      timer = undefined;
      const s = stateRef.current;
      if (stage === 'wait') {
        if (s.sets.length <= 1) {
          const fresh = buildRef.current();
          const key = optsRef.current.setKey;
          const same = fresh.length === s.sets.length && (fresh.length === 0 || (key ? key(fresh[0]) === key(s.sets[0]) : false));
          if (same || s.sets.length === 0 || fresh.length === 0) {
            commit({ ...s, sets: same ? s.sets : fresh, index: 0, phase: 'in', cycle: s.cycle + 1 });
            arm(intervalMs);
            return;
          }
          pending = fresh;
        }
        settled.current = true;
        commit({ ...s, phase: 'out' });
        stage = 'out';
        arm((optsRef.current.outMs ?? (() => OUT_MS))(s.sets[s.index]));
      } else {
        if (pending) {
          commit({ sets: pending, index: 0, phase: 'in', cycle: s.cycle + 1 });
          pending = null;
          stage = 'wait';
          arm(intervalMs);
          return;
        }
        const next = (s.index + 1) % s.sets.length;
        commit(next === 0
          ? { sets: buildRef.current(), index: 0, phase: 'in', cycle: s.cycle + 1 }
          : { ...s, index: next, phase: 'in' });
        stage = 'wait';
        arm(intervalMs);
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
          remaining = Math.max(0, deadline - now());
        }
      } else if (timer === undefined) {
        arm(remaining);
      }
    };

    arm(intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return state;
}
