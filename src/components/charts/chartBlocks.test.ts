import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DonutChart } from './DonutChart';
import { RankedBars } from './RankedBars';
import { Histogram } from './Histogram';
import { foldSlices } from './chartData';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('chart blocks', () => {
  it('render an empty state without data', () => {
    expect(html(createElement(DonutChart, { title: 't', data: [] }))).toContain('No data yet');
    expect(html(createElement(RankedBars, { title: 't', data: [] }))).toContain('No data yet');
    expect(html(createElement(Histogram, { title: 't', buckets: [{ from: 0, to: 1, count: 0 }] }))).toContain('No data yet');
  });
  it('donut renders untrusted labels as escaped text and builds the aria summary', () => {
    const data = foldSlices([{ label: '<img src=x onerror=alert(1)>', value: 3 }, { label: 'High', value: 1 }]);
    const out = html(createElement(DonutChart, { title: 'Severity', data }));
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('aria-label="Severity: &lt;img src=x onerror=alert(1)&gt; 3 (75%), High 1 (25%)"');
  });
  it('ranked bars default the aria summary from the data', () => {
    const out = html(createElement(RankedBars, { title: 'Top', data: [{ label: 'a', value: 2 }, { label: 'b', value: 1 }] }));
    expect(out).toContain('aria-label="Top: a 2, b 1"');
  });
});
