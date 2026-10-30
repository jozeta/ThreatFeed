/**
 * The ensure* pattern for the data files a view loads on demand (msrc.json, actors.json, trends.json): fetched
 * the first time a view needs it and again whenever a newer snapshot has been loaded since. Concurrent calls
 * share one request. The IndexedDB copy is read only when the network load fails (offline), and saving it is
 * a convenience: a full or blocked IndexedDB never fails the load.
 */
export interface SnapshotLoaderOptions<T extends { generatedAt?: string }> {
  ref: { current: T | null }; // the data in state, kept current by the provider on every render
  snapshotAt: () => string | null; // generatedAt of the snapshot in use
  load: () => Promise<T | null>; // the network load; null when it failed
  read: () => Promise<T | null>; // the stored offline copy
  save: (data: T) => Promise<unknown>;
  setState: (update: T | null | ((prev: T | null) => T | null)) => void;
}

export function createSnapshotLoader<T extends { generatedAt?: string }>(o: SnapshotLoaderOptions<T>): () => Promise<T | null> {
  let request: Promise<T | null> | null = null;
  return () => {
    const current = o.ref.current;
    if (current?.generatedAt && current.generatedAt === o.snapshotAt()) return Promise.resolve(current);
    if (!request) {
      request = o.load()
        .then(async (data) => {
          if (data) {
            o.ref.current = data;
            o.setState(data);
            await o.save(data).catch(() => undefined);
            return data;
          }
          if (o.ref.current) return o.ref.current;
          const stored = await o.read().catch(() => null);
          if (stored) {
            o.ref.current = stored;
            o.setState((prev) => prev ?? stored);
          }
          return o.ref.current;
        })
        .finally(() => { request = null; });
    }
    return request;
  };
}
