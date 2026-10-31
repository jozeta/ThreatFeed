// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TvTile } from '../../services/tv/tiles';
import { useBreakingNews } from './useBreakingNews';

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
