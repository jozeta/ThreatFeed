import { Article } from '../types';
import { shardDay } from './articleContent';

// Builds the content shards (data/content/<YYYY-MM-DD>.json) in the snapshot job. The snapshot keeps only the
// latest articles per feed, but the app keeps articles for 30 days, so each run carries the previously
// published shards over and lays its own text on top, instead of writing only what this run fetched.

export type DayContent = Record<string, string>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC days a shard is kept for, oldest first: today and the maxAgeDays before it. */
export function shardWindow(now: number, maxAgeDays: number): string[] {
  const days: string[] = [];
  for (let i = maxAgeDays; i >= 0; i--) days.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10));
  return days;
}

/** This run's article text, grouped by publish day. Articles without text or a valid date are left out. */
export function groupContentByDay(articles: Pick<Article, 'id' | 'publishedAt' | 'content'>[]): Map<string, DayContent> {
  const byDay = new Map<string, DayContent>();
  for (const a of articles) {
    const day = shardDay(a.publishedAt);
    if (!a.content || !day) continue;
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)![a.id] = a.content;
  }
  return byDay;
}

/** The text map of a published shard, or null when it isn't one (only string entries are kept). */
export function parseShardContent(data: unknown): DayContent | null {
  const content = (data as { content?: unknown } | null)?.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  return Object.fromEntries(Object.entries(content).filter(([, v]) => typeof v === 'string')) as DayContent;
}

/**
 * Reads the previously published shards for the given days. A 404 means the day has no shard and isn't an error;
 * any other failure is listed, and that day then has only this run's text.
 */
export async function readPreviousShards(
  base: string,
  days: string[],
  getJson: (url: string) => Promise<unknown>,
): Promise<{ shards: Map<string, DayContent>; failed: { day: string; error: string }[] }> {
  const shards = new Map<string, DayContent>();
  const failed: { day: string; error: string }[] = [];
  await Promise.all(days.map(async (day) => {
    try {
      const content = parseShardContent(await getJson(`${base}content/${day}.json`));
      if (content) shards.set(day, content);
      else failed.push({ day, error: 'not a content shard' });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (error !== 'HTTP 404') failed.push({ day, error });
    }
  }));
  failed.sort((a, b) => a.day.localeCompare(b.day));
  return { shards, failed };
}

/**
 * Lays this run's text over the previous shards (this run wins per article) and drops days outside the window.
 * Counts the articles carried over from earlier runs and those from this run.
 */
export function mergeContentShards(
  previous: Map<string, DayContent>,
  current: Map<string, DayContent>,
  window: string[],
): { shards: Map<string, DayContent>; carried: number; fresh: number } {
  const keep = new Set(window);
  const shards = new Map<string, DayContent>();
  let carried = 0;
  let fresh = 0;
  for (const day of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
    if (!keep.has(day)) continue;
    const now = current.get(day) ?? {};
    const before = previous.get(day) ?? {};
    const merged = { ...before, ...now };
    fresh += Object.keys(now).length;
    carried += Object.keys(merged).length - Object.keys(now).length;
    shards.set(day, merged);
  }
  return { shards, carried, fresh };
}
