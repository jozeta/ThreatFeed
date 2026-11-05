import { EngineItem } from './tileEngine';

/**
 * Mixed mode: every 4th item (indexes 3, 7, 11, …; `every` sets the spacing) is the next number panel while numbers last.
 * A number only follows `every - 1` stories, and each number is used once per build; no numbers leaves the stories unchanged.
 * With `keepRest`, items left over when the stories run short follow at the end, at most one per started group of `every`
 * (so a short wall still gets them, and never more than 1 in `every`).
 */
export function mixItems(stories: EngineItem[], numbers: EngineItem[], every = 4, keepRest = false): EngineItem[] {
  if (numbers.length === 0) return stories;
  const out: EngineItem[] = [];
  let next = 0;
  for (const s of stories) {
    out.push(s);
    if (out.length % every === every - 1 && next < numbers.length) out.push(numbers[next++]);
  }
  if (keepRest) {
    while (next < numbers.length && next < Math.ceil((out.length + 1) / every)) out.push(numbers[next++]);
  }
  return out;
}
