import { describe, expect, it } from 'vitest';
import { cleanSyncLog, mergeSyncLogs, mergeSyncedList, recordListChanges, syncLogForImport, withoutDeletedRules } from './syncLog';
import type { AlertRule, SyncLog } from '../../types';

const NOW = new Date('2026-11-03T12:00:00Z');
const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';

describe('recordListChanges', () => {
  it('records adds and removals per lowercased term, keeping earlier events', () => {
    const prev = { mutedKeywords: ['Deal', 'webinar'], stackKeywords: [], syncLog: { mutedKeywords: { old: { removed: true, at: T1 } } } };
    const log = recordListChanges(prev, { ...prev, mutedKeywords: ['webinar', 'Sponsored'] }, NOW)!;
    expect(log.mutedKeywords).toEqual({
      old: { removed: true, at: T1 },
      deal: { removed: true, at: NOW.toISOString() },
      sponsored: { removed: false, at: NOW.toISOString() },
    });
    expect(log.stackKeywords).toBeUndefined();
  });

  it('returns the same log when no tracked list changed (case-only edits included)', () => {
    const prev = { watchlistKeywords: ['LockBit'], syncLog: {} as SyncLog };
    expect(recordListChanges(prev, { ...prev, watchlistKeywords: ['lockbit'] }, NOW)).toBe(prev.syncLog);
    expect(recordListChanges({}, {}, NOW)).toBeUndefined();
  });

  it('records adds and removals of watched npm packages', () => {
    const log = recordListChanges({ npmPackages: ['lodash@4.17.15', 'express'] }, { npmPackages: ['express', '@types/node'] }, NOW)!;
    expect(log.npmPackages).toEqual({
      'lodash@4.17.15': { removed: true, at: NOW.toISOString() },
      '@types/node': { removed: false, at: NOW.toISOString() },
    });
  });

  it('tombstones deleted alert rules by id', () => {
    const rule = (id: string) => ({ id } as AlertRule);
    const log = recordListChanges({ alertRules: [rule('a'), rule('B')] }, { alertRules: [rule('a')] }, NOW)!;
    expect(log.alertRules).toEqual({ B: { removed: true, at: NOW.toISOString() } });
  });
});

describe('mergeSyncedList', () => {
  const events = (removedAt?: string, addedAt?: string) => {
    const e: Record<string, { removed: boolean; at: string }> = {};
    if (removedAt) e.deal = { removed: true, at: removedAt };
    if (addedAt && (!removedAt || addedAt > removedAt)) e.deal = { removed: false, at: addedAt };
    return e;
  };

  it('drops a term deleted on one device that the other still has, in both merge orders', () => {
    const log = events(T1);
    expect(mergeSyncedList(['webinar'], ['Deal', 'webinar'], log)).toEqual(['webinar']);
    expect(mergeSyncedList(['Deal', 'webinar'], ['webinar'], log)).toEqual(['webinar']);
  });

  it('keeps a term re-added after the deletion', () => {
    expect(mergeSyncedList(['webinar'], ['webinar', 'deal'], events(T1, T2))).toEqual(['webinar', 'deal']);
  });

  it('unions when there are no events, keeping local spelling and order', () => {
    expect(mergeSyncedList(['LockBit', 'Akira'], ['lockbit', 'Play', 7], {})).toEqual(['LockBit', 'Akira', 'Play']);
    expect(mergeSyncedList(undefined, ['x'], {})).toEqual(['x']);
  });
});

describe('mergeSyncLogs', () => {
  it('keeps the latest event per key, removal on a tie, and purges removals older than 90 days', () => {
    const a: SyncLog = { mutedKeywords: { deal: { removed: true, at: T1 }, tie: { removed: false, at: T1 }, ancient: { removed: true, at: '2026-07-01T00:00:00Z' } } };
    const b: SyncLog = { mutedKeywords: { deal: { removed: false, at: T2 }, tie: { removed: true, at: T1 }, oldAdd: { removed: false, at: '2026-01-01T00:00:00Z' } } };
    for (const merged of [mergeSyncLogs(a, b, NOW), mergeSyncLogs(b, a, NOW)]) {
      expect(merged.mutedKeywords).toEqual({
        deal: { removed: false, at: T2 },
        tie: { removed: true, at: T1 },
        oldAdd: { removed: false, at: '2026-01-01T00:00:00Z' },
      });
    }
  });
});

