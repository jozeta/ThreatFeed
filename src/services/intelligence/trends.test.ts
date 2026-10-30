import { describe, expect, it } from 'vitest';
import { countEntitiesByDay, decodeTrends, mergeTrends, pickPreviousTrends, trendsVocab, TrendVocab } from './trends';
import { article } from '../../test/fixtures';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const DAY = 24 * 3600e3;
const daysAgo = (d: number, h = 0) => new Date(NOW - d * DAY - h * 3600e3).toISOString();
const vocab: TrendVocab = [
  { kind: 'ransomware', terms: ['LockBit'] },
  { kind: 'actor', terms: ['Lazarus'] },
  { kind: 'product', terms: ['FortiGate'] },
  { kind: 'vendor', terms: ['Fortinet', 'Arm'] },
];

describe('countEntitiesByDay', () => {
  it('counts distinct articles per entity and UTC day, for every day asked for', () => {
    const days = countEntitiesByDay([
      article('a', { title: 'Lazarus hits Fortinet FortiGate', publishedAt: daysAgo(0, 1), cves: ['CVE-2026-1', 'CVE-2026-1'] }),
      article('b', { title: 'Lazarus again', description: 'Lazarus, Lazarus', publishedAt: daysAgo(0, 2) }),
      article('c', { title: 'LockBit claims', publishedAt: daysAgo(1) }),
      article('d', { title: 'Lazarus old news', publishedAt: daysAgo(5) }),
    ], vocab, 3, NOW);
    expect(Object.keys(days).sort()).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
    expect(days['2026-10-30']).toEqual({ 'actor:Lazarus': 2, 'vendor:Fortinet': 1, 'product:FortiGate': 1, 'cve:CVE-2026-1': 1 });
    expect(days['2026-10-29']).toEqual({ 'ransomware:LockBit': 1 });
    expect(days['2026-10-28']).toEqual({});
  });

  it('matches whole words and leaves out CVE list feeds, leak-site posts and vendors in general tech news', () => {
    const days = countEntitiesByDay([
      article('a', { title: 'No harm done', publishedAt: daysAgo(0) }),
      article('g', { categories: ['Consumer Tech'], title: 'Fortinet stock rises', publishedAt: daysAgo(0) }),
      article('b', { sourceId: 'cvefeed-latest', title: 'CVE-2026-2', cves: ['CVE-2026-2'], publishedAt: daysAgo(0) }),
      article('c', { sourceId: 'ransomware-live', title: '🏴‍☠️ LockBit has just published a new victim : acme.de', publishedAt: daysAgo(0) }),
    ], vocab, 1, NOW);
    expect(days).toEqual({ '2026-10-30': {} });
  });
});

describe('mergeTrends', () => {
  it('keeps older days, takes the larger count per entity on recounted days and rolls days past 60 into weeks', () => {
    const merged = mergeTrends(
      {
        days: {
          '2024-11-01': { 'cve:CVE-9': 1, 'vendor:Arm': 1 }, // 728 days ago: still kept, as its week
          '2026-08-27': { 'cve:CVE-1': 1, 'cve:CVE-3': 1 }, // a Thursday 64 days ago: into the week of Monday 08-24
          '2026-08-31': { 'actor:Lazarus': 2, 'cve:CVE-4': 1 }, // 60 days ago, a Monday: its week isn't complete yet
          '2026-09-01': { 'actor:Lazarus': 1 }, // 59 days ago: stays a day
          '2026-10-29': { 'actor:Lazarus': 5, 'vendor:Arm': 1 },
        },
        weeks: { '2026-08-24': { 'cve:CVE-1': 2 }, '2024-10-21': { 'cve:CVE-1': 7 } }, // the second ended over 730 days ago
      },
      { '2026-10-29': { 'actor:Lazarus': 2, 'cve:CVE-2': 1 }, '2026-10-30': { 'cve:CVE-2': 4 } },
      NOW,
    );
    expect(merged).toEqual({
      days: {
        '2026-09-01': { 'actor:Lazarus': 1 },
        // Articles that rotated out of the snapshot since the last run still count
        '2026-10-29': { 'actor:Lazarus': 5, 'vendor:Arm': 1, 'cve:CVE-2': 1 },
        '2026-10-30': { 'cve:CVE-2': 4 },
      },
      weeks: {
        // In a complete week, a CVE named once is dropped (most of the file); everything else stays exact
        '2024-10-28': { 'vendor:Arm': 1 },
        '2026-08-24': { 'cve:CVE-1': 3 },
        '2026-08-31': { 'actor:Lazarus': 2, 'cve:CVE-4': 1 },
      },
    });
  });
});

describe('pickPreviousTrends', () => {
  const older = { generatedAt: '2026-10-30T10:00:00Z', days: {} };
  const newer = { generatedAt: '2026-10-30T10:30:00Z', days: {} };

  it('builds on the newer of the cached and the published history', () => {
    expect(pickPreviousTrends(newer, { data: older })).toEqual({ base: newer, write: true, source: 'cache' });
    expect(pickPreviousTrends(older, { data: newer })).toEqual({ base: newer, write: true, source: 'published' });
    expect(pickPreviousTrends(null, { data: newer })).toEqual({ base: newer, write: true, source: 'published' });
  });

  it('falls back to the cache when the published history can\'t be read', () => {
    expect(pickPreviousTrends(older, { data: null, error: 'HTTP 503' })).toEqual({ base: older, write: true, source: 'cache' });
  });

  it('writes nothing when no history could be read, unless there has never been one (404)', () => {
    expect(pickPreviousTrends(null, { data: null, error: 'HTTP 503' })).toEqual({ base: null, write: false, source: 'none' });
    expect(pickPreviousTrends(null, { data: null })).toEqual({ base: null, write: true, source: 'none' });
  });
});

describe('trendsVocab', () => {
  it('moves vendor names out of the products and leaves out everyday-word vendors', () => {
    const v = trendsVocab(['lockbit5', 'Qilin', 'qilin'], ['Fortinet', 'Progress', 'Microsoft', 'Microsoft']);
    expect(v.find(x => x.kind === 'product')!.terms).not.toContain('Fortinet');
    expect(v.find(x => x.kind === 'product')!.terms).toContain('FortiGate');
    expect(v.find(x => x.kind === 'vendor')!.terms).toEqual(['Fortinet', 'Microsoft']);
    const groups = v.find(x => x.kind === 'ransomware')!.terms;
    expect(groups).toContain('Lockbit5');
    expect(groups.filter(g => g.toLowerCase() === 'qilin')).toHaveLength(1);
  });
});

describe('decodeTrends', () => {
  it('drops malformed days and counts', () => {
    expect(decodeTrends({ version: 1, generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2, 'bad': 1, 'actor:X': -1, 'actor:Y': 'a' }, 'nope': {}, '2026-10-29': null }, weeks: { '2026-10-26': { 'cve:CVE-1': 3 }, 'x': {} } }))
      .toEqual({ generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2 } }, weeks: { '2026-10-26': { 'cve:CVE-1': 3 } } });
    expect(decodeTrends(null)).toBeNull();
    expect(decodeTrends({ days: [] })).toBeNull();
  });

  it('reads files written before the weekly rollup (no weeks) as having none', () => {
    expect(decodeTrends({ version: 1, generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2 } } }))
      .toEqual({ generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2 } }, weeks: {} });
  });
});
