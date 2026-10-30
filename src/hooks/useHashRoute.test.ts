import { describe, expect, it } from 'vitest';
import { buildHash, parseHash } from './useHashRoute';

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

  it('routes the Trends page with its period, kind and open CVE panel', () => {
    const route = parseHash('#/trends?period=year&kind=vendor&cve=CVE-2026-1');
    expect(route.page).toBe('trends');
    expect(route.params.get('period')).toBe('year');
    expect(buildHash('trends', '', new URLSearchParams({ kind: 'cve' }))).toBe('#/trends?kind=cve');
  });

  it('routes the Actors page with its malware sub-tab and open panel', () => {
    const route = parseHash('#/actors/malware?malware=cobalt-strike');
    expect(route.page).toBe('actors');
    expect(route.sub).toBe('malware');
    expect(route.params.get('malware')).toBe('cobalt-strike');
    expect(buildHash('actors', '', new URLSearchParams({ actor: 'G0007' }))).toBe('#/actors?actor=G0007');
  });

  it('routes My Feed with its News / Vulns sub-tab', () => {
    const route = parseHash('#/feed/vulns');
    expect(route.page).toBe('feed');
    expect(route.sub).toBe('vulns');
    expect(buildHash('feed', 'news')).toBe('#/feed/news');
  });
});
