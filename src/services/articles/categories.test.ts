import { describe, expect, it } from 'vitest';
import { feedsInUse, withoutDisabledCategories } from './categories';
import { article } from '../../test/fixtures';
import type { Feed } from '../../types';

const feed = (id: string, category: string) => ({ id, name: id, url: `https://${id}.test/rss`, category, enabled: true }) as Feed;
const feeds = [feed('feber', 'Swedish (Feber)'), feed('bleeping', 'Threat Intel')];

describe('withoutDisabledCategories', () => {
  it('drops articles of a disabled category', () => {
    const out = withoutDisabledCategories([article('a', { sourceId: 'feber' }), article('b', { sourceId: 'bleeping' })], feeds, ['Swedish (Feber)']);
    expect(out.map(a => a.id)).toEqual(['b']);
  });

  it('keeps bookmarked articles', () => {
    const out = withoutDisabledCategories([article('a', { sourceId: 'feber', bookmarked: true })], feeds, ['Swedish (Feber)']);
    expect(out.map(a => a.id)).toEqual(['a']);
  });

  it('keeps articles whose feed is unknown', () => {
    const out = withoutDisabledCategories([article('a', { sourceId: 'gone' })], feeds, ['Swedish (Feber)']);
    expect(out.map(a => a.id)).toEqual(['a']);
  });

  it('returns the same array when nothing is disabled', () => {
    const list = [article('a', { sourceId: 'feber' })];
    expect(withoutDisabledCategories(list, feeds, [])).toBe(list);
  });
});

describe('feedsInUse', () => {
  it('drops feeds of disabled categories only', () => {
    expect(feedsInUse(feeds, ['Swedish (Feber)']).map(f => f.id)).toEqual(['bleeping']);
  });
});
