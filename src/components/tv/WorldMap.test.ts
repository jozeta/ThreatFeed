import { describe, expect, it } from 'vitest';
import { shade } from './WorldMap';

describe('shade', () => {
  it('is neutral for no victims and spans the purple scale', () => {
    expect(shade(0, 10)).toBe('#1c222b');
    expect(shade(10, 10)).toBe('#a855f7');
    expect(shade(5, 10)).toBe('#693a9a');
  });
});
