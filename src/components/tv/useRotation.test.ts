// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRotation } from './useRotation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Result = ReturnType<typeof useRotation<number>>;
let result: Result;
let root: Root;

function mount(build: () => number[], interval = 1000) {
  function Harness() {
    result = useRotation(build, interval);
    return null;
  }
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Harness)));
}
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => root.unmount());
  setHidden(false);
  vi.useRealTimers();
});

describe('useRotation', () => {
  it('fades a set out after the interval, then shows the next', () => {
    mount(() => [1, 2, 3]);
    expect(result).toMatchObject({ index: 0, phase: 'in' });
    advance(1000);
    expect(result).toMatchObject({ index: 0, phase: 'out' });
    advance(600);
    expect(result).toMatchObject({ index: 1, phase: 'in' });
  });

  it('rebuilds only when it wraps to the first set', () => {
    const build = vi.fn(() => [1, 2, 3]);
    mount(build);
    advance(1600 * 2);
    expect(result.index).toBe(2);
    expect(build).toHaveBeenCalledTimes(1);
    advance(1600);
    expect(result.index).toBe(0);
    expect(result.cycle).toBe(1);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and resumes with the time that was left', () => {
    mount(() => [1, 2, 3]);
    advance(400);
    setHidden(true);
    advance(10000);
    expect(result).toMatchObject({ index: 0, phase: 'in' });
    setHidden(false);
    advance(599);
    expect(result.phase).toBe('in');
    advance(1);
    expect(result.phase).toBe('out');
    advance(600);
    expect(result.index).toBe(1);
  });

  it('never animates out with a single set, but rebuilds each interval', () => {
    const build = vi.fn(() => [1]);
    mount(build);
    advance(1000);
    expect(result).toMatchObject({ index: 0, phase: 'in', cycle: 1 });
    expect(build).toHaveBeenCalledTimes(2);
  });
});
