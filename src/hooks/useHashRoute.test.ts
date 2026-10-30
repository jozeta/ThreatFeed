import { describe, expect, it } from 'vitest';
import { buildHash, canonicalHash, parseHash } from './useHashRoute';

describe('hash routes', () => {
  it('parses page, tab and parameters', () => {
    const route = parseHash('#/vulns/kev?vendor=Fortinet&min=9');
    expect(route.page).toBe('vulnerabilities');
    expect(route.sub).toBe('kev');
    expect(route.params.get('vendor')).toBe('Fortinet');
    expect(route.params.get('min')).toBe('9');
  });

  it('falls back to the newspaper for empty or unknown hashes', () => {
    expect(parseHash('').page).toBe('newspaper');
    expect(parseHash('#/nope').page).toBe('newspaper');
  });

  it('round-trips', () => {
    const hash = buildHash('vulnerabilities', 'new', new URLSearchParams({ cve: 'CVE-2026-1', q: 'a b' }));
    expect(hash).toBe('#/vulns/new?cve=CVE-2026-1&q=a+b');
    expect(parseHash(hash).params.get('q')).toBe('a b');
    expect(buildHash('newspaper')).toBe('#/');
    expect(buildHash('bookmarks')).toBe('#/saved');
  });

  it('sends removed or unknown pages to the newspaper, keeping their parameters', () => {
    const route = parseHash('#/actors/malware?actor=G0007');
    expect(route.page).toBe('newspaper');
    expect(route.sub).toBe('');
    expect(route.params.get('actor')).toBe('G0007');
    expect(parseHash('#/trends?period=year').page).toBe('newspaper');
  });

  it('rewrites a removed page\'s hash to the newspaper\'s, and leaves known pages alone', () => {
    expect(canonicalHash('#/actors?actor=G0007')).toBe('#/?actor=G0007');
    expect(canonicalHash('#/actors/malware?malware=cobalt-strike')).toBe('#/?malware=cobalt-strike');
    expect(canonicalHash('#/trends')).toBe('#/');
    expect(canonicalHash('#/vulns/kev?cve=CVE-2026-1')).toBeNull();
    expect(canonicalHash('#/?vendor=Fortinet')).toBeNull();
    expect(canonicalHash('')).toBeNull();
  });

  it('routes My Feed with its News / Vulns sub-tab', () => {
    const route = parseHash('#/feed/vulns');
    expect(route.page).toBe('feed');
    expect(route.sub).toBe('vulns');
    expect(buildHash('feed', 'news')).toBe('#/feed/news');
  });
});
