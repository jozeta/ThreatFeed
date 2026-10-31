import { TvTileSize } from '../../types';

/** Tile wall engine: per-tile jittered swaps that replace, split or merge tiles while keeping every cell covered. Pure; the hook owns timers. */

export type Shape = '1x1' | '2x1' | '2x2'; // width x height in cells
export interface GridSpec { cols: number; rows: number; min: number; max: number; ideal: number; shapes: Shape[] }
export const GRIDS: Record<TvTileSize, GridSpec> = {
  large: { cols: 3, rows: 2, min: 3, max: 5, ideal: 4, shapes: ['1x1', '2x1', '2x2'] },
  medium: { cols: 4, rows: 2, min: 5, max: 7, ideal: 6, shapes: ['1x1', '2x1'] },
  small: { cols: 4, rows: 3, min: 6, max: 10, ideal: 8, shapes: ['1x1', '2x1'] },
};
export interface EngineItem { id: string; weight: number; shapes: Shape[] } // stories: all shapes; number panels ['1x1']; charts/lists ['2x1','2x2']
export interface Slot {
  key: string; // unique per arrival (`${itemId}#${seq}`); React key
  itemId: string;
  col: number; row: number; w: 1 | 2 | 3 | 4; h: 1 | 2 | 3; // 0-based origin; fallback layout may use w>2 / h=rows
  cycle: number; page: number; pageCount: number;
  arrivedAt: number; dueAt: number;
  order: number; // position within the arrival batch, for staggered reveal
}
/** A queue entry; `used` once it has arrived on screen this cycle. */
export interface QueueEntry { item: EngineItem; page: number; used: boolean }
export interface WallState {
  size: TvTileSize; fallback: boolean;
  queue: QueueEntry[]; cursor: number; // first unused queue position
  cycle: number; pageCount: number; seq: number;
  slots: Slot[];
}
export interface Swap { leaving: string[]; arriving: Slot[] } // slot keys; arriving cover exactly the leaving cells
export type Rng = () => number; // [0,1)

interface Rect { col: number; row: number; w: number; h: number }

const MERGE_AGE_MS = 20000;
const WEIGHTS = { replace: 0.5, split: 0.25, merge: 0.25 };

const shapeOf = (r: Rect) => `${r.w}x${r.h}` as Shape;
const area = (r: Rect) => r.w * r.h;
const readingOrder = (a: Rect, b: Rect) => a.row - b.row || a.col - b.col;
const rectOf = ({ col, row, w, h }: Rect): Rect => ({ col, row, w, h });

export function jitterMs(intervalMs: number): number {
  return Math.max(0, Math.min(20000, intervalMs - 20000));
}

export function drawDue(now: number, intervalMs: number, rng: Rng): number {
  return now + intervalMs + (2 * rng() - 1) * jitterMs(intervalMs);
}

const tilingCache = new Map<TvTileSize, Rect[][]>();

/** Every way to tile the grid with its shapes: fill the first empty cell (row-major) with each shape that fits. */
function tilings(size: TvTileSize): Rect[][] {
  const cached = tilingCache.get(size);
  if (cached) return cached;
  const { cols, rows, shapes } = GRIDS[size];
  const filled = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const out: Rect[][] = [];
  const mark = (r: Rect, v: boolean) => {
    for (let y = r.row; y < r.row + r.h; y++) for (let x = r.col; x < r.col + r.w; x++) filled[y][x] = v;
  };
  const fits = (r: Rect) => {
    if (r.row + r.h > rows || r.col + r.w > cols) return false;
    for (let y = r.row; y < r.row + r.h; y++) for (let x = r.col; x < r.col + r.w; x++) if (filled[y][x]) return false;
    return true;
  };
  const fill = (acc: Rect[]) => {
    const cell = filled.flat().indexOf(false);
    if (cell < 0) return void out.push([...acc]);
    for (const s of shapes) {
      const r = { col: cell % cols, row: Math.floor(cell / cols), w: +s[0], h: +s[2] };
      if (!fits(r)) continue;
      mark(r, true);
      fill([...acc, r]);
      mark(r, false);
    }
  };
  fill([]);
  tilingCache.set(size, out);
  return out;
}

