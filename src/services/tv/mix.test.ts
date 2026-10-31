import { describe, expect, it } from 'vitest';
import { mixItems } from './mix';
import { EngineItem } from './tileEngine';

const story = (i: number): EngineItem => ({ id: `s${i}`, weight: 1, shapes: ['1x1', '2x1', '2x2'] });
const num = (i: number): EngineItem => ({ id: `num:n${i}`, weight: 1, shapes: ['1x1'] });
const stories = (n: number) => Array.from({ length: n }, (_, i) => story(i));
const numbers = (n: number) => Array.from({ length: n }, (_, i) => num(i));

describe('mixItems', () => {
  it('puts a number at every 4th position while numbers last; the 4th waits for more stories', () => {
    const out = mixItems(stories(9), numbers(4));
    expect(out.map(i => i.id)).toEqual(['s0', 's1', 's2', 'num:n0', 's3', 's4', 's5', 'num:n1', 's6', 's7', 's8', 'num:n2']);
  });
  it('a number only follows three stories', () => {
    expect(mixItems(stories(2), numbers(4)).map(i => i.id)).toEqual(['s0', 's1']);
  });
  it('uses each number once per build', () => {
    const out = mixItems(stories(30), numbers(4));
    expect(out.filter(i => i.id.startsWith('num:')).map(i => i.id)).toEqual(['num:n0', 'num:n1', 'num:n2', 'num:n3']);
    expect(out).toHaveLength(34);
    expect(out[15].id).toBe('num:n3');
    expect(out[16].id).toBe('s12');
  });
  it('no numbers leaves the stories unchanged', () => {
    const s = stories(5);
    expect(mixItems(s, [])).toEqual(s);
  });
});
