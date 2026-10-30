import { describe, expect, it } from 'vitest';
import { tvAvailable, tvFromParams } from './tvRoute';

describe('tvRoute', () => {
  it('lists the modes each page offers', () => {
    expect(tvAvailable('latest')).toEqual(['tv']);
    expect(tvAvailable('newspaper')).toEqual(['tv']);
    expect(tvAvailable('briefing')).toEqual(['tv']);
    expect(tvAvailable('ransomware')).toEqual(['tv', 'dash']);
    expect(tvAvailable('vulnerabilities')).toEqual(['dash']);
    expect(tvAvailable('settings')).toEqual([]);
  });
  it('reads the mode from the params only where the page offers it', () => {
    expect(tvFromParams('briefing', new URLSearchParams('dash=1'))).toBeNull();
    expect(tvFromParams('ransomware', new URLSearchParams('dash=1'))).toBe('dash');
    expect(tvFromParams('latest', new URLSearchParams('tv=1'))).toBe('tv');
    expect(tvFromParams('latest', new URLSearchParams(''))).toBeNull();
  });
});
