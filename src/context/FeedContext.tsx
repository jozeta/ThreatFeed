import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Article, CveIntel, Feed, FeedHealth } from '../types';
import {
  getAllArticlesFromDB,
  saveArticlesToDB,
  updateArticleStateInDB,
  markAllArticlesAsReadInDB,
  getFeedsFromDB,
  saveFeedsToDB,
  saveSingleFeedToDB,
  deleteFeedFromDB,
  getAllFeedHealthFromDB,
  saveFeedHealthToDB,
  deleteArticlesFromDB,
  getStoredValue,
  saveStoredValue
} from '../services/storage/indexeddb';
import { loadSnapshot } from '../services/snapshot';
import { notifyWatchlistMatches } from '../services/notifications';
import { safeHttpUrl, sanitizeStoredArticle } from '../services/rss/sanitizer';
import { fetchAllFeeds, fetchFeed, resolveCanonicalFeedUrl } from '../services/rss/fetcher';
import { rescoreArticle } from '../services/rss/parser';
import { deduplicateArticles } from '../services/articles/deduplication';
import { isExpired, mergeFetchedArticles } from '../services/articles/merge';
import { useSettings } from './SettingsContext';

interface RefreshProgress {
  completed: number;
  total: number;
  currentFeedName?: string;
}

interface RefreshOptions {
  // Load the server-built snapshot first and only fetch live the feeds it doesn't cover
  useSnapshot?: boolean;
  // Skip feeds that keep failing (see BACKOFF_*) instead of waiting on them every time
  skipBackedOff?: boolean;
}

// A feed that failed this many refreshes in a row is only retried once per BACKOFF_RETRY_MS
// during automatic refreshes; manual refreshes still try it.
const BACKOFF_AFTER_FAILURES = 5;
const BACKOFF_RETRY_MS = 60 * 60 * 1000;

export function isBackedOff(health: FeedHealth | undefined, now = Date.now()): boolean {
  if (!health || (health.consecutiveFailures ?? 0) < BACKOFF_AFTER_FAILURES) return false;
  return now - new Date(health.lastFetchedAt || 0).getTime() < BACKOFF_RETRY_MS;
}

