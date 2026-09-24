import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Article, Feed, FeedHealth } from '../types';
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
  saveFeedHealthToDB
} from '../services/storage/indexeddb';
import { fetchAllFeeds, fetchFeed, resolveCanonicalFeedUrl } from '../services/rss/fetcher';
import { deduplicateArticles } from '../services/articles/deduplication';
import { useSettings } from './SettingsContext';

interface RefreshProgress {
  completed: number;
  total: number;
  currentFeedName?: string;
}

interface FeedContextType {
  feeds: Feed[];
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
      setFeeds(storedFeeds || []);

      // 2. Load health
      const healthMap = await getAllFeedHealthFromDB();
      setFeedHealth(healthMap);

      // 3. Load articles
      let storedArticles = await getAllArticlesFromDB();
      try {
        const seedRes = await fetch(`${import.meta.env.BASE_URL}data/seed-articles.json`);
        if (seedRes.ok) {
          const seedData: Article[] = await seedRes.json();
          if (Array.isArray(seedData) && seedData.length > 0) {
            if (!storedArticles || storedArticles.length === 0) {
              storedArticles = seedData;
              await saveArticlesToDB(storedArticles);
            } else {
              // Ensure articles from newly added categories are merged into cache
              const existingArticleIds = new Set(storedArticles.map(a => a.id));
              const newSeeds = seedData.filter(s => !existingArticleIds.has(s.id));
              if (newSeeds.length > 0) {
                storedArticles = deduplicateArticles([...storedArticles, ...newSeeds]);
                await saveArticlesToDB(storedArticles);
              }
            }
          }
        }
      } catch (seedErr) {
        console.warn('Could not load /data/seed-articles.json:', seedErr);
      }
      setArticles(storedArticles || []);

