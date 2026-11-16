import { describe, it, expect } from 'vitest';
import pkgRaw from '../../package.json?raw';

describe('app version', () => {
  it('is injected from package.json', () => {
    const pkg = JSON.parse(pkgRaw) as { version: string };
    expect(__APP_VERSION__).toBe(pkg.version);
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