interface FeedContextType {
  feeds: Feed[];
  cveIntel: Record<string, CveIntel>;
  snapshotGeneratedAt: string | null; // when the server snapshot in use was built by the GitHub Action
  articles: Article[];
  feedHealth: Record<string, FeedHealth>;
  isRefreshing: boolean;
  refreshProgress: RefreshProgress;
  lastUpdated: Date | null;
  isOffline: boolean;
  activeArticle: Article | null;
  setActiveArticle: (article: Article | null) => void;
  refreshFeeds: (targetFeedId?: string) => Promise<void>;
  refreshFailedFeeds: () => Promise<void>;
  toggleFeedEnabled: (feedId: string) => Promise<void>;
  addCustomFeed: (newFeed: Omit<Feed, 'id'>) => Promise<void>;
  addCustomFeeds: (newFeeds: Omit<Feed, 'id'>[]) => Promise<number>;
  updateFeed: (feed: Feed) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
  resetFeedsToDefault: () => Promise<void>;
  toggleBookmark: (articleId: string) => Promise<void>;
  setBookmarkFolder: (articleId: string, folder: string) => Promise<void>;
  setBookmarkNotes: (articleId: string, notes: string) => Promise<void>;
  toggleRead: (articleId: string) => Promise<void>;
  markViewed: (articleId: string) => Promise<void>;
  markAllAsRead: (ids?: string[]) => Promise<void>;
  addCustomTagToArticle: (articleId: string, tag: string) => Promise<void>;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

export const FeedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [feedHealth, setFeedHealth] = useState<Record<string, FeedHealth>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress>({ completed: 0, total: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [cveIntel, setCveIntel] = useState<Record<string, CveIntel>>({});
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null);

  // Latest values for async work started from older renders (init timer, auto-refresh interval)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const feedHealthRef = useRef(feedHealth);
  feedHealthRef.current = feedHealth;
  const cveIntelRef = useRef(cveIntel);
  cveIntelRef.current = cveIntel;

  // Monitor online / offline connectivity
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize feeds and cached articles from IndexedDB
  const initLoadedRef = useRef(false);

  const initData = useCallback(async () => {
    try {
      // 1. Load feeds
      let storedFeeds = await getFeedsFromDB();
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/feeds.json`);
        if (res.ok) {
          const data = await res.json();
          const defaultFeeds: Feed[] = data.feeds || [];
          if (!storedFeeds || storedFeeds.length === 0) {
            storedFeeds = defaultFeeds;
            await saveFeedsToDB(storedFeeds);
          } else {
            // Automatically merge newly introduced default feeds while preserving user customizations
            const existingIds = new Set(storedFeeds.map(f => f.id));
            const newFeeds = defaultFeeds.filter(f => !existingIds.has(f.id));
            
            // Also update any existing default feed whose URL was corrected/updated upstream
            const defaultMap = new Map(defaultFeeds.map(f => [f.id, f]));
            storedFeeds = storedFeeds.map(stored => {
              const canonicalUrl = resolveCanonicalFeedUrl(stored.url);
              if (canonicalUrl !== stored.url) {
                return { ...stored, url: canonicalUrl };
              }
              const def = defaultMap.get(stored.id);
              if (def && def.url !== stored.url && !stored.isCustom) {
                return { ...stored, url: def.url, category: def.category, tags: def.tags };
              }
              return stored;
            });

            if (newFeeds.length > 0) {
              storedFeeds = [...storedFeeds, ...newFeeds];
            }
            await saveFeedsToDB(storedFeeds);
          }
        }
      } catch (fetchErr) {
        console.warn('Could not load /data/feeds.json:', fetchErr);
      }
      storedFeeds = storedFeeds || [];
      setFeeds(storedFeeds);

      // 2. Load health
      const healthMap = await getAllFeedHealthFromDB();
      setFeedHealth(healthMap);

      // 3. Load articles, dropping expired ones and those whose feed was removed (bookmarks always stay)
      const maxAgeDays = settingsRef.current.maxArticleAgeDays ?? 30;
      const feedById = new Map(storedFeeds.map(f => [f.id, f]));
      const isKept = (a: Article) => a.bookmarked || (feedById.has(a.sourceId) && !isExpired(a, maxAgeDays));

      const cachedArticles = await getAllArticlesFromDB();
      let storedArticles = cachedArticles.filter(isKept);
      const keptIds = new Set(storedArticles.map(a => a.id));
      await deleteArticlesFromDB(cachedArticles.filter(a => !keptIds.has(a.id)).map(a => a.id));

      try {
        const seedRes = await fetch(`${import.meta.env.BASE_URL}data/seed-articles.json`);
        if (seedRes.ok) {
          const seedData: unknown = await seedRes.json();
          if (Array.isArray(seedData)) {
            // Seed articles fill the page on first run (whatever their age; the first refresh prunes them).
            // Later, only seeds that are new and still in range are added.
            const isFirstRun = cachedArticles.length === 0;
            const newSeeds = seedData
              .map(sanitizeStoredArticle)
              .filter((s): s is Article => s !== null && !keptIds.has(s.id) && (isFirstRun || isKept(s)));
            if (newSeeds.length > 0) {
              storedArticles = deduplicateArticles([...storedArticles, ...newSeeds]);
              const addedIds = new Set(storedArticles.map(a => a.id));
              await saveArticlesToDB(newSeeds.filter(s => addedIds.has(s.id)));
            }
          }
        }
      } catch (seedErr) {
        console.warn('Could not load /data/seed-articles.json:', seedErr);
      }
      const storedIntel = (await getStoredValue<Record<string, CveIntel>>('cveIntel')) || {};
      cveIntelRef.current = storedIntel;
      setCveIntel(storedIntel);
      setSnapshotGeneratedAt(await getStoredValue<string>('snapshotGeneratedAt'));

      // Re-apply current tagging/severity rules, and drop non-http(s) links stored by older versions
      setArticles(storedArticles.map(a => ({
        ...rescoreArticle(a, feedById.get(a.sourceId), storedIntel),
        url: safeHttpUrl(a.url),
        image: safeHttpUrl(a.image) || undefined,
      })));

      // 4. Initial fetch if device is online to ingest latest dispatches
      if (navigator.onLine && storedFeeds.length > 0) {
        const initialFeeds = storedFeeds;
        setTimeout(() => {
          refreshFeedsInternal(initialFeeds, undefined, { useSnapshot: true, skipBackedOff: true });
        }, 300);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }, []);

  useEffect(() => {
    if (!initLoadedRef.current) {
      initLoadedRef.current = true;
      initData();
    }
  }, [initData]);

  // Synchronous in-flight guard: the isRefreshing state is captured per render, so callers
  // holding an older closure (init timer, auto-refresh interval) would otherwise see stale `false`.
  const refreshInFlightRef = useRef(false);

  // Core refresh logic. Reads settings/articles through refs, so it is safe to call from any closure.
  const refreshFeedsInternal = useCallback(async (feedsToFetch: Feed[], singleFeedId?: string, options: RefreshOptions = {}) => {
    if (refreshInFlightRef.current || !navigator.onLine) return;

    refreshInFlightRef.current = true;
    setIsRefreshing(true);

    const settings = settingsRef.current;
    const maxItems = settings.maxArticlesPerFeed ?? 25;
    const maxAgeDays = settings.maxArticleAgeDays ?? 30;

    const feedById = new Map(feedsRef.current.map(f => [f.id, f]));

    // Each feed's health also tracks how many refreshes in a row it has failed
    const withFailureCount = (h: FeedHealth): FeedHealth => ({
      ...h,
      consecutiveFailures: h.status === 'healthy' ? 0 : (feedHealthRef.current[h.feedId]?.consecutiveFailures ?? 0) + 1,
    });

    const applyFetched = async (fetchedItems: Article[]) => {
      // Score CVE-bearing articles with the latest KEV/EPSS data
      const intel = cveIntelRef.current;
      const newItems = fetchedItems.map(a => (a.cves?.length ? rescoreArticle(a, feedById.get(a.sourceId), intel) : a));
      // Work out the DB changes from the ref snapshot: title/date-based dedup and the age cutoff
      // don't depend on read state, so it agrees with the state update below.
      const before = articlesRef.current;
      const knownIds = new Set(before.map(a => a.id));
      const mergedSnapshot = mergeFetchedArticles(before, newItems, maxAgeDays);
      const after = new Set(mergedSnapshot.map(a => a.id));
      // Progressive merges can run several times before React re-renders; keep the ref current for the next one
      articlesRef.current = mergedSnapshot;
      setArticles(prev => mergeFetchedArticles(prev, newItems, maxAgeDays));
      // Persist fetched items that survived (near-duplicates of existing ones are dropped)
      await saveArticlesToDB(newItems.filter(a => after.has(a.id)));
      // Delete articles the merge pruned (expired), so they don't come back on reload
      await deleteArticlesFromDB(before.filter(a => !after.has(a.id)).map(a => a.id));

      // Desktop alert for genuinely new, recent articles that hit the watchlist (not on a first-ever load)
      if (settingsRef.current.watchlistNotifications && knownIds.size > 0) {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const fresh = mergedSnapshot.filter(a => !knownIds.has(a.id) && new Date(a.publishedAt).getTime() >= dayAgo);
        notifyWatchlistMatches(fresh, settingsRef.current.watchlistKeywords);
      }
    };

    const applyCveIntel = async (intel: Record<string, CveIntel>) => {
      cveIntelRef.current = intel;
      setCveIntel(intel);
      const rescore = (list: Article[]) => list.map(a => (a.cves?.length ? rescoreArticle(a, feedById.get(a.sourceId), intel) : a));
      articlesRef.current = rescore(articlesRef.current);
      setArticles(prev => rescore(prev));
      await saveStoredValue('cveIntel', intel);
    };

    try {
      if (singleFeedId) {
        const feed = feedsToFetch.find(f => f.id === singleFeedId);
        if (!feed) return;

        setRefreshProgress({ completed: 0, total: 1, currentFeedName: feed.name });
        const { articles: newItems, health } = await fetchFeed(
          feed,
          settings.proxyMode,
          settings.customProxyUrl,
          maxItems,
          maxAgeDays
        );
        
        const counted = withFailureCount(health);
        await saveFeedHealthToDB(counted);
        setFeedHealth(prev => ({ ...prev, [feed.id]: counted }));

        if (newItems.length > 0) {
          await applyFetched(newItems);
        }
        setRefreshProgress({ completed: 1, total: 1 });
      } else {
        let fetchedLive = false;

        if (options.useSnapshot && settings.dataSource !== 'live') {
          const snapshot = await loadSnapshot();
          if (snapshot) {
            await applyCveIntel(snapshot.cveIntel);
            const covered = new Set(feedsToFetch.filter(f => f.enabled && snapshot.feedHealth[f.id]).map(f => f.id));
            const healths = [...covered].map(id => snapshot.feedHealth[id]);
            setFeedHealth(prev => ({ ...prev, ...Object.fromEntries(healths.map(h => [h.feedId, h])) }));
            for (const h of healths) await saveFeedHealthToDB(h);
            await applyFetched(snapshot.articles.filter(a => covered.has(a.sourceId)));
            setLastUpdated(new Date(snapshot.generatedAt));
            setSnapshotGeneratedAt(snapshot.generatedAt);
            await saveStoredValue('snapshotGeneratedAt', snapshot.generatedAt);
            feedsToFetch = feedsToFetch.filter(f => !covered.has(f.id));
          }
        }

        if (options.skipBackedOff) {
          feedsToFetch = feedsToFetch.filter(f => !isBackedOff(feedHealthRef.current[f.id]));
        }

        const activeList = feedsToFetch.filter(f => f.enabled);
        if (activeList.length > 0) {
          fetchedLive = true;
          setRefreshProgress({ completed: 0, total: activeList.length });

          // Merge results while the refresh runs instead of after the slowest feed. Buffered and flushed
          // about once a second: merging per feed would re-render (and re-cluster) the page 100+ times.
          let pendingArticles: Article[] = [];
          let pendingHealth: FeedHealth[] = [];
          let flushTimer: ReturnType<typeof setTimeout> | null = null;
          let flushChain = Promise.resolve();

          const flush = () => {
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            const items = pendingArticles;
            const healths = pendingHealth;
            pendingArticles = [];
            pendingHealth = [];
            // Chained so DB writes from consecutive flushes never interleave
            flushChain = flushChain.then(async () => {
              if (healths.length > 0) {
                setFeedHealth(prev => ({ ...prev, ...Object.fromEntries(healths.map(h => [h.feedId, h])) }));
                for (const h of healths) await saveFeedHealthToDB(h);
              }
              if (items.length > 0) await applyFetched(items);
            }).catch(err => {
              // One failed flush must not stop later ones from applying
              console.error('Failed to apply refresh results:', err);
            });
            return flushChain;
          };

          await fetchAllFeeds(
            feedsToFetch,
            settings.proxyMode,
            settings.customProxyUrl,
            (completed, total, latestHealth, feedArticles) => {
              const curFeed = feedsToFetch.find(f => f.id === latestHealth.feedId);
              setRefreshProgress({ completed, total, currentFeedName: curFeed?.name });
              pendingHealth.push(withFailureCount(latestHealth));
              pendingArticles.push(...feedArticles);
              if (!flushTimer) flushTimer = setTimeout(flush, 1000);
            },
            maxItems,
            maxAgeDays
          );

          await flush();
        }
        if (fetchedLive) setLastUpdated(new Date());
      }
      if (singleFeedId) setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to refresh feeds:', err);
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const refreshFeeds = useCallback(async (targetFeedId?: string) => {
    await refreshFeedsInternal(feedsRef.current, targetFeedId, { useSnapshot: true });
  }, [refreshFeedsInternal]);

  const refreshFailedFeeds = useCallback(async () => {
    const failedList = feedsRef.current.filter(f => {
      const h = feedHealthRef.current[f.id];
      return f.enabled && (!h || h.status !== 'healthy');
    });
    if (failedList.length === 0) return;
    await refreshFeedsInternal(failedList);
  }, [refreshFeedsInternal]);

  // Auto-refresh: refetch enabled feeds whose last successful fetch is older than the per-feed
  // cooldown. Basing this on fetch time (not article age) means busy feeds still get refreshed.
  useEffect(() => {
    if (settings.autoRefreshMinutes <= 0) return;

    const timer = setInterval(() => {
      if (!navigator.onLine) return;
      // Snapshot mode: reload the (regularly rebuilt) snapshot; only feeds it lacks are fetched live
      if (settingsRef.current.dataSource !== 'live') {
        refreshFeedsInternal(feedsRef.current, undefined, { useSnapshot: true, skipBackedOff: true });
        return;
      }
      const cooldownHours = settingsRef.current.autoRefreshFeedCooldownHours ?? 1;
      const cutoffMs = Date.now() - cooldownHours * 60 * 60 * 1000;

      const feedsToFetch = feedsRef.current.filter(feed => {
        if (!feed.enabled) return false;
        if (cooldownHours <= 0) return true;
        const lastSuccess = feedHealthRef.current[feed.id]?.lastSuccessAt;
        return !lastSuccess || new Date(lastSuccess).getTime() <= cutoffMs;
      });

      if (feedsToFetch.length === 0) {
        console.log(`[Auto-Refresh] All feeds fetched within the last ${cooldownHours}h. Skipping cycle.`);
        return;
      }
      refreshFeedsInternal(feedsToFetch, undefined, { skipBackedOff: true });
    }, settings.autoRefreshMinutes * 60 * 1000);

    return () => clearInterval(timer);
  }, [settings.autoRefreshMinutes, refreshFeedsInternal]);

  // Feed management operations
  const toggleFeedEnabled = useCallback(async (feedId: string) => {
    const updated = feedsRef.current.map(f => f.id === feedId ? { ...f, enabled: !f.enabled } : f);
    setFeeds(updated);
    await saveFeedsToDB(updated);
  }, []);

  // Adds feeds in one state update (e.g. an OPML import), skipping URLs that are already subscribed.
  // Returns how many feeds were actually added.
  const addCustomFeeds = useCallback(async (newFeedsData: Omit<Feed, 'id'>[]): Promise<number> => {
    const knownUrls = new Set(feedsRef.current.map(f => resolveCanonicalFeedUrl(f.url)));
    const added: Feed[] = [];
    for (const data of newFeedsData) {
      const url = resolveCanonicalFeedUrl(data.url);
      if (knownUrls.has(url)) continue;
      knownUrls.add(url);
      added.push({
        ...data,
        url,
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        isCustom: true
      });
    }
    if (added.length === 0) return 0;

    setFeeds(prev => [...prev, ...added]);
    for (const feed of added) {
      await saveSingleFeedToDB(feed);
    }
    // Fetch the new feeds immediately
    refreshFeedsInternal(added);
    return added.length;
  }, [refreshFeedsInternal]);

  const addCustomFeed = useCallback(async (newFeedData: Omit<Feed, 'id'>) => {
    await addCustomFeeds([newFeedData]);
  }, [addCustomFeeds]);

  const updateFeed = useCallback(async (updatedFeed: Feed) => {
    const canonicalFeed: Feed = {
      ...updatedFeed,
      url: resolveCanonicalFeedUrl(updatedFeed.url)
    };
    setFeeds(prev => prev.map(f => f.id === canonicalFeed.id ? canonicalFeed : f));
    await saveSingleFeedToDB(canonicalFeed);
  }, []);

  const removeFeed = useCallback(async (feedId: string) => {
    setFeeds(prev => prev.filter(f => f.id !== feedId));
    await deleteFeedFromDB(feedId);
    setFeedHealth(prev => {
      const copy = { ...prev };
      delete copy[feedId];
      return copy;
    });
    // The feed's articles go with it, except bookmarks
    const orphaned = articlesRef.current.filter(a => a.sourceId === feedId && !a.bookmarked).map(a => a.id);
    const orphanedSet = new Set(orphaned);
    setArticles(prev => prev.filter(a => !orphanedSet.has(a.id)));
    await deleteArticlesFromDB(orphaned);
  }, []);

  const resetFeedsToDefault = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/feeds.json`);
      if (res.ok) {
        const data = await res.json();
        const defaultFeeds: Feed[] = data.feeds || [];
        setFeeds(defaultFeeds);
        await saveFeedsToDB(defaultFeeds);
        refreshFeedsInternal(defaultFeeds);
      }
    } catch (err) {
      console.error('Failed to reset feeds:', err);
    }
  }, [refreshFeedsInternal]);

