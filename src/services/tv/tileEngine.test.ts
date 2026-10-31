import { describe, expect, it } from 'vitest';
import {
  applySwap, drawDue, shiftDue, EngineItem, GRIDS, initWall, jitterMs, nextDue, pageLabel, planSwap, prioritize, refill, Rng, Shape, Slot, WallState,
} from './tileEngine';
import { TvTileSize } from '../../types';

/** Seeded [0,1) generator so every run is reproducible. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL: Shape[] = ['1x1', '2x1', '2x2'];
const stories = (n: number): EngineItem[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, weight: (i * 37) % 11, shapes: ALL }));
const SIZES: TvTileSize[] = ['large', 'medium', 'small', 'xsmall'];
const MIN = 60000;

/** Every cell covered exactly once, nothing outside the grid. */
function expectCovered(s: WallState) {
  const { cols, rows } = GRIDS[s.size];
  const hits = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const t of s.slots) for (let r = t.row; r < t.row + t.h; r++) for (let c = t.col; c < t.col + t.w; c++) {
    expect(r < rows && c < cols).toBe(true);
    hits[r][c]++;
  }
  expect(hits.flat().every(n => n === 1)).toBe(true);
}
const expectDistinct = (s: WallState) => expect(new Set(s.slots.map(t => t.itemId)).size).toBe(s.slots.length);

describe('timers', () => {
  it('jitter is min(20 s, interval − 20 s)', () => {
    expect(jitterMs(60000)).toBe(20000);
    expect(jitterMs(30000)).toBe(10000);
    expect(jitterMs(300000)).toBe(20000);
  });
  it('draws a due time within interval ± jitter', () => {
    expect(drawDue(0, 60000, () => 0)).toBe(40000);
    expect(drawDue(0, 60000, () => 0.999999)).toBeCloseTo(80000, -1);
  });
});

describe('initWall', () => {
  it.each(SIZES)('%s with 30 stories fills the grid from page 0', size => {
    const g = GRIDS[size];
    for (let seed = 1; seed <= 20; seed++) {
      const s = initWall(stories(30), size, 0, MIN, mulberry32(seed));
      expect(s.fallback).toBe(false);
      expectCovered(s);
      expect(s.slots.length).toBeGreaterThanOrEqual(g.min);
      expect(s.slots.length).toBeLessThanOrEqual(g.max);
      expectDistinct(s);
      expect(s.slots.every(t => t.page === 0)).toBe(true);
      expect(pageLabel(s)).toEqual({ page: 1, of: Math.ceil(30 / g.ideal) });
    }
  });

  it('large with 3 items uses a 2×2 hero', () => {
    const s = initWall(stories(3), 'large', 0, MIN, mulberry32(7));
    expect(s.fallback).toBe(false);
    expect(s.slots).toHaveLength(3);
    expectCovered(s);
    expect(s.slots.some(t => t.w === 2 && t.h === 2)).toBe(true);
  });

  it('medium with 2 items falls back to 2 full-height columns', () => {
    const s = initWall(stories(2), 'medium', 0, MIN, mulberry32(7));
    expect(s.fallback).toBe(true);
    expect(s.slots).toHaveLength(2);
    expect(s.slots.every(t => t.h === 2)).toBe(true);
    expectCovered(s);
  });

  it('large with 2 items splits 3 columns as 2 + 1', () => {
    const s = initWall(stories(2), 'large', 0, MIN, mulberry32(7));
    expect(s.slots.map(t => t.w).sort()).toEqual([1, 2]);
    expectCovered(s);
  });

  it('numbers arrival order 0..n-1', () => {
    const s = initWall(stories(30), 'small', 0, MIN, mulberry32(3));
    expect(s.slots.map(t => t.order).sort((a, b) => a - b)).toEqual(s.slots.map((_, i) => i));
  });
});

/** Drives the wall like the hook would; returns per-step observations. */
function run(size: TvTileSize, items: EngineItem[], steps: number, seed: number, onStep?: (s: WallState, kind: string, refilled: boolean) => void) {
  const rng = mulberry32(seed);
  let s = initWall(items, size, 0, MIN, rng);
  let splits = 0, merges = 0, refills = 0;
  const keys = new Set(s.slots.map(t => t.key));
  onStep?.(s, 'init', false);
  for (let i = 0; i < steps; i++) {
    const due = nextDue(s)!;
    const swap = planSwap(s, due.key, due.dueAt, MIN, rng);
    expect(swap.arriving.length).toBeGreaterThan(0);
    const kind = swap.leaving.length === 1 && swap.arriving.length === 2 ? 'split' : swap.leaving.length === 2 ? 'merge' : 'replace';
    if (kind === 'split') splits++;
    if (kind === 'merge') merges++;
    s = applySwap(s, swap);
    let refilled = false;
    if (s.cursor >= s.queue.length) { s = refill(s, items, due.dueAt, MIN, rng); refilled = true; refills++; }
    for (const t of s.slots) if (t.arrivedAt === due.dueAt) {
      expect(keys.has(t.key)).toBe(false); // keys never repeat
      keys.add(t.key);
    }
    onStep?.(s, kind, refilled);
  }
  return { s, splits, merges, refills };
}

