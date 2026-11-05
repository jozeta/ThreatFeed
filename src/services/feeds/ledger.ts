import type { FeedName } from './candidates';

/** One published (or baseline) item: when it was first and last seen, and its identity keys. */
export interface LedgerEntry {
  firstSeen: string; // ISO 8601
  lastSeen: string; // ISO 8601
  published: boolean; // false for a first-run baseline exploit
  keys: string[];
  pubDate?: string; // ISO 8601, fixed when the item is first published
}

/** The published-items ledger (`data/feeds/seen.json`), keyed by feed and then guid. */
export interface FeedLedger {
  version: 1;
  feeds: Record<FeedName, Record<string, LedgerEntry>>;
}

export const FEED_NAMES: FeedName[] = ['news', 'vulns', 'ransomware', 'npm'];
const DAY_MS = 24 * 60 * 60 * 1000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTime = (value: unknown): value is string => typeof value === 'string' && !isNaN(Date.parse(value));

export function emptyLedger(): FeedLedger {
  return { version: 1, feeds: { news: {}, vulns: {}, ransomware: {}, npm: {} } };
}

function decodeEntry(raw: unknown): LedgerEntry | null {
  if (!isObject(raw)) return null;
  const { firstSeen, lastSeen, published, keys, pubDate } = raw;
  if (!isTime(firstSeen) || !isTime(lastSeen) || typeof published !== 'boolean') return null;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) return null;
  const entry: LedgerEntry = { firstSeen, lastSeen, published, keys: [...keys] };
  // A malformed pubDate is dropped; the entry falls back to pickPubDate
  if (isTime(pubDate)) entry.pubDate = pubDate;
  return entry;
}

/** Validates a ledger read from JSON. Null when it is malformed; malformed entries are dropped. */
export function decodeLedger(raw: unknown): FeedLedger | null {
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.feeds)) return null;
  const ledger = emptyLedger();
  for (const feed of FEED_NAMES) {
    const entries = raw.feeds[feed];
    if (entries === undefined) continue;
    if (!isObject(entries)) return null;
    const kept: [string, LedgerEntry][] = [];
    for (const [guid, value] of Object.entries(entries)) {
      const entry = decodeEntry(value);
      if (entry) kept.push([guid, entry]);
    }
    // fromEntries defines own properties, so a guid such as "__proto__" stays plain data
    ledger.feeds[feed] = Object.fromEntries(kept);
  }
  return ledger;
}

/** Drops entries whose lastSeen is more than `keepDays` before now. */
export function pruneLedger(ledger: FeedLedger, now: number, keepDays = 90): FeedLedger {
  const cutoff = now - keepDays * DAY_MS;
  const out = emptyLedger();
  for (const feed of FEED_NAMES) {
    out.feeds[feed] = Object.fromEntries(
      Object.entries(ledger.feeds[feed]).filter(([, entry]) => Date.parse(entry.lastSeen) >= cutoff),
    );
  }
  return out;
}

/**
 * An item's pubDate: the source's own timestamp when it is valid, not after firstSeen and less
 * than 24 hours before it; otherwise firstSeen. A late-arriving item is dated when it was first seen.
 */
export function pickPubDate(sourceTime: string | undefined, firstSeen: string): string {
  const source = sourceTime ? Date.parse(sourceTime) : NaN;
  const seen = Date.parse(firstSeen);
  if (!isNaN(source) && source <= seen && seen - source < DAY_MS) return new Date(source).toISOString();
  return firstSeen;
}
