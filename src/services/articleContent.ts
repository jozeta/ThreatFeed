import { Article } from '../types';

// Full article text ships in per-day files next to the snapshot (data/content/<YYYY-MM-DD>.json, written by
// scripts/build-snapshot.ts), so the snapshot itself only carries what the lists need. The reader and
// bookmarks fetch a day file when they need an article's text.

type ShardContent = Record<string, string>;

/** The UTC day (YYYY-MM-DD) whose content file holds an article, or null when the date is invalid. */
export function shardDay(publishedAt: string): string | null {
  const t = new Date(publishedAt).getTime();
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

async function fetchJsonOrNull(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  return res.ok ? res.json() : null;
}

function parseShard(data: unknown): ShardContent | null {
  const content = (data as { content?: unknown } | null)?.content;
  return content && typeof content === 'object' && !Array.isArray(content) ? (content as ShardContent) : null;
}

// One load per day file, shared by concurrent calls. A failed load (network, malformed JSON) is dropped so the
// next call tries again; a missing file (404) is kept as null.
const shards = new Map<string, Promise<ShardContent | null>>();

function readShard(day: string, fetchJson: (url: string) => Promise<unknown>): Promise<ShardContent | null> {
  const load: Promise<ShardContent | null> = fetchJson(`${import.meta.env.BASE_URL}data/content/${day}.json`).then(parseShard, () => {
    if (shards.get(day) === load) shards.delete(day);
    return null;
  });
  shards.set(day, load);
  return load;
}

const entry = (content: ShardContent | null, id: string): string | null =>
  content && Object.prototype.hasOwnProperty.call(content, id) && typeof content[id] === 'string' ? content[id] : null;

/**
 * An article's full text: its own `content` when it has one (old snapshots, live-fetched and bookmarked
 * articles), otherwise its entry in the day file. Null when there is none (the file aged out or the feed
 * had no text). The result is raw feed HTML: callers sanitize it before rendering.
 */
export async function loadArticleContent(
  article: Pick<Article, 'id' | 'publishedAt' | 'content'>,
  fetchJson: (url: string) => Promise<unknown> = fetchJsonOrNull,
): Promise<string | null> {
  if (article.content) return article.content;
  const day = shardDay(article.publishedAt);
  if (!day) return null;
  const cached = shards.get(day);
  const found = entry(await (cached ?? readShard(day, fetchJson)), article.id);
  if (found !== null || !cached) return found;
  // The copy in memory may predate the latest snapshot run (the files are rebuilt every run): read it again once
  const current = shards.get(day);
  return entry(await (current && current !== cached ? current : readShard(day, fetchJson)), article.id);
}

/** Forgets the loaded day files (tests). */
export function clearArticleContentCache(): void {
  shards.clear();
}