  // Article state operations: apply a patch to the article list and to the open reader copy
  const patchArticle = useCallback((articleId: string, patch: Partial<Article>) => {
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, ...patch } : a));
    setActiveArticle(prev => prev && prev.id === articleId ? { ...prev, ...patch } : prev);
  }, []);

  const findArticle = (articleId: string) => articlesRef.current.find(a => a.id === articleId);

  const toggleBookmark = useCallback(async (articleId: string) => {
    const target = findArticle(articleId);
    if (!target) return;

    const newBookmarked = !target.bookmarked;
    const folder = newBookmarked ? (target.bookmarkFolder || 'General') : target.bookmarkFolder;
    await updateArticleStateInDB(articleId, { bookmarked: newBookmarked, bookmarkFolder: folder });
    patchArticle(articleId, { bookmarked: newBookmarked, bookmarkFolder: folder });
  }, [patchArticle]);

  const setBookmarkFolder = useCallback(async (articleId: string, folder: string) => {
    await updateArticleStateInDB(articleId, { bookmarkFolder: folder, bookmarked: true });
    patchArticle(articleId, { bookmarkFolder: folder, bookmarked: true });
  }, [patchArticle]);

  const setBookmarkNotes = useCallback(async (articleId: string, notes: string) => {
    await updateArticleStateInDB(articleId, { bookmarkNotes: notes });
    patchArticle(articleId, { bookmarkNotes: notes });
  }, [patchArticle]);

  const toggleRead = useCallback(async (articleId: string) => {
    const target = findArticle(articleId);
    if (!target) return;

    const newRead = !target.read;
    await updateArticleStateInDB(articleId, { read: newRead });
    patchArticle(articleId, { read: newRead });
  }, [patchArticle]);

  const markViewed = useCallback(async (articleId: string) => {
    const target = findArticle(articleId);
    if (!target || target.viewed) return;

    await updateArticleStateInDB(articleId, { viewed: true, read: true });
    patchArticle(articleId, { viewed: true, read: true });
  }, [patchArticle]);

  const markAllAsRead = useCallback(async (ids?: string[]) => {
    await markAllArticlesAsReadInDB(ids);
    const targetIds = ids ? new Set(ids) : null;
    setArticles(prev => prev.map(a => (!targetIds || targetIds.has(a.id)) ? { ...a, read: true } : a));
  }, []);

  const addCustomTagToArticle = useCallback(async (articleId: string, tag: string) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    const target = findArticle(articleId);
    if (!target) return;

    const currentTags = target.customTags || [];
    if (currentTags.includes(cleanTag)) return;

    const updatedTags = [...currentTags, cleanTag];
    await updateArticleStateInDB(articleId, { customTags: updatedTags });
    patchArticle(articleId, { customTags: updatedTags });
  }, [patchArticle]);

  // Memoized so consumers only re-render when data actually changes (actions above are stable)
  const value = useMemo<FeedContextType>(() => ({
    feeds,
    cveIntel,
    snapshotGeneratedAt,
    articles,
    feedHealth,
    isRefreshing,
    refreshProgress,
    lastUpdated,
    isOffline,
    activeArticle,
    setActiveArticle,
    refreshFeeds,
    refreshFailedFeeds,
    toggleFeedEnabled,
    addCustomFeed,
    addCustomFeeds,
    updateFeed,
    removeFeed,
    resetFeedsToDefault,
    toggleBookmark,
    setBookmarkFolder,
    setBookmarkNotes,
    toggleRead,
    markViewed,
    markAllAsRead,
    addCustomTagToArticle,
  }), [
    feeds, cveIntel, snapshotGeneratedAt, articles, feedHealth, isRefreshing, refreshProgress, lastUpdated, isOffline, activeArticle,
    refreshFeeds, refreshFailedFeeds, toggleFeedEnabled, addCustomFeed, addCustomFeeds, updateFeed, removeFeed,
    resetFeedsToDefault, toggleBookmark, setBookmarkFolder, setBookmarkNotes, toggleRead, markViewed,
    markAllAsRead, addCustomTagToArticle,
  ]);

  return (
    <FeedContext.Provider value={value}>
      {children}
    </FeedContext.Provider>
  );
};

export function useFeeds(): FeedContextType {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error('useFeeds must be used within a FeedProvider');
  }
  return context;
}