/**
 * Queue index for a rect: heaviest of the next 3 fitting entries for larger rects, the first fitting one for 1×1; -1 if
 * none. Looks at unused entries, or with `used` at already-shown ones (fillers).
 */
function pick(queue: QueueEntry[], from: number, shape: Shape, excluded: Set<string>, taken: Set<number>, used = false): number {
  const found: number[] = [];
  const want = shape === '1x1' ? 1 : 3;
  for (let i = from; i < queue.length && found.length < want; i++) {
    const q = queue[i];
    if (q.used === used && !taken.has(i) && !excluded.has(q.item.id) && q.item.shapes.includes(shape)) found.push(i);
  }
  if (!found.length) return -1;
  return found.reduce((best, i) => (queue[i].item.weight > queue[best].item.weight ? i : best));
}

/**
 * Distinct queue indexes for `rects` (larger rects choose first), or null when one finds nothing. With `filler`, a rect
 * with no unused fit may take an already-shown entry, as long as at least one unused entry is placed.
 */
function assign(queue: QueueEntry[], cursor: number, rects: Rect[], excluded: Set<string>, filler = false): number[] | null {
  const ex = new Set(excluded);
  const taken = new Set<number>();
  const out: number[] = Array(rects.length);
  const byArea = rects.map((_, i) => i).sort((a, b) => area(rects[b]) - area(rects[a]) || a - b);
  for (const i of byArea) {
    let j = pick(queue, cursor, shapeOf(rects[i]), ex, taken);
    if (j < 0 && filler) j = pick(queue, 0, shapeOf(rects[i]), ex, taken, true);
    if (j < 0) return null;
    out[i] = j;
    taken.add(j);
    ex.add(queue[j].item.id);
  }
  return filler && out.every(j => queue[j].used) ? null : out;
}

const firstUnused = (queue: QueueEntry[], from = 0) => {
  let i = from;
  while (i < queue.length && queue[i].used) i++;
  return i;
};

function makeSlot(rect: Rect, itemId: string, seq: number, cycle: number, page: number, pageCount: number, now: number, intervalMs: number, rng: Rng, order: number): Slot {
  return {
    key: `${itemId}#${seq}`, itemId, col: rect.col, row: rect.row, w: rect.w as Slot['w'], h: rect.h as Slot['h'],
    cycle, page, pageCount, arrivedAt: now, dueAt: drawDue(now, intervalMs, rng), order,
  };
}

/** Equal-ish full-height columns for walls with too few items (widths sum to cols, wider ones first). */
function columns(n: number, { cols, rows }: GridSpec): Rect[] {
  const out: Rect[] = [];
  for (let i = 0, col = 0; i < n; i++) {
    const w = Math.floor(cols / n) + (i < cols % n ? 1 : 0);
    out.push({ col, row: 0, w, h: rows });
    col += w;
  }
  return out;
}

/** A fresh wall; `seq` continues the key sequence of a wall it replaces, so keys never repeat. */
export function initWall(items: EngineItem[], size: TvTileSize, now: number, intervalMs: number, rng: Rng, cycle = 0, seq = 0): WallState {
  const g = GRIDS[size];
  const queue = items.map((item, i) => ({ item, page: Math.floor(i / g.ideal), used: false }));
  const pageCount = Math.max(1, Math.ceil(items.length / g.ideal));
  let rects: Rect[] = [];
  let picks: number[] | null = null;
  if (items.length >= g.min) {
    const ranked = tilings(size)
      .filter(t => t.length >= g.min && t.length <= g.max)
      .map(t => ({ t, k: Math.abs(t.length - g.ideal), r: rng() }))
      .sort((a, b) => a.k - b.k || a.r - b.r);
    for (const { t } of ranked) {
      picks = assign(queue, 0, t, new Set());
      if (picks) { rects = t; break; }
    }
  }
  const fallback = !picks;
  if (!picks) {
    rects = columns(Math.min(items.length, g.cols), g);
    picks = rects.map((_, i) => i);
  }
  const order = rects.map((_, i) => i).sort((a, b) => readingOrder(rects[a], rects[b]));
  const slots = order.map((i, n) => {
    const q = queue[picks![i]];
    q.used = true;
    return makeSlot(rects[i], q.item.id, seq + n, cycle, q.page, pageCount, now, intervalMs, rng, n);
  });
  return { size, fallback, queue, cursor: firstUnused(queue), cycle, pageCount, seq: seq + slots.length, slots };
}

