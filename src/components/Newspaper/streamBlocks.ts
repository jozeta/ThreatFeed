// Stories a column may borrow from those that follow it to fill the height it has left, at most.
// Rarely more than one or two fit, and each is rendered (hidden) to be measured, so keep it small
export const FILL_POOL = 3;

/** How many stories each column of a feature block shows under its own (reported by its fillers) */
export type BlockFill = { right: number; left: number };

// Block types that fill a row edge to edge
export type StreamBlock<T> =
  | { type: 'full-banner'; items: [T] }
  | { type: 'duo-half'; items: [T, T] }
  | { type: 'trio-columns'; items: [T, T, T] }
  | { type: 'quad-briefs'; items: [T, T, T, T] }
  // The stories after the block are offered to fill its columns: the right one the first of them,
  // the left one those after what the right one shows. Only one of the two has height to spare.
  // `ordinal` numbers the feature blocks in order (0, 1, ...): their fills are kept by that number, so a
  // block keeps its fill while stories shift through it
  | { type: 'feature-left-stack-right'; ordinal: number; main: T; side: T[]; rightPool: T[]; rightFill: number; leftPool: T[]; leftFill: number };

/**
 * Partitions the chronological stream into blocks: feature + stack, four briefs, two halves and a
 * banner in turn, ending on a banner, two halves or three columns for the last 1-3 stories.
 * Stories a feature block's columns show as fillers (`fillAt(ordinal)`, the n-th feature block's)
 * leave the stream there, so the blocks after it start after them and nothing shows twice.
 */
export function partitionStream<T extends { id: string }>(stories: T[], fillAt: (ordinal: number) => BlockFill): StreamBlock<T>[] {
  const blocks: StreamBlock<T>[] = [];
  let idx = 0;
  let cycle = 0;
  let ordinal = 0;

  while (idx < stories.length) {
    const count = stories.length - idx;

    if (count === 1) {
      blocks.push({ type: 'full-banner', items: [stories[idx]] });
      break;
    }
    if (count === 2) {
      blocks.push({ type: 'duo-half', items: [stories[idx], stories[idx + 1]] });
      break;
    }
    if (count === 3) {
      blocks.push({ type: 'trio-columns', items: [stories[idx], stories[idx + 1], stories[idx + 2]] });
      break;
    }

    switch (cycle % 4) {
      case 0: {
        const main = stories[idx];
        const side = stories.slice(idx + 1, idx + 4);
        idx += 4;
        const fill = fillAt(ordinal);
        const rightPool = stories.slice(idx, idx + FILL_POOL);
        const rightFill = Math.min(fill?.right ?? 0, rightPool.length);
        const leftPool = stories.slice(idx + rightFill, idx + rightFill + FILL_POOL);
        const leftFill = Math.min(fill?.left ?? 0, leftPool.length);
        blocks.push({ type: 'feature-left-stack-right', ordinal: ordinal++, main, side, rightPool, rightFill, leftPool, leftFill });
        idx += rightFill + leftFill;
        break;
      }
      case 1:
        blocks.push({ type: 'quad-briefs', items: [stories[idx], stories[idx + 1], stories[idx + 2], stories[idx + 3]] });
        idx += 4;
        break;
      case 2:
        blocks.push({ type: 'duo-half', items: [stories[idx], stories[idx + 1]] });
        idx += 2;
        break;
      case 3:
        blocks.push({ type: 'full-banner', items: [stories[idx]] });
        idx += 1;
        break;
    }
    cycle++;
  }

  return blocks;
}

/**
 * The fill counts with the fillers' latest reports applied (all reports of a frame at once). A count
 * of 0 is dropped rather than kept, and when nothing changes the same object comes back, so React
 * skips the render.
 */
export function mergeFills(prev: Record<string, number>, reports: Map<string, number>): Record<string, number> {
  let next: Record<string, number> | null = null;
  for (const [key, count] of reports) {
    if ((prev[key] ?? 0) === count) continue;
    next ??= { ...prev };
    if (count > 0) next[key] = count;
    else delete next[key];
  }
  return next ?? prev;
}

/** The fill counts without those of rows no longer on the page (the same object when there are none) */
export function pruneFills(prev: Record<string, number>, isLive: (key: string) => boolean): Record<string, number> {
  const stale = Object.keys(prev).filter((key) => !isLive(key));
  if (stale.length === 0) return prev;
  const next = { ...prev };
  stale.forEach((key) => delete next[key]);
  return next;
}
