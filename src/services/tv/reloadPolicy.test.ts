import { describe, expect, it } from 'vitest';
import { mainScriptName, nextNightly, shouldReload } from './reloadPolicy';

const MIN = 60_000;

describe('mainScriptName', () => {
  it('finds the hashed main script', () => {
    expect(mainScriptName('<script type="module" crossorigin src="/ThreatFeed/assets/index-SufP6gyM.js">')).toBe('index-SufP6gyM.js');
  });
  it('ignores other scripts and garbage', () => {
    expect(mainScriptName('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(mainScriptName('<script src="/ThreatFeed/assets/vendor-abc.js"></script>')).toBeNull();
    expect(mainScriptName('garbage')).toBeNull();
    expect(mainScriptName('')).toBeNull();
  });
});

describe('shouldReload', () => {
  const now = Date.UTC(2026, 9, 31, 12, 0);
  const base = { now, runningBuild: 'index-A.js', deployedBuild: 'index-A.js', lastReloadAt: null, lastReloadBuild: null, nightlyDue: false };
  it('reloads for a new deployed build', () => expect(shouldReload({ ...base, deployedBuild: 'index-B.js' })).toBe(true));
  it('does nothing when the check failed', () => {
    expect(shouldReload({ ...base, deployedBuild: null })).toBe(false);
    expect(shouldReload({ ...base, deployedBuild: null, nightlyDue: true })).toBe(false);
  });
  it('does nothing when the build is unchanged', () => expect(shouldReload(base)).toBe(false));
  it('never reloads twice for the same build', () => {
    expect(shouldReload({ ...base, deployedBuild: 'index-B.js', lastReloadAt: now - 60 * MIN, lastReloadBuild: 'index-B.js' })).toBe(false);
  });
  it('never reloads within 10 minutes of the last reload', () => {
    expect(shouldReload({ ...base, deployedBuild: 'index-B.js', lastReloadAt: now - 5 * MIN, lastReloadBuild: 'index-A.js' })).toBe(false);
    expect(shouldReload({ ...base, deployedBuild: 'index-B.js', lastReloadAt: now - 11 * MIN, lastReloadBuild: 'index-A.js' })).toBe(true);
  });
  it('reloads nightly with no new build, unless reloaded less than 10 minutes ago', () => {
    expect(shouldReload({ ...base, nightlyDue: true })).toBe(true);
    expect(shouldReload({ ...base, nightlyDue: true, lastReloadAt: now - 5 * MIN, lastReloadBuild: 'index-A.js' })).toBe(false);
    expect(shouldReload({ ...base, nightlyDue: true, lastReloadAt: now - 11 * MIN, lastReloadBuild: 'index-A.js' })).toBe(true);
  });
  it('never reloads without a running build (dev)', () => {
    expect(shouldReload({ ...base, runningBuild: null, deployedBuild: 'index-B.js' })).toBe(false);
    expect(shouldReload({ ...base, runningBuild: null, nightlyDue: true })).toBe(false);
  });
});

describe('nextNightly', () => {
  it('is today 03:00 just before it', () => {
    const at = new Date(2026, 9, 31, 2, 59).getTime();
    expect(nextNightly(at)).toBe(new Date(2026, 9, 31, 3, 0).getTime());
  });
  it('is tomorrow 03:00 at 03:00 and after', () => {
    expect(nextNightly(new Date(2026, 9, 31, 3, 0).getTime())).toBe(new Date(2026, 10, 1, 3, 0).getTime());
    expect(nextNightly(new Date(2026, 9, 31, 22, 15).getTime())).toBe(new Date(2026, 10, 1, 3, 0).getTime());
  });
});
