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
import { fetchAllFeeds, fetchFeed } from '../services/rss/fetcher';
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
  toggleFeedEnabled: (feedId: string) => Promise<void>;
  addCustomFeed: (newFeed: Omit<Feed, 'id'>) => Promise<void>;
  updateFeed: (feed: Feed) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
  resetFeedsToDefault: () => Promise<void>;
  toggleBookmark: (articleId: string) => Promise<void>;
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
      if (!storedFeeds || storedFeeds.length === 0) {
        // Fetch static default feeds
        try {
          const res = await fetch('/data/feeds.json');
          if (res.ok) {
            const data = await res.json();
            storedFeeds = data.feeds || [];
            await saveFeedsToDB(storedFeeds);
          }
        } catch (fetchErr) {
          console.warn('Could not load /data/feeds.json:', fetchErr);
        }
      }
      setFeeds(storedFeeds || []);

      // 2. Load health
      const healthMap = await getAllFeedHealthFromDB();
      setFeedHealth(healthMap);

      // 3. Load articles
      let storedArticles = await getAllArticlesFromDB();
      if (!storedArticles || storedArticles.length === 0) {
        try {
          const seedRes = await fetch('/data/seed-articles.json');
          if (seedRes.ok) {
            const seedData = await seedRes.json();
            if (Array.isArray(seedData) && seedData.length > 0) {
              storedArticles = seedData;
              await saveArticlesToDB(storedArticles);
            }
          }
        } catch (seedErr) {
          console.warn('Could not load /data/seed-articles.json:', seedErr);
        }
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

    try {
      if (singleFeedId) {
        const feed = feedsToFetch.find(f => f.id === singleFeedId);
        if (!feed) return;

        setRefreshProgress({ completed: 0, total: 1, currentFeedName: feed.name });
        const { articles: newItems, health } = await fetchFeed(feed, settings.proxyMode, settings.customProxyUrl);
        
        await saveFeedHealthToDB(health);
        setFeedHealth(prev => ({ ...prev, [feed.id]: health }));

        if (newItems.length > 0) {
          setArticles(prev => {
            const merged = deduplicateArticles([...newItems, ...prev]);
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
          }
        );

        // Save health to DB & state
        for (const h of Object.values(healthMap)) {
          await saveFeedHealthToDB(h);
        }
        setFeedHealth(prev => ({ ...prev, ...healthMap }));

        // Deduplicate and merge articles
        setArticles(prev => {
          const merged = deduplicateArticles([...newItems, ...prev]);
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
  }, [feeds, settings.proxyMode, settings.customProxyUrl, isRefreshing]);

  // Auto-refresh timer
  useEffect(() => {
    if (settings.autoRefreshMinutes <= 0 || !navigator.onLine) return;

    const intervalMs = settings.autoRefreshMinutes * 60 * 1000;
    const timer = setInterval(() => {
      refreshFeeds();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.autoRefreshMinutes, refreshFeeds]);

  // Feed management operations
  const toggleFeedEnabled = async (feedId: string) => {
    const updated = feeds.map(f => f.id === feedId ? { ...f, enabled: !f.enabled } : f);
    setFeeds(updated);
    await saveFeedsToDB(updated);
  };

  const addCustomFeed = async (newFeedData: Omit<Feed, 'id'>) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newFeed: Feed = { ...newFeedData, id, isCustom: true };
    const updated = [...feeds, newFeed];
    setFeeds(updated);
    await saveSingleFeedToDB(newFeed);
    // Fetch this feed immediately
    refreshFeedsInternal(updated, newFeed.id);
  };

  const updateFeed = async (updatedFeed: Feed) => {
    const updated = feeds.map(f => f.id === updatedFeed.id ? updatedFeed : f);
    setFeeds(updated);
    await saveSingleFeedToDB(updatedFeed);
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
      const res = await fetch('/data/feeds.json');
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
    await updateArticleStateInDB(articleId, { bookmarked: newBookmarked });

    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, bookmarked: newBookmarked } : a));
    if (activeArticle && activeArticle.id === articleId) {
      setActiveArticle({ ...activeArticle, bookmarked: newBookmarked });
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
        toggleFeedEnabled,
        addCustomFeed,
        updateFeed,
        removeFeed,
        resetFeedsToDefault,
        toggleBookmark,
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
