// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvTile } from '../../services/tv/tiles';
import { DETECT_THROTTLE_MS, useBreakingDetection, useBreakingNews } from './useBreakingNews';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse('2026-10-31T12:00:00Z');
const tile = (id: string, critical = true): TvTile => ({
  id, kind: 'story', tone: 'critical', source: 'S', time: new Date(NOW - 5 * 60000).toISOString(), headline: id, weight: 1, critical,
});

function mountNews() {
  let news!: ReturnType<typeof useBreakingNews>;
  function H() {
    news = useBreakingNews();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(H)));
  return { news: () => news, root };
}

describe('useBreakingNews', () => {
  it('stories of the starting build are not news; new ones break once', () => {
    const { news, root } = mountNews();
    news().markSeen([tile('a')]);
    expect(news().detect([tile('a'), tile('b'), tile('c', false)], new Map(), NOW).map(t => t.id)).toEqual(['b']);
    expect(news().detect([tile('a'), tile('b')], new Map(), NOW)).toEqual([]);
    act(() => root.unmount());
  });

  it('shows the badge for the cycle the item first arrives in, then not', () => {
    const { news, root } = mountNews();
    news().detect([tile('b')], new Map(), NOW);
    expect(news().isNew({ itemId: 'a', cycle: 3 })).toBe(false);
    expect(news().isNew({ itemId: 'b', cycle: 3 })).toBe(true);
    expect(news().isNew({ itemId: 'b', cycle: 3 })).toBe(true); // still its round
    expect(news().isNew({ itemId: 'b', cycle: 4 })).toBe(false); // an ordinary story next round
    act(() => root.unmount());
  });
});

describe('useBreakingDetection', () => {
  let tiles: TvTile[];
  let synced: boolean;
  let accepts: boolean;
  let page: string;
  let builds: number;
  let broke: string[][];
  let root: ReturnType<typeof createRoot>;
  let news: ReturnType<typeof useBreakingNews>;
  const fresh = (id: string): TvTile => ({ ...tile(id), time: new Date(Date.now() - 60000).toISOString() });

  function H() {
    news = useBreakingNews();
    useBreakingDetection(news, {
      page, data: [tiles], synced,
      build: () => { builds++; return tiles; },
      kevAdded: () => new Map(),
      acceptsNews: () => accepts,
      onBreaking: found => broke.push(found.map(t => t.id)),
    });
    return null;
  }
  const render = () => act(() => root.render(createElement(H)));
  /** New data arrives (a fresh array, like a refresh flush) */
  const flush = (next: TvTile[]) => { tiles = next; render(); };
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tiles = [fresh('a')];
    synced = true; accepts = false; page = 'latest'; builds = 0; broke = [];
    root = createRoot(document.createElement('div'));
    render(); // the wall starts (not settled yet): its data is seen
    accepts = true;
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('a story that arrives once the wall runs breaks (after the throttle); the starting data does not', () => {
    flush([fresh('a'), fresh('b')]);
    expect(broke).toEqual([]);
    advance(DETECT_THROTTLE_MS);
    expect(broke).toEqual([['b']]);
  });

  it("stored data, then new critical data before the wall's first swap: no priority, and never later", () => {
    accepts = false;
    flush([fresh('a'), fresh('b')]);
    advance(DETECT_THROTTLE_MS);
    accepts = true; // the first swap landed
    flush([fresh('a'), fresh('b')]);
    advance(DETECT_THROTTLE_MS);
    expect(broke).toEqual([]);
    expect(news.isNew({ itemId: 'b', cycle: 0 })).toBe(false);
  });

  it("everything counts as seen until the app's first sync is done, even when the scheduled run comes after it", () => {
    advance(DETECT_THROTTLE_MS);
    synced = false;
    flush([fresh('a'), fresh('b')]); // runs at once: seen
    flush([fresh('a'), fresh('b'), fresh('c')]); // scheduled
    synced = true;
    render();
    advance(DETECT_THROTTLE_MS);
    flush([fresh('a'), fresh('b'), fresh('c')]);
    advance(DETECT_THROTTLE_MS);
    expect(broke).toEqual([]);
    flush([fresh('a'), fresh('b'), fresh('c'), fresh('d')]);
    advance(DETECT_THROTTLE_MS);
    expect(broke).toEqual([['d']]);
  });

  it('a page change is not news', () => {
    advance(DETECT_THROTTLE_MS);
    page = 'briefing';
    flush([fresh('x')]);
    advance(DETECT_THROTTLE_MS);
    expect(broke).toEqual([]);
  });

  it('builds at most once per throttle window under a stream of flushes', () => {
    advance(DETECT_THROTTLE_MS);
    builds = 0;
    for (let i = 0; i < 20; i++) {
      flush([fresh('a'), fresh(`n${i}`)]);
      advance(1000);
    }
    expect(builds).toBeLessThanOrEqual(20 / (DETECT_THROTTLE_MS / 1000) + 1);
  });
});
