// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardWall, { PanelDef } from './DashboardWall';

vi.mock('../Common/SidePanel', () => ({ useReducedMotion: () => false }));
vi.mock('./useTvSettings', () => ({
  useTvSettings: () => ({ size: 'medium', speed: 'medium', transition: 'fade', intervalSeconds: 10, qr: false, mix: false }),
}));
vi.mock('../../context/FeedContext', () => ({ useFeeds: () => ({ lastUpdated: null, snapshotGeneratedAt: null }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CELLS = 4 * 2; // the medium grid

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Cells covered by the slots on screen, from their grid spans */
function covered(): number {
  return Array.from(host.querySelectorAll<HTMLElement>('.tv-slot')).reduce((sum, el) => {
    const span = (v: string) => Number(/span (\d+)/.exec(v)?.[1] ?? 1);
    return sum + span(el.style.gridColumn) * span(el.style.gridRow);
  }, 0);
}

describe('DashboardWall refill', () => {
  it('keeps what an on-screen tile shows through a refill and leaves no empty cell', () => {
    // Version 0 offers p0..p9; from version 1 on the data has changed: every panel shows new content, and p0..p4 and p8
    // are gone (p8 is on screen when the refill runs)
    let version = 0;
    const newDataBuilds: boolean[] = [];
    const build = (): PanelDef[] => {
      const v = version;
      const ids = Array.from({ length: 10 }, (_, i) => `p${i}`).filter((_, i) => v === 0 || (i >= 5 && i !== 8));
      return ids.map(id => ({
        id, weight: 1, shapes: ['1x1'],
        render: () => createElement('span', { className: 'content' }, `${id}@v${v}`),
      }));
    };
    const tracked = (): PanelDef[] => {
      const panels = build();
      newDataBuilds.push(version > 0);
      return panels;
    };
    act(() => root.render(createElement(DashboardWall, { build: tracked })));
    expect(covered()).toBe(CELLS);

    // What each slot element showed when first seen; React keeps an element per slot key
    const firstSeen = new Map<Element, string>();
    const look = () => {
      for (const el of host.querySelectorAll('.tv-slot')) {
        const text = el.textContent ?? '';
        expect(text).not.toBe('');
        if (!firstSeen.has(el)) firstSeen.set(el, text);
        else expect(text).toBe(firstSeen.get(el));
      }
      expect(covered()).toBe(CELLS);
    };
    look();

    version = 1;
    let refilledAt = -1;
    let atRefill: Element[] = []; // the version-0 tiles on screen when the refill ran
    let stayed: Element[] = []; // those still on screen once the swap that triggered the refill has landed
    for (let t = 200; t <= 180_000; t += 200) {
      act(() => { vi.advanceTimersByTime(200); });
      look(); // every step: no empty cell, and no tile ever changes what it shows
      if (refilledAt < 0 && newDataBuilds.includes(true)) {
        refilledAt = t;
        atRefill = [...host.querySelectorAll('.tv-slot')].filter(el => /@v0$/.test(el.textContent ?? ''));
      }
      if (refilledAt > 0 && t === refilledAt + 2000) stayed = atRefill.filter(el => host.contains(el));
    }
    expect(refilledAt).toBeGreaterThan(0);
    expect(atRefill.map(el => el.textContent)).toContain('p8@v0'); // dropped by the refill while on screen
    // Tiles that outlived the refill's swap still show their version-0 content (the new build has v1 content, or none)
    expect(stayed.length).toBeGreaterThanOrEqual(1);
    expect(stayed.every(el => /@v0$/.test(el.textContent ?? ''))).toBe(true);
    // The refill's new content does arrive in fresh tiles
    expect([...host.querySelectorAll('.tv-slot')].some(el => /@v1$/.test(el.textContent ?? ''))).toBe(true);
  });
});
