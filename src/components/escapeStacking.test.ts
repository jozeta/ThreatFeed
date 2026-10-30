import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The panels only need these to render; no network
vi.mock('../context/FeedContext', () => ({ useFeeds: () => ({ articles: [] }) }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: { stackKeywords: [], hiddenVulnVendors: [], watchedCves: [] }, updateSettings() {} }) }));
vi.mock('../hooks/useVulns', () => ({ useVulns: () => null, useMsrc: () => null }));
vi.mock('../services/intelligence/vendor', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/vendor')>()), fetchWikiSummary: () => Promise.resolve(null) }));
vi.mock('../services/intelligence/cvss', () => ({ fetchCveDescription: () => Promise.resolve(null) }));
vi.mock('../services/intelligence/cveWatch', async (orig) => ({ ...(await orig<typeof import('../services/intelligence/cveWatch')>()), fetchEpssHistory: () => Promise.resolve([]) }));

import VendorPanelHost from './VendorPanel';
import { KeyboardShortcutsModal } from './Common/KeyboardShortcutsModal';
import { ProfilePanel } from '../pages/actors/shared';
import { CvePanelHost } from '../pages/vulns/CvePanelHost';
import { parseHash, setHashParams } from '../hooks/useHashRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const params = () => parseHash(window.location.hash).params;

/**
 * The layers as the app mounts them on the Actors page: the actor panel and the CVE opened on top of it are
 * the page's (in that order, as ActorsPage renders them), the vendor panel is the app's, the shortcuts modal
 * tops everything
 */
const Layers: React.FC<{ shortcuts: boolean; onCloseShortcuts: () => void }> = ({ shortcuts, onCloseShortcuts }) => {
  const actor = params().get('actor');
  const vendor = params().get('vendor');
  const cve = params().get('cve');
  // ActorsPage's closeUnlessCve('actor')
  const closeActor = () => { if (!params().get('cve')) setHashParams({ actor: '' }); };
  return React.createElement(React.Fragment, null,
    actor && React.createElement(ProfilePanel, { title: 'APT28', label: 'APT28', onClose: closeActor, children: null }),
    cve && React.createElement(CvePanelHost, { cve, articles: [], onOpenArticle() {}, onClose: () => setHashParams({ cve: '' }) }),
    vendor && React.createElement(VendorPanelHost, { vendor, cve: cve ?? '', page: 'actors', covered: shortcuts, onOpenArticle() {} }),
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
    await render();
  };

  beforeEach(() => {
    shortcuts = false;
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it('closes one layer per press, topmost first: CVE, then vendor, then actor', async () => {
    window.location.hash = '#/actors?actor=G0007&vendor=Fortinet&cve=CVE-2026-21643';
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
    window.location.hash = '#/actors?actor=G0007&vendor=Fortinet';
    shortcuts = true;
    await render();
    await escape();
    expect(shortcuts).toBe(false);
    expect([params().get('actor'), params().get('vendor')]).toEqual(['G0007', 'Fortinet']);
    await escape();
    expect([params().get('actor'), params().get('vendor')]).toEqual(['G0007', null]);
  });
});
