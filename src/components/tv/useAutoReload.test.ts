// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, QUIET_WAIT_MS, RELOAD_KEY, useAutoReload } from './useAutoReload';
import { TV_QUIET_EVENT } from './useLivingWall';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MIN = 60_000;
let root: Root;
let reload: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let script: HTMLScriptElement | null = null;

const deploy = (name: string) => fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve(`<script type="module" crossorigin src="/ThreatFeed/assets/${name}"></script>`) });
const running = (name: string | null) => {
  script?.remove();
  script = null;
  if (!name) return;
  script = document.createElement('script');
  script.type = 'text/plain'; // jsdom must not try to load it
  script.setAttribute('src', `/ThreatFeed/assets/${name}`);
  document.head.appendChild(script);
};
const mount = (strict = false) => {
  function H() { useAutoReload(reload); return null; }
  root = createRoot(document.createElement('div'));
  act(() => root.render(strict ? createElement(StrictMode, null, createElement(H)) : createElement(H)));
};
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const quiet = () => act(() => { window.dispatchEvent(new Event(TV_QUIET_EVENT)); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0));
  reload = vi.fn();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  running(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useAutoReload', () => {
  it('does nothing in dev (no hashed main script)', async () => {
    running(null);
    deploy('index-B.js');
    mount();
    await advance(CHECK_EVERY_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('checks every 30 minutes, cache-bypassed, and stays put on the same build', async () => {
    running('index-A.js');
    deploy('index-A.js');
    mount();
    await advance(CHECK_EVERY_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/index\.html\?v=\d+$/);
    expect(init).toEqual({ cache: 'no-store' });
    await advance(QUIET_WAIT_MS * 2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads for a new build at the next quiet moment, keeping the guard', async () => {
    running('index-A.js');
    deploy('index-B.js');
    mount();
    await advance(CHECK_EVERY_MS);
    expect(reload).not.toHaveBeenCalled();
    quiet();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(RELOAD_KEY)!)).toEqual({ at: Date.now(), build: 'index-B.js' });
  });

  it('reloads anyway after 2 minutes without a swap, but never mid-swap', async () => {
    running('index-A.js');
    deploy('index-B.js');
    const leaving = document.createElement('div');
    leaving.className = 'tv-root';
    leaving.innerHTML = '<div data-leaving="1"></div>';
    document.body.appendChild(leaving);
    mount();
    await advance(CHECK_EVERY_MS + QUIET_WAIT_MS);
    expect(reload).not.toHaveBeenCalled(); // a swap is in its out phase
    leaving.remove();
    quiet();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads after 2 minutes when nothing swaps', async () => {
    running('index-A.js');
    deploy('index-B.js');
    mount();
    await advance(CHECK_EVERY_MS + QUIET_WAIT_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    await advance(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads twice for the same build', async () => {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ at: Date.now() - 60 * MIN, build: 'index-B.js' }));
    running('index-A.js');
    deploy('index-B.js');
    mount();
    await advance(CHECK_EVERY_MS + QUIET_WAIT_MS);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads nightly at 03:00 with no new build', async () => {
    vi.setSystemTime(new Date(2026, 9, 31, 2, 50));
    running('index-A.js');
    deploy('index-A.js');
    mount();
    await advance(9 * MIN);
    expect(reload).not.toHaveBeenCalled();
    await advance(MIN); // 03:00 tick
    quiet();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the check fails (offline)', async () => {
    running('index-A.js');
    fetchMock.mockRejectedValue(new TypeError('offline'));
    mount();
    await advance(CHECK_EVERY_MS + QUIET_WAIT_MS);
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves no timers or listeners after unmount, StrictMode included', async () => {
    running('index-A.js');
    deploy('index-B.js');
    mount(true);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    await advance(CHECK_EVERY_MS + QUIET_WAIT_MS);
    quiet();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    mount(); // for afterEach
  });

  it('StrictMode mounts check once per period', async () => {
    running('index-A.js');
    deploy('index-A.js');
    mount(true);
    await advance(CHECK_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
