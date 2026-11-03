import { describe, it, expect } from 'vitest';
import { readPreviousLedger } from './previous';

const URL = 'https://x/seen.json';
const reject = (message: string) => async () => { throw new Error(message); };
const resolveWith = (value: unknown) => async () => value;
const ledgerSeenAt = (iso: string) => ({
  version: 1,
  feeds: { news: { 'news-1': { firstSeen: iso, lastSeen: iso, published: true, keys: [] } }, vulns: {}, ransomware: {} },
});
const cacheOf = (value: unknown) => () => JSON.stringify(value);
const noCache = () => null;
const newestOf = (result: Awaited<ReturnType<typeof readPreviousLedger>>) =>
  result.ok ? result.ledger?.feeds.news['news-1']?.lastSeen : undefined;

describe('readPreviousLedger', () => {
  it('reads the previous ledger and tells a 404 from an outage', async () => {
    expect(await readPreviousLedger(reject('HTTP 404'), URL)).toEqual({ ok: true, ledger: null, source: 'none' });

    const outage = await readPreviousLedger(reject('HTTP 503'), URL);
    expect(outage.ok).toBe(false);

    const good = await readPreviousLedger(resolveWith({ version: 1, feeds: { news: {}, vulns: {}, ransomware: {} } }), URL);
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.ledger?.version).toBe(1);

    const garbage = await readPreviousLedger(resolveWith('garbage'), URL);
    expect(garbage.ok).toBe(false);

    expect(await readPreviousLedger(reject('unused'), undefined)).toEqual({ ok: true, ledger: null, source: 'none' });
  });

  it('starts over only when nothing is published (404) and there is no cached copy', async () => {
    expect(await readPreviousLedger(reject('HTTP 404'), URL, noCache)).toEqual({ ok: true, ledger: null, source: 'none' });
  });

  it('uses the published ledger when it is newer or the cached copy is unusable', async () => {
    const published = await readPreviousLedger(resolveWith(ledgerSeenAt('2026-11-03T10:00:00Z')), URL, cacheOf(ledgerSeenAt('2026-11-03T09:30:00Z')));
    expect(published.ok && published.source).toBe('published');
    expect(newestOf(published)).toBe('2026-11-03T10:00:00Z');

    const noCopy = await readPreviousLedger(resolveWith(ledgerSeenAt('2026-11-03T10:00:00Z')), URL, noCache);
    expect(noCopy.ok && noCopy.source).toBe('published');

    const brokenCopy = await readPreviousLedger(resolveWith(ledgerSeenAt('2026-11-03T10:00:00Z')), URL, () => '{not json');
    expect(brokenCopy.ok && brokenCopy.source).toBe('published');
  });

  it('prefers the cached copy when it is newer than the published one (a stale CDN)', async () => {
    const result = await readPreviousLedger(resolveWith(ledgerSeenAt('2026-11-03T09:30:00Z')), URL, cacheOf(ledgerSeenAt('2026-11-03T10:00:00Z')));
    expect(result.ok && result.source).toBe('cache');
    expect(newestOf(result)).toBe('2026-11-03T10:00:00Z');

    const emptyPublished = await readPreviousLedger(resolveWith({ version: 1, feeds: {} }), URL, cacheOf(ledgerSeenAt('2026-11-03T10:00:00Z')));
    expect(emptyPublished.ok && emptyPublished.source).toBe('cache');
  });

  it('falls back to the cached copy when the published one is missing, unreachable or malformed', async () => {
    const cached = cacheOf(ledgerSeenAt('2026-11-03T10:00:00Z'));
    for (const fetchJson of [reject('HTTP 404'), reject('HTTP 503'), resolveWith('garbage')]) {
      const result = await readPreviousLedger(fetchJson, URL, cached);
      expect(result.ok && result.source).toBe('cache');
      expect(newestOf(result)).toBe('2026-11-03T10:00:00Z');
    }
    const local = await readPreviousLedger(reject('unused'), undefined, cached);
    expect(local.ok && local.source).toBe('cache');
  });

  it('is not ok when neither copy can be used', async () => {
    const malformed = [() => '{not json', cacheOf({ version: 2 }), () => { throw new Error('EACCES'); }];
    for (const readCached of malformed) {
      // A cached copy that exists but can't be read is not "no ledger": a 404 doesn't make it a first run
      const notFound = await readPreviousLedger(reject('HTTP 404'), URL, readCached);
      expect(notFound.ok).toBe(false);
      const outage = await readPreviousLedger(reject('HTTP 503'), URL, readCached);
      expect(outage.ok).toBe(false);
    }
    const outage = await readPreviousLedger(reject('HTTP 503'), URL, noCache);
    expect(outage.ok).toBe(false);
    if (!outage.ok) expect(outage.error).toContain('HTTP 503');
  });
});
