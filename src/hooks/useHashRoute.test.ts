import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHash, canonicalHash, closeAllPanels, closePanel, openPanel, panelLevels, panelParam, parseHash, withPanelOnTop } from './useHashRoute';

describe('hash routes', () => {
  it('parses page, tab and parameters', () => {
    const route = parseHash('#/vulns/kev?vendor=Fortinet&min=9');
    expect(route.page).toBe('vulnerabilities');
    expect(route.sub).toBe('kev');
    expect(route.params.get('vendor')).toBe('Fortinet');
    expect(route.params.get('min')).toBe('9');
  });

  it('falls back to the newspaper for empty or unknown hashes', () => {
    expect(parseHash('').page).toBe('newspaper');
    expect(parseHash('#/nope').page).toBe('newspaper');
  });

  it('round-trips', () => {
    const hash = buildHash('vulnerabilities', 'new', new URLSearchParams({ cve: 'CVE-2026-1', q: 'a b' }));
    expect(hash).toBe('#/vulns/new?cve=CVE-2026-1&q=a+b');
    expect(parseHash(hash).params.get('q')).toBe('a b');
    expect(buildHash('newspaper')).toBe('#/');
    expect(buildHash('bookmarks')).toBe('#/saved');
  });

  it('sends removed or unknown pages to the newspaper, keeping their parameters', () => {
    const route = parseHash('#/actors/malware?actor=G0007');
    expect(route.page).toBe('newspaper');
    expect(route.sub).toBe('');
    expect(route.params.get('actor')).toBe('G0007');
    expect(parseHash('#/trends?period=year').page).toBe('newspaper');
  });

  it('rewrites a removed page\'s hash to the newspaper\'s, and leaves known pages alone', () => {
    expect(canonicalHash('#/actors?actor=G0007')).toBe('#/?actor=G0007');
    expect(canonicalHash('#/actors/malware?malware=cobalt-strike')).toBe('#/?malware=cobalt-strike');
    expect(canonicalHash('#/trends')).toBe('#/');
    expect(canonicalHash('#/vulns/kev?cve=CVE-2026-1')).toBeNull();
    expect(canonicalHash('#/?vendor=Fortinet')).toBeNull();
    expect(canonicalHash('')).toBeNull();
  });

  it('routes My Feed with its News / Vulns sub-tab', () => {
    const route = parseHash('#/feed/vulns');
    expect(route.page).toBe('feed');
    expect(route.sub).toBe('vulns');
    expect(buildHash('feed', 'news')).toBe('#/feed/news');
  });

  it('stacks the panels in the order their parameters come, the last on top', () => {
    expect(panelLevels(parseHash('#/vulns/kev?kevVendor=X&vendor=Fortinet&q=a&actor=G0007&cve=CVE-2026-1').params)).toEqual({ vendor: 0, actor: 1, cve: 2 });
    expect(panelLevels(new URLSearchParams())).toEqual({});
  });

  it('opens a panel on top: its parameter moves to the end, the others stay', () => {
    const params = parseHash('#/?group=akira&vendor=Fortinet&q=x').params;
    expect(withPanelOnTop(params, 'group', 'play').toString()).toBe('vendor=Fortinet&q=x&group=play');
    expect(withPanelOnTop(params, 'actor', 'G0007').toString()).toBe('group=akira&vendor=Fortinet&q=x&actor=G0007');
    expect(params.toString()).toBe('group=akira&vendor=Fortinet&q=x');
  });
});

describe('panel parameters', () => {
  it('keeps a trimmed value of at most 200 characters, and nothing for a blank or longer one', () => {
    expect(panelParam('vendor', ' Fortinet ')).toBe('Fortinet');
    expect(panelParam('tag', null)).toBe('');
    expect(panelParam('tag', '   ')).toBe('');
    expect(panelParam('group', 'a'.repeat(200))).toBe('a'.repeat(200));
    expect(panelParam('group', 'a'.repeat(201))).toBe('');
  });

  it('upper-cases a CVE id and drops anything that is not one', () => {
    expect(panelParam('cve', 'cve-2026-21643')).toBe('CVE-2026-21643');
    expect(panelParam('cve', 'CVE-2026-123')).toBe('');
    expect(panelParam('cve', 'CVE-2026-1234<x>')).toBe('');
    expect(panelParam('cve', 'junk')).toBe('');
  });
});

