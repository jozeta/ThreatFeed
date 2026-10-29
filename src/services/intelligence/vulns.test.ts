import { describe, expect, it } from 'vitest';
import { assignerName, cvssBand, kevPerMonth, normalizeAdvisory, normalizeKev, normalizeNvdCve, summarizeNvd } from './vulns';
import { KevEntry } from '../../types';

describe('normalizeKev', () => {
  it('keeps the catalog fields and flags ransomware use', () => {
    const k = normalizeKev({
      cveID: 'cve-2026-41709', vendorProject: 'Broadcom', product: 'VMware ESX', vulnerabilityName: 'ESX Logging Vulnerability',
      dateAdded: '2026-10-28', dueDate: '2026-11-11', knownRansomwareCampaignUse: 'Known', cwes: ['CWE-778', 'NVD-CWE-noinfo'], shortDescription: '  Logs   nothing. ',
    });
    expect(k).toMatchObject({ cve: 'CVE-2026-41709', vendor: 'Broadcom', ransomware: true, cwes: ['CWE-778'], description: 'Logs nothing.', dueDate: '2026-11-11' });
  });

  it('rejects entries without a valid CVE id or date', () => {
    expect(normalizeKev({ cveID: 'not-a-cve', dateAdded: '2026-10-28' })).toBeNull();
    expect(normalizeKev({ cveID: 'CVE-2026-1234' })).toBeNull();
  });
});

describe('normalizeNvdCve', () => {
  const base = { id: 'CVE-2026-0001', published: '2026-10-28T10:15:00.000', sourceIdentifier: 'secalert@redhat.com', descriptions: [{ lang: 'en', value: 'Overflow.' }] };

  it('prefers the primary CVSS v3.1 score and reads the CWE', () => {
    const r = normalizeNvdCve({
      ...base,
      metrics: {
        cvssMetricV40: [{ type: 'Secondary', cvssData: { baseScore: 5.0 } }],
        cvssMetricV31: [{ type: 'Secondary', cvssData: { baseScore: 7.5 } }, { type: 'Primary', cvssData: { baseScore: 9.8 } }],
      },
      weaknesses: [{ description: [{ lang: 'en', value: 'NVD-CWE-Other' }, { lang: 'en', value: 'CWE-787' }] }],
    });
    expect(r).toMatchObject({ id: 'CVE-2026-0001', score: 9.8, severity: 'CRITICAL', cwe: 'CWE-787', assigner: 'redhat.com', description: 'Overflow.' });
    expect(r?.published).toBe('2026-10-28T10:15:00.000Z');
  });

  it('falls back to v4 and leaves unscored CVEs without a severity', () => {
    expect(normalizeNvdCve({ ...base, metrics: { cvssMetricV40: [{ type: 'Secondary', cvssData: { baseScore: 6.1 } }] } })?.severity).toBe('MEDIUM');
    expect(normalizeNvdCve({ ...base, metrics: {} })?.severity).toBeUndefined();
  });
});

describe('assignerName', () => {
  it('turns CNA e-mail addresses into domains and drops UUIDs', () => {
    expect(assignerName('cna@vuldb.com')).toBe('vuldb.com');
    expect(assignerName('psirt@security.example.org')).toBe('example.org');
    expect(assignerName('a1b2c3d4-0000-1111-2222-333344445555')).toBeUndefined();
  });
});

describe('summarizeNvd', () => {
  it('counts per day and severity across the window', () => {
    const from = new Date('2026-10-27T00:00:00Z');
    const to = new Date('2026-10-29T00:00:00Z');
    const stats = summarizeNvd([
      { id: 'A', published: '2026-10-27T05:00:00Z', severity: 'CRITICAL', cwe: 'CWE-79', assigner: 'x.com' },
      { id: 'B', published: '2026-10-28T05:00:00Z', severity: 'HIGH', cwe: 'CWE-79' },
      { id: 'C', published: '2026-10-28T06:00:00Z' },
    ], from, to);
    expect(stats.total).toBe(3);
    expect(stats.daily).toEqual([
      { date: '2026-10-27', critical: 1, high: 0, medium: 0, low: 0, unscored: 0 },
      { date: '2026-10-28', critical: 0, high: 1, medium: 0, low: 0, unscored: 1 },
    ]);
    expect(stats.cwes).toEqual([['CWE-79', 2]]);
  });
});

describe('normalizeAdvisory', () => {
  it('reads the first package and skips withdrawn advisories', () => {
    const raw = {
      ghsa_id: 'GHSA-aaaa-bbbb-cccc', cve_id: 'CVE-2026-118664', summary: 'Prototype pollution', severity: 'high',
      published_at: '2026-10-29T16:41:28Z', html_url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      vulnerabilities: [{ package: { ecosystem: 'npm', name: 'decode-uri-component' } }],
    };
    expect(normalizeAdvisory(raw)).toMatchObject({ id: 'GHSA-aaaa-bbbb-cccc', ecosystem: 'npm', package: 'decode-uri-component', severity: 'high' });
    expect(normalizeAdvisory({ ...raw, withdrawn_at: '2026-10-29T17:00:00Z' })).toBeNull();
    expect(normalizeAdvisory({ ...raw, html_url: 'https://evil.example/' })?.url).toBe('https://github.com/advisories/GHSA-aaaa-bbbb-cccc');
  });
});

describe('kevPerMonth', () => {
  it('buckets additions into the last N months, ransomware separately', () => {
    const entry = (dateAdded: string, ransomware = false) => ({ cve: 'CVE-1', dateAdded, ransomware } as KevEntry);
    const months = kevPerMonth([entry('2026-10-01', true), entry('2026-10-20'), entry('2026-09-05'), entry('2025-01-01')], 2, new Date('2026-10-29T00:00:00Z'));
    expect(months).toEqual([
      { month: '2026-09', total: 1, ransomware: 0 },
      { month: '2026-10', total: 2, ransomware: 1 },
    ]);
  });
});

describe('cvssBand', () => {
  it('maps scores to the CVSS severity bands, edges included', () => {
    expect(cvssBand(10)).toBe('critical');
    expect(cvssBand(9)).toBe('critical');
    expect(cvssBand(8.9)).toBe('high');
    expect(cvssBand(7)).toBe('high');
    expect(cvssBand(4)).toBe('medium');
    expect(cvssBand(0.1)).toBe('low');
    expect(cvssBand(0)).toBe('unscored');
    expect(cvssBand(undefined)).toBe('unscored');
  });
});
