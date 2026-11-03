import { decodeLedger, type FeedLedger } from './ledger';

export type PreviousLedger = { ok: true; ledger: FeedLedger | null } | { ok: false; error: string };

/**
 * Reads the ledger the last run published. No url (a local run) or a 404 (nothing published yet) is a
 * first run. Any other failure, or a file that doesn't decode, is not ok: treating it as a first run
 * would re-date every item.
 */
export async function readPreviousLedger(
  fetchJson: (url: string) => Promise<unknown>,
  url: string | undefined,
): Promise<PreviousLedger> {
  if (!url) return { ok: true, ledger: null };
  let raw: unknown;
  try {
    raw = await fetchJson(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'HTTP 404') return { ok: true, ledger: null };
    return { ok: false, error: message };
  }
  const ledger = decodeLedger(raw);
  return ledger ? { ok: true, ledger } : { ok: false, error: 'seen.json is malformed' };
}
