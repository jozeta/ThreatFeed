import { describe, expect, it } from 'vitest';
import { qrPath } from './TvQr';

describe('qrPath', () => {
  it('encodes a short URL', () => {
    const { size, d } = qrPath('https://example.com/a');
    expect(size).toBeGreaterThanOrEqual(21);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M/);
  });
  it('encodes a 300-character URL without throwing', () => {
    const url = 'https://example.com/' + 'a'.repeat(280);
    expect(url.length).toBe(300);
    const { size, d } = qrPath(url);
    expect(size).toBeGreaterThan(21);
    expect(d.length).toBeGreaterThan(0);
  });
});
