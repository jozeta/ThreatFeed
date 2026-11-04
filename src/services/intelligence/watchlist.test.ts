import { describe, expect, it } from 'vitest';
import { checkWatchlistMatch, upgradeWatchlistKeywords, DEFAULT_WATCHLIST_KEYWORDS, isDefaultTerm, termCounts } from './watchlist';
import { extractIOCs } from './iocExtractor';
import { article } from '../../test/fixtures';

describe('watchlist', () => {
  it('matches whole words, including terms with punctuation', () => {
    const a = article('x', { title: 'Attackers adapt tactics; C++ toolkit and .NET loader' });
    expect(checkWatchlistMatch(a, ['APT', 'adapt', 'C++', '.NET']).matchedTerms).toEqual(['adapt', 'C++', '.NET']);
  });

  it('ignores auto-generated tags but uses custom tags', () => {
    expect(checkWatchlistMatch(article('x', { tags: ['Data Breach'] }), ['data breach']).matched).toBe(false);
    expect(checkWatchlistMatch(article('x', { customTags: ['LockBit'] }), ['LockBit']).matched).toBe(true);
  });

  it('upgrades saved lists without re-adding removed legacy defaults', () => {
    const upgraded = upgradeWatchlistKeywords(['Ivanti', 'MyVendor'], 1);
    expect(upgraded).toContain('MyVendor');
    expect(upgraded).toContain('zero-day');
    expect(upgraded).not.toContain('Fortinet'); // legacy default the user removed
    expect(upgradeWatchlistKeywords(DEFAULT_WATCHLIST_KEYWORDS, 99)).toBe(DEFAULT_WATCHLIST_KEYWORDS);
  });
});

describe('extractIOCs', () => {
  it('filters private IPv4 ranges', () => {
    const ips = extractIOCs('172.16.1.1 172.20.0.1 172.31.9.9 172.32.0.1 8.8.8.8 192.168.1.1').map(i => i.value);
    expect(ips).toEqual(['172.32.0.1', '8.8.8.8']);
  });

  it('tells default terms from your own, ignoring case', () => {
    expect(isDefaultTerm('cisco')).toBe(true);
    expect(isDefaultTerm('Remote Code Execution')).toBe(true);
    expect(isDefaultTerm('  Cisco ')).toBe(true);
    expect(isDefaultTerm('MyVendor')).toBe(false);
    // Non-default presets are user choices
    expect(isDefaultTerm('Okta')).toBe(false);
  });

  it('counts stories per term since a cutoff using the watchlist matching', () => {
    const now = Date.now();
    const day = 86_400_000;
    const articles = [
      article('a', { title: 'Cisco and Okta patch', publishedAt: new Date(now - day).toISOString() }),
      article('b', { title: 'Cisco again', publishedAt: new Date(now - 2 * day).toISOString() }),
      article('c', { title: 'Old Cisco story', publishedAt: new Date(now - 30 * day).toISOString() }),
      article('d', { title: 'We adapt', publishedAt: new Date(now).toISOString() }),
    ];
    const counts = termCounts(articles, ['Cisco', 'Okta', 'APT', 'Nothing'], now - 7 * day);
    expect(counts.get('Cisco')).toBe(2);
    expect(counts.get('Okta')).toBe(1);
    expect(counts.get('APT')).toBe(0);
    expect(counts.get('Nothing')).toBe(0);
  });
});