export function nextDue(state: WallState): Slot | undefined {
  return state.slots.reduce<Slot | undefined>((best, t) => (!best || t.dueAt < best.dueAt ? t : best), undefined);
}

/** The two halves of a wide/hero tile, or null for a single. */
function halves(r: Rect): Rect[] | null {
  if (r.w === 2 && r.h === 1) return [{ ...r, w: 1 }, { ...r, col: r.col + 1, w: 1 }];
  if (r.w === 2 && r.h === 2) return [{ ...r, h: 1 }, { ...r, row: r.row + 1, h: 1 }];
  return null;
}

/** The rect two equal neighbours form together (singles side by side, wides stacked), or null. */
function joined(a: Rect, b: Rect): Rect | null {
  if (a.w !== b.w || a.h !== b.h) return null;
  if (a.w === 1 && a.h === 1 && a.row === b.row && Math.abs(a.col - b.col) === 1) return { col: Math.min(a.col, b.col), row: a.row, w: 2, h: 1 };
  if (a.w === 2 && a.h === 1 && a.col === b.col && Math.abs(a.row - b.row) === 1) return { col: a.col, row: Math.min(a.row, b.row), w: 2, h: 2 };
  return null;
}

interface Move { weight: number; leaving: Slot[]; rects: Rect[]; picks: number[] }

/**
 * Moves for `slot` that bring in queue items: replace, split (a filler may complete it), merge. With `now` null, merges
 * ignore the neighbour's age (used to tell a stuck wall from one that is only waiting).
 */
function moves(state: WallState, slot: Slot, now: number | null): Move[] {
  const g = GRIDS[state.size];
  const out: Move[] = [];
  const consider = (weight: number, leaving: Slot[], rects: Rect[]) => {
    if (rects.some(r => !g.shapes.includes(shapeOf(r)))) return;
    const onScreen = new Set(state.slots.filter(t => !leaving.includes(t)).map(t => t.itemId));
    const picks = assign(state.queue, state.cursor, rects, onScreen) ?? (rects.length > 1 ? assign(state.queue, state.cursor, rects, onScreen, true) : null);
    if (picks) out.push({ weight, leaving, rects, picks });
  };
  const count = state.slots.length;
  consider(WEIGHTS.replace, [slot], [rectOf(slot)]);
  const split = halves(rectOf(slot));
  if (split && count + 1 <= g.max) consider(WEIGHTS.split, [slot], split);
  if (count - 1 >= g.min) {
    const before = out.length;
    for (const mate of state.slots) {
      const rect = mate.key !== slot.key && (now === null || now - mate.arrivedAt >= MERGE_AGE_MS) ? joined(slot, mate) : null;
      if (rect) consider(WEIGHTS.merge, [slot, mate], [rect]);
    }
    // Several feasible neighbours share the merge weight.
    for (let i = before; i < out.length; i++) out[i].weight /= out.length - before;
  }
  return out;
}

