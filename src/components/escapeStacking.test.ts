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
vi.mock('../hooks/useVulns', () => ({ useVulns: () => null, useMsrc: () => null, useActors: () => ACTORS, useRansomwareIntel: () => null }));
vi.mock('../services/intelligence/vendor', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/vendor')>()), fetchWikiSummary: () => Promise.resolve(null) }));
vi.mock('../services/intelligence/cvss', () => ({ fetchCveDescription: () => Promise.resolve(null) }));
vi.mock('../services/intelligence/cveWatch', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/cveWatch')>()), fetchEpssHistory: () => Promise.resolve([]) }));

import VendorPanelHost from './VendorPanel';
import { KeyboardShortcutsModal } from './Common/KeyboardShortcutsModal';
import { ActorPanelHost } from './EntityPanelHosts';
import { CvePanelHost } from '../pages/vulns/CvePanelHost';
import { parseHash, setHashParams } from '../hooks/useHashRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const params = () => parseHash(window.location.hash).params;

/**
 * The layers as the app mounts them over any page: the actor, vendor and CVE hosts (in App's order), with the
 * shortcuts modal over everything. They all register with the one panel stack, so the CVE opened from the
 * actor panel sits on top by its level, whichever mounted first
 */
const Layers: React.FC<{ shortcuts: boolean; onCloseShortcuts: () => void }> = ({ shortcuts, onCloseShortcuts }) => {
  const actor = params().get('actor');
  const vendor = params().get('vendor');
  const cve = params().get('cve');
  return React.createElement(React.Fragment, null,
    actor && React.createElement(ActorPanelHost, { id: actor, onOpenArticle() {} }),
    vendor && React.createElement(VendorPanelHost, { vendor, onOpenArticle() {} }),
    cve && React.createElement(CvePanelHost, { cve, articles: [], onOpenArticle() {}, onClose: () => setHashParams({ cve: '' }) }),
    React.createElement(KeyboardShortcutsModal, { isOpen: shortcuts, onClose: onCloseShortcuts }),
  );
};

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
});
