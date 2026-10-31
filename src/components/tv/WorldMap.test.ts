import { describe, expect, it } from 'vitest';
import { shade } from './WorldMap';

describe('shade', () => {
  it('is neutral for no victims and spans the purple scale', () => {
    expect(shade(0, 10)).toBe('#1c222b');
    expect(shade(10, 10)).toBe('#a855f7');
    // t = 0.25 + 0.75·sqrt(0.5) ≈ 0.780
    expect(shade(5, 10)).toBe('#8c49ce');
  });
  it('keeps a single victim visible beside a large maximum', () => {
    // t = 0.25 + 0.75·sqrt(0.01) = 0.325, well clear of the neutral fill
    expect(shade(1, 100)).toBe('#533179');
  });
});
