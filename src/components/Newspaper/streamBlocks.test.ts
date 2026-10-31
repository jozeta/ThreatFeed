import { describe, expect, it } from 'vitest';
import { partitionStream, FILL_POOL, type StreamBlock } from './streamBlocks';

const stories = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));

/** Every story the blocks show, in order: the block's own, then those filling its right and left columns */
function shown(blocks: StreamBlock<{ id: string }>[]): string[] {
  return blocks.flatMap((b) =>
    b.type === 'feature-left-stack-right'
      ? [b.main, ...b.side, ...b.rightPool.slice(0, b.rightFill), ...b.leftPool.slice(0, b.leftFill)].map((s) => s.id)
      : b.items.map((s) => s.id)
  );
}

describe('partitionStream', () => {
  it('cycles feature + stack, quad, duo, banner, and shows every story once in order', () => {
    const blocks = partitionStream(stories(15), {});
    expect(blocks.map((b) => b.type)).toEqual(['feature-left-stack-right', 'quad-briefs', 'duo-half', 'full-banner', 'feature-left-stack-right']);
    expect(shown(blocks)).toEqual(stories(15).map((s) => s.id));
  });

  it('ends on a banner, duo or trio for the last 1-3 stories', () => {
    expect(partitionStream(stories(1), {}).map((b) => b.type)).toEqual(['full-banner']);
    expect(partitionStream(stories(2), {}).map((b) => b.type)).toEqual(['duo-half']);
    expect(partitionStream(stories(3), {}).map((b) => b.type)).toEqual(['trio-columns']);
    expect(partitionStream(stories(5), {}).map((b) => b.type)).toEqual(['feature-left-stack-right', 'full-banner']);
  });

  it('offers the stories after a feature block as its fillers, at most FILL_POOL', () => {
    const [first] = partitionStream(stories(30), {});
    if (first.type !== 'feature-left-stack-right') throw new Error('expected a feature block');
    expect(first.rightPool.map((s) => s.id)).toEqual(stories(30).slice(4, 4 + FILL_POOL).map((s) => s.id));
    expect(first.rightFill).toBe(0);
    expect(first.leftFill).toBe(0);
  });

  it('takes the filled stories out of the stream, so the next blocks start after them', () => {
    const blocks = partitionStream(stories(20), { s0: { right: 2, left: 0 } });
    const first = blocks[0];
    if (first.type !== 'feature-left-stack-right') throw new Error('expected a feature block');
    expect(first.rightFill).toBe(2);
    expect(blocks[1].type).toBe('quad-briefs');
    if (blocks[1].type === 'quad-briefs') expect(blocks[1].items[0].id).toBe('s6');
    const ids = shown(blocks);
    expect(ids).toEqual(stories(20).map((s) => s.id)); // nothing twice, nothing lost
  });

  it('gives the left column the stories after those the right one filled', () => {
    const [first] = partitionStream(stories(20), { s0: { right: 1, left: 2 } });
    if (first.type !== 'feature-left-stack-right') throw new Error('expected a feature block');
    expect(first.rightPool[0].id).toBe('s4');
    expect(first.leftPool.map((s) => s.id).slice(0, 2)).toEqual(['s5', 's6']);
  });

  it('never fills more than there are stories left', () => {
    const blocks = partitionStream(stories(6), { s0: { right: 5, left: 5 } });
    const first = blocks[0];
    if (first.type !== 'feature-left-stack-right') throw new Error('expected a feature block');
    expect(first.rightFill + first.leftFill).toBe(2);
    expect(blocks).toHaveLength(1);
    expect(shown(blocks)).toEqual(stories(6).map((s) => s.id));
  });
});
