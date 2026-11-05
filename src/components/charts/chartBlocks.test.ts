import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DonutChart } from './DonutChart';
import { RankedBars } from './RankedBars';
import { Histogram } from './Histogram';
import { foldSlices } from './chartData';
import { StackedBars } from './StackedBars';

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
  it('donut with one slice draws a full ring', () => {
    const out = html(createElement(DonutChart, { title: 't', data: foldSlices([{ label: 'Only', value: 5 }]) }));
    expect(out).toContain('<circle');
    expect(out).not.toContain('stroke-dasharray'); // one plain circle, not an arc
    expect(out).toContain('Only: 5 (100%)');
  });
  it('donut greys Unknown and Other and ranks the rest', () => {
    const data = foldSlices([{ label: 'Unknown', value: 9 }, { label: 'A', value: 5 }, { label: 'B', value: 4 }]);
    const out = html(createElement(DonutChart, { title: 't', data }));
    expect(out.match(/stroke="(#[0-9a-f]{6})"/g)).toEqual(['stroke="#94a3b8"', 'stroke="#e11d48"', 'stroke="#f97316"']);
  });
  it('histogram labels every bucket, with the caller formatting the edges', () => {
    const buckets = [{ from: 0, to: 0.01, count: 2 }, { from: 0.01, to: 0.05, count: 1 }, { from: 0.05, to: 1, count: 4 }];
    const out = html(createElement(Histogram, { title: 'EPSS', buckets, formatEdge: (v: number) => String(Math.round(v * 100)) }));
    expect(out.match(/data-bucket-label[^>]*>([^<]*)</g)?.map((m) => m.split('>')[1].slice(0, -1))).toEqual(['0–1', '1–5', '5–100']);
    expect(out).toContain('peak 4');
    expect(html(createElement(Histogram, { title: 't', buckets }))).toContain('>0.01–0.05<');
  });
  it('stacked bars show the empty state when every bar is zero', () => {
    const zero = [{ label: '2026-11-04', short: '11-04', segments: [{ name: 'a', value: 0, className: 'fill-rose-500' }] }];
    expect(html(createElement(StackedBars, { buckets: zero, ariaLabel: 'x', unit: 'u' }))).toContain('No data yet');
    const some = [{ ...zero[0], segments: [{ name: 'a', value: 2, className: 'fill-rose-500' }] }];
    expect(html(createElement(StackedBars, { buckets: some, ariaLabel: 'x', unit: 'u' }))).not.toContain('No data yet');
  });
});
