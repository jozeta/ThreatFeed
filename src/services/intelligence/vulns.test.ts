import { describe, expect, it } from 'vitest';
import { applyNvdUpdates, assignerName, cvssBand, daysToKev, median, timeToKevBucket, decodeNvdCache, encodeNvdCache, isRemoteNoAuth, kevPerMonth, parseVector, normalizeAdvisory, normalizeKev, normalizeNvdCve, summarizeNvd } from './vulns';
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

describe('NVD cache', () => {
  const records = [
    { id: 'CVE-2026-0001', published: '2026-10-20T00:00:00.000Z', score: 9.8, severity: 'CRITICAL' as const, cwe: 'CWE-787', assigner: 'x.com', description: 'Critical bug.',
      vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', ssvc: { exploitation: 'active' as const, automatable: 'yes' as const, impact: 'total' as const }, products: ['Acme Gateway'] },
    { id: 'CVE-2026-0002', published: '2026-10-21T00:00:00.000Z', score: 5.0, severity: 'MEDIUM' as const, description: 'Not stored.', vector: 'CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:U/C:L/I:N/A:N', products: ['Not stored'] },
    { id: 'CVE-2026-0003', published: '2026-10-22T00:00:00.000Z' },
  ];
  const kev = { 'CVE-2021-1': { id: 'CVE-2021-1', published: '2021-01-01T00:00:00.000Z', score: 9.8, severity: 'CRITICAL' as const, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', products: ['Acme VPN'] } };

  it('round-trips, keeping full detail only for critical CVEs and KEV entries', () => {
    const decoded = decodeNvdCache(JSON.parse(JSON.stringify(encodeNvdCache({ fetchedAt: '2026-10-29T10:00:00.000Z', records, kev }))));
    expect(decoded?.records[0]).toEqual(records[0]);
    expect(decoded?.records[1]).toMatchObject({ id: 'CVE-2026-0002', score: 5, description: undefined, vector: 'AV:L/PR:L/UI:R', products: undefined });
    expect(decoded?.records[2].score).toBeUndefined();
    expect(decoded?.kev['CVE-2021-1']).toMatchObject({ score: 9.8, products: ['Acme VPN'], vector: kev['CVE-2021-1'].vector });
  });

  it('rejects malformed caches and the old format', () => {
    expect(decodeNvdCache(null)).toBeNull();
    expect(decodeNvdCache({ version: 1, fetchedAt: '2026-10-29', records: [], kevScores: {} })).toBeNull();
    expect(decodeNvdCache({ version: 2, fetchedAt: 'nope', records: [], kev: [] })).toBeNull();
  });

  it('applies updates and drops CVEs that left the window', () => {
    const updated = applyNvdUpdates(records, [
      { id: 'CVE-2026-0003', published: '2026-10-22T00:00:00.000Z', score: 9.1, severity: 'CRITICAL' },
      { id: 'CVE-2026-0004', published: '2026-10-29T00:00:00.000Z' },
      { id: 'CVE-2019-0001', published: '2019-01-01T00:00:00.000Z', score: 7 },
    ], new Date('2026-10-21T00:00:00.000Z'));
    expect(updated.map(r => r.id).sort()).toEqual(['CVE-2026-0002', 'CVE-2026-0003', 'CVE-2026-0004']);
    expect(updated.find(r => r.id === 'CVE-2026-0003')?.score).toBe(9.1);
  });
});

describe('NVD enrichment', () => {
  it('reads the vector, CISA SSVC and affected products', () => {
    const r = normalizeNvdCve({
      id: 'CVE-2026-0005', published: '2026-10-28T10:00:00.000',
      metrics: {
        cvssMetricV31: [{ type: 'Primary', cvssData: { baseScore: 9.8, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' } }],
        ssvcV203: [{ ssvcData: { options: [{ exploitation: 'active' }, { automatable: 'yes' }, { technicalImpact: 'total' }] } }],
      },
      affected: [{ affectedData: [{ vendor: 'GitLab', product: 'GitLab' }, { vendor: 'n/a', product: 'Widget' }] }],
      configurations: [{ nodes: [{ cpeMatch: [{ vulnerable: true, criteria: 'cpe:2.3:a:gitlab:gitlab:*:*:*:*:*:*:*:*' }, { vulnerable: true, criteria: 'cpe:2.3:o:microsoft:windows_server:2019:*:*:*:*:*:*:*' }] }] }],
    });
    expect(r?.ssvc).toEqual({ exploitation: 'active', automatable: 'yes', impact: 'total' });
    expect(r?.products).toEqual(['GitLab GitLab', 'Widget', 'microsoft windows server']);
    expect(isRemoteNoAuth(r?.vector)).toBe(true);
    expect(isRemoteNoAuth('CVSS:3.1/AV:N/AC:L/PR:L/UI:N')).toBe(false);
    expect(parseVector('CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:P')).toEqual({ av: 'L', pr: 'N', ui: 'P' });
  });

  it('summarizes attack vectors, remote no-auth bugs and SSVC ratings', () => {
    const stats = summarizeNvd([
      { id: 'A', published: '2026-10-27T05:00:00Z', vector: 'AV:N/PR:N/UI:N', ssvc: { exploitation: 'poc' } },
      { id: 'B', published: '2026-10-27T06:00:00Z', vector: 'AV:L/PR:L/UI:N' },
      { id: 'C', published: '2026-10-27T07:00:00Z' },
    ], new Date('2026-10-27T00:00:00Z'), new Date('2026-10-28T00:00:00Z'));
    expect(stats.remoteNoAuth).toBe(1);
    expect(Object.fromEntries(stats.attackVectors!)).toEqual({ Network: 1, Local: 1, Unknown: 1 });
    expect(stats.ssvcExploitation).toEqual([['poc', 1]]);
  });
});

describe('time to KEV', () => {
  it('measures days from publication to listing and buckets them', () => {
    const entry = (published: string, dateAdded: string) => ({ cve: 'CVE-1', dateAdded, published } as KevEntry);
    expect(daysToKev(entry('2026-10-01T12:00:00.000Z', '2026-10-01'))).toBe(0);
    expect(daysToKev(entry('2026-10-01T12:00:00.000Z', '2026-10-06'))).toBe(5);
    expect(daysToKev(entry('2026-10-10T00:00:00.000Z', '2026-10-06'))).toBe(-4); // listed before NVD published it
    expect(daysToKev({ cve: 'CVE-1', dateAdded: '2026-10-06' } as KevEntry)).toBeUndefined();
    expect([-4, 0, 5, 30, 200, 900].map(timeToKevBucket)).toEqual(['zero', 'zero', 'week', 'month', 'year', 'older']);
    expect(median([5, 1, 9])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(3);
    expect(median([])).toBeUndefined();
  });
});
