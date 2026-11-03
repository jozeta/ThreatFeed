import { describe, expect, it } from 'vitest';
import { mergeSyncData, mergeAlertRules } from './gistSync';
import type { AlertRule } from '../../types';
import { article, feed } from '../../test/fixtures';

const data = (overrides: any) => ({ version: '1.1', exportDate: '', feeds: [], articleStates: [], bookmarkedArticles: [], settings: null, ...overrides });

describe('mergeSyncData', () => {
  it('keeps the local disabled categories and does not merge in the remote ones', () => {
    const local = data({ settings: { watchlistKeywords: [], disabledCategories: ['Policy'] } });
    const remote = data({ settings: { watchlistKeywords: [], disabledCategories: ['Research', 'Vulnerabilities'] } });
    const merged = mergeSyncData(local as any, remote) as any;
    expect(merged.settings.disabledCategories).toEqual(['Policy']);
  });

  it('takes the most recently changed state per article, including un-bookmarking', () => {
    const local = data({ articleStates: [
      { id: 'a', read: true, viewed: true, bookmarked: false, updatedAt: '2026-10-28T10:00:00Z' }, // un-bookmarked later
      { id: 'b', read: false, viewed: false, bookmarked: false, updatedAt: '2026-10-01T00:00:00Z' },
    ] });
    const remote = data({ articleStates: [
      { id: 'a', read: true, viewed: true, bookmarked: true, bookmarkedAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' },
      { id: 'b', read: true, viewed: true, bookmarked: false, readAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' },
      { id: 'c', read: true, viewed: false, bookmarked: false, updatedAt: '2026-10-20T00:00:00Z' },
    ] });
    const merged = mergeSyncData(local, remote);
    const byId = Object.fromEntries(merged.articleStates.map(s => [s.id, s]));
    expect(byId.a.bookmarked).toBe(false);
    expect(byId.b.read).toBe(true);
    expect(byId.c).toBeDefined();
  });

  it('unions feeds, bookmarked articles and keyword lists', () => {
    const local = data({ feeds: [feed({ id: 'x' })], bookmarkedArticles: [article('1')], settings: { watchlistKeywords: ['LockBit'], stackKeywords: [], mutedKeywords: [], savedSearches: [], bookmarkFolders: ['General'] } });
    const remote = data({ feeds: [feed({ id: 'x', name: 'Renamed' }), feed({ id: 'y' })], bookmarkedArticles: [article('2')], settings: { watchlistKeywords: ['Akira'], stackKeywords: ['Okta'] } });
    const merged = mergeSyncData(local as any, remote);
    expect(merged.feeds.map(f => f.id)).toEqual(['x', 'y']);
    expect(merged.feeds[0].name).toBe('Test Feed'); // local wins on conflict
    expect(merged.bookmarkedArticles.map(a => a.id)).toEqual(['1', '2']);
    expect(merged.settings!.watchlistKeywords).toEqual(['LockBit', 'Akira']);
    expect(merged.settings!.stackKeywords).toEqual(['Okta']);
  });
});

describe('mergeSyncData deletions (TEST-008)', () => {
  const recent = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const lists = { watchlistKeywords: [], stackKeywords: [], savedSearches: [], bookmarkFolders: [] };
  // Device A deleted "deal" a day ago; device B still has it and never touched it
  const a = data({ settings: { ...lists, mutedKeywords: ['webinar'], syncLog: { mutedKeywords: { deal: { removed: true, at: recent(1) } } } } });
  const b = data({ settings: { ...lists, mutedKeywords: ['Deal', 'webinar'] } });

  it('removes a term deleted on one device from both, whichever side merges', () => {
    expect((mergeSyncData(a as any, b) as any).settings.mutedKeywords).toEqual(['webinar']);
    const onB = mergeSyncData(b as any, a) as any;
    expect(onB.settings.mutedKeywords).toEqual(['webinar']);
    expect(onB.settings.syncLog.mutedKeywords.deal.removed).toBe(true); // B carries the tombstone onward
  });

  it('keeps a term re-added on the other device after the deletion', () => {
    const readded = data({ settings: { ...lists, mutedKeywords: ['webinar', 'deal'], syncLog: { mutedKeywords: { deal: { removed: false, at: recent(0) } } } } });
    expect((mergeSyncData(a as any, readded) as any).settings.mutedKeywords).toEqual(['webinar', 'deal']);
    expect((mergeSyncData(readded as any, a) as any).settings.mutedKeywords).toEqual(['webinar', 'deal']);
  });

  it('unions as before when neither side has a sync log (old format)', () => {
    const old = data({ settings: { ...lists, mutedKeywords: ['deal'] } });
    expect((mergeSyncData(b as any, old) as any).settings.mutedKeywords).toEqual(['Deal', 'webinar']);
  });

  it('ignores a malformed remote sync log', () => {
    const bad = data({ settings: { ...lists, mutedKeywords: [], syncLog: { mutedKeywords: { webinar: { removed: 'yes', at: 'never' } } } } });
    expect((mergeSyncData(b as any, bad) as any).settings.mutedKeywords).toEqual(['Deal', 'webinar']);
  });
});

describe('mergeAlertRules', () => {
  const rule = (id: string, over: Partial<AlertRule> = {}): AlertRule => ({
    id, name: id, kind: 'news', enabled: true, notify: false,
    root: { op: 'all', items: [{ field: 'keyword', values: ['x'] }] },
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over,
  });
  const builtIn = (id: AlertRule['builtIn'], over: Partial<AlertRule> = {}) =>
    rule(id!, { builtIn: id, kind: id === 'stack-vulns' || id === 'watched-cves' ? 'vulns' : 'news', root: { op: 'any', items: [] }, ...over });

  it('lets the newer updatedAt win and keeps rules that exist on one side only', () => {
    const local = [rule('a', { name: 'old' }), rule('only-local')];
    const remote = [rule('a', { name: 'new', updatedAt: '2026-10-05T00:00:00Z' }), rule('only-remote')];
    const out = mergeAlertRules(local, remote);
    expect(out.find(r => r.id === 'a')!.name).toBe('new');
    expect(out.map(r => r.id).sort()).toEqual(['a', 'only-local', 'only-remote']);
  });

  it('sorts built-ins first, then by createdAt', () => {
    const out = mergeAlertRules(
      [rule('late', { createdAt: '2026-10-09T00:00:00Z' }), builtIn('watchlist')],
      [rule('early', { createdAt: '2026-10-02T00:00:00Z' }), builtIn('stack-news')],
    );
    expect(out.map(r => r.id)).toEqual(['watchlist', 'stack-news', 'early', 'late']);
  });

  it('drops malformed rules without throwing', () => {
    const bad = [
      rule('null-item', { root: { op: 'all', items: [null] } as any }),
      rule('no-field', { root: { op: 'all', items: [{ values: ['x'] }] } as any }),
      rule('nested-bad', { root: { op: 'all', items: [{ op: 'any', items: [42] }] } as any }),
      rule('bad-root', { root: { op: 'xor', items: [] } as any }),
      null, 'junk',
    ] as unknown as AlertRule[];
    const nested = rule('nested-ok', { root: { op: 'all', items: [{ op: 'any', items: [{ field: 'keyword', values: ['y'] }] }] } as any });
    let out: AlertRule[] = [];
    expect(() => { out = mergeAlertRules([nested], bad); }).not.toThrow();
    expect(out.map(r => r.id)).toEqual(['nested-ok']);
    expect(() => mergeAlertRules([], undefined as any)).not.toThrow();
  });

  it('collapses duplicate ids to the newer one', () => {
    const out = mergeAlertRules([], [
      rule('d', { name: 'older' }),
      rule('d', { name: 'newer', updatedAt: '2026-10-03T00:00:00Z' }),
      rule('d', { name: 'oldest', updatedAt: '2026-09-01T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('newer');
  });

  it('normalizes a built-in with a wrong kind or name, keeping only enabled/notify', () => {
    const out = mergeAlertRules([], [builtIn('stack-vulns', {
      kind: 'news', name: 'Hacked', enabled: false, notify: true,
      root: { op: 'all', items: [{ field: 'keyword', values: ['z'] }] } as any,
    })]);
    expect(out[0]).toMatchObject({ id: 'stack-vulns', builtIn: 'stack-vulns', kind: 'vulns', name: 'My Stack (vulns)', enabled: false, notify: true });
    expect(out[0].root).toEqual({ op: 'any', items: [] });
  });

  it('propagates a deleted rule, unless the other device edited it after the deletion', () => {
    const syncLog = { alertRules: { gone: { removed: true, at: '2026-10-10T00:00:00Z' }, edited: { removed: true, at: '2026-10-10T00:00:00Z' } } };
    const local = data({ settings: { alertRules: [rule('kept')], syncLog } });
    const remote = data({ settings: { alertRules: [rule('kept'), rule('gone'), rule('edited', { updatedAt: '2026-10-11T00:00:00Z' })] } });
    for (const merged of [mergeSyncData(local as any, remote) as any, mergeSyncData(remote as any, local) as any]) {
      expect(merged.settings.alertRules.map((r: AlertRule) => r.id).sort()).toEqual(['edited', 'kept']);
    }
  });

  it('is wired into mergeSyncData along with the local alert gap', () => {
    const local = data({ settings: { alertRules: [rule('l')], alertGapHours: 4 } });
    const remote = data({ settings: { alertRules: [rule('r')], alertGapHours: 12 } });
    const merged = mergeSyncData(local as any, remote) as any;
    expect(merged.settings.alertRules.map((r: AlertRule) => r.id).sort()).toEqual(['l', 'r']);
    expect(merged.settings.alertGapHours).toBe(4);
  });
});
