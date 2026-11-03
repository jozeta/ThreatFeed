import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../services/storage/indexeddb', () => ({
  getSettingsFromDB: vi.fn().mockResolvedValue(null),
  saveSettingsToDB: vi.fn().mockResolvedValue(undefined),
}));

import { SettingsProvider, useSettings } from './SettingsContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SettingsProvider sync log', () => {
  it('records list deletions on update but nothing on reset, keeping the existing log', async () => {
    let ctx!: ReturnType<typeof useSettings>;
    const Probe = () => { ctx = useSettings(); return null; };
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(SettingsProvider, null, createElement(Probe))); });

    await act(async () => { ctx.updateSettings({ mutedKeywords: ['deal'] }); });
    await act(async () => { ctx.updateSettings({ mutedKeywords: [] }); });
    const log = ctx.settings.syncLog;
    expect(log?.mutedKeywords?.deal.removed).toBe(true);

    await act(async () => { ctx.updateSettings({ stackKeywords: ['Okta'] }); });
    const beforeReset = ctx.settings.syncLog;
    await act(async () => { ctx.resetSettings(); });
    expect(ctx.settings.stackKeywords).toEqual([]);
    expect(ctx.settings.syncLog).toBe(beforeReset); // no removal recorded for Okta or the default lists
    act(() => root.unmount());
  });
});
