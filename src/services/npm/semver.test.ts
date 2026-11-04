import { describe, expect, it } from 'vitest';
import { compareVersions, formatPackageEntry, osvAffected, parseGhsaRange, parsePackageEntry, parseVersion, Version } from './semver';

const v = (s: string): Version => {
  const p = parseVersion(s);
  if (!p) throw new Error(`bad test version ${s}`);
  return p;
};

describe('parseVersion', () => {
  it('parses plain, prerelease and build versions', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseVersion('1.2.3-alpha.1.x-y+build.5')).toEqual({ major: 1, minor: 2, patch: 3, pre: ['alpha', 1, 'x-y'] });
  });
  it('rejects anything that is not strict semver', () => {
    for (const s of ['', '1', '1.2', '1.2.3.4', '01.2.3', '1.02.3', '1.2.3-', '1.2.3-01', '1.2.3-a..b', '1.2.3+', '^1.2.3', '1.2.x', ' 1.2.3', '1.2.3 ', 'vv1.2.3', '99999999999999999999.0.0']) {
      expect(parseVersion(s), s).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('orders the semver.org precedence example', () => {
    const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(compareVersions(v(order[i]), v(order[j])), `${order[i]} vs ${order[j]}`).toBe(Math.sign(i - j));
      }
    }
  });
  it('compares numbers numerically, not lexically', () => {
    expect(compareVersions(v('1.10.0'), v('1.9.0'))).toBe(1);
    expect(compareVersions(v('1.0.0-2'), v('1.0.0-10'))).toBe(-1);
  });
  it('ranks numeric prerelease identifiers below alphanumeric ones', () => {
    expect(compareVersions(v('1.0.0-1'), v('1.0.0-a'))).toBe(-1);
    expect(compareVersions(v('1.0.0-a'), v('1.0.0-1'))).toBe(1);
  });
  it('compares alphanumeric identifiers by ASCII order', () => {
    expect(compareVersions(v('1.0.0-B'), v('1.0.0-a'))).toBe(-1);
  });
  it('ignores build metadata', () => {
    expect(compareVersions(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
  });
});

describe('parseGhsaRange', () => {
  it('handles a two-sided range', () => {
    const t = parseGhsaRange('>= 4.0.0, < 4.17.21')!;
    expect(t(v('4.17.20'))).toBe(true);
    expect(t(v('4.0.0'))).toBe(true);
    expect(t(v('4.17.21'))).toBe(false);
    expect(t(v('3.9.9'))).toBe(false);
  });
  it('handles single comparators', () => {
    const lt = parseGhsaRange('< 4.17.21')!;
    expect(lt(v('0.0.1'))).toBe(true);
    expect(lt(v('4.17.21'))).toBe(false);
    const gt = parseGhsaRange('> 1.0.0')!;
    expect(gt(v('1.0.0'))).toBe(false);
    expect(gt(v('1.0.1'))).toBe(true);
  });
  it('handles exact match', () => {
    const t = parseGhsaRange('= 2.0.0')!;
    expect(t(v('2.0.0'))).toBe(true);
    expect(t(v('2.0.1'))).toBe(false);
  });
  it('expands bare versions missing minor/patch', () => {
    const t = parseGhsaRange('<= 3.1')!;
    expect(t(v('3.1.0'))).toBe(true);
    expect(t(v('3.1.1'))).toBe(false);
    expect(parseGhsaRange('>= 3')!(v('3.0.0'))).toBe(true);
  });
  it('>= 0 matches everything, prereleases included', () => {
    const t = parseGhsaRange('>= 0')!;
    expect(t(v('0.0.0'))).toBe(true);
    expect(t(v('0.0.0-alpha'))).toBe(true);
    expect(t(v('9.9.9'))).toBe(true);
  });
  it('handles prerelease bounds', () => {
    const t = parseGhsaRange('>= 4.0.0-canary.0, < 4.0.0-canary.34')!;
    expect(t(v('4.0.0-canary.5'))).toBe(true);
    expect(t(v('4.0.0-canary.34'))).toBe(false);
    expect(t(v('4.0.0'))).toBe(false);
  });
  it('tolerates spacing variants', () => {
    const t = parseGhsaRange('>=3.25.0,<3.90.0')!;
    expect(t(v('3.30.0'))).toBe(true);
    expect(t(v('3.90.0'))).toBe(false);
  });
  it('ranges never read as safe when unparseable: returns null', () => {
    for (const s of ['garbage', '', ' ', ',', '>= 1.0.0,', '>= 1.0.0, , < 2', '^1.2.3', '~1.2.3', '1.2.3', '>= x', '>= 1.x', '>=', '>= 1.0.0 < 2.0.0', '>= 1.2.3.4', '=> 1.0.0', '>= 1.0-beta', '>= 01.0.0', '* ', '>= 1.0.0 || < 0.5']) {
      expect(parseGhsaRange(s), JSON.stringify(s)).toBeNull();
    }
  });
});

describe('osvAffected', () => {
  it('introduced 0 / fixed', () => {
    const ev = [{ introduced: '0' }, { fixed: '1.2.3' }];
    expect(osvAffected(v('0.0.1'), ev)).toBe(true);
    expect(osvAffected(v('0.0.0-alpha'), ev)).toBe(true);
    expect(osvAffected(v('1.2.2'), ev)).toBe(true);
    expect(osvAffected(v('1.2.3'), ev)).toBe(false);
    expect(osvAffected(v('2.0.0'), ev)).toBe(false);
  });
  it('last_affected is inclusive', () => {
    const ev = [{ introduced: '1.0.0' }, { last_affected: '1.5.0' }];
    expect(osvAffected(v('0.9.0'), ev)).toBe(false);
    expect(osvAffected(v('1.0.0'), ev)).toBe(true);
    expect(osvAffected(v('1.5.0'), ev)).toBe(true);
    expect(osvAffected(v('1.5.1'), ev)).toBe(false);
  });
  it('open-ended range (no fixed) stays affected', () => {
    expect(osvAffected(v('99.0.0'), [{ introduced: '2.0.0' }])).toBe(true);
  });
  it('multiple introduced/fixed pairs, in any event order', () => {
    const ev = [{ introduced: '3.0.0' }, { fixed: '3.4.0' }, { introduced: '1.0.0' }, { fixed: '1.2.0' }];
    expect(osvAffected(v('1.1.0'), ev)).toBe(true);
    expect(osvAffected(v('1.2.0'), ev)).toBe(false);
    expect(osvAffected(v('2.5.0'), ev)).toBe(false);
    expect(osvAffected(v('3.3.0'), ev)).toBe(true);
    expect(osvAffected(v('3.4.0'), ev)).toBe(false);
  });
  it('reintroduction at the fixed version stays affected', () => {
    const ev = [{ introduced: '0' }, { fixed: '2.0.0' }, { introduced: '2.0.0' }, { fixed: '2.1.0' }];
    expect(osvAffected(v('2.0.0'), ev)).toBe(true);
    expect(osvAffected(v('2.1.0'), ev)).toBe(false);
  });
  it('returns null (not false) when it cannot decide', () => {
    expect(osvAffected(v('1.0.0'), [])).toBeNull();
    expect(osvAffected(v('1.0.0'), [{ introduced: 'abc' }, { fixed: '1.2.3' }])).toBeNull();
    expect(osvAffected(v('1.0.0'), [{ introduced: '0' }, { fixed: 'abc' }])).toBeNull();
    expect(osvAffected(v('1.0.0'), [{}])).toBeNull();
    expect(osvAffected(v('1.0.0'), [{ introduced: '0', fixed: '1.2.3' }])).toBeNull();
    expect(osvAffected(v('1.0.0'), [{ fixed: '1.2.3' }])).toBeNull();
  });
});

describe('parsePackageEntry / formatPackageEntry', () => {
  it('accepts valid entries', () => {
    expect(parsePackageEntry('lodash')).toEqual({ name: 'lodash' });
    expect(parsePackageEntry('lodash@4.17.15')).toEqual({ name: 'lodash', version: '4.17.15' });
    expect(parsePackageEntry('@types/node')).toEqual({ name: '@types/node' });
    expect(parsePackageEntry('@types/node@20.1.0')).toEqual({ name: '@types/node', version: '20.1.0' });
    expect(parsePackageEntry('left-pad@1.0.0-beta.1')).toEqual({ name: 'left-pad', version: '1.0.0-beta.1' });
    expect(parsePackageEntry('lodash.merge')).toEqual({ name: 'lodash.merge' });
  });
  it('rejects invalid entries', () => {
    for (const s of ['Lodash', 'lodash@^4', 'a b', 'lodash@', '', '@', '@scope', '@scope/', '@/name', '@scope/name/extra', '@@scope/name', 'lodash@1.2', 'lodash@latest', '.hidden', '_private', 'a/b', 'lodash@v1.2.3', 'lodash@1.0.0@2', ' lodash', 'lodash ', 'a'.repeat(215), 'lo%dash', 'lodash?x']) {
      expect(parsePackageEntry(s), JSON.stringify(s)).toBeNull();
    }
  });
  it('enforces the 214 character limit including scope', () => {
    expect(parsePackageEntry('a'.repeat(214))).toEqual({ name: 'a'.repeat(214) });
    const scoped = `@s/${'a'.repeat(211)}`;
    expect(parsePackageEntry(scoped)).not.toBeNull();
    expect(parsePackageEntry(`${scoped}a`)).toBeNull();
  });
  it('round-trips', () => {
    for (const s of ['lodash', 'lodash@4.17.15', '@types/node', '@types/node@20.1.0']) {
      expect(formatPackageEntry(parsePackageEntry(s)!)).toBe(s);
    }
  });
});
