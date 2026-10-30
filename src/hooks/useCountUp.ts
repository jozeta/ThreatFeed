import { useEffect, useRef, useState } from 'react';

export const COUNT_UP_MS = 400;

/** Where a count-up stands `elapsed` ms in: ease-out cubic from 0 to target, exactly target once done */
export function countUpAt(target: number, elapsed: number, duration = COUNT_UP_MS): number {
  if (elapsed >= duration) return target;
  const t = Math.max(0, elapsed) / duration;
  return target * (1 - (1 - t) ** 3);
}

const MAX_DECIMALS = 3;

/**
 * A stat value that can count up: a number, or text that is just one ("7.5", "#3", "42%"); anything else isn't.
 * The decimals come from the value's own text, so the count lands on exactly what the value would show; one
 * with more than three (1/3) shows as it is.
 */
export function parseCountable(value: unknown): { prefix: string; n: number; decimals: number; suffix: string } | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return parseCountable(String(value));
  }
  if (typeof value !== 'string') return null;
  const m = /^(#?)(\d+)(?:\.(\d+))?(%?)$/.exec(value);
  if (!m || (m[3]?.length ?? 0) > MAX_DECIMALS) return null;
  return { prefix: m[1], n: Number(`${m[2]}${m[3] ? `.${m[3]}` : ''}`), decimals: m[3]?.length ?? 0, suffix: m[4] };
}

/**
 * Counts from 0 up to `target` over 400 ms the first time it has a target above zero (e.g. when a panel opens
 * or its data arrives), after `delay` ms at 0 (letting a panel slide in first); after that, and when
 * `disabled` (reduced motion), it follows the target at once.
 */
export function useCountUp(target: number, disabled = false, delay = 0, duration = COUNT_UP_MS): number {
  const [value, setValue] = useState(() => (disabled ? target : 0));
  const done = useRef(disabled);

  useEffect(() => {
    if (done.current || disabled || target <= 0) {
      if (disabled || target > 0) done.current = true;
      setValue(target);
      return;
    }
    let frame = 0;
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now + delay;
      const elapsed = now - start;
      setValue(countUpAt(target, elapsed, duration));
      if (elapsed < duration) frame = requestAnimationFrame(step);
      else done.current = true;
    };
    frame = requestAnimationFrame(step);
    // Cut short (a new target, StrictMode's second run): the next run starts over
    return () => cancelAnimationFrame(frame);
  }, [target, disabled, delay, duration]);

  return value;
}
