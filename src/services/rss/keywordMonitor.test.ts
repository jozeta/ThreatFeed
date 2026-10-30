import { describe, it, expect } from 'vitest';
import { googleNewsFeedUrl, isKeywordMonitor, monitorQuery } from './keywordMonitor';
import { Feed } from '../../types';

const feedOf = (url: string): Feed => ({ id: 'x', name: 'x', url, category: 'Keyword Monitors', tags: [], enabled: true });

describe('googleNewsFeedUrl', () => {
  it('builds the default url with when:7d and ceid', () => {
    expect(googleNewsFeedUrl('lockbit')).toBe(
      'https://news.google.com/rss/search?q=lockbit+when:7d&hl=en-US&gl=US&ceid=US:en'
    );
  });

  it('encodes quotes and OR', () => {
    const url = googleNewsFeedUrl('"zero day" OR ransomware');
    expect(url).toContain('q=%22zero+day%22+OR+ransomware+when:7d');
  });

  it('encodes Swedish characters and uses locale options', () => {
    const url = googleNewsFeedUrl('dataintrång åäö', { lang: 'sv-SE', country: 'SE', days: 3 });
    expect(url).toContain('q=dataintr%C3%A5ng+%C3%A5%C3%A4%C3%B6+when:3d');
    expect(url).toContain('hl=sv-SE&gl=SE&ceid=SE:sv');
  });

  it('omits when: for days of 0', () => {
    expect(googleNewsFeedUrl('a', { days: 0 })).not.toContain('when:');
  });
});

describe('isKeywordMonitor / monitorQuery', () => {
  it('detects monitor feeds', () => {
    expect(isKeywordMonitor(feedOf(googleNewsFeedUrl('a')))).toBe(true);
    expect(isKeywordMonitor(feedOf('https://news.google.com/rss/topics/abc'))).toBe(false);
    expect(isKeywordMonitor(feedOf('https://example.com/rss/search?q=a'))).toBe(false);
    expect(isKeywordMonitor(feedOf('not a url'))).toBe(false);
  });

  it('round-trips the query without the when: part', () => {
    for (const q of ['lockbit', '"zero day" OR ransomware', 'dataintrång åäö']) {
      expect(monitorQuery(feedOf(googleNewsFeedUrl(q)))).toBe(q);
    }
    expect(monitorQuery(feedOf(googleNewsFeedUrl('a', { days: 0 })))).toBe('a');
  });

  it('returns null for non-monitors', () => {
    expect(monitorQuery(feedOf('https://example.com/feed'))).toBeNull();
  });
});
