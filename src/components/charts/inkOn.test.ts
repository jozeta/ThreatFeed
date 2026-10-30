import { describe, expect, it } from 'vitest';
import { inkOn } from './shared';
import { cellInk } from './SeverityMatrix';

describe('inkOn', () => {
  it('picks black on light fills and white on deep ones', () => {
    expect(inkOn('#fbbf24', 0.9, '#ffffff')).toBe('black'); // amber, light theme
    expect(inkOn('#fbbf24', 0.9, '#151a21')).toBe('black'); // amber, dark theme: the fill is still light
    expect(inkOn('#e11d48', 0.3, '#151a21')).toBe('white'); // faint rose over dark
    expect(inkOn('#e11d48', 0.3, '#ffffff')).toBe('black'); // faint rose over white
  });
});

describe('cellInk', () => {
  it('gives a class per theme', () => {
    expect(cellInk('Moderate', 0.9)).toBe('text-black dark:text-black');
    expect(cellInk('Low', 0.2)).toBe('text-black dark:text-white');
  });
});
