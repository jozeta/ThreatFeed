import { describe, expect, it } from 'vitest';
import { isRefreshDue, shouldPauseWhenHidden, PendingFeedQueue, shouldApplySnapshot, snapshotApplyKey } from './refreshPlanning';

describe('snapshotApplyKey / shouldApplySnapshot', () => {
  it('is independent of feed order and duplicates', () => {
    expect(snapshotApplyKey('t1', ['b', 'a', 'b'])).toBe(snapshotApplyKey('t1', ['a', 'b']));
  });

  it('applies when nothing was applied before', () => {
    expect(shouldApplySnapshot(snapshotApplyKey('t1', ['a']), null)).toBe(true);
    expect(shouldApplySnapshot(snapshotApplyKey('t1', ['a']), undefined)).toBe(true);
  });

  it('skips the same snapshot with the same covered feeds', () => {
    const key = snapshotApplyKey('t1', ['a', 'b']);
    expect(shouldApplySnapshot(key, snapshotApplyKey('t1', ['b', 'a']))).toBe(false);
  });

  it('re-applies when the snapshot is newer', () => {
    expect(shouldApplySnapshot(snapshotApplyKey('t2', ['a']), snapshotApplyKey('t1', ['a']))).toBe(true);
  });

  it('re-applies when the covered feed set changed (category toggled, feed added or removed)', () => {
    const last = snapshotApplyKey('t1', ['a', 'b']);
    expect(shouldApplySnapshot(snapshotApplyKey('t1', ['a']), last)).toBe(true);
    expect(shouldApplySnapshot(snapshotApplyKey('t1', ['a', 'b', 'c']), last)).toBe(true);
  });
});

describe('isRefreshDue', () => {
  const min = 60 * 1000;
  it('is due once the interval has passed', () => {
    expect(isRefreshDue(0, 30 * min, 30)).toBe(true);
    expect(isRefreshDue(0, 30 * min - 1, 30)).toBe(false);
  });
  it('is never due when auto-refresh is off', () => {
    expect(isRefreshDue(0, 999 * min, 0)).toBe(false);
  });
});

describe('PendingFeedQueue', () => {
  it('collects ids without duplicates and drains once', () => {
    const q = new PendingFeedQueue();
    q.add(['a', 'b']);
    q.add(['b', 'c']);
    expect(q.size).toBe(3);
    expect(q.drain()).toEqual(['a', 'b', 'c']);
    expect(q.size).toBe(0);
    expect(q.drain()).toEqual([]);
  });
});

describe('PendingFeedQueue follow-up flow', () => {
  it('keeps requests made during a refresh and hands each out only once', () => {
    const q = new PendingFeedQueue();
    q.add(['custom-1']);
    q.add(['custom-2', 'custom-3']);
    q.add(['custom-1']);
    expect(q.drain()).toEqual(['custom-1', 'custom-2', 'custom-3']);
    // Requests arriving after the drain belong to the next follow-up
    q.add(['custom-4']);
    expect(q.drain()).toEqual(['custom-4']);
  });
});

describe('shouldPauseWhenHidden', () => {
  const notifying = [{ enabled: true, notify: true }];
  it('never pauses a visible tab', () => {
    expect(shouldPauseWhenHidden(false, 'default', [])).toBe(false);
  });
  it('pauses a hidden tab that cannot notify', () => {
    expect(shouldPauseWhenHidden(true, undefined, notifying)).toBe(true);
    expect(shouldPauseWhenHidden(true, 'default', notifying)).toBe(true);
    expect(shouldPauseWhenHidden(true, 'denied', notifying)).toBe(true);
    expect(shouldPauseWhenHidden(true, 'granted', [])).toBe(true);
    expect(shouldPauseWhenHidden(true, 'granted', [{ enabled: true, notify: false }, { enabled: false, notify: true }])).toBe(true);
  });
  it('keeps a hidden tab refreshing when permission is granted and an enabled rule notifies', () => {
    expect(shouldPauseWhenHidden(true, 'granted', [{ enabled: false, notify: false }, ...notifying])).toBe(false);
  });
});
