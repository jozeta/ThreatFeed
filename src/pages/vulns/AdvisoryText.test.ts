import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AdvisoryText, advisoryTextParts } from './AdvisoryText';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(text: string): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(React.createElement(AdvisoryText, { text })));
  return host;
}

describe('advisory text', () => {
  it('advisory text is never HTML', () => {
    const el = render('Run <script>alert(1)</script> <img src=x onerror=alert(2)>\n[x](javascript:alert(1)) and [y](data:text/html,hi)');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    for (const a of el.querySelectorAll('a')) expect(a.getAttribute('href')).toMatch(/^https?:/);
    expect(el.innerHTML).not.toContain('javascript:alert(1)"');
    expect(el.querySelectorAll('a')).toHaveLength(0);
    // The hostile text is still there to read, as text
    expect(el.textContent).toContain('<script>alert(1)</script>');
    expect(el.textContent).toContain('[x](javascript:alert(1))');
  });

  it('links markdown links and bare URLs only when they are http(s), with rel noopener noreferrer', () => {
    const el = render('See [the fix](https://github.com/o/r/commit/1) and https://example.com/a.\nAlso http://x.test');
    const links = [...el.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://github.com/o/r/commit/1', 'https://example.com/a', 'http://x.test']);
    expect(links[0].textContent).toBe('the fix');
    for (const a of links) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('target')).toBe('_blank');
    }
    // The full stop after a bare URL stays text
    expect(el.textContent).toContain('https://example.com/a.');
  });

  it('keeps line breaks for the pre-wrap block', () => {
    expect(advisoryTextParts('a\n\nb')).toEqual([{ text: 'a\n\nb' }]);
  });
});