describe('withoutDeletedRules', () => {
  const rule = (id: string, updatedAt: string) => ({ id, updatedAt } as AlertRule);
  it('drops a rule whose tombstone is newer than its last edit, keeps one edited after it', () => {
    const log: SyncLog = { alertRules: { gone: { removed: true, at: T2 }, edited: { removed: true, at: T1 } } };
    const out = withoutDeletedRules([rule('gone', T1), rule('edited', T2), rule('other', T1)], log);
    expect(out.map(r => r.id)).toEqual(['edited', 'other']);
  });
});

describe('cleanSyncLog', () => {
  it('drops malformed collections and entries', () => {
    const raw = {
      mutedKeywords: { ok: { removed: true, at: T1 }, badDate: { removed: true, at: 'nope' }, badFlag: { removed: 'yes', at: T1 }, nul: null },
      unknownList: { x: { removed: true, at: T1 } },
      stackKeywords: 'junk',
      alertRules: [],
    };
    expect(cleanSyncLog(raw)).toEqual({ mutedKeywords: { ok: { removed: true, at: T1 } } });
    expect(cleanSyncLog(null)).toBeUndefined();
    expect(cleanSyncLog([1])).toBeUndefined();
  });

  it('drops events dated more than a day in the future', () => {
    const raw = { mutedKeywords: { soon: { removed: true, at: '2026-11-04T06:00:00Z' }, far: { removed: true, at: '2026-11-05T00:00:00Z' } } };
    expect(cleanSyncLog(raw, NOW)).toEqual({ mutedKeywords: { soon: { removed: true, at: '2026-11-04T06:00:00Z' } } });
  });

  it('does not let a __proto__ key touch the prototype', () => {
    const log = cleanSyncLog(JSON.parse(`{"mutedKeywords":{"__proto__":{"removed":true,"at":"${T1}"}}}`))!;
    expect(Object.getPrototypeOf(log.mutedKeywords)).toBe(Object.prototype);
    expect(mergeSyncedList(['__proto__', 'x'], [], log.mutedKeywords!)).toEqual(['x']);
  });
});

describe('syncLogForImport', () => {
  it('merges the current and backup logs and marks every restored item as added now', () => {
    const current: SyncLog = { mutedKeywords: { deal: { removed: true, at: T2 } }, alertRules: { r1: { removed: true, at: T2 } } };
    const imported = {
      mutedKeywords: ['Deal'], watchlistKeywords: ['Akira'],
      alertRules: [{ id: 'r1' } as AlertRule],
      syncLog: { stackKeywords: { okta: { removed: true, at: T1 } }, savedSearches: { bad: { removed: 'x', at: T1 } } },
    };
    const log = syncLogForImport(current, imported as any, NOW);
    const now = { removed: false, at: NOW.toISOString() };
    expect(log).toEqual({
      mutedKeywords: { deal: now },
      watchlistKeywords: { akira: now },
      stackKeywords: { okta: { removed: true, at: T1 } },
      alertRules: { r1: now },
    });
    // a restored rule then survives the merge against the older tombstone
    expect(withoutDeletedRules([{ id: 'r1', updatedAt: T1 } as AlertRule], log)).toHaveLength(1);
  });

  it('works for a backup without a log and with no current log', () => {
    expect(syncLogForImport(undefined, { npmPackages: ['Express'] }, NOW)).toEqual({ npmPackages: { express: { removed: false, at: NOW.toISOString() } } });
    expect(syncLogForImport(undefined, { bookmarkFolders: ['General'] }, NOW)).toEqual({ bookmarkFolders: { general: { removed: false, at: NOW.toISOString() } } });
  });
});
