import type { AlertRule, SyncCollection, SyncEvent, SyncLog, UserSettings } from '../../types';

/**
 * Deletion tracking for Gist sync. Sync stores state, so without a record of removals an item
 * deleted on one device returns from the other. SettingsContext diffs every settings update into
 * this log (latest add/remove per item); mergeSyncData then lets the latest event across both
 * devices decide. Items with no event count as present since time 0, so data without a log merges
 * as a plain union.
 */
export const SYNCED_LISTS = ['watchlistKeywords', 'stackKeywords', 'mutedKeywords', 'savedSearches', 'bookmarkFolders'] as const;
export type SyncedList = (typeof SYNCED_LISTS)[number];
const COLLECTIONS: readonly SyncCollection[] = [...SYNCED_LISTS, 'alertRules'];
const PURGE_REMOVED_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
// An event further in the future than this is garbled or from a badly skewed clock: it would win every merge and never be purged
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

type Events = Record<string, SyncEvent>;

const termKey = (term: string) => term.trim().toLowerCase();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ruleIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(r => r?.id).filter((id): id is string => typeof id === 'string') : [];
// Own properties only, so a term like "__proto__" or "constructor" never reads Object.prototype
const eventFor = (events: Events | undefined, key: string): SyncEvent | undefined =>
  events && Object.prototype.hasOwnProperty.call(events, key) ? events[key] : undefined;

/** The sync log after going from prev to next: adds and removals in the tracked lists, deleted alert rule ids */
export function recordListChanges(prev: Partial<UserSettings>, next: Partial<UserSettings>, now: Date): SyncLog | undefined {
  const at = now.toISOString();
  let log = next.syncLog;
  const add = (collection: SyncCollection, key: string, removed: boolean) => {
    log = { ...log, [collection]: { ...log?.[collection], [key]: { removed, at } } };
  };

  for (const list of SYNCED_LISTS) {
    if (prev[list] === next[list]) continue;
    const before = new Set(strings(prev[list]).map(termKey));
    const after = new Set(strings(next[list]).map(termKey));
    for (const key of after) if (!before.has(key)) add(list, key, false);
    for (const key of before) if (!after.has(key)) add(list, key, true);
  }

  if (prev.alertRules !== next.alertRules) {
    const after = new Set(ruleIds(next.alertRules));
    for (const id of ruleIds(prev.alertRules)) if (!after.has(id)) add('alertRules', id, true);
  }
  return log;
}

/** Both devices' lists, local spelling and order first, minus terms whose latest event is a removal */
export function mergeSyncedList(local: unknown, remote: unknown, events: Events): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...strings(local), ...strings(remote)]) {
    const key = termKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!eventFor(events, key)?.removed) out.push(term);
  }
  return out;
}

/** Drops alert rules deleted (on either device) after their last edit */
export function withoutDeletedRules(rules: AlertRule[], log: SyncLog): AlertRule[] {
  return rules.filter(rule => {
    const event = eventFor(log.alertRules, rule.id);
    return !event?.removed || Date.parse(event.at) <= Date.parse(rule.updatedAt);
  });
}

/** Latest event per key from both logs (a removal wins a tie); removals older than 90 days are purged */
export function mergeSyncLogs(a: SyncLog | undefined, b: SyncLog | undefined, now: Date): SyncLog {
  const cutoff = now.getTime() - PURGE_REMOVED_AFTER_MS;
  const out: SyncLog = {};
  for (const collection of COLLECTIONS) {
    const merged = new Map<string, SyncEvent>();
    for (const events of [a?.[collection], b?.[collection]]) {
      for (const [key, event] of Object.entries(events || {})) {
        const have = merged.get(key);
        const t = Date.parse(event.at);
        const haveT = have ? Date.parse(have.at) : -Infinity;
        if (t > haveT || (t === haveT && event.removed)) merged.set(key, event);
      }
    }
    const kept = [...merged].filter(([, e]) => !e.removed || Date.parse(e.at) >= cutoff);
    if (kept.length) out[collection] = Object.fromEntries(kept);
  }
  return out;
}

/**
 * The log to store when a backup is restored: the current and imported logs merged, plus an add event now for every
 * list term and alert rule in the backup, so restored items stick instead of being deleted again by an older tombstone.
 */
export function syncLogForImport(current: unknown, imported: Partial<UserSettings>, now: Date): SyncLog {
  const log = mergeSyncLogs(cleanSyncLog(current, now), cleanSyncLog(imported.syncLog, now), now);
  const at = now.toISOString();
  const added = (collection: SyncCollection, keys: string[]) => {
    if (keys.length) log[collection] = { ...log[collection], ...Object.fromEntries(keys.map(k => [k, { removed: false, at }])) };
  };
  for (const list of SYNCED_LISTS) added(list, strings(imported[list]).map(termKey));
  added('alertRules', ruleIds(imported.alertRules));
  return log;
}

/** Validates an untrusted (synced or imported) log: unknown collections, malformed entries and events dated more than a day ahead are dropped */
export function cleanSyncLog(raw: unknown, now: Date = new Date()): SyncLog | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const latest = now.getTime() + MAX_FUTURE_MS;
  const out: SyncLog = {};
  for (const collection of COLLECTIONS) {
    const events = (raw as Record<string, unknown>)[collection];
    if (!events || typeof events !== 'object' || Array.isArray(events)) continue;
    const kept = Object.entries(events).filter(([, e]) =>
      e && typeof e === 'object' && typeof e.removed === 'boolean' && typeof e.at === 'string' && Date.parse(e.at) <= latest,
    ) as [string, SyncEvent][];
    // fromEntries defines own properties, so a "__proto__" key stays an ordinary entry
    if (kept.length) out[collection] = Object.fromEntries(kept.map(([k, e]) => [k, { removed: e.removed, at: e.at }]));
  }
  return out;
}
