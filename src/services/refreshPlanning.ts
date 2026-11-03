// Pure decisions for the refresh flow in FeedContext, kept here so they can be unit-tested.

/** Identifies what applying a snapshot would write: the snapshot build plus the feeds it covers. */
export function snapshotApplyKey(generatedAt: string, coveredFeedIds: Iterable<string>): string {
  return `${generatedAt}|${[...new Set(coveredFeedIds)].sort().join(',')}`;
}

/** False when the snapshot with this key was already applied, so re-applying would only burn CPU. */
export function shouldApplySnapshot(key: string, lastAppliedKey: string | null | undefined): boolean {
  return key !== lastAppliedKey;
}

/** True when a visible tab has gone longer than the auto-refresh interval without a refresh. */
export function isRefreshDue(lastRefreshStartedAt: number, now: number, intervalMinutes: number): boolean {
  return intervalMinutes > 0 && now - lastRefreshStartedAt >= intervalMinutes * 60 * 1000;
}

/**
 * True when a hidden tab should skip the auto-refresh. A tab that can send desktop notifications keeps
 * refreshing: alert checks run on that tab's in-memory data, so pausing it would silence them.
 */
export function shouldPauseWhenHidden(
  hidden: boolean,
  notificationPermission: NotificationPermission | undefined,
  rules: ReadonlyArray<{ enabled: boolean; notify: boolean }>
): boolean {
  if (!hidden) return false;
  const canNotify = notificationPermission === 'granted' && rules.some(r => r.enabled && r.notify);
  return !canNotify;
}

/**
 * Feed ids requested while a refresh was running. They are fetched in one follow-up refresh
 * once the running one ends.
 */
export class PendingFeedQueue {
  private ids = new Set<string>();

  add(feedIds: Iterable<string>): void {
    for (const id of feedIds) this.ids.add(id);
  }

  /** Returns the queued ids and empties the queue. */
  drain(): string[] {
    const out = [...this.ids];
    this.ids.clear();
    return out;
  }

  get size(): number {
    return this.ids.size;
  }
}
