import { describe, expect, it } from 'vitest';
import { parsePackageInput } from './npmPackagesForm';

describe('parsePackageInput', () => {
  it('accepts several entries separated by commas and spaces', () => {
    expect(parsePackageInput('lodash@4.17.15, @types/node  express,react@18.2.0', [])).toEqual({
      added: ['lodash@4.17.15', '@types/node', 'express', 'react@18.2.0'],
      invalid: [],
    });
  });
  it('reports invalid entries and still adds the valid ones', () => {
    expect(parsePackageInput('Lodash@^4 express', [])).toEqual({ added: ['express'], invalid: ['Lodash@^4'] });
  });
  it('skips entries already watched and repeats, but treats a different version as new', () => {
    expect(parsePackageInput('express express express@4.18.2', ['express'])).toEqual({ added: ['express@4.18.2'], invalid: [] });
  });
  it('returns nothing for blank input', () => {
    expect(parsePackageInput('  , ', [])).toEqual({ added: [], invalid: [] });
  });
});
