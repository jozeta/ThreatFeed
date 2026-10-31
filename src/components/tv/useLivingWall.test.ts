// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineItem } from '../../services/tv/tileEngine';
import { useLivingWall } from './useLivingWall';

vi.mock('../Common/SidePanel', () => ({ useReducedMotion: () => false }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Result = ReturnType<typeof useLivingWall>;
let result: Result;
let root: Root;

const items = (n: number): EngineItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, weight: 1, shapes: ['1x1', '2x1', '2x2'] }));

let Harness: () => null;
function mount(build: () => EngineItem[], interval = 60000, signature?: () => number) {
  Harness = function H() {
    result = useLivingWall(build, 'medium', interval, { signature: signature?.(), outMs: 450, rng: () => 0.5 });
    return null;
  };
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

describe('useLivingWall', () => {
  it('starts with a filled wall', () => {
    mount(() => items(30));
    expect(result.slots.length).toBeGreaterThanOrEqual(5);
    expect(result.leaving.size).toBe(0);
    expect(result.fallback).toBe(false);
  });

  it('starts one swap after the interval and replaces the leaving slots after outMs', () => {
    mount(() => items(30));
    const before = result.slots.map(s => s.key);
    advance(60000);
    expect(result.leaving.size).toBeGreaterThan(0);
    const leaving = [...result.leaving];
    leaving.forEach(k => expect(before).toContain(k));
    advance(450);
    expect(result.leaving.size).toBe(0);
    const after = result.slots.map(s => s.key);
    leaving.forEach(k => expect(after).not.toContain(k));
  });

  it('rebuilds on a signature change before the first swap', () => {
    let data: EngineItem[] = [];
    let sig = 0;
    mount(() => data, 60000, () => sig);
    expect(result.slots.length).toBe(0);
    data = items(30);
    sig = 1;
    act(() => root.render(createElement(Harness)));
    expect(result.slots.length).toBeGreaterThanOrEqual(5);
  });

  it('does not swap in the first second after a long hidden period', () => {
    mount(() => items(30));
    advance(1000);
    setHidden(true);
    advance(10 * 60 * 1000);
    expect(result.leaving.size).toBe(0);
    setHidden(false);
    advance(1000);
    expect(result.leaving.size).toBe(0);
  });

  it('leaves no pending timers after unmount', () => {
    mount(() => items(30));
    advance(60000 + 20000);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(document.createElement('div'));
  });

  it('survives StrictMode double mount with a single armed timer', () => {
    Harness = function H() {
      result = useLivingWall(() => items(30), 'medium', 60000, { outMs: 450, rng: () => 0.5 });
      return null;
    };
    root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
    expect(vi.getTimerCount()).toBe(1);
    advance(60000);
    expect(result.leaving.size).toBeGreaterThan(0);
    advance(450);
    expect(result.leaving.size).toBe(0);
  });

  const cellsOk = (slots: Result['slots'], cols: number, rows: number) => {
    const seen = new Set<string>();
    for (const t of slots) for (let y = t.row; y < t.row + t.h; y++) for (let x = t.col; x < t.col + t.w; x++) {
      expect(seen.has(`${x},${y}`)).toBe(false);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(cols * rows);
    expect(new Set(slots.map(t => t.key)).size).toBe(slots.length);
  };

  it('a size change during the out phase drops the stale swap', () => {
    let size: 'medium' | 'small' = 'medium';
    Harness = function H() {
      result = useLivingWall(() => items(30), size, 60000, { outMs: 450, rng: () => 0.5 });
      return null;
    };
    root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Harness)));
    advance(60000);
    expect(result.leaving.size).toBeGreaterThan(0);
    size = 'small';
    act(() => root.render(createElement(Harness)));
    expect(result.leaving.size).toBe(0);
    advance(450);
    expect(result.leaving.size).toBe(0);
    cellsOk(result.slots, 4, 3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a signature change on a fallback wall during the out phase leaves no stuck state', () => {
    let data = items(2);
    let sig = 0;
    Harness = function H() {
      result = useLivingWall(() => data, 'medium', 60000, { signature: sig, outMs: 450, rng: () => 0.5 });
      return null;
    };
    root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Harness)));
    expect(result.fallback).toBe(true);
    advance(60000);
    data = items(30);
    sig = 1;
    act(() => root.render(createElement(Harness)));
    advance(450);
    expect(result.leaving.size).toBe(0);
    expect(result.fallback).toBe(false);
    cellsOk(result.slots, 4, 2);
  });

  it('hiding during the out phase still lands the swap after resuming', () => {
    mount(() => items(30));
    advance(60000);
    expect(result.leaving.size).toBeGreaterThan(0);
    setHidden(true);
    advance(5 * 60 * 1000);
    setHidden(false);
    advance(450);
    expect(result.leaving.size).toBe(0);
    cellsOk(result.slots, 4, 2);
  });

  it('runs two hours with refills and always one timer', () => {
    mount(() => items(12));
    for (let i = 0; i < 2 * 60 * 60; i++) {
      advance(1000);
      if (result.leaving.size === 0) {
        expect(vi.getTimerCount()).toBe(1);
        expect(result.slots.length).toBeGreaterThan(0);
      }
    }
    advance(450);
    expect(result.leaving.size).toBe(0);
    cellsOk(result.slots, 4, 2);
  });
});
