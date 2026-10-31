// Stories a column may borrow from those that follow it to fill the height it has left, at most
export const FILL_POOL = 8;

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
  | { type: 'feature-left-stack-right'; main: T; side: T[]; rightPool: T[]; rightFill: number; leftPool: T[]; leftFill: number };

/**
 * Partitions the chronological stream into blocks: feature + stack, four briefs, two halves and a
 * banner in turn, ending on a banner, two halves or three columns for the last 1-3 stories.
 * Stories a feature block's columns show as fillers (`fills`, keyed by the block's main story)
 * leave the stream there, so the blocks after it start after them and nothing shows twice.
 */
export function partitionStream<T extends { id: string }>(stories: T[], fills: Record<string, BlockFill>): StreamBlock<T>[] {
  const blocks: StreamBlock<T>[] = [];
  let idx = 0;
  let cycle = 0;

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
        const fill = fills[main.id];
        const rightPool = stories.slice(idx, idx + FILL_POOL);
        const rightFill = Math.min(fill?.right ?? 0, rightPool.length);
        const leftPool = stories.slice(idx + rightFill, idx + rightFill + FILL_POOL);
        const leftFill = Math.min(fill?.left ?? 0, leftPool.length);
        blocks.push({ type: 'feature-left-stack-right', main, side, rightPool, rightFill, leftPool, leftFill });
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
