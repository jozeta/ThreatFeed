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

describe('seriesColors', () => {
  it('greys neutral labels and missing map entries; ranks count coloured series only', async () => {
    const { seriesColors, NEUTRAL_COLOR } = await import('./dashParts');
    const { DONUT_COLORS } = await import('../charts/DonutChart');
    expect(seriesColors([{ label: 'Unknown' }, { label: 'A' }, { label: 'No CWE' }, { label: 'B' }, { label: 'x', other: true }]))
      .toEqual([NEUTRAL_COLOR, DONUT_COLORS[0], NEUTRAL_COLOR, DONUT_COLORS[1], NEUTRAL_COLOR]);
    expect(seriesColors([{ label: 'High' }, { label: 'Odd' }], { High: '#f97316' })).toEqual(['#f97316', NEUTRAL_COLOR]);
  });
});
