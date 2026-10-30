import { describe, expect, it } from 'vitest';
import { CveRecord, KevEntry, LeakSiteVictim, StatsData, StatsDay } from '../../types';
import { countStatsByDay, dayTotals, decodeStats, mergeStats, STATS_KEEP_DAYS } from './stats';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const cve = (id: string, published: string, severity: CveRecord['severity']): CveRecord => ({ id, published, severity });
const kev = (cveId: string, dateAdded: string) => ({ cve: cveId, dateAdded } as KevEntry);
const victim = (id: string, discoveredAt: string, group = 'Akira', country = 'DE', sector = 'Manufacturing') =>
  ({ id, victim: id, group, country, sector, discoveredAt } as LeakSiteVictim);
const empty = (): StatsDay => ({ crit: [], high: [], kev: [], exploits: [], victims: [], groups: {}, countries: {}, sectors: {} });

const input = {
  notable: [cve('CVE-1', '2026-10-20T03:00:00Z', 'CRITICAL'), cve('CVE-2', '2026-10-20T05:00:00Z', 'HIGH')],
  kev: [kev('CVE-3', '2026-09-01')],
  exploits: { 'CVE-1': { msf: ['exploit/x'] }, 'CVE-3': { pocs: 2 }, 'CVE-2': { pocs: 0 } },
  victims: [victim('v1', '2026-10-21T08:00:00Z')],
};

describe('countStatsByDay', () => {
  it('buckets CVEs, KEV additions, exploits and victims by UTC day', () => {
    const days = countStatsByDay(input, NOW);
    expect(days['2026-10-20'].crit).toEqual(['CVE-1']);
    expect(days['2026-10-20'].high).toEqual(['CVE-2']);
    expect(days['2026-10-20'].exploits).toEqual(['CVE-1']);
    expect(days['2026-09-01'].kev).toEqual(['CVE-3']);
    expect(days['2026-09-01'].exploits).toEqual(['CVE-3']);
    expect(days['2026-10-21'].victims).toEqual(['v1']);
    expect(days['2026-10-21'].groups).toEqual({ Akira: 1 });
    expect(days['2026-10-21'].countries).toEqual({ DE: 1 });
    expect(days['2026-10-21'].sectors).toEqual({ Manufacturing: 1 });
  });
});

describe('mergeStats', () => {
  it('does not inflate when the same counts are merged twice', () => {
    const recent = countStatsByDay(input, NOW);
    const once = mergeStats(null, recent, NOW);
    const twice = mergeStats({ version: 1, generatedAt: '', days: once }, recent, NOW);
    expect(twice['2026-10-20'].crit).toHaveLength(1);
    expect(twice['2026-10-21'].groups).toEqual({ Akira: 1 });
  });
  it('drops days older than the keep window and keeps previous-only days', () => {
    const old = new Date(NOW - (STATS_KEEP_DAYS + 5) * 86400000).toISOString().slice(0, 10);
    const prev: StatsData = { version: 1, generatedAt: '', days: { [old]: { ...empty(), crit: ['A'] }, '2026-10-01': { ...empty(), crit: ['B'], groups: { Lockbit: 3 } } } };
    const merged = mergeStats(prev, countStatsByDay(input, NOW), NOW);
    expect(merged[old]).toBeUndefined();
    expect(merged['2026-10-01'].crit).toEqual(['B']);
    expect(merged['2026-10-01'].groups).toEqual({ Lockbit: 3 });
  });
  it('unions ids and keeps the larger tally per key when the recent list lacks older victims', () => {
    const prev: StatsData = { version: 1, generatedAt: '', days: { '2026-10-21': { ...empty(), victims: ['v0', 'v1'], groups: { Akira: 2 }, countries: { DE: 1, US: 1 } } } };
    const merged = mergeStats(prev, countStatsByDay(input, NOW), NOW)['2026-10-21'];
    expect(merged.victims.sort()).toEqual(['v0', 'v1']);
    expect(merged.groups).toEqual({ Akira: 2 });
    expect(merged.countries).toEqual({ DE: 1, US: 1 });
  });
});

describe('decodeStats', () => {
  it('rejects anything but a version 1 file', () => {
    expect(decodeStats(null)).toBeNull();
    expect(decodeStats({})).toBeNull();
    expect(decodeStats({ version: 2, days: {} })).toBeNull();
  });
  it('drops malformed days', () => {
    const good = { ...empty(), crit: ['CVE-1'] };
    const decoded = decodeStats({ version: 1, generatedAt: 'x', days: { '2026-10-20': good, 'nope': good, '2026-10-21': { ...good, crit: [1] } } });
    expect(Object.keys(decoded!.days)).toEqual(['2026-10-20']);
  });
});

describe('dayTotals', () => {
  it('returns the list lengths', () => {
    expect(dayTotals({ ...empty(), crit: ['a', 'b'], victims: ['c'] })).toEqual({ crit: 2, high: 0, kev: 0, exploits: 0, victims: 1 });
  });
});
