// Letters and digits in any script (the `u` flag matters: plain \w is ASCII-only).
// Script_Extensions (scx) so the prolonged sound mark ー and the iteration mark 々 stay inside their run.
const CJK = '\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Hangul}';
const CJK_RUN = new RegExp(`[${CJK}]+|[^${CJK}]+`, 'gu');
const HAS_CJK = new RegExp(`[${CJK}]`, 'u');

export const hasCjk = (token: string): boolean => HAS_CJK.test(token);

/**
 * Splits one whitespace-free word into comparison tokens. Scripts written without spaces
 * (Chinese, Japanese, Korean) become character bigrams of each run; everything else stays one word.
 */
export function wordTokens(word: string): string[] {
  if (!hasCjk(word)) return [word];
  const out: string[] = [];
  for (const run of word.match(CJK_RUN) ?? []) {
    if (!hasCjk(run)) {
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
