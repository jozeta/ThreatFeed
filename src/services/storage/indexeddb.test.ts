import { describe, expect, it } from 'vitest';
import { cleanImportedSettings } from './indexeddb';

describe('cleanImportedSettings', () => {
  const imported = { npmPackages: ['lodash@4.17.15', 'Lodash@^4', 7], npmOsvLookup: true };
  it('drops malformed npm entries', () => {
    expect(cleanImportedSettings(imported, undefined, false).npmPackages).toEqual(['lodash@4.17.15']);
  });
  it('keeps the backup\'s OSV opt-in on a restore', () => {
    expect(cleanImportedSettings(imported, { npmOsvLookup: false }, false).npmOsvLookup).toBe(true);
  });
  it('keeps this device\'s OSV setting on a synced import, even when the remote has it on', () => {
    expect(cleanImportedSettings(imported, { npmOsvLookup: false }, true).npmOsvLookup).toBe(false);
    expect(cleanImportedSettings(imported, undefined, true).npmOsvLookup).toBe(false);
    expect(cleanImportedSettings({ ...imported, npmOsvLookup: false }, { npmOsvLookup: true }, true).npmOsvLookup).toBe(true);
  });
});
