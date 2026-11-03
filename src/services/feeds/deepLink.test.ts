import { describe, it, expect } from 'vitest';
import { resolveDeepLink } from './deepLink';

describe('resolveDeepLink', () => {
  it('waits for sync, then reports missing', () => {
    expect(resolveDeepLink('a', [], false)).toEqual({ state: 'waiting' });
    expect(resolveDeepLink('a', [], true)).toEqual({ state: 'missing' });
  });

  it('finds an item that is present, even before sync', () => {
    const item = { id: 'a' };
    expect(resolveDeepLink('a', [{ id: 'b' }, item], false)).toEqual({ state: 'found', item });
    expect(resolveDeepLink('a', [item], true)).toEqual({ state: 'found', item });
  });
});
