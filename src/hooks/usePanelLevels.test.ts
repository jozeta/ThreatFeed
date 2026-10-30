import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { usePanelLevels } from './usePanelLevels';
import { READER_LEVEL } from '../components/Common/panelStack';
import { openPanel } from './useHashRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('usePanelLevels', () => {
  let root: Root;
  let levels: ReturnType<typeof usePanelLevels> = {};
  const Probe: React.FC<{ query: string; reader: boolean }> = ({ query, reader }) => {
    levels = usePanelLevels(new URLSearchParams(query), reader);
    return null;
  };
  const render = (query: string, reader: boolean) => act(() => root.render(React.createElement(Probe, { query, reader })));

  beforeEach(() => { root = createRoot(document.createElement('div')); });
  afterEach(() => act(() => root.unmount()));

  it('puts a panel opened from the reader over it, and only that one', async () => {
    await render('vendor=Fortinet', false);
    expect(levels).toEqual({ vendor: 0 });
    await render('vendor=Fortinet', true); // the reader opens over the vendor panel
    expect(levels).toEqual({ vendor: 0 });
    await render('vendor=Fortinet&group=akira', true); // a link in the article
    expect(levels).toEqual({ vendor: 0, group: READER_LEVEL + 2 });
    await render('vendor=Cisco&group=akira', true); // the vendor panel shows something else, from the reader too
    expect(levels).toEqual({ vendor: READER_LEVEL + 1, group: READER_LEVEL + 2 });
    await render('vendor=Cisco&group=akira', false); // the reader closed
    expect(levels).toEqual({ vendor: 0, group: 1 });
  });

  it('raises a panel already open under the reader when a link in the article opens it again', async () => {
    window.history.replaceState(null, '', '#/?vendor=Fortinet');
    await render('vendor=Fortinet', false);
    await render('vendor=Fortinet', true); // the reader opens over the vendor panel
    expect(levels).toEqual({ vendor: 0 });
    await act(async () => openPanel('vendor', 'Fortinet')); // a Fortinet link in the article: the hash stays as it is
    await render('vendor=Fortinet', true);
    expect(levels).toEqual({ vendor: READER_LEVEL + 1 });
    await render('vendor=Fortinet', false);
    expect(levels).toEqual({ vendor: 0 });
  });
});
