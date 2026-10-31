import { describe, expect, it } from 'vitest';
import { chartReady } from './dashParts';

describe('chartReady', () => {
  it('needs two points with any series above zero', () => {
    expect(chartReady([])).toBe(false);
    expect(chartReady([[3, 2], [0, 0]])).toBe(false);
    expect(chartReady([[3, 2], [0, 1]])).toBe(true);
    expect(chartReady([[0], [4], [0], [1]])).toBe(true);
  });
});

describe('VBars', () => {
  it('shows only the chosen values, keeping every bar', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { VBars } = await import('./dashParts');
    const data = [5, 123, 7, 9].map((n, i) => ({ label: String(i), n }));
    const html = renderToStaticMarkup(createElement(VBars, { label: 'x', data, color: '#000', showValue: (i: number) => i === 1 || i === 3 }));
    const values = [...html.matchAll(/class="tv-vbar-n">([^<]*)</g)].map(m => m[1]);
    expect(values).toEqual([' ', '123', ' ', '9']);
    expect(html.match(/tv-grow-y/g)).toHaveLength(4);
  });
});
