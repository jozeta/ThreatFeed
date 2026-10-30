import { describe, expect, it, vi } from 'vitest';
import { leaveFullscreen, tvAvailable, tvFromParams } from './tvRoute';

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

describe('leaveFullscreen', () => {
  const setFs = (el: unknown, exit: unknown) => {
    Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
  };
  it('exits only when in full screen, and swallows rejections', async () => {
    const exit = vi.fn(() => Promise.reject(new Error('no')));
    setFs(null, exit);
    leaveFullscreen();
    expect(exit).not.toHaveBeenCalled();
    setFs(document.documentElement, exit);
    expect(() => leaveFullscreen()).not.toThrow();
    expect(exit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });
});
