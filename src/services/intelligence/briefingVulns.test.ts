import { describe, expect, it } from 'vitest';
import { buildBriefing, briefingToMarkdown } from './briefing';
import { VulnData } from '../../types';

describe('briefing: vulnerabilities in your stack', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const vulns: VulnData = {
    updatedAt: '2026-10-29T12:00:00Z',
    kev: [
      { cve: 'CVE-2026-1', vendor: 'Fortinet', product: 'FortiOS', name: 'FortiOS Heap Overflow', dateAdded: '2026-10-29', ransomware: false, cwes: [], cvss: 9.8 },
      { cve: 'CVE-2025-2', vendor: 'Fortinet', product: 'FortiOS', name: 'Old one', dateAdded: '2025-01-01', ransomware: false, cwes: [] },
      { cve: 'CVE-2026-3', vendor: 'Cisco', product: 'IOS XE', name: 'Cisco bug', dateAdded: '2026-10-29', ransomware: false, cwes: [] },
    ],
    nvd: null,
    notable: [
      { id: 'CVE-2026-4', published: '2026-10-29T08:00:00.000Z', score: 9.1, description: 'Okta Verify allows bypass' },
      { id: 'CVE-2026-5', published: '2026-10-20T08:00:00.000Z', score: 9.9, description: 'Okta older' },
    ],
    advisories: [
      { id: 'GHSA-1', summary: 'Prototype pollution', severity: 'high', publishedAt: '2026-10-29T09:00:00Z', ecosystem: 'npm', package: 'lodash', url: 'https://github.com/advisories/GHSA-1' },
    ],
    epssTop: [],
  };

  it('matches new KEV entries, critical CVEs and advisories against the stack, within the window', () => {
    const b = buildBriefing([], {}, [], ['FortiOS', 'Okta', 'lodash'], 24, now, null, vulns);
    expect(b.stackVulns.kev.map(k => k.cve)).toEqual(['CVE-2026-1']);
    expect(b.stackVulns.kev[0].terms).toEqual(['FortiOS']);
    expect(b.stackVulns.cves.map(r => r.id)).toEqual(['CVE-2026-4']);
    expect(b.stackVulns.advisories.map(a => a.id)).toEqual(['GHSA-1']);
    expect(briefingToMarkdown(b)).toContain('## Vulnerabilities in Your Stack');
  });

  it('is empty without a stack or without vulnerability data', () => {
    expect(buildBriefing([], {}, [], [], 24, now, null, vulns).stackVulns.kev).toEqual([]);
    expect(buildBriefing([], {}, [], ['FortiOS'], 24, now, null, null).stackVulns.kev).toEqual([]);
  });
});