export function planSwap(state: WallState, slotKey: string, now: number, intervalMs: number, rng: Rng): Swap {
  const slot = state.slots.find(t => t.key === slotKey);
  if (!slot) return { leaving: [], arriving: [] };
  const arrive = (rect: Rect, i: number, n: number) => {
    const q = state.queue[i];
    return makeSlot(rect, q.item.id, state.seq + n, state.cycle, q.page, state.pageCount, now, intervalMs, rng, n);
  };
  const again = (): Swap => ({
    leaving: [slot.key],
    arriving: [makeSlot(rectOf(slot), slot.itemId, state.seq, slot.cycle, slot.page, slot.pageCount, now, intervalMs, rng, 0)],
  });
  if (state.fallback) {
    // Any item fills a column: the next unused one that is not already on screen.
    const onScreen = new Set(state.slots.filter(t => t !== slot).map(t => t.itemId));
    const i = state.queue.findIndex((q, i) => i >= state.cursor && !q.used && !onScreen.has(q.item.id));
    return i < 0 ? again() : { leaving: [slot.key], arriving: [arrive(rectOf(slot), i, 0)] };
  }
  const options = moves(state, slot, now);
  if (!options.length) return again();
  let r = rng() * options.reduce((s, o) => s + o.weight, 0);
  const op = options.find(o => (r -= o.weight) < 0) ?? options[options.length - 1];
  const order = op.rects.map((_, i) => i).sort((a, b) => readingOrder(op.rects[a], op.rects[b]));
  return { leaving: op.leaving.map(t => t.key), arriving: order.map((i, n) => arrive(op.rects[i], op.picks[i], n)) };
}

export function applySwap(state: WallState, swap: Swap): WallState {
  const leaving = new Set(swap.leaving);
  const queue = state.queue.map(q => ({ ...q }));
  for (const t of swap.arriving) {
    if (t.cycle !== state.cycle) continue; // an old-cycle tile re-arriving in place takes nothing from the queue
    const q = queue.find(e => !e.used && e.item.id === t.itemId);
    if (q) q.used = true;
  }
  const next = {
    ...state,
    queue,
    cursor: firstUnused(queue, state.cursor),
    seq: state.seq + swap.arriving.length,
    slots: [...state.slots.filter(t => !leaving.has(t.key)), ...swap.arriving],
  };
  // Stuck: no tile can ever bring in what is left of the queue, so count it used and let the hook refill.
  if (!next.fallback && next.cursor < queue.length && next.slots.every(t => !moves(next, t, null).length)) {
    for (const q of queue) q.used = true;
    next.cursor = queue.length;
  }
  return next;
}

/**
 * New cycle: queue rebuilt from `items`, slots kept. Laid out afresh instead when a fallback wall can now be tiled or
 * needs a different number of columns, or a tiled wall's items dropped below the minimum.
 */
export function refill(state: WallState, items: EngineItem[], now: number, intervalMs: number, rng: Rng): WallState {
  const g = GRIDS[state.size];
  if (state.fallback || items.length < g.min) {
    const fresh = initWall(items, state.size, now, intervalMs, rng, state.cycle + 1, state.seq);
    if (!state.fallback || !fresh.fallback || fresh.slots.length !== state.slots.length) return fresh;
  }
  const queue = items.map((item, i) => ({ item, page: Math.floor(i / g.ideal), used: false }));
  return { ...state, queue, cursor: firstUnused(queue), cycle: state.cycle + 1, pageCount: Math.max(1, Math.ceil(items.length / g.ideal)) };
}

/** Pushes every due time back (e.g. after a pause). `arrivedAt` is intentionally kept: a paused screen stayed visible. */
export function shiftDue(state: WallState, ms: number): WallState {
  return { ...state, slots: state.slots.map(t => ({ ...t, dueAt: t.dueAt + ms })) };
}

/** 1-based page of the oldest (cycle, page) on screen, out of that cycle's page count. */
export function pageLabel(state: WallState): { page: number; of: number } | null {
  const low = state.slots.reduce<Slot | undefined>((b, t) => (!b || t.cycle < b.cycle || (t.cycle === b.cycle && t.page < b.page) ? t : b), undefined);
  return low ? { page: low.page + 1, of: low.pageCount } : null;
}
