import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Article, Feed, FeedHealth, UserSettings } from '../../types';

interface ThreatFeedDB extends DBSchema {
  articles: {
    key: string;
    value: Article;
    indexes: {
      'by-published': string;
      'by-source': string;
      'by-read': number;
      'by-bookmarked': number;
    };
  };
  feeds: {
    key: string;
    value: Feed;
  };
  feedHealth: {
    key: string;
    value: FeedHealth;
  };
  articleState: {
    key: string;
    value: {
      id: string;
      read: boolean;
      viewed: boolean;
      bookmarked: boolean;
      customTags?: string[];
      readAt?: string;
      viewedAt?: string;
      bookmarkedAt?: string;
    };
  };
  settings: {
    key: string;
    value: { key: string; value: any };
  };
}

const DB_NAME = 'threatfeed_database';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ThreatFeedDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<ThreatFeedDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ThreatFeedDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Articles store
        if (!db.objectStoreNames.contains('articles')) {
          const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
          articleStore.createIndex('by-published', 'publishedAt');
          articleStore.createIndex('by-source', 'sourceId');
          // idb requires numbers or strings for indexes
          articleStore.createIndex('by-read', 'read');
          articleStore.createIndex('by-bookmarked', 'bookmarked');
        }

        // Feeds store
        if (!db.objectStoreNames.contains('feeds')) {
          db.createObjectStore('feeds', { keyPath: 'id' });
        }

        // Feed Health store
        if (!db.objectStoreNames.contains('feedHealth')) {
          db.createObjectStore('feedHealth', { keyPath: 'feedId' });
        }

        // Article persistent read/bookmarked state store
        if (!db.objectStoreNames.contains('articleState')) {
          db.createObjectStore('articleState', { keyPath: 'id' });
        }

        // User settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Articles
export async function getAllArticlesFromDB(): Promise<Article[]> {
  const db = await getDB();
  const articles = await db.getAll('articles');
  // Sort newest first
  return articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function saveArticlesToDB(newArticles: Article[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['articles', 'articleState'], 'readwrite');
  const articleStore = tx.objectStore('articles');
  const stateStore = tx.objectStore('articleState');

  for (const article of newArticles) {
    // Check if user already marked this article read/viewed/bookmarked
    const existingState = await stateStore.get(article.id);
    if (existingState) {
      article.read = existingState.read;
      article.viewed = existingState.viewed;
      article.bookmarked = existingState.bookmarked;
      article.customTags = existingState.customTags || article.customTags;
      article.readAt = existingState.readAt;
      article.viewedAt = existingState.viewedAt;
      article.bookmarkedAt = existingState.bookmarkedAt;
    }
    await articleStore.put(article);
  }

  await tx.done;
}

export async function updateArticleStateInDB(
  id: string,
  updates: Partial<Pick<Article, 'read' | 'viewed' | 'bookmarked' | 'customTags'>>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['articles', 'articleState'], 'readwrite');
  const articleStore = tx.objectStore('articles');
  const stateStore = tx.objectStore('articleState');

  const article = await articleStore.get(id);
  const now = new Date().toISOString();

  let state = await stateStore.get(id);
  if (!state) {
    state = {
      id,
      read: updates.read ?? (article ? article.read : false),
      viewed: updates.viewed ?? (article ? article.viewed : false),
      bookmarked: updates.bookmarked ?? (article ? article.bookmarked : false),
      customTags: updates.customTags ?? (article ? article.customTags : []),
    };
  }

  if (updates.read !== undefined) {
    state.read = updates.read;
    state.readAt = updates.read ? now : undefined;
  }
  if (updates.viewed !== undefined) {
    state.viewed = updates.viewed;
    state.viewedAt = updates.viewed ? now : undefined;
  }
  if (updates.bookmarked !== undefined) {
    state.bookmarked = updates.bookmarked;
    state.bookmarkedAt = updates.bookmarked ? now : undefined;
  }
  if (updates.customTags !== undefined) {
    state.customTags = updates.customTags;
  }

  await stateStore.put(state);

  if (article) {
    Object.assign(article, updates);
    if (updates.read !== undefined) article.readAt = state.readAt;
    if (updates.viewed !== undefined) article.viewedAt = state.viewedAt;
    if (updates.bookmarked !== undefined) article.bookmarkedAt = state.bookmarkedAt;
    if (updates.customTags !== undefined) article.customTags = state.customTags;
    await articleStore.put(article);
  }

  await tx.done;
}

