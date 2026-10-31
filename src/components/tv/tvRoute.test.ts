import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enterTv, exitTv, leaveFullscreen, resetTvExit, tvAvailable, tvFromParams } from './tvRoute';

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

describe('enterTv / exitTv history', () => {
  const settle = () => new Promise(r => setTimeout(r, 30));
  beforeEach(() => resetTvExit()); // as a fresh TvShell mount does
  it('exit goes back over the pushed entry, leaving no duplicate', async () => {
    window.history.replaceState(null, '', '/#/latest');
    const before = window.history.length;
    enterTv('tv');
    expect(window.location.hash).toContain('tv=1');
    expect(window.history.length).toBe(before + 1);
    exitTv();
    await settle();
    expect(window.location.hash).toBe('#/latest');
    expect(window.history.length).toBe(before + 1); // back() doesn't add an entry
  });
  it('exit replaces in place when the entry was not pushed by enterTv', () => {
    window.history.replaceState(null, '', '/#/latest?tv=1');
    const back = vi.spyOn(window.history, 'back');
    exitTv();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/latest');
    back.mockRestore();
  });
  it('leaves only once per TV session (the full-screen change can call it a second time)', () => {
    window.history.replaceState({ tvEntry: true }, '', '/#/latest?tv=1');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    exitTv();
    exitTv();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
  it('a new TV session can leave again', () => {
    window.history.replaceState({ tvEntry: true }, '', '/#/latest?tv=1');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    exitTv();
    enterTv('tv');
    exitTv();
    expect(back).toHaveBeenCalledTimes(2);
    back.mockRestore();
  });
});
