import { useEffect, useRef, useState } from 'react';

export const OUT_MS = 600;

interface Options<T> {
  now?: () => number;
  /** How long a set takes to leave (default OUT_MS) */
  outMs?: (set: T) => number;
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

  useEffect(() => {
    const now = () => (optsRef.current.now ?? Date.now)();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stage: 'wait' | 'out' = 'wait';
    let deadline = 0;
    let remaining = intervalMs;

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
          commit({ ...s, sets: buildRef.current(), index: 0, cycle: s.cycle + 1 });
          arm(intervalMs);
          return;
        }
        commit({ ...s, phase: 'out' });
        stage = 'out';
        arm((optsRef.current.outMs ?? (() => OUT_MS))(s.sets[s.index]));
      } else {
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