export async function markAllArticlesAsReadInDB(articleIds?: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['articles', 'articleState'], 'readwrite');
  const articleStore = tx.objectStore('articles');
  const stateStore = tx.objectStore('articleState');

  const now = new Date().toISOString();
  const allArticles = await articleStore.getAll();

  for (const article of allArticles) {
    if (!articleIds || articleIds.includes(article.id)) {
      if (!article.read) {
        article.read = true;
        article.readAt = now;
        await articleStore.put(article);

        const state = (await stateStore.get(article.id)) || {
          id: article.id,
          read: true,
          viewed: article.viewed,
          bookmarked: article.bookmarked,
        };
        state.read = true;
        state.readAt = now;
        await stateStore.put(state);
      }
    }
  }

  await tx.done;
}

// Feeds
export async function getFeedsFromDB(): Promise<Feed[]> {
  const db = await getDB();
  return db.getAll('feeds');
}

export async function saveFeedsToDB(feeds: Feed[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('feeds', 'readwrite');
  await tx.store.clear();
  for (const feed of feeds) {
    await tx.store.put(feed);
  }
  await tx.done;
}

export async function saveSingleFeedToDB(feed: Feed): Promise<void> {
  const db = await getDB();
  await db.put('feeds', feed);
}

export async function deleteFeedFromDB(feedId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['feeds', 'feedHealth'], 'readwrite');
  await tx.objectStore('feeds').delete(feedId);
  await tx.objectStore('feedHealth').delete(feedId);
  await tx.done;
}

// Feed Health
export async function getAllFeedHealthFromDB(): Promise<Record<string, FeedHealth>> {
  const db = await getDB();
  const list = await db.getAll('feedHealth');
  const map: Record<string, FeedHealth> = {};
  for (const item of list) {
    map[item.feedId] = item;
  }
  return map;
}

export async function saveFeedHealthToDB(health: FeedHealth): Promise<void> {
  const db = await getDB();
  await db.put('feedHealth', health);
}

// User Settings
const SETTINGS_KEY = 'user_settings';

export async function getSettingsFromDB(): Promise<UserSettings | null> {
  try {
    const db = await getDB();
    const entry = await db.get('settings', SETTINGS_KEY);
    return entry ? entry.value : null;
  } catch (err) {
    console.error('Failed to get settings from IDB:', err);
    return null;
  }
}

export async function saveSettingsToDB(settings: UserSettings): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings', { key: SETTINGS_KEY, value: settings });
  } catch (err) {
    console.error('Failed to save settings to IDB:', err);
  }
}

// Full export / import for backup & OPML
export async function exportAllThreatFeedData() {
  const db = await getDB();
  const feeds = await db.getAll('feeds');
  const articleStates = await db.getAll('articleState');
  const settingsEntry = await db.get('settings', SETTINGS_KEY);

  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    feeds,
    articleStates,
    settings: settingsEntry?.value || null,
  };
}

export async function importThreatFeedData(data: any): Promise<boolean> {
  if (!data || !data.feeds || !Array.isArray(data.feeds)) {
    throw new Error('Invalid ThreatFeed backup format: missing feeds list.');
  }

  const db = await getDB();
  const tx = db.transaction(['feeds', 'articleState', 'settings'], 'readwrite');

  // Import feeds
  const feedStore = tx.objectStore('feeds');
  for (const feed of data.feeds) {
    await feedStore.put(feed);
  }

  // Import article state (read/bookmarks)
  if (data.articleStates && Array.isArray(data.articleStates)) {
    const stateStore = tx.objectStore('articleState');
    for (const state of data.articleStates) {
      await stateStore.put(state);
    }
  }

  // Import settings
  if (data.settings) {
    const settingsStore = tx.objectStore('settings');
    await settingsStore.put({ key: SETTINGS_KEY, value: data.settings });
  }

  await tx.done;
  return true;
}
