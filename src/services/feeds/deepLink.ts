export type DeepLinkResult<T> = { state: 'found'; item: T } | { state: 'waiting' } | { state: 'missing' };

/**
 * Where a feed link's target stands: an item that is there wins at once, one that isn't may still arrive until
 * the first sync has settled, and after that it is gone (aged out, or its category turned off)
 */
export function resolveDeepLink<T extends { id: string }>(id: string, items: T[], synced: boolean): DeepLinkResult<T> {
  const item = items.find((i) => i.id === id);
  if (item) return { state: 'found', item };
  return { state: synced ? 'missing' : 'waiting' };
}