describe('swaps', () => {
  it.each(SIZES)('%s soak keeps every invariant', size => {
    const g = GRIDS[size];
    const { splits, merges } = run(size, stories(30), 2000, 11, s => {
      expectCovered(s);
      expect(s.slots.length).toBeGreaterThanOrEqual(g.min);
      expect(s.slots.length).toBeLessThanOrEqual(g.max);
      expectDistinct(s);
      for (const t of s.slots) {
        expect(Math.abs(t.dueAt - t.arrivedAt - MIN)).toBeLessThanOrEqual(jitterMs(MIN) + 1e-6);
        expect(t.w === 2 && t.h === 2 ? g.shapes.includes('2x2') : true).toBe(true);
      }
    });
    expect(splits).toBeGreaterThan(0);
    expect(merges).toBeGreaterThan(0);
  });

  it('never merges with a neighbour that arrived 5 s ago', () => {
    const now = 100000;
    let merged = 0, control = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const base = initWall(stories(30), 'medium', 0, MIN, mulberry32(seed));
      const young = { ...base, slots: base.slots.map(t => ({ ...t, arrivedAt: now - 5000 })) };
      const old = { ...base, slots: base.slots.map(t => ({ ...t, arrivedAt: now - 25000 })) };
      const key = base.slots[0].key;
      if (planSwap(young, key, now, MIN, mulberry32(seed)).leaving.length === 2) merged++;
      if (planSwap(old, key, now, MIN, mulberry32(seed)).leaving.length === 2) control++;
    }
    expect(merged).toBe(0);
    expect(control).toBeGreaterThan(0);
  });

  const numbers = (n: number): EngineItem[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, weight: 1, shapes: ['1x1'] }));
  const charts = (n: number, shapes: Shape[] = ['2x1', '2x2']): EngineItem[] =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, weight: 2, shapes }));

  /** Drives a pool and checks the queue keeps moving: a refill at least every 100 swaps and (optionally) every item shown each cycle. */
  function expectProgress(size: TvTileSize, items: EngineItem[], seed: number, everyItem: boolean) {
    const seen = new Set<string>();
    let cycle = 0, step = 0, last = 0;
    run(size, items, 2000, seed, (s, _kind, refilled) => {
      for (const t of s.slots) if (t.cycle === cycle) seen.add(t.itemId);
      expect(step++ - last).toBeLessThanOrEqual(100);
      if (refilled) {
        if (everyItem) expect([...seen].sort()).toEqual(items.map(i => i.id).sort());
        cycle++;
        last = step;
        seen.clear();
      }
    });
  }

  it.each(SIZES)('%s: 6 numbers + 8 charts keep cycling and all show', size => {
    for (let seed = 1; seed <= 8; seed++) expectProgress(size, [...numbers(6), ...charts(8)], seed, true);
  });

  it('small: 6 wide-only charts + 1 number still refill (the number can never fit)', () => {
    for (let seed = 1; seed <= 4; seed++) expectProgress('small', [...charts(6, ['2x1']), ...numbers(1)], seed, false);
  });

  it('small fallback with 5 items shows all 5 within a cycle', () => {
    expectProgress('small', stories(5), 3, true);
  });

  it('keys never repeat across a fallback → tiled upgrade', () => {
    const rng = mulberry32(5);
    let s = initWall(stories(2), 'medium', 0, MIN, rng);
    const keys = new Set(s.slots.map(t => t.key));
    for (let i = 0; i < 5; i++) {
      const due = nextDue(s)!;
      s = applySwap(s, planSwap(s, due.key, due.dueAt, MIN, rng));
      for (const t of s.slots) keys.add(t.key);
    }
    const before = keys.size;
    const up = refill(s, stories(30), 400000, MIN, rng);
    expect(up.fallback).toBe(false);
    for (const t of up.slots) keys.add(t.key);
    expect(keys.size).toBe(before + up.slots.length);
  });

  it('keeps swapping a 4-panel all-wide medium pool', () => {
    const items = Array.from({ length: 4 }, (_, i): EngineItem => ({ id: `c${i}`, weight: 1, shapes: ['2x1'] }));
    run('medium', items, 200, 5, s => expectCovered(s));
  });

  it('keeps swapping a mixed 2 numbers + 2 charts medium pool', () => {
    const items: EngineItem[] = [
      { id: 'n0', weight: 1, shapes: ['1x1'] }, { id: 'n1', weight: 1, shapes: ['1x1'] },
      { id: 'c0', weight: 1, shapes: ['2x1'] }, { id: 'c1', weight: 1, shapes: ['2x1'] },
    ];
    run('medium', items, 200, 5, s => expectCovered(s));
  });

  it('keeps swapping a dashboard-like pool of numbers and charts', () => {
    const items: EngineItem[] = [
      ...Array.from({ length: 6 }, (_, i): EngineItem => ({ id: `n${i}`, weight: 1, shapes: ['1x1'] })),
      ...Array.from({ length: 5 }, (_, i): EngineItem => ({ id: `c${i}`, weight: 2, shapes: ['2x1', '2x2'] })),
    ];
    for (const size of SIZES) run(size, items, 300, 9, s => { expectCovered(s); expectDistinct(s); });
  });

  it.each(SIZES)('%s shows every item of a cycle before the next refill', size => {
    const items = stories(30);
    const seen = new Set(initWall(items, size, 0, MIN, mulberry32(4)).slots.map(t => t.itemId));
    let refills = 0;
    run(size, items, 400, 4, (s, _kind, refilled) => {
      for (const t of s.slots) if (t.cycle === refills) seen.add(t.itemId);
      if (refilled) {
        if (refills < 2) expect(seen.size).toBe(30);
        refills++;
        seen.clear();
      }
    });
    expect(refills).toBeGreaterThanOrEqual(2);
  });

  it('keeps the page counter on the old cycle until its tiles are gone', () => {
    let sawOld = false, sawNew = false;
    run('medium', stories(30), 300, 8, (s, _kind, refilled) => {
      const label = pageLabel(s)!;
      const oldest = Math.min(...s.slots.map(t => t.cycle));
      const lowest = s.slots.filter(t => t.cycle === oldest).reduce((m, t) => Math.min(m, t.page), Infinity);
      expect(label.page).toBe(lowest + 1);
      if (refilled && oldest < s.cycle) {
        sawOld = true;
        expect(label.page).toBeGreaterThan(1);
      }
      if (oldest === s.cycle && s.cycle > 0) sawNew = true;
    });
    expect(sawOld && sawNew).toBe(true);
  });

  it('planSwap does not mutate the state', () => {
    const s = initWall(stories(30), 'small', 0, MIN, mulberry32(2));
    const before = JSON.stringify(s);
    const due = nextDue(s)!;
    planSwap(s, due.key, due.dueAt, MIN, mulberry32(3));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('prioritize', () => {
  const hot = (id = 'hot'): EngineItem => ({ id, weight: 0, shapes: ALL });
  const isSingle = (t: Slot) => t.w === 1 && t.h === 1;
  /** A medium wall (and its due single) where that single has exactly one single neighbour beside it; `atMin` picks the tile count. */
  function wallWithSingle(atMin: boolean): { s: WallState; due: Slot } {
    const g = GRIDS.medium;
    // Walk a seeded wall until it reaches such a state
    const rng = mulberry32(3);
    let s = initWall(stories(30), 'medium', 0, MIN, rng);
    for (let i = 0; i < 2000; i++) {
      if ((s.slots.length === g.min) === atMin) {
        for (const due of s.slots.filter(isSingle)) {
          const mates = s.slots.filter(t => t !== due && isSingle(t) && t.row === due.row && Math.abs(t.col - due.col) === 1);
          if (mates.length === 1) return { s, due };
        }
      }
      const next = nextDue(s)!;
      s = applySwap(s, planSwap(s, next.key, next.dueAt, MIN, rng));
      if (s.cursor >= s.queue.length) s = refill(s, stories(30), next.dueAt, MIN, rng);
    }
    throw new Error('no such wall');
  }

  it('puts the item at the front of the unused queue, dropping an older unused copy', () => {
    const s = initWall(stories(30), 'medium', 0, MIN, mulberry32(1));
    const later = s.queue[s.queue.length - 1].item;
    const p = prioritize(s, later);
    expect(p.queue).toHaveLength(s.queue.length);
    expect(p.queue[p.cursor].item.id).toBe(later.id);
    expect(p.queue[p.cursor].priority).toBe(true);
    expect(p.queue.filter(q => q.item.id === later.id && !q.used)).toHaveLength(1);
    expect(s.queue[s.cursor].priority).toBeUndefined(); // not mutated
  });

  it('merges a due single with a neighbour that arrived 5 s ago into a wide tile for the priority item', () => {
    const { s, due } = wallWithSingle(false);
    const now = 100000;
    const young = { ...s, slots: s.slots.map(t => ({ ...t, arrivedAt: now - 5000 })) };
    const swap = planSwap(prioritize(young, hot()), due.key, now, MIN, mulberry32(1));
    expect(swap.leaving).toHaveLength(2);
    expect(swap.leaving).toContain(due.key);
    expect(swap.arriving).toHaveLength(1);
    expect(swap.arriving[0]).toMatchObject({ itemId: 'hot', w: 2, h: 1, row: due.row });
  });

  it('with the tile count at the minimum it replaces the due tile in place', () => {
    const { s, due } = wallWithSingle(true);
    const swap = planSwap(prioritize(s, hot()), due.key, 100000, MIN, mulberry32(1));
    expect(swap.leaving).toEqual([due.key]);
    expect(swap.arriving).toHaveLength(1);
    expect(swap.arriving[0]).toMatchObject({ itemId: 'hot', col: due.col, row: due.row, w: 1, h: 1 });
  });

  it('two priority items arrive in order, one per swap', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      let s = initWall(stories(30), 'small', 0, MIN, rng);
      s = prioritize(prioritize(s, hot('a')), hot('b'));
      const arrived: string[][] = [];
      for (let i = 0; i < 2; i++) {
        const due = nextDue(s)!;
        const swap = planSwap(s, due.key, due.dueAt, MIN, rng);
        arrived.push(swap.arriving.map(t => t.itemId).filter(id => id === 'a' || id === 'b'));
        s = applySwap(s, swap);
      }
      expect(arrived).toEqual([['a'], ['b']]);
    }
  });

  it.each(SIZES)('%s soak keeps every invariant with a priority item every 50 swaps', size => {
    const g = GRIDS[size];
    const items = stories(30);
    const rng = mulberry32(17);
    let s = initWall(items, size, 0, MIN, rng);
    let pending: string | null = null;
    let wide = 0, injected = 0;
    for (let i = 0; i < 2000; i++) {
      if (i % 50 === 0) {
        pending = `hot${i}`;
        s = prioritize(s, hot(pending));
        injected++;
      }
      const due = nextDue(s)!;
      const swap = planSwap(s, due.key, due.dueAt, MIN, rng);
      const hots = swap.arriving.filter(t => t.itemId.startsWith('hot'));
      expect(hots.length).toBeLessThanOrEqual(1);
      if (pending) {
        expect(hots.map(t => t.itemId)).toEqual([pending]); // takes the next due tile
        if (hots[0].w * hots[0].h >= 2) wide++;
        pending = null;
      }
      s = applySwap(s, swap);
      if (s.cursor >= s.queue.length) s = refill(s, items, due.dueAt, MIN, rng);
      expectCovered(s);
      expect(s.slots.length).toBeGreaterThanOrEqual(g.min);
      expect(s.slots.length).toBeLessThanOrEqual(g.max);
      expectDistinct(s);
    }
    expect(wide).toBeGreaterThan(injected / 3);
  });
});

describe('refill', () => {
  it('upgrades a fallback wall once there are enough items', () => {
    const s = initWall(stories(2), 'medium', 0, MIN, mulberry32(1));
    const r = refill(s, stories(30), 1000, MIN, mulberry32(1));
    expect(r.fallback).toBe(false);
    expect(r.cycle).toBe(s.cycle + 1);
    expectCovered(r);
  });

  it('keeps a fallback wall in place while the items stay the same', () => {
    const s = initWall(stories(2), 'medium', 0, MIN, mulberry32(1));
    const r = refill(s, stories(2), 1000, MIN, mulberry32(1));
    expect(r.slots).toEqual(s.slots);
    expect(r.cycle).toBe(1);
  });
});

describe('shiftDue', () => {
  it('moves every due time, leaving arrivals alone', () => {
    const s = initWall(stories(30), 'large', 0, MIN, mulberry32(1));
    const t = shiftDue(s, 5000);
    expect(t.slots.map(x => x.dueAt - 5000)).toEqual(s.slots.map(x => x.dueAt));
    expect(t.slots.map(x => x.arrivedAt)).toEqual(s.slots.map(x => x.arrivedAt));
  });
});
