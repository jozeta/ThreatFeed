import { cleanRuleList } from '../intelligence/alertRules';
import type { AlertRule, SyncLog } from '../../types';
import { cleanSyncLog, mergeSyncedList, mergeSyncLogs, withoutDeletedRules, type SyncedList } from './syncLog';
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

/**
 * Merges alert rules by id, newer updatedAt wins. Remote data is untrusted, so every rule is validated;
 * malformed ones are dropped. A rule deleted on either device (tombstone in the merged sync log) stays
 * deleted unless it was edited after the deletion.
 */
export function mergeAlertRules(local: AlertRule[], remote: AlertRule[], syncLog: SyncLog = {}): AlertRule[] {
  return withoutDeletedRules(cleanRuleList([...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])]), syncLog);
}

/**
 * Merges two devices' data: per-article state takes whichever side changed it last; feeds and
 * bookmarked articles are unioned (local wins on conflicts); settings stay local (disabled categories too) except keyword
 * lists, saved searches, folders and alert rules, which are unioned minus what the merged sync log says was deleted
 * (the latest add/remove across both devices wins; data from before the log existed merges as a plain union).
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

  // The OSV lookup sends package names to a third party: it is a per-device opt-in and never arrives through sync
  let settings = local.settings || (remote.settings ? { ...remote.settings, npmOsvLookup: false } : null);
  if (local.settings && remote.settings) {
    const now = new Date();
    const syncLog = mergeSyncLogs(cleanSyncLog(local.settings.syncLog, now), cleanSyncLog(remote.settings.syncLog, now), now);
    const list = (key: SyncedList) =>
      mergeSyncedList(local.settings![key], remote.settings![key], syncLog[key] || {});
    settings = {
      ...local.settings,
      watchlistKeywords: list('watchlistKeywords'),
      stackKeywords: list('stackKeywords'),
      mutedKeywords: list('mutedKeywords'),
      savedSearches: list('savedSearches'),
      bookmarkFolders: list('bookmarkFolders'),
      npmPackages: list('npmPackages'),
      alertRules: mergeAlertRules(local.settings.alertRules, remote.settings.alertRules, syncLog),
      alertGapHours: local.settings.alertGapHours,
      syncLog,
    };
  }

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

  await importThreatFeedData(merged, { fromSync: true });

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
