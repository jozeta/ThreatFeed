import { describe, expect, it } from 'vitest';
import { cleanPackageList } from './packageList';

describe('cleanPackageList', () => {
  it('keeps valid entries and drops malformed ones', () => {
    expect(cleanPackageList(['lodash@4.17.15', '@types/node', 'Lodash@^4', 42, null, '', 'bad name', 'left-pad@v1.0.0'])).toEqual(['lodash@4.17.15', '@types/node']);
  });
  it('removes duplicates and tolerates a non-array', () => {
    expect(cleanPackageList(['a', ' a ', 'a@1.0.0', 'a@1.0.0'])).toEqual(['a', 'a@1.0.0']);
    expect(cleanPackageList('lodash')).toEqual([]);
    expect(cleanPackageList(undefined)).toEqual([]);
  });
});
