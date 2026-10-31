import { EngineItem } from './tileEngine';

/**
 * Mixed mode: every 4th item (indexes 3, 7, 11, …) is the next number panel while numbers last. A number only follows
 * three stories, and each number is used once per build; no numbers leaves the stories unchanged.
 */
export function mixItems(stories: EngineItem[], numbers: EngineItem[]): EngineItem[] {
  if (numbers.length === 0) return stories;
  const out: EngineItem[] = [];
  let next = 0;
  for (const s of stories) {
    out.push(s);
    if (out.length % 4 === 3 && next < numbers.length) out.push(numbers[next++]);
  }
  return out;
}
