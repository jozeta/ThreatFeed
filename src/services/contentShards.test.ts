import { describe, expect, it, vi } from 'vitest';
import { groupContentByDay, mergeContentShards, parseShardContent, readPreviousShards, shardWindow, type DayContent } from './contentShards';

const NOW = Date.parse('2026-11-04T12:00:00Z');

describe('shardWindow', () => {
  it('lists today and the 30 days before it, oldest first', () => {
    const days = shardWindow(NOW, 30);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-10-05');
    expect(days[30]).toBe('2026-11-04');
  });
});

describe('groupContentByDay', () => {
  it('groups text by UTC publish day and skips articles without text or a valid date', () => {
    const byDay = groupContentByDay([
      { id: 'a', publishedAt: '2026-11-04T01:00:00+02:00', content: '<p>A</p>' },
      { id: 'b', publishedAt: '2026-11-04T10:00:00Z', content: '<p>B</p>' },
      { id: 'c', publishedAt: '2026-11-04T10:00:00Z', content: '' },
      { id: 'd', publishedAt: 'garbage', content: '<p>D</p>' },
    ]);
    expect(Object.fromEntries(byDay)).toEqual({ '2026-11-03': { a: '<p>A</p>' }, '2026-11-04': { b: '<p>B</p>' } });
  });
});

describe('parseShardContent', () => {
  it('keeps the string entries of a shard and rejects anything else', () => {
    expect(parseShardContent({ version: 1, day: 'x', content: { a: '<p>A</p>', b: 5 } })).toEqual({ a: '<p>A</p>' });
    expect(parseShardContent({ content: ['a'] })).toBeNull();
    expect(parseShardContent(null)).toBeNull();
  });
});

describe('mergeContentShards', () => {
  const window = shardWindow(NOW, 30);

  it('carries earlier runs\' text over, with this run winning per article', () => {
    const previous = new Map<string, DayContent>([['2026-11-03', { a: 'old A', b: 'old B' }], ['2026-10-20', { c: 'old C' }]]);
    const current = new Map<string, DayContent>([['2026-11-03', { a: 'new A' }], ['2026-11-04', { d: 'D' }]]);
    const { shards, carried, fresh } = mergeContentShards(previous, current, window);
    expect(Object.fromEntries(shards)).toEqual({
      '2026-10-20': { c: 'old C' },
      '2026-11-03': { a: 'new A', b: 'old B' },
      '2026-11-04': { d: 'D' },
    });
    expect({ carried, fresh }).toEqual({ carried: 2, fresh: 2 });
  });

  it('drops days older than the window, from either side', () => {
    const previous = new Map<string, DayContent>([['2026-10-04', { a: 'A' }], ['2026-10-05', { b: 'B' }]]);
    const current = new Map<string, DayContent>([['2026-10-01', { c: 'C' }]]);
    expect([...mergeContentShards(previous, current, window).shards.keys()]).toEqual(['2026-10-05']);
  });
});

describe('readPreviousShards', () => {
  it('reads each day, treating a 404 as no shard and listing other failures', async () => {
    const getJson = vi.fn(async (url: string) => {
      if (url.endsWith('2026-11-03.json')) return { version: 1, day: '2026-11-03', content: { a: 'A' } };
      if (url.endsWith('2026-11-02.json')) throw new Error('HTTP 404');
      if (url.endsWith('2026-11-01.json')) return { nope: true };
      throw new Error('HTTP 503');
    });
    const { shards, failed } = await readPreviousShards('https://example.test/data/', ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'], getJson);
    expect(getJson).toHaveBeenCalledWith('https://example.test/data/content/2026-11-03.json');
    expect(Object.fromEntries(shards)).toEqual({ '2026-11-03': { a: 'A' } });
    expect(failed).toEqual([{ day: '2026-10-31', error: 'HTTP 503' }, { day: '2026-11-01', error: 'not a content shard' }]);
  });
});
