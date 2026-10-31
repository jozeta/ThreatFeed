import { cleanRuleList } from '../intelligence/alertRules';
import type { AlertRule } from '../../types';
import { exportAllThreatFeedData, getStoredValue, importThreatFeedData, saveStoredValue } from '../storage/indexeddb';

/**
 * Cross-device sync through a private GitHub Gist. The token lives in its own IndexedDB record,
 * never in settings, so it is not included in JSON backups or in the synced data itself.
 */
export interface GistSyncConfig {
  token: string;
  gistId?: string;
  lastSyncedAt?: string;
}

type SyncData = Awaited<ReturnType<typeof exportAllThreatFeedData>>;
type ArticleState = SyncData['articleStates'][number];

const CONFIG_KEY = 'gistSync';
const FILE_NAME = 'threatfeed-sync.json';
const API = 'https://api.github.com';

export const getSyncConfig = () => getStoredValue<GistSyncConfig>(CONFIG_KEY);
export const saveSyncConfig = (config: GistSyncConfig | null) => saveStoredValue(CONFIG_KEY, config);

const stateTime = (s: ArticleState) =>
  Math.max(...[s.updatedAt, s.readAt, s.viewedAt, s.bookmarkedAt].map(t => (t ? new Date(t).getTime() : 0)));

const union = (a: unknown, b: unknown) =>
  Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));

/**
 * Merges alert rules by id, newer updatedAt wins. Remote data is untrusted, so every rule is validated;
 * malformed ones are dropped. Deletes don't propagate: a rule removed on one device returns from the other.
 */
export function mergeAlertRules(local: AlertRule[], remote: AlertRule[]): AlertRule[] {
  return cleanRuleList([...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])]);
}

/**
 * Merges two devices' data: per-article state takes whichever side changed it last; feeds and
 * bookmarked articles are unioned (local wins on conflicts); settings stay local except keyword
 * lists, which are unioned so a term added on either device survives.
 */
export function mergeSyncData(local: SyncData, remote: Partial<SyncData>): SyncData {
  const states = new Map<string, ArticleState>(local.articleStates.map(s => [s.id, s]));
  for (const s of remote.articleStates || []) {
    const mine = states.get(s.id);
    if (!mine || stateTime(s) > stateTime(mine)) states.set(s.id, s);
  }

  const feeds = new Map(local.feeds.map(f => [f.id, f]));
  for (const f of remote.feeds || []) if (!feeds.has(f.id)) feeds.set(f.id, f);

  const articles = new Map(local.bookmarkedArticles.map(a => [a.id, a]));
  for (const a of remote.bookmarkedArticles || []) if (!articles.has(a.id)) articles.set(a.id, a);

  const settings = local.settings && remote.settings
    ? {
        ...local.settings,
        watchlistKeywords: union(local.settings.watchlistKeywords, remote.settings.watchlistKeywords),
        stackKeywords: union(local.settings.stackKeywords, remote.settings.stackKeywords),
        mutedKeywords: union(local.settings.mutedKeywords, remote.settings.mutedKeywords),
        disabledCategories: union(local.settings.disabledCategories, remote.settings.disabledCategories),
        savedSearches: union(local.settings.savedSearches, remote.settings.savedSearches),
        bookmarkFolders: union(local.settings.bookmarkFolders, remote.settings.bookmarkFolders),
        alertRules: mergeAlertRules(local.settings.alertRules, remote.settings.alertRules),
        alertGapHours: local.settings.alertGapHours,
      }
    : local.settings || remote.settings || null;

  return {
    ...local,
    exportDate: new Date().toISOString(),
    feeds: [...feeds.values()],
    articleStates: [...states.values()],
    bookmarkedArticles: [...articles.values()],
    settings,
  };
}

async function github(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'GitHub rejected the token (check it has the "gist" scope)' : `GitHub API error ${res.status}: ${detail.slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Pull (if a gist exists), merge, write locally, push. Returns the updated config.
 * Callers should reload the app afterwards, as after a backup import.
 */
export async function syncNow(config: GistSyncConfig): Promise<GistSyncConfig> {
  const local = await exportAllThreatFeedData();
  let merged = local;

  let gistId = config.gistId;
  if (gistId) {
    const gist = await github(`/gists/${gistId}`, config.token);
    const file = gist.files?.[FILE_NAME];
    // Large gist files are truncated in the API response; fetch the raw file then
    const content = file?.truncated ? await (await fetch(file.raw_url)).text() : file?.content;
    if (content) merged = mergeSyncData(local, JSON.parse(content));
  }

  await importThreatFeedData(merged);

  const body = JSON.stringify({ description: 'ThreatFeed sync data', files: { [FILE_NAME]: { content: JSON.stringify(merged) } } });
  if (gistId) {
    await github(`/gists/${gistId}`, config.token, { method: 'PATCH', body });
  } else {
    const created = await github('/gists', config.token, { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), public: false }) });
    gistId = created.id as string;
  }

  const updated = { ...config, gistId, lastSyncedAt: new Date().toISOString() };
  await saveSyncConfig(updated);
  return updated;
}
