import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The panels only need these to render; no network
vi.mock('../context/FeedContext', () => ({ useFeeds: () => ({ articles: [] }) }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: { stackKeywords: [], hiddenVulnVendors: [], watchedCves: [] }, updateSettings() {} }) }));
const ACTORS = {
  actors: [{ id: 'G0007', name: 'APT28', aliases: [], description: '', techniques: [], software: [], url: 'https://attack.mitre.org/groups/G0007/' }],
  malware: [],
};
vi.mock('../hooks/useVulns', () => ({ useVulns: () => null, useMsrc: () => null, useActors: () => ACTORS, useRansomwareIntel: () => null, useTrends: () => null }));
// The vendor panel's Wikipedia lead names a group, for following a link from one panel to another
const WIKI = { title: 'Fortinet', extract: 'Fortinet devices are a favourite target of the Akira ransomware gang.', url: 'https://en.wikipedia.org/wiki/Fortinet' };
vi.mock('../services/intelligence/vendor', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/vendor')>()), fetchWikiSummary: () => Promise.resolve(WIKI) }));
vi.mock('../services/intelligence/cvss', () => ({ fetchCveDescription: () => Promise.resolve(null) }));
vi.mock('../services/intelligence/cveWatch', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/cveWatch')>()), fetchEpssHistory: () => Promise.resolve([]) }));

import VendorPanelHost from './VendorPanel';
import { KeyboardShortcutsModal } from './Common/KeyboardShortcutsModal';
import { ActorPanelHost, GroupPanelHost } from './EntityPanelHosts';
import { PanelLevel } from './Common/SidePanel';
import { EntityMatcherContext } from '../hooks/useEntityMatcher';
import { buildEntityMatcher } from '../services/intelligence/entityLinks';
import { CvePanelHost } from '../pages/vulns/CvePanelHost';
import { panelLevels, parseHash, setHashParams } from '../hooks/useHashRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const params = () => parseHash(window.location.hash).params;

const matcher = buildEntityMatcher({ vendors: ['Fortinet'], groups: [{ key: 'akira', name: 'Akira', aliases: [] }], actors: [], malware: [] });

/**
 * The layers as the app mounts them over any page: the actor, group, vendor and CVE hosts (in App's order), each
 * at the level of its parameter's place in the URL, with the shortcuts modal over everything. They all register
 * with the one panel stack, so the panel opened last sits on top, whichever mounted first
 */
const Layers: React.FC<{ shortcuts: boolean; onCloseShortcuts: () => void }> = ({ shortcuts, onCloseShortcuts }) => {
  const levels = panelLevels(params());
  const at = (key: keyof typeof levels, id: string, el: React.ReactElement) => React.createElement(PanelLevel.Provider, { key, value: levels[key] ?? 0 }, React.cloneElement(el, { key: id }));
  const actor = params().get('actor');
  const group = params().get('group');
  const vendor = params().get('vendor');
  const cve = params().get('cve');
  return React.createElement(EntityMatcherContext.Provider, { value: matcher },
    actor && at('actor', actor, React.createElement(ActorPanelHost, { id: actor, onOpenArticle() {} })),
    group && at('group', group, React.createElement(GroupPanelHost, { id: group, onOpenArticle() {} })),
    vendor && at('vendor', vendor, React.createElement(VendorPanelHost, { vendor, onOpenArticle() {} })),
    cve && at('cve', cve, React.createElement(CvePanelHost, { cve, articles: [], onOpenArticle() {}, onClose: () => setHashParams({ cve: '' }) })),
    React.createElement(KeyboardShortcutsModal, { isOpen: shortcuts, onClose: onCloseShortcuts }),
  );
};
/** The z-index of the panel (its fixed layer) whose dialog is labelled `name` */
const zOf = (name: string) => Number((document.querySelector(`[role=dialog][aria-label="${name}"]`)?.parentElement as HTMLElement | null)?.style.zIndex);

describe('Escape with stacked panels', () => {
  let root: Root;
  let shortcuts = false;
  const render = async () => {
    await act(async () => root.render(React.createElement(Layers, { shortcuts, onCloseShortcuts: () => { shortcuts = false; } })));
  };
  const escape = async () => {
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    // Side panels call onClose once their exit animation has played
    await act(async () => { vi.advanceTimersByTime(400); });
    await render();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    shortcuts = false;
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('closes one layer per press, topmost first: CVE, then vendor, then actor', async () => {
    window.location.hash = '#/?actor=G0007&vendor=Fortinet&cve=CVE-2026-21643';
    await render();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(3);

    await escape();
    expect([params().get('actor'), params().get('vendor'), params().get('cve')]).toEqual(['G0007', 'Fortinet', null]);
    await escape();
    expect([params().get('actor'), params().get('vendor')]).toEqual(['G0007', null]);
    await escape();
    expect(params().get('actor')).toBeNull();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(0);
  });

  it('closes only the shortcuts modal when it is open over the panels', async () => {
    window.location.hash = '#/?actor=G0007&vendor=Fortinet';
    shortcuts = true;
    await render();
    await escape();
    expect(shortcuts).toBe(false);
    expect([params().get('actor'), params().get('vendor')]).toEqual(['G0007', 'Fortinet']);
    await escape();
    expect([params().get('actor'), params().get('vendor')]).toEqual(['G0007', null]);
  });

  it('a second press during the exit animation goes to the next panel down', async () => {
    window.location.hash = '#/?actor=G0007&vendor=Fortinet';
    await render();
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await escape();
    expect([params().get('actor'), params().get('vendor')]).toEqual([null, null]);
  });

  it('a link in a panel opens its panel on top, and Escape then closes that one first', async () => {
    window.location.hash = '#/?vendor=Fortinet';
    await render();
    await act(async () => { await Promise.resolve(); }); // the Wikipedia lead
    const link = [...document.querySelectorAll<HTMLElement>('[role=dialog] .entity-link')].find((el) => el.textContent === 'Akira');
    expect(link).toBeDefined();
    const length = window.history.length;
    await act(async () => { link!.click(); });
    expect(window.location.hash).toBe('#/?vendor=Fortinet&group=akira');
    expect(window.history.length).toBe(length + 1); // a history entry, so Back closes it
    await render();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(2);
    expect(zOf('Akira ransomware group')).toBeGreaterThan(zOf('Fortinet'));

    await escape();
    expect([params().get('vendor'), params().get('group')]).toEqual(['Fortinet', null]);
    await escape();
    expect(params().get('vendor')).toBeNull();
  });

  it('a panel opened before others but named last in the URL still sits on top', async () => {
    window.location.hash = '#/?cve=CVE-2026-21643&actor=G0007';
    await render();
    expect(zOf('APT28 threat actor')).toBeGreaterThan(zOf('CVE-2026-21643'));
    await escape();
    expect([params().get('cve'), params().get('actor')]).toEqual(['CVE-2026-21643', null]);
  });
});
