import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { countUpAt, parseCountable, useCountUp } from './useCountUp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('countUpAt', () => {
  it('eases out from 0 to the target and lands on it exactly', () => {
    expect(countUpAt(100, 0)).toBe(0);
    expect(countUpAt(100, 200)).toBeCloseTo(87.5);
    expect(countUpAt(100, 400)).toBe(100);
    expect(countUpAt(100, 900)).toBe(100);
    expect(countUpAt(100, -5)).toBe(0);
  });
});

describe('parseCountable', () => {
  it('takes numbers and text that is just a number', () => {
    expect(parseCountable(42)).toEqual({ prefix: '', n: 42, decimals: 0, suffix: '' });
    expect(parseCountable(7.25)).toEqual({ prefix: '', n: 7.25, decimals: 2, suffix: '' });
    expect(parseCountable(7.5)).toEqual({ prefix: '', n: 7.5, decimals: 1, suffix: '' });
    expect(parseCountable('7.5')).toEqual({ prefix: '', n: 7.5, decimals: 1, suffix: '' });
    expect(parseCountable('#3')).toEqual({ prefix: '#', n: 3, decimals: 0, suffix: '' });
    expect(parseCountable('42%')).toEqual({ prefix: '', n: 42, decimals: 0, suffix: '%' });
  });

  it('lands on the same text the value would show', () => {
    for (const v of [42, 7.25, 7.5, 0.125, '7.50', '#3', '42%']) {
      const p = parseCountable(v)!;
      expect(`${p.prefix}${p.n.toFixed(p.decimals)}${p.suffix}`).toBe(String(v));
    }
  });

  it('leaves values it could not show exactly as they are', () => {
    expect(parseCountable(1 / 3)).toBeNull();
    expect(parseCountable('0.12345')).toBeNull();
  });

  it('leaves everything else alone', () => {
    for (const v of ['—', '3d ago', '12K', '', '1,234', -1, NaN, null, undefined]) expect(parseCountable(v)).toBeNull();
  });
});

describe('useCountUp', () => {
  let root: Root;
  let host: HTMLDivElement;
  const seen: number[] = [];
  const Probe: React.FC<{ target: number; disabled?: boolean; delay?: number }> = ({ target, disabled, delay }) => {
    seen.push(useCountUp(target, disabled, delay));
    return null;
  };
  const render = (props: { target: number; disabled?: boolean; delay?: number }) => act(() => root.render(React.createElement(Probe, props)));
  const last = () => seen[seen.length - 1];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date', 'setTimeout'] });
    seen.length = 0;
    host = document.createElement('div');
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('counts up over 400 ms, then holds the target', () => {
    render({ target: 80 });
    expect(seen[0]).toBe(0);
    act(() => { vi.advanceTimersByTime(16); }); // first frame sets the start
    act(() => { vi.advanceTimersByTime(200); });
    expect(last()).toBeGreaterThan(0);
    expect(last()).toBeLessThan(80);
    act(() => { vi.advanceTimersByTime(300); });
    expect(last()).toBe(80);
  });

  it('only counts the first time; later targets show at once', () => {
    render({ target: 5 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(last()).toBe(5);
    render({ target: 9 });
    expect(last()).toBe(9);
  });

  it('waits for a target above zero (data still loading)', () => {
    render({ target: 0 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(last()).toBe(0);
    render({ target: 12 });
    act(() => { vi.advanceTimersByTime(216); });
    expect(last()).toBeLessThan(12);
    act(() => { vi.advanceTimersByTime(400); });
    expect(last()).toBe(12);
  });

  it('holds at zero through a delay (a panel sliding in), then counts', () => {
    render({ target: 50, delay: 240 });
    act(() => { vi.advanceTimersByTime(200); });
    expect(last()).toBe(0);
    act(() => { vi.advanceTimersByTime(250); });
    expect(last()).toBeGreaterThan(0);
    expect(last()).toBeLessThan(50);
    act(() => { vi.advanceTimersByTime(400); });
    expect(last()).toBe(50);
  });

  it('shows the target straight away under reduced motion', () => {
    render({ target: 30, disabled: true });
    expect(seen).toEqual(expect.not.arrayContaining([0]));
    expect(last()).toBe(30);
  });
});
