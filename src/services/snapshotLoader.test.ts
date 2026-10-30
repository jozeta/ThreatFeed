import { describe, expect, it, vi } from 'vitest';
import { createSnapshotLoader } from './snapshotLoader';

type Data = { generatedAt?: string; n: number };

function setup(opts: { load?: () => Promise<Data | null>; read?: () => Promise<Data | null>; save?: (d: Data) => Promise<unknown>; current?: Data | null; snapshotAt?: string | null } = {}) {
  const ref = { current: opts.current ?? null };
  let state: Data | null = ref.current;
  const setState = vi.fn((u: Data | null | ((prev: Data | null) => Data | null)) => { state = typeof u === 'function' ? u(state) : u; });
  const load = vi.fn(opts.load ?? (async () => ({ generatedAt: 'B', n: 2 })));
  const read = vi.fn(opts.read ?? (async () => ({ generatedAt: 'A', n: 1 })));
  const save = vi.fn(opts.save ?? (async () => undefined));
  const ensure = createSnapshotLoader<Data>({ ref, snapshotAt: () => opts.snapshotAt ?? 'B', load, read, save, setState });
  return { ensure, ref, load, read, save, setState, state: () => state };
}

describe('createSnapshotLoader', () => {
  it('does nothing when this snapshot\'s copy is loaded', async () => {
    const t = setup({ current: { generatedAt: 'B', n: 2 } });
    expect(await t.ensure()).toEqual({ generatedAt: 'B', n: 2 });
    expect(t.load).not.toHaveBeenCalled();
  });

  it('loads from the network, saves the offline copy and never reads it', async () => {
    const t = setup();
    expect(await t.ensure()).toEqual({ generatedAt: 'B', n: 2 });
    expect(t.state()).toEqual({ generatedAt: 'B', n: 2 });
    expect(t.ref.current).toEqual({ generatedAt: 'B', n: 2 });
    expect(t.save).toHaveBeenCalledWith({ generatedAt: 'B', n: 2 });
    expect(t.read).not.toHaveBeenCalled();
  });

  it('shares one request between concurrent calls', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.ensure(), t.ensure()]);
    expect(a).toBe(b);
    expect(t.load).toHaveBeenCalledTimes(1);
  });

  it('falls back to the stored copy when the network load fails, without replacing loaded data', async () => {
    const offline = setup({ load: async () => null });
    expect(await offline.ensure()).toEqual({ generatedAt: 'A', n: 1 });
    expect(offline.state()).toEqual({ generatedAt: 'A', n: 1 });

    const loaded = setup({ load: async () => null, current: { generatedAt: 'Z', n: 9 } });
    expect(await loaded.ensure()).toEqual({ generatedAt: 'Z', n: 9 });
    expect(loaded.read).not.toHaveBeenCalled();
    expect(loaded.setState).not.toHaveBeenCalled();
  });

  it('resolves even when IndexedDB fails to read or save', async () => {
    const t = setup({ save: () => Promise.reject(new Error('quota')) });
    expect(await t.ensure()).toEqual({ generatedAt: 'B', n: 2 });
    const u = setup({ load: async () => null, read: () => Promise.reject(new Error('blocked')) });
    expect(await u.ensure()).toBeNull();
  });
});