      // 4. Initial fetch if device is online to ingest latest dispatches
      if (navigator.onLine && storedFeeds && storedFeeds.length > 0) {
        setTimeout(() => {
          refreshFeedsInternal(storedFeeds);
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

  // Core refresh logic
  const refreshFeedsInternal = async (feedsToFetch: Feed[], singleFeedId?: string) => {
    if (isRefreshing || !navigator.onLine) return;

    setIsRefreshing(true);

    const maxItems = settings.maxArticlesPerFeed ?? 25;
    const maxAgeDays = settings.maxArticleAgeDays ?? 30;

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
        
        await saveFeedHealthToDB(health);
        setFeedHealth(prev => ({ ...prev, [feed.id]: health }));

        if (newItems.length > 0) {
          setArticles(prev => {
            let merged = deduplicateArticles([...newItems, ...prev]);
            if (maxAgeDays > 0) {
              const cutoffMs = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
              merged = merged.filter(a => a.bookmarked || isNaN(new Date(a.publishedAt).getTime()) || new Date(a.publishedAt).getTime() >= cutoffMs);
            }
            saveArticlesToDB(merged);
            return merged;
          });
        }
        setRefreshProgress({ completed: 1, total: 1 });
      } else {
        const activeList = feedsToFetch.filter(f => f.enabled);
        setRefreshProgress({ completed: 0, total: activeList.length });

        const { articles: newItems, healthMap } = await fetchAllFeeds(
          feedsToFetch,
          settings.proxyMode,
          settings.customProxyUrl,
          (completed, total, latestHealth) => {
            const curFeed = feedsToFetch.find(f => f.id === latestHealth.feedId);
            setRefreshProgress({ completed, total, currentFeedName: curFeed?.name });
          },
          maxItems,
          maxAgeDays
        );

        // Save health to DB & state
        for (const h of Object.values(healthMap)) {
          await saveFeedHealthToDB(h);
        }
        setFeedHealth(prev => ({ ...prev, ...healthMap }));

        // Deduplicate and merge articles
        setArticles(prev => {
          let merged = deduplicateArticles([...newItems, ...prev]);
          if (maxAgeDays > 0) {
            const cutoffMs = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
            merged = merged.filter(a => a.bookmarked || isNaN(new Date(a.publishedAt).getTime()) || new Date(a.publishedAt).getTime() >= cutoffMs);
          }
          saveArticlesToDB(merged);
          return merged;
        });
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to refresh feeds:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshFeeds = useCallback(async (targetFeedId?: string) => {
    await refreshFeedsInternal(feeds, targetFeedId);
  }, [feeds, settings.proxyMode, settings.customProxyUrl, settings.maxArticlesPerFeed, settings.maxArticleAgeDays, isRefreshing]);

  const refreshFailedFeeds = useCallback(async () => {
    const failedList = feeds.filter(f => {
      const h = feedHealth[f.id];
      return f.enabled && (!h || h.status !== 'healthy');
    });
    if (failedList.length === 0) return;
    await refreshFeedsInternal(failedList);
  }, [feeds, feedHealth, settings.proxyMode, settings.customProxyUrl, settings.maxArticlesPerFeed, settings.maxArticleAgeDays, isRefreshing]);

  // Auto-refresh logic with age cooldown filtering
  const autoRefreshFeeds = useCallback(async () => {
    const cooldownHours = settings.autoRefreshFeedCooldownHours ?? 4;
    let feedsToFetch = feeds.filter(f => f.enabled);

    if (cooldownHours > 0) {
      const now = Date.now();
      const cutoffMs = now - (cooldownHours * 60 * 60 * 1000);

      feedsToFetch = feedsToFetch.filter(feed => {
        // If feed has never been fetched, always fetch it
        const health = feedHealth[feed.id];
        if (!health?.lastFetchedAt) return true;

        // Find newest article belonging to this feed
        const feedArticles = articles.filter(a => a.sourceId === feed.id);
        if (feedArticles.length === 0) return true;

        let newestPubTime = 0;
        for (const a of feedArticles) {
          const t = new Date(a.publishedAt).getTime();
          if (!isNaN(t) && t > newestPubTime) {
            newestPubTime = t;
          }
        }

        if (newestPubTime === 0) return true;

        // If newest item is younger than cooldownHours (newestPubTime > cutoffMs),
        // skip this feed during the auto-refresh interval window
        const isYoungerThanCooldown = newestPubTime > cutoffMs;
        return !isYoungerThanCooldown;
      });
    }

    if (feedsToFetch.length === 0) {
      console.log(`[Auto-Refresh] All feeds have dispatches younger than ${cooldownHours}h. Skipping cycle.`);
      return;
    }

    await refreshFeedsInternal(feedsToFetch);
  }, [feeds, feedHealth, articles, settings.autoRefreshFeedCooldownHours, refreshFeedsInternal]);

  // Auto-refresh timer
  useEffect(() => {
    if (settings.autoRefreshMinutes <= 0 || !navigator.onLine) return;

    const intervalMs = settings.autoRefreshMinutes * 60 * 1000;
    const timer = setInterval(() => {
      autoRefreshFeeds();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.autoRefreshMinutes, autoRefreshFeeds]);

  // Feed management operations
  const toggleFeedEnabled = async (feedId: string) => {
    const updated = feeds.map(f => f.id === feedId ? { ...f, enabled: !f.enabled } : f);
    setFeeds(updated);
    await saveFeedsToDB(updated);
  };

  const addCustomFeed = async (newFeedData: Omit<Feed, 'id'>) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newFeed: Feed = {
      ...newFeedData,
      url: resolveCanonicalFeedUrl(newFeedData.url),
      id,
      isCustom: true
    };
    const updated = [...feeds, newFeed];
    setFeeds(updated);
    await saveSingleFeedToDB(newFeed);
    // Fetch this feed immediately
    refreshFeedsInternal(updated, newFeed.id);
  };

  const updateFeed = async (updatedFeed: Feed) => {
    const canonicalFeed: Feed = {
      ...updatedFeed,
      url: resolveCanonicalFeedUrl(updatedFeed.url)
    };
    const updated = feeds.map(f => f.id === canonicalFeed.id ? canonicalFeed : f);
    setFeeds(updated);
    await saveSingleFeedToDB(canonicalFeed);
  };

  const removeFeed = async (feedId: string) => {
    const updated = feeds.filter(f => f.id !== feedId);
    setFeeds(updated);
    await deleteFeedFromDB(feedId);
    setFeedHealth(prev => {
      const copy = { ...prev };
      delete copy[feedId];
      return copy;
    });
  };

  const resetFeedsToDefault = async () => {
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
  };

  // Article state operations
  const toggleBookmark = async (articleId: string) => {
    const target = articles.find(a => a.id === articleId);
    if (!target) return;

    const newBookmarked = !target.bookmarked;
    const folder = newBookmarked ? (target.bookmarkFolder || 'General') : target.bookmarkFolder;
    await updateArticleStateInDB(articleId, { bookmarked: newBookmarked, bookmarkFolder: folder });

    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, bookmarked: newBookmarked, bookmarkFolder: folder } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, bookmarked: newBookmarked, bookmarkFolder: folder });
    }
  };

  const setBookmarkFolder = async (articleId: string, folder: string) => {
    await updateArticleStateInDB(articleId, { bookmarkFolder: folder, bookmarked: true });
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, bookmarkFolder: folder, bookmarked: true } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, bookmarkFolder: folder, bookmarked: true });
    }
  };

  const setBookmarkNotes = async (articleId: string, notes: string) => {
    await updateArticleStateInDB(articleId, { bookmarkNotes: notes });
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, bookmarkNotes: notes } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, bookmarkNotes: notes });
    }
  };

  const toggleRead = async (articleId: string) => {
    const target = articles.find(a => a.id === articleId);
    if (!target) return;

    const newRead = !target.read;
    await updateArticleStateInDB(articleId, { read: newRead });

    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, read: newRead } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, read: newRead });
    }
  };

  const markViewed = async (articleId: string) => {
    const target = articles.find(a => a.id === articleId);
    if (!target || target.viewed) return;

    await updateArticleStateInDB(articleId, { viewed: true, read: true });

    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, viewed: true, read: true } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, viewed: true, read: true });
    }
  };

  const markAllAsRead = async (ids?: string[]) => {
    await markAllArticlesAsReadInDB(ids);
    setArticles(prev => prev.map(a => {
      if (!ids || ids.includes(a.id)) {
        return { ...a, read: true };
      }
      return a;
    }));
  };

  const addCustomTagToArticle = async (articleId: string, tag: string) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    const target = articles.find(a => a.id === articleId);
    if (!target) return;

    const currentTags = target.customTags || [];
    if (currentTags.includes(cleanTag)) return;

    const updatedTags = [...currentTags, cleanTag];
    await updateArticleStateInDB(articleId, { customTags: updatedTags });

    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, customTags: updatedTags } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, customTags: updatedTags });
    }
  };

  return (
    <FeedContext.Provider
      value={{
        feeds,
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
      }}
    >
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
