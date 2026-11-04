import type { Article } from '../types';

/** IndexedDB key (see getStoredValue) of the time the page was last hidden or closed */
export const LAST_VISIT_KEY = 'lastVisitAt';

/** The time "new" is measured from: the stored last visit, clamped to now; now on a first visit (nothing is "new" yet) */
export function visitBaseline(stored: string | null, now: number): number {
  const t = stored ? Date.parse(stored) : NaN;
  if (Number.isNaN(t)) return now;
  return Math.min(t, now);
}

/** When the article arrived here (fetchedAt, else publishedAt); NaN when neither parses */
function arrivedAt(a: Article): number {
  const fetched = a.fetchedAt ? Date.parse(a.fetchedAt) : NaN;
  return Number.isNaN(fetched) ? Date.parse(a.publishedAt) : fetched;
}

export function isNewSince(a: Article, baseline: number): boolean {
  return arrivedAt(a) > baseline;
}

export function newSince(articles: Article[], baseline: number): Article[] {
  return articles.filter((a) => isNewSince(a, baseline));
}

/** Articles that arrived at or before the baseline (invalid dates are in neither list) */
export function olderThan(articles: Article[], baseline: number): Article[] {
  return articles.filter((a) => arrivedAt(a) <= baseline);
}

/** "08:12" for today (24 h, like the rest of the app), "Tue 08:12" for an earlier day */
export function formatSince(baseline: number, now: number): string {
  const d = new Date(baseline);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date(now).toDateString()) return time;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** Id of the first article (in list order) that arrived at or before the baseline; null when there is no newer article above it */
export function firstEarlierId(articles: Article[], baseline: number): string | null {
  const i = articles.findIndex((a) => arrivedAt(a) <= baseline);
  return i > 0 ? articles[i].id : null;
}
