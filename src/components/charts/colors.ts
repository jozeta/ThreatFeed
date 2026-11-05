/**
 * Colours shared by the page charts and the TV wall. Hex, never theme classes: the wall is always dark, and these
 * also read on both card themes of the page.
 */

/** Distinguishable on light and dark cards, in rank order */
export const DONUT_COLORS = ['#e11d48', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6'];
export const NEUTRAL_COLOR = '#94a3b8';

/** Severity by label; the same hex as the page's per-day bars (SEVERITY_FILL), so page and TV agree */
export const SEVERITY_HEX: Record<string, string> = { Critical: '#e11d48', High: '#f97316', Medium: '#fbbf24', Low: '#0ea5e9' };

/** Labels that aren't a category; they are grey and take no rank colour */
const NEUTRAL_LABELS = new Set(['Other', 'Unknown', 'No CWE']);

/**
 * One colour per series (donut slice or stacked segment), in order: neutral labels grey; by label from `colors` when
 * given (grey when missing); else the donut palette in rank order, counting coloured series only, so the first real
 * category always gets the first colour.
 */
export function seriesColors(series: { label: string; other?: boolean }[], colors?: Record<string, string>): string[] {
  let rank = 0;
  return series.map((s) => {
    if (s.other || NEUTRAL_LABELS.has(s.label)) return NEUTRAL_COLOR;
    if (colors) return colors[s.label] ?? NEUTRAL_COLOR;
    return DONUT_COLORS[rank++ % DONUT_COLORS.length];
  });
}
