import { describe, expect, it } from 'vitest';
import { normalizeUrl, parseFeedXml } from './parser';
import { sanitizeStoredArticle } from './sanitizer';
import { feed, rss, rssItem } from '../../test/fixtures';

describe('parseFeedXml', () => {
  it('parses an empty but valid feed', () => {
    expect(parseFeedXml(rss(''), feed())).toEqual([]);
  });

  it('rejects well-formed XML that is not a feed', () => {
    expect(() => parseFeedXml('<error><message>Rate limited</message></error>', feed())).toThrow(/XML/);
  });

  it('parses Atom', () => {
    const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A</title><id>urn:1</id><link href="https://e.com/a"/><updated>2026-10-27T00:00:00Z</updated></entry></feed>';
    expect(parseFeedXml(atom, feed())).toHaveLength(1);
  });

  it('keeps only the newest maxItems entries, by date', () => {
    const items = [3, 1, 2].map(d => rssItem(`Item ${d}`, 'x', [], new Date(Date.UTC(2026, 9, d)))).join('');
    expect(parseFeedXml(rss(items), feed(), 2).map(a => a.title)).toEqual(['Item 3', 'Item 2']);
  });
});

describe('URL safety', () => {
  it('drops non-http links and strips tracking parameters', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
    expect(normalizeUrl('https://e.com/a/?utm_source=x')).toBe('https://e.com/a');
  });

  it('sanitizes imported articles', () => {
    const a = sanitizeStoredArticle({
      id: 'x', title: '<b>T</b>', sourceId: 's', url: 'javascript:alert(1)', image: 'data:image/png;base64,AAA',
      content: '<img src=x onerror=alert(1)><script>alert(2)</script><p>ok</p>', tags: ['a', 5], bookmarked: 1,
    })!;
    expect(a.url).toBe('');
    expect(a.image).toBeUndefined();
    expect(a.content).not.toMatch(/onerror|script/i);
    expect(a.content).toContain('<p>ok</p>');
    expect(a.tags).toEqual(['a']);
    expect(a.bookmarked).toBe(true);
    expect(sanitizeStoredArticle({ title: 'x', sourceId: 's' })).toBeNull();
  });
});
