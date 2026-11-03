import { decodeLedger, FEED_NAMES, type FeedLedger } from './ledger';

export type PreviousLedger =
  | { ok: true; ledger: FeedLedger | null; source: 'published' | 'cache' | 'none' }
  | { ok: false; error: string };

type Read = { ledger: FeedLedger } | { missing: true } | { error: string };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The latest firstSeen/lastSeen in a ledger, in epoch ms (-Infinity for an empty ledger) */
function newestSeen(ledger: FeedLedger): number {
  let newest = -Infinity;
  for (const feed of FEED_NAMES) {
    for (const entry of Object.values(ledger.feeds[feed])) {
      newest = Math.max(newest, Date.parse(entry.firstSeen), Date.parse(entry.lastSeen));
    }
  }
  return newest;
}

async function readPublished(fetchJson: (url: string) => Promise<unknown>, url: string | undefined): Promise<Read> {
  if (!url) return { missing: true };
  let raw: unknown;
  try {
    raw = await fetchJson(url);
  } catch (err) {
    const message = errorText(err);
    return message === 'HTTP 404' ? { missing: true } : { error: message };
  }
  const ledger = decodeLedger(raw);
  return ledger ? { ledger } : { error: 'seen.json is malformed' };
}

function readCache(readCachedFile: () => string | null): Read {
  let text: string | null;
  try {
    text = readCachedFile();
  } catch (err) {
    return { error: `cached copy unreadable (${errorText(err)})` };
  }
  if (text === null) return { missing: true };
  try {
    const ledger = decodeLedger(JSON.parse(text));
    if (ledger) return { ledger };
  } catch {
    // reported below
  }
  return { error: 'cached copy is malformed' };
}

/**
 * Reads the ledger the last run published, with the workflow's Action-cache copy (`readCachedFile`,
 * null when there is none) as a second copy. With both readable, the one seen most recently wins. It is
 * a first run only when nothing is published (a 404, or no url for a local run) and there is no cached
 * copy. Any other failure is not ok: treating it as a first run would re-date every item.
 */
export async function readPreviousLedger(
  fetchJson: (url: string) => Promise<unknown>,
  url: string | undefined,
  readCachedFile: () => string | null = () => null,
): Promise<PreviousLedger> {
  const published = await readPublished(fetchJson, url);
  const cached = readCache(readCachedFile);
  if ('ledger' in published && 'ledger' in cached) {
    return newestSeen(cached.ledger) > newestSeen(published.ledger)
      ? { ok: true, ledger: cached.ledger, source: 'cache' }
      : { ok: true, ledger: published.ledger, source: 'published' };
  }
  if ('ledger' in published) return { ok: true, ledger: published.ledger, source: 'published' };
  if ('ledger' in cached) return { ok: true, ledger: cached.ledger, source: 'cache' };
  if ('missing' in published && 'missing' in cached) return { ok: true, ledger: null, source: 'none' };
  const errors = ['error' in published ? published.error : '', 'error' in cached ? cached.error : ''].filter(Boolean);
  return { ok: false, error: errors.join('; ') };
}
