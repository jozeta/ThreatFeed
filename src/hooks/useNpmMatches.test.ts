import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { NpmAdvisoryData } from '../services/npm/advisories';
import type { OsvResult } from '../services/npm/osv';

const settings = { npmPackages: [] as string[], npmOsvLookup: false };
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings }) }));
const stored = new Map<string, unknown>();
vi.mock('../services/storage/indexeddb', () => ({
  getStoredValue: vi.fn(async (key: string) => stored.get(key) ?? null),
  saveStoredValue: vi.fn(async (key: string, value: unknown) => { stored.set(key, value); }),
}));
vi.mock('../services/npm/osv', async (orig) => ({ ...(await orig<typeof import('../services/npm/osv')>()), osvQueryBatch: vi.fn() }));

import { osvQueryBatch } from '../services/npm/osv';
import { useNpmMatches, type NpmMatches } from './useNpmMatches';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const query = vi.mocked(osvQueryBatch);
const DATA: NpmAdvisoryData = { version: 1, generatedAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z', recent: [], index: [] };
const answer = (): Map<string, OsvResult> => new Map([['lodash@4.17.15', { vulns: [], complete: true }]]);

let roots: Root[] = [];
const seen: NpmMatches[] = [];
const Probe = () => { seen.push(useNpmMatches(DATA, null)); return null; };
async function mount(count = 1) {
  for (let i = 0; i < count; i++) {
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    await act(async () => { root.render(createElement(Probe)); });
  }
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue(answer());
  stored.clear();
  seen.length = 0;
  settings.npmPackages = ['lodash@4.17.15'];
  settings.npmOsvLookup = true;
});
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
});

describe('useNpmMatches and OSV', () => {
  it('never asks OSV when the setting is off, even with data and a list', async () => {
    settings.npmOsvLookup = false;
    await mount();
    expect(query).not.toHaveBeenCalled();
    expect(seen[seen.length - 1].results[0].osv).toBe('off');
  });

  it('uses a fresh cached answer for the same list without asking again', async () => {
    stored.set('npmOsv', { at: new Date().toISOString(), key: 'lodash@4.17.15', results: [...answer()] });
    await mount();
    expect(query).not.toHaveBeenCalled();
    expect(seen[seen.length - 1].results[0].osv).toBe('checked');
  });

  it('asks exactly once when the list changed since the cached answer, and caches the new one', async () => {
    stored.set('npmOsv', { at: new Date().toISOString(), key: 'lodash@4.17.0', results: [] });
    await mount();
    expect(query).toHaveBeenCalledTimes(1);
    expect((stored.get('npmOsv') as { key: string }).key).toBe('lodash@4.17.15');
    expect(seen[seen.length - 1].results[0].osv).toBe('checked');
  });

  it('shares one lookup between two views', async () => {
    let resolve!: (v: Map<string, OsvResult>) => void;
    query.mockReturnValue(new Promise((r) => { resolve = r; }));
    await mount(2);
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(answer()); await new Promise((r) => setTimeout(r, 0)); });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('shows OSV as unavailable when the lookup fails, and caches nothing', async () => {
    query.mockResolvedValue(null);
    await mount();
    expect(seen[seen.length - 1].results[0].osv).toBe('unavailable');
    expect(stored.has('npmOsv')).toBe(false);
  });
});
