import { describe, expect, it } from 'vitest';
import { countEntitiesByDay, decodeTrends, historyStart, mergeTrendDays, rankTrends, risers, trendsVocab, TrendVocab, weekTrendDays } from './trends';
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

describe('mergeTrendDays', () => {
  it('keeps older days, takes the larger count per entity on recounted days and keeps 400 days', () => {
    const merged = mergeTrendDays(
      { days: { '2025-01-01': { 'cve:CVE-1': 1 }, '2026-08-01': { 'cve:CVE-1': 1, 'cve:CVE-3': 2 }, '2026-10-01': { 'actor:Lazarus': 3, 'cve:CVE-1': 1 }, '2026-10-29': { 'actor:Lazarus': 5, 'vendor:Arm': 1 } } },
      { '2026-10-29': { 'actor:Lazarus': 2, 'cve:CVE-2': 1 }, '2026-10-30': { 'cve:CVE-2': 4 } },
      NOW,
    );
    expect(merged).toEqual({
      '2026-08-01': { 'cve:CVE-3': 2 }, // single mentions go after 60 days
      '2026-10-01': { 'actor:Lazarus': 3, 'cve:CVE-1': 1 },
      // Articles that rotated out of the snapshot since the last run still count
      '2026-10-29': { 'actor:Lazarus': 5, 'vendor:Arm': 1, 'cve:CVE-2': 1 },
      '2026-10-30': { 'cve:CVE-2': 4 },
    });
  });
});

describe('rankTrends', () => {
  const history = {
    '2026-10-30': { 'actor:Lazarus': 2, 'vendor:Fortinet': 1 },
    '2026-10-27': { 'actor:Lazarus': 1, 'cve:CVE-2026-1': 4 },
    '2026-10-20': { 'actor:Lazarus': 1, 'vendor:Fortinet': 5 },
    '2026-10-01': { 'vendor:Fortinet': 2 },
  };

  it('sums the period, compares it with the one before and gives a daily series', () => {
    const rows = rankTrends(history, 'week', 'all', NOW);
    expect(rows.map(r => r.key)).toEqual(['cve:CVE-2026-1', 'actor:Lazarus', 'vendor:Fortinet']);
    expect(rows[1]).toEqual({ key: 'actor:Lazarus', kind: 'actor', name: 'Lazarus', count: 3, previous: 1, change: 2, series: [0, 0, 0, 1, 0, 0, 2] });
    expect(rows[2]).toMatchObject({ count: 1, previous: 5, change: -4 });
    expect(rankTrends(history, 'week', 'vendor', NOW).map(r => r.name)).toEqual(['Fortinet']);
  });

  it('has no change when the history does not reach back over the previous period', () => {
    const rows = rankTrends(history, 'month', 'all', NOW);
    expect(rows.find(r => r.name === 'Fortinet')).toMatchObject({ count: 8, previous: null, change: null });
    expect(rows[0].series).toHaveLength(30);
  });

  it('buckets the year by week, ending today', () => {
    const [row] = rankTrends(history, 'year', 'vendor', NOW);
    expect(row.series).toHaveLength(53);
    expect(row.series.slice(-5)).toEqual([2, 0, 0, 5, 1]);
  });

  it('picks the biggest risers that have a previous period to compare with', () => {
    const rows = rankTrends(history, 'week', 'all', NOW);
    expect(risers(rows, 5).map(r => r.name)).toEqual(['CVE-2026-1', 'Lazarus']);
    expect(historyStart(history)).toBe('2026-10-01');
  });
});

describe('weekTrendDays', () => {
  it('fills days the history lacks from local articles and adds custom feeds and newer articles to the rest', () => {
    const days = weekTrendDays(
      { generatedAt: daysAgo(0, 6), days: { '2026-10-30': { 'actor:Lazarus': 2 }, '2026-10-29': {} } },
      [
        article('snap', { title: 'Lazarus', publishedAt: daysAgo(0, 8) }), // already in the history
        article('new', { title: 'Lazarus', publishedAt: daysAgo(0, 1) }), // newer than the snapshot
        article('mine', { sourceId: 'my-feed', title: 'Lazarus', publishedAt: daysAgo(1) }), // a custom feed
        article('old', { title: 'Lazarus', publishedAt: daysAgo(4) }), // before the history begins
      ],
      vocab,
      new Set(['my-feed']),
      NOW,
    );
    expect(days['2026-10-30']).toEqual({ 'actor:Lazarus': 3 });
    expect(days['2026-10-29']).toEqual({ 'actor:Lazarus': 1 });
    expect(days['2026-10-26']).toEqual({ 'actor:Lazarus': 1 });
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
    expect(decodeTrends({ version: 1, generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2, 'bad': 1, 'actor:X': -1, 'actor:Y': 'a' }, 'nope': {}, '2026-10-29': null } }))
      .toEqual({ generatedAt: 'x', days: { '2026-10-30': { 'cve:CVE-1': 2 } } });
    expect(decodeTrends(null)).toBeNull();
    expect(decodeTrends({ days: [] })).toBeNull();
  });
});
