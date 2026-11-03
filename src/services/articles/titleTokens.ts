// Letters and digits in any script (the `u` flag matters: plain \w is ASCII-only).
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const CJK_RUN = new RegExp(`[${CJK}]+|[^${CJK}]+`, 'gu');
const HAS_CJK = new RegExp(`[${CJK}]`, 'u');

/**
 * Splits one whitespace-free word into comparison tokens. Scripts written without spaces
 * (Chinese, Japanese, Korean) become character bigrams of each run; everything else stays one word.
 */
export function wordTokens(word: string): string[] {
  if (!HAS_CJK.test(word)) return [word];
  const out: string[] = [];
  for (const run of word.match(CJK_RUN) ?? []) {
    if (!HAS_CJK.test(run)) {
      out.push(run);
      continue;
    }
    const chars = Array.from(run);
    if (chars.length === 1) out.push(run);
    for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
  }
  return out;
}

/** Titles that yield fewer tokens than this are not comparable by word overlap. */
export const MIN_COMPARABLE_TOKENS = 2;
