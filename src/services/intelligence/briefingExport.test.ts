import { describe, expect, it } from 'vitest';
import { buildBriefing, briefingToHtml, briefingToMarkdown } from './briefing';
import { article } from '../../test/fixtures';

describe('briefingToHtml', () => {
  const now = Date.now();
  const build = (overrides = {}) =>
    buildBriefing([article('a', { severity: 'critical', severityScore: 9, publishedAt: new Date(now - 3600_000).toISOString(), ...overrides })], {}, [], [], 24, now);

  it('is a self-contained document with the Markdown section headings', () => {
    const b = build();
    const html = briefingToHtml(b);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<h1');
    expect(html).toContain('Critical &amp; High Severity');
    expect(html).not.toMatch(/<script|<link|<style/i);
    expect(briefingToMarkdown(b)).toContain('## Critical & High Severity');
  });

  it('escapes markup in story titles', () => {
    const html = briefingToHtml(build({ title: '<script>alert(1)</script> "x"' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot;');
  });

  it('keeps https links and drops a javascript: link', () => {
    expect(briefingToHtml(build())).toContain('href="https://example.com/a"');
    const html = briefingToHtml(build({ url: 'javascript:alert(1)' }));
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Article a');
  });
});
