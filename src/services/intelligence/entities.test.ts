import { describe, expect, it } from 'vitest';
import { buildEntities, decodeEntities } from './entities';

describe('buildEntities', () => {
  const actors = {
    actors: [{ id: 'G0007', name: 'APT28', aliases: ['Fancy Bear', 'STRONTIUM', 'Sednit'] }],
    malware: [
      { id: 'mimikatz', name: 'Mimikatz', aliases: [] },
      { id: 'net', name: 'Net', aliases: ['net.exe'] },
      { id: 'ping', name: 'ping', aliases: [] },
      { id: 'cobalt-strike', name: 'Cobalt Strike', aliases: ['CS', 'Beacon'] },
    ],
  };

  it('keeps canonical KEV vendors once each, without the everyday-word ones', () => {
    const e = buildEntities({ kevVendors: ['Fortinet', 'fortinet', 'Microsoft Corporation', 'Microsoft', 'Progress', 'Arm', 'Versa', 'Cisco '], groups: [], victimGroups: [], actors: null });
    expect(e.vendors).toEqual(['Cisco', 'Fortinet', 'Microsoft']);
  });

  it('merges profiled groups with leak-site group names, keyed lowercase and title-cased for display', () => {
    const e = buildEntities({
      kevVendors: [],
      groups: [{ key: 'lockbit5', name: 'lockbit5', aliases: ['LockBit 5.0', 'lockbit5'] }],
      victimGroups: ['qilin', 'LockBit5', 'Global Secret Group', 'N0n'],
      actors: null,
    });
    expect(e.groups).toEqual([
      { key: 'global secret group', name: 'Global Secret Group', aliases: [] },
      { key: 'lockbit5', name: 'Lockbit5', aliases: ['LockBit 5.0'] },
      { key: 'qilin', name: 'Qilin', aliases: [] },
    ]);
  });

  it('drops names that never count as mentions: commands and terms under four characters', () => {
    const e = buildEntities({ kevVendors: [], groups: [], victimGroups: [], actors });
    expect(e.actors).toEqual([{ id: 'G0007', name: 'APT28', aliases: ['Fancy Bear', 'STRONTIUM', 'Sednit'] }]);
    expect(e.malware).toEqual([
      { id: 'cobalt-strike', name: 'Cobalt Strike', aliases: ['Beacon'] },
      { id: 'mimikatz', name: 'Mimikatz', aliases: [] },
      { id: 'net', name: 'Net', aliases: ['net.exe'] },
    ]);
  });
});

describe('decodeEntities', () => {
  it('rejects what is not the file', () => {
    expect(decodeEntities(null)).toBeNull();
    expect(decodeEntities({ vendors: 'x' })).toBeNull();
    expect(decodeEntities([])).toBeNull();
  });

  it('reads version 1 or an unversioned file, and nothing newer it would misread', () => {
    expect(decodeEntities({ version: 1, vendors: ['Fortinet'] })?.vendors).toEqual(['Fortinet']);
    expect(decodeEntities({ vendors: ['Fortinet'] })?.vendors).toEqual(['Fortinet']);
    expect(decodeEntities({ version: 2, vendors: ['Fortinet'] })).toBeNull();
    expect(decodeEntities({ version: '1', vendors: ['Fortinet'] })).toBeNull();
  });

  it('drops malformed entries and fields, keeping the rest', () => {
    const data = decodeEntities({
      generatedAt: '2026-10-30T12:00:00Z',
      vendors: ['Fortinet', 3, '', null],
      groups: [{ key: 'akira', name: 'Akira', aliases: ['Akira 2', 7] }, { key: 'x' }, { key: 'storm', name: 'Storm' }],
      actors: [{ id: 'G0007', name: 'APT28', aliases: 'nope' }, { name: 'no id' }],
      malware: 'nope',
    });
    expect(data).toEqual({
      generatedAt: '2026-10-30T12:00:00Z',
      vendors: ['Fortinet'],
      groups: [{ key: 'akira', name: 'Akira', aliases: ['Akira 2'] }, { key: 'storm', name: 'Storm', aliases: [] }],
      actors: [{ id: 'G0007', name: 'APT28', aliases: [] }],
      malware: [],
    });
  });
});
