/**
 * Whole-word, case-insensitive term matching shared by tagging, severity scoring and the watchlist.
 * Substring matching is not enough here: "rce" would hit "source", "apt" would hit "adapt".
 */

const patternCache = new Map<string, RegExp>();

function termPattern(term: string): RegExp {
  const key = term.toLowerCase();
  let pattern = patternCache.get(key);
  if (!pattern) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Lookarounds instead of \b so terms that start or end with punctuation (e.g. "C++", ".NET") still match.
    pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i');
    patternCache.set(key, pattern);
  }
  return pattern;
}

export function containsTerm(text: string, term: string): boolean {
  return termPattern(term).test(text);
}
