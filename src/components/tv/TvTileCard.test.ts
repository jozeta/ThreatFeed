// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TvTile } from '../../services/tv/tiles';

vi.mock('./useTvSettings', () => ({ useTvSettings: () => ({ qr: true }) }));

import TvTileCard from './TvTileCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

const npmTile = (over: Partial<TvTile> = {}): TvTile => ({
  id: 'npm-GHSA-2222-2222-2222', kind: 'npm', tone: 'critical', source: 'npm advisory', time: new Date().toISOString(),
  headline: 'Prototype pollution in <b>x</b>', weight: 8, url: 'https://github.com/advisories/GHSA-2222-2222-2222',
  npm: { severity: 'critical', packages: ['<img src=x onerror=alert(1)>', 'other'], vulnerable: '< 1.0.0', patched: '1.0.0', ids: ['GHSA-2222-2222-2222', 'CVE-2026-1'], yours: ['<i>lodash</i>@4.17.15'] },
  ...over,
});

const render = (tile: TvTile, area = 2) => act(() => root.render(createElement(TvTileCard, { tile, size: 'medium', area, leaving: false, now: Date.now() })));

describe('TvTileCard (npm)', () => {
  it('tile text is never HTML', () => {
    render(npmTile());
    expect(host.querySelector('.tv-tile-headline')!.textContent).toBe('Prototype pollution in <b>x</b>');
    expect(host.querySelector('.tv-tile-headline b')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.tv-tile-npm i')).toBeNull();
    expect(host.querySelector('.tv-tile-npm')!.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(host.querySelector('.tv-tile-npm-yours')!.textContent).toBe('Yours: <i>lodash</i>@4.17.15');
  });

  it('shows the severity, the range to the fix and the ids, and the "Yours" line only when affecting', () => {
    render(npmTile({ npm: { severity: 'high', packages: ['left-pad'], vulnerable: '< 1.3.0', patched: '1.3.0', ids: ['GHSA-2222-2222-2222', 'CVE-2026-1'], yours: [] } }));
    expect(host.querySelector('.tv-sev-chip')!.textContent).toBe('High');
    expect(host.querySelector('.tv-tile-npm')!.textContent).toContain('left-pad < 1.3.0 → fixed in 1.3.0');
    expect(host.querySelector('.tv-tile-npm')!.textContent).toContain('GHSA-2222-2222-2222 · CVE-2026-1');
    expect(host.querySelector('.tv-tile-npm-yours')).toBeNull();
  });

  it('draws the QR code only with an advisory link', () => {
    render(npmTile());
    expect(host.querySelector('.tv-qr')).not.toBeNull();
    render(npmTile({ url: undefined }));
    expect(host.querySelector('.tv-qr')).toBeNull();
  });
});
