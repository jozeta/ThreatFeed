import { describe, expect, it } from 'vitest';
import { checkWatchlistMatch, upgradeWatchlistKeywords, DEFAULT_WATCHLIST_KEYWORDS } from './watchlist';
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
});
