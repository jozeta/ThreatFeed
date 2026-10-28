import { describe, expect, it } from 'vitest';
import { parseRansomwareVictim } from './ransomware';
import { computeTrending } from './trending';
import { buildBriefing, briefingToMarkdown } from './briefing';
import { iocsToCsv, iocsToStix } from './iocExport';
import { calculateThreatSeverity } from './iocExtractor';
import { article } from '../../test/fixtures';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600e3).toISOString();

describe('ransomware victims', () => {
  it('parses group, victim, sector and country', () => {
    const v = parseRansomwareVictim(article('r1', {
      title: '🏴‍☠️ N0n has just published a new victim : Company #112',
      description: 'telecommunications services · Malaysia | [PENDING EXPOSURE]',
    }))!;
    expect(v).toMatchObject({ group: 'N0n', victim: 'Company #112', sector: 'telecommunications services', country: 'Malaysia' });
  });

  it('reads bracketed sectors and country TLDs', () => {
    const v = parseRansomwareVictim(article('r2', { title: '🏴‍☠️ Akira has just published a new victim : bygg.se', description: '[construction] Data published.' }))!;
    expect(v).toMatchObject({ group: 'Akira', sector: 'construction', country: 'Sweden' });
  });

  it('ignores ordinary articles', () => {
    expect(parseRansomwareVictim(article('x', { title: 'LockBit returns' }))).toBeNull();
  });
});

describe('trending', () => {
  it('counts mentions this week versus last week', () => {
    const arts = [
      article('a', { title: 'Ivanti zero-day hits VPNs', publishedAt: hoursAgo(10), cves: ['CVE-2026-1'] }),
      article('b', { title: 'More Ivanti attacks', publishedAt: hoursAgo(30), cves: ['CVE-2026-1'] }),
      article('c', { title: 'Ivanti patch', publishedAt: hoursAgo(24 * 9) }),
      article('d', { title: 'Single Citrix story', publishedAt: hoursAgo(5) }),
    ];
    const trending = computeTrending(arts, [], 7, NOW);
    expect(trending.find(t => t.name === 'Ivanti')).toMatchObject({ kind: 'product', count: 2, previous: 1 });
    expect(trending.find(t => t.name === 'CVE-2026-1')).toMatchObject({ kind: 'cve', count: 2 });
    expect(trending.find(t => t.name === 'Citrix')).toBeUndefined(); // needs 2+ mentions
  });
});

describe('briefing', () => {
  const arts = [
    article('a', { title: 'Fortinet zero-day exploited', publishedAt: hoursAgo(2), severity: 'critical', severityScore: 90, cves: ['CVE-2026-5'] }),
    article('b', { title: 'Gadget review', publishedAt: hoursAgo(3), severity: 'info', severityScore: 10 }),
    article('c', { title: 'Old critical story', publishedAt: hoursAgo(40), severity: 'critical', severityScore: 95 }),
    article('r', { sourceId: 'ransomware-live', title: '🏴‍☠️ Qilin has just published a new victim : acme.de', publishedAt: hoursAgo(1) }),
  ];
  const intel = { 'CVE-2026-5': { kev: true, kevDateAdded: '2026-10-27', epss: 0.8, percentile: 0.99 } };
  const b = buildBriefing(arts, intel, ['Fortinet'], ['FortiGate'], 24, NOW);

  it('collects the last 24h by section', () => {
    expect(b.topStories.map(s => s.cluster.primaryArticle.id)).toEqual(['a']);
    expect(b.watchlist.map(s => s.cluster.primaryArticle.id)).toEqual(['a']);
    expect(b.newKev.map(k => k.cve)).toEqual(['CVE-2026-5']);
    expect(b.ransomware.byGroup).toEqual([['Qilin', 1]]);
  });

  it('exports Markdown', () => {
    const md = briefingToMarkdown(b);
    expect(md).toContain('# ThreatFeed Daily Briefing');
    expect(md).toContain('**CRITICAL** [Fortinet zero-day exploited](https://example.com/a)');
    expect(md).toContain('**CVE-2026-5** (added 2026-10-27)');
    expect(md).toContain('Qilin (1)');
  });
});

describe('IOC export', () => {
  const src = article('x', { title: 'Report, with "quotes"' });
  const iocs = [
    { type: 'cve' as const, value: 'CVE-2026-1' },
    { type: 'ipv4' as const, value: '8.8.8.8' },
    { type: 'hash_sha256' as const, value: 'a'.repeat(64) },
    { type: 'mitre' as const, value: 'T1059.001' },
  ];

  it('writes CSV with quoting', () => {
    const csv = iocsToCsv(iocs, src);
    expect(csv.split('\n')[0]).toBe('type,value,source_title,source_url,published_at');
    expect(csv).toContain('"Report, with ""quotes"""');
  });

  it('writes a STIX 2.1 bundle', () => {
    const bundle = JSON.parse(iocsToStix(iocs, src));
    expect(bundle.type).toBe('bundle');
    const types = bundle.objects.map((o: any) => o.type);
    expect(types).toEqual(['vulnerability', 'indicator', 'indicator', 'attack-pattern', 'report']);
    expect(bundle.objects[1].pattern).toBe("[ipv4-addr:value = '8.8.8.8']");
    expect(bundle.objects[2].pattern).toBe(`[file:hashes.'SHA-256' = '${'a'.repeat(64)}']`);
    expect(bundle.objects[4].object_refs).toHaveLength(4);
  });
});

describe('KEV / EPSS severity', () => {
  it('makes KEV-listed CVEs critical and adds EPSS weight', () => {
    const base = { title: 'Vendor fixes bug', description: 'Patch notes.' };
    expect(calculateThreatSeverity(base, ['CVE-2026-9'], { 'CVE-2026-9': { kev: true } }).severity).toBe('critical');
    const plain = calculateThreatSeverity(base, ['CVE-2026-9'], {}).score;
    expect(calculateThreatSeverity(base, ['CVE-2026-9'], { 'CVE-2026-9': { kev: false, epss: 0.6 } }).score).toBe(plain + 20);
  });
});
