// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = { size: 'medium', speed: 'medium', transition: 'fade', intervalSeconds: 10, qr: false, mix: false };
const mounts: string[] = [];

vi.mock('./useTvSettings', () => ({ useTvSettings: () => settings }));
vi.mock('./useTvChrome', () => ({ useTvChrome: () => ({ idle: false }) }));
vi.mock('./useAutoReload', () => ({ QUIET_SETTLE_MS: 1500, useAutoReload: () => {} }));
vi.mock('../Common/panelStack', () => ({ usePanelLayer: () => 0 }));
vi.mock('./TvWall', () => ({
  default: function FakeWall({ page }: { page: string }) {
    useEffect(() => { mounts.push(`${page}|${settings.mix}`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  },
}));
const dashboards: string[] = [];
vi.mock('./VulnDashboard', () => ({ default: () => { dashboards.push('vulns'); return null; } }));
vi.mock('./RansomDashboard', () => ({ default: () => { dashboards.push('ransomware'); return null; } }));
vi.mock('./NpmDashboard', () => ({ default: () => { dashboards.push('npm'); return null; } }));

import TvShell from './TvShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  mounts.length = 0;
  dashboards.length = 0;
  settings.mix = false;
  root = createRoot(document.createElement('div'));
});
afterEach(() => act(() => root.unmount()));

describe('TvShell', () => {
  it('starts a fresh wall when the page or the mix changes, so no old tile stays on screen', () => {
    act(() => root.render(createElement(TvShell, { kind: 'tv', page: 'latest' })));
    act(() => root.render(createElement(TvShell, { kind: 'tv', page: 'newspaper' })));
    settings.mix = true;
    act(() => root.render(createElement(TvShell, { kind: 'tv', page: 'newspaper' })));
    expect(mounts).toEqual(['latest|false', 'newspaper|false', 'newspaper|true']);
  });
  it('shows the npm dashboard on the npm tab of Vulnerabilities, the Vulns dashboard elsewhere on it', () => {
    act(() => root.render(createElement(TvShell, { kind: 'dash', page: 'vulnerabilities', sub: 'npm' })));
    act(() => root.render(createElement(TvShell, { kind: 'dash', page: 'vulnerabilities', sub: 'kev' })));
    act(() => root.render(createElement(TvShell, { kind: 'dash', page: 'ransomware' })));
    expect([...new Set(dashboards)]).toEqual(['npm', 'vulns', 'ransomware']);
  });
});