describe('opening and closing panels', () => {
  const hash = () => window.location.hash;
  // Back (history.go) lands asynchronously, with a popstate
  const pops = (n: number) => new Promise<void>((resolve) => {
    let left = n;
    const on = () => { if (--left === 0) { window.removeEventListener('popstate', on); resolve(); } };
    window.addEventListener('popstate', on);
  });
  const panelsOpen = () => Object.keys(panelLevels(parseHash(hash()).params));

  beforeEach(() => {
    window.history.replaceState(null, '', '#/');
    window.history.pushState(null, '', '#/latest'); // a page visited in the app before the panels
  });
  afterEach(() => vi.restoreAllMocks());

  it('closing the panels goes back through their entries, so Back afterwards reopens none', async () => {
    openPanel('vendor', 'Fortinet');
    openPanel('cve', 'CVE-2026-1234');
    expect(hash()).toBe('#/latest?vendor=Fortinet&cve=CVE-2026-1234');
    let popped = pops(1);
    closePanel('cve');
    await popped;
    expect(hash()).toBe('#/latest?vendor=Fortinet');
    popped = pops(1);
    closePanel('vendor');
    await popped;
    expect(hash()).toBe('#/latest');
    popped = pops(1);
    window.history.back(); // the user's Back: the page before, still in the app, with no panel
    await popped;
    expect(hash()).toBe('#/');
    expect(panelsOpen()).toEqual([]);
  });

  it('a second close while the first is still going back waits for it (Escape twice during the exit)', async () => {
    openPanel('vendor', 'Fortinet');
    openPanel('cve', 'CVE-2026-1234');
    const popped = pops(2);
    closePanel('cve');
    closePanel('vendor');
    await popped;
    expect(hash()).toBe('#/latest');
  });

  it('a deep-linked panel closes in place, without going back out of the app', () => {
    window.history.replaceState(null, '', '#/?vendor=Fortinet');
    const go = vi.spyOn(window.history, 'go');
    const length = window.history.length;
    closePanel('vendor');
    expect(hash()).toBe('#/');
    expect(go).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
  });

  it('a panel with another on top of it closes in place', () => {
    openPanel('vendor', 'Fortinet');
    openPanel('cve', 'CVE-2026-1234');
    const go = vi.spyOn(window.history, 'go');
    closePanel('vendor');
    expect(hash()).toBe('#/latest?cve=CVE-2026-1234');
    expect(go).not.toHaveBeenCalled();
  });

  it('a panel that shows something else under the same key closes Back to what it showed before', async () => {
    openPanel('actor', 'G0007');
    openPanel('actor', 'G0016'); // e.g. malware's "used by" in a panel stacked on the first actor's
    expect(hash()).toBe('#/latest?actor=G0016');
    let popped = pops(1);
    closePanel('actor');
    await popped;
    expect(hash()).toBe('#/latest?actor=G0007');
    popped = pops(1);
    closeAllPanels();
    await popped;
    expect(hash()).toBe('#/latest');
  });

  it('closing them all after a same-key swap goes back to before the first', async () => {
    openPanel('vendor', 'Fortinet');
    openPanel('vendor', 'Cisco');
    const popped = pops(1);
    closeAllPanels();
    await popped;
    expect(hash()).toBe('#/latest');
  });

  it('opening a panel that is already open raises it in place, with no new entry', () => {
    openPanel('vendor', 'Fortinet');
    openPanel('cve', 'CVE-2026-1234');
    const length = window.history.length;
    openPanel('vendor', 'Fortinet');
    expect(hash()).toBe('#/latest?cve=CVE-2026-1234&vendor=Fortinet');
    expect(window.history.length).toBe(length);
  });

  it('closing them all (reading an article from a panel) goes back to before the first, so Back reopens none', async () => {
    openPanel('vendor', 'Fortinet');
    openPanel('group', 'akira');
    openPanel('cve', 'CVE-2026-1234');
    const popped = pops(1);
    closeAllPanels();
    await popped;
    expect(hash()).toBe('#/latest');
  });

  it('closing them all on a deep link removes every panel parameter in place, keeping the rest', () => {
    window.history.replaceState(null, '', '#/vulns/kev?kevVendor=X&vendor=Fortinet&tag=Ransomware&cve=CVE-2026-1234');
    const go = vi.spyOn(window.history, 'go');
    closeAllPanels();
    expect(hash()).toBe('#/vulns/kev?kevVendor=X');
    expect(go).not.toHaveBeenCalled();
  });

  it('closing them all after a deep-linked panel had others opened on it goes back, then clears that one too', async () => {
    window.history.replaceState(null, '', '#/?tag=Ransomware');
    openPanel('cve', 'CVE-2026-1234');
    const popped = pops(1);
    closeAllPanels();
    await popped;
    expect(hash()).toBe('#/');
  });
});
