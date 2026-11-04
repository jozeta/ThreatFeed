import { describe, it, expect } from 'vitest';
import { sanitizeHtml, safeHttpUrl } from './sanitizer';

const parse = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};

describe('sanitizeHtml classes (SEC-004)', () => {
  it('keeps only language-* classes on code', () => {
    const out = parse(sanitizeHtml('<code class="language-js foo">x</code>'));
    expect(out.querySelector('code')?.getAttribute('class')).toBe('language-js');
  });

  it('keeps only language-* classes on pre', () => {
    const out = parse(sanitizeHtml('<pre class="fixed language-python z-50"><code>x</code></pre>'));
    expect(out.querySelector('pre')?.getAttribute('class')).toBe('language-python');
  });

  it('drops the class attribute when no language-* token remains', () => {
    const out = parse(sanitizeHtml('<code class="foo bar">x</code>'));
    expect(out.querySelector('code')?.hasAttribute('class')).toBe(false);
  });

  it('removes classes from links and other elements', () => {
    const out = parse(sanitizeHtml(
      '<a class="fixed inset-0 z-50" href="https://x.example/">l</a><p class="language-js">p</p><span class="sr-only">s</span>',
    ));
    expect(out.querySelector('a')?.hasAttribute('class')).toBe(false);
    expect(out.querySelector('p')?.hasAttribute('class')).toBe(false);
    expect(out.querySelector('span')?.hasAttribute('class')).toBe(false);
  });
});

describe('sanitizeHtml hardening', () => {
  it('removes scripts, event handlers and style', () => {
    const out = sanitizeHtml('<p style="position:fixed" onclick="x()">a</p><script>alert(1)</script><img src="https://x.example/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/script|onerror|onclick|style/i);
  });

  it('removes javascript: and data:text/html hrefs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">a</a><a href="data:text/html,<b>x</b>">b</a>');
    expect(out).not.toMatch(/javascript:|data:text\/html/i);
  });

  it('adds target and rel to links', () => {
    const a = parse(sanitizeHtml('<a href="https://x.example/">l</a>')).querySelector('a');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('truncates payloads over 300,000 characters with a note', () => {
    const out = sanitizeHtml('<p>' + 'a'.repeat(310000) + '</p>');
    expect(out).toContain('[Article content truncated for length]');
    expect(out.length).toBeLessThan(310000);
  });

  it('strips large base64 images', () => {
    const big = 'A'.repeat(11000);
    const out = sanitizeHtml(`<img src="data:image/png;base64,${big}">` + '<p>' + 'a'.repeat(100000) + '</p>');
    expect(out).not.toContain(big);
  });
});

describe('safeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com');
  });

  it('rejects other schemes, relative URLs and empty input', () => {
    expect(safeHttpUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(safeHttpUrl('//evil')).toBe('');
    expect(safeHttpUrl('data:text/html,x')).toBe('');
    expect(safeHttpUrl('')).toBe('');
    expect(safeHttpUrl(undefined)).toBe('');
  });
});
