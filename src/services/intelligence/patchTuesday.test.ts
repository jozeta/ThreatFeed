import { describe, expect, it } from 'vitest';
import { normalizeCvrf, pickPatchMonths, refreshPatchMonths } from './patchTuesday';
import { MsrcData } from '../../types';

// Hand-trimmed from the real 2026-Oct CVRF document (api.msrc.microsoft.com/cvrf/v3.0/cvrf/2026-Oct)
const doc = {
  DocumentTitle: { Value: 'October 2026 Security Updates' },
  DocumentTracking: { Identification: { ID: { Value: '2026-Oct' } }, InitialReleaseDate: '2026-10-13T07:00:00' },
  ProductTree: {
    FullProductName: [
      { ProductID: '11926', Value: 'Windows 11 Version 24H2 for x64-based Systems' },
      { ProductID: '11927', Value: 'Windows 11 Version 24H2 for ARM64-based Systems' },
      { ProductID: '12085', Value: 'Windows Server 2025' },
      { ProductID: '12086', Value: 'Windows Server 2025 (Server Core installation)' },
      { ProductID: '11762', Value: 'Microsoft Office LTSC 2024' },
      { ProductID: '0', Value: 'Microsoft Edge (Chromium-based)' },
    ],
  },
  Vulnerability: [
    {
      CVE: 'CVE-2026-96951',
      Title: { Value: 'Windows Shell Security Feature Bypass Vulnerability' },
      Notes: [{ Title: 'Windows Shell', Type: 7 }, { Title: 'Microsoft', Type: 8 }],
      ProductStatuses: [{ ProductID: ['11926', '11927', '12085', '12086'], Type: 3 }],
      Threats: [
        { Description: { Value: 'Security Feature Bypass' }, ProductID: ['11926'], Type: 0 },
        { Description: { Value: 'Security Feature Bypass' }, ProductID: ['12085'], Type: 0 },
        { Description: { Value: 'Important' }, ProductID: ['11926'], Type: 3 },
        { Description: { Value: 'Moderate' }, ProductID: ['12085'], Type: 3 },
        { Description: { Value: 'Publicly Disclosed:No;Exploited:Yes;Latest Software Release:Exploitation Detected' }, Type: 1 },
      ],
      CVSSScoreSets: [{ BaseScore: 6.5, ProductID: ['11926'] }, { BaseScore: 7.8, ProductID: ['12085'] }],
      Remediations: [
        { Description: { Value: '5126836' }, SubType: 'Security Update', Type: 2 },
        { Description: { Value: '5126868' }, SubType: 'Security Update', Type: 2 },
        { Description: { Value: '5126868' }, SubType: 'Security Update', Type: 2 },
        { Description: { Value: 'Release Notes' }, Type: 2 },
        { URL: 'https://example.com', Type: 3 },
      ],
    },
    {
      CVE: 'CVE-2026-96100',
      Title: { Value: 'Microsoft Office Remote Code Execution Vulnerability' },
      Notes: [{ Title: 'Microsoft Office', Type: 7 }, { Title: 'Microsoft', Type: 8 }],
      ProductStatuses: [{ ProductID: ['11762'], Type: 3 }],
      Threats: [
        { Description: { Value: 'Remote Code Execution' }, ProductID: ['11762'], Type: 0 },
        { Description: { Value: 'Critical' }, ProductID: ['11762'], Type: 3 },
        { Description: { Value: 'Publicly Disclosed:Yes;Exploited:No;Latest Software Release:Exploitation More Likely' }, Type: 1 },
      ],
      CVSSScoreSets: [{ BaseScore: 8.4, ProductID: ['11762'] }],
      Remediations: [],
    },
    {
      // Third-party CVE that Microsoft only republishes (Chromium in Edge): not part of Patch Tuesday
      CVE: 'CVE-2026-11111',
      Title: { Value: 'Chromium: CVE-2026-11111 Use after free in V8' },
      Notes: [{ Title: 'Microsoft Edge (Chromium-based)', Type: 7 }, { Title: 'Chrome', Type: 8 }],
      ProductStatuses: [{ ProductID: ['0'], Type: 3 }],
      Threats: [{ Description: {}, ProductID: ['0'], Type: 0 }],
      CVSSScoreSets: [],
      Remediations: [],
    },
  ],
};

describe('normalizeCvrf', () => {
  const month = normalizeCvrf(doc)!;

  it('reads the month id, title and release date', () => {
    expect(month.id).toBe('2026-Oct');
    expect(month.title).toBe('October 2026 Security Updates');
    expect(month.released).toBe('2026-10-13T07:00:00Z');
  });

  it('keeps Microsoft CVEs only', () => {
    expect(month.cves.map((c) => c.cve)).toEqual(['CVE-2026-96951', 'CVE-2026-96100']);
  });

  it('parses exploited and publicly disclosed from the Type 1 threat', () => {
    const [shell, office] = month.cves;
    expect([shell.exploited, shell.publiclyDisclosed]).toEqual([true, false]);
    expect([office.exploited, office.publiclyDisclosed]).toEqual([false, true]);
  });

  it('takes the highest severity (Type 3), the impact (Type 0) and the highest CVSS base score', () => {
    const [shell, office] = month.cves;
    expect(shell).toMatchObject({ title: 'Windows Shell Security Feature Bypass Vulnerability', severity: 'Important', impact: 'Security Feature Bypass', cvss: 7.8 });
    expect(office).toMatchObject({ severity: 'Critical', impact: 'Remote Code Execution', cvss: 8.4 });
  });

  it('looks product names up in the product tree, without architecture or install-type duplicates', () => {
    expect(month.cves[0].products).toEqual(['Windows 11 Version 24H2', 'Windows Server 2025']);
    expect(month.cves[1].products).toEqual(['Microsoft Office LTSC 2024']);
  });

  it('collects KB numbers from the remediations, once each', () => {
    expect(month.cves[0].kb).toEqual(['KB5126836', 'KB5126868']);
    expect(month.cves[1].kb).toBeUndefined();
  });

  it('caps products at five', () => {
    const many = {
      ...doc,
      ProductTree: { FullProductName: Array.from({ length: 8 }, (_, i) => ({ ProductID: String(i), Value: `Product ${i}` })) },
      Vulnerability: [{ ...doc.Vulnerability[1], ProductStatuses: [{ ProductID: ['0', '1', '2', '3', '4', '5', '6', '7'], Type: 3 }] }],
    };
    expect(normalizeCvrf(many)!.cves[0].products).toHaveLength(5);
  });

  it('rejects documents without an id', () => {
    expect(normalizeCvrf({})).toBeNull();
    expect(normalizeCvrf(null)).toBeNull();
  });
});

describe('pickPatchMonths', () => {
  it('returns the latest monthly releases first, skipping out-of-band documents', () => {
    const list = { value: [
      { ID: '2026-Aug', DocumentTitle: 'August 2026 Security Updates', InitialReleaseDate: '2026-08-11T07:00:00Z' },
      { ID: '2026-Oct', DocumentTitle: 'October 2026 Security Updates', InitialReleaseDate: '2026-10-13T07:00:00Z' },
      { ID: '2026-Oct-OOB', DocumentTitle: 'October 2026 Out-of-Band Updates', InitialReleaseDate: '2026-10-20T07:00:00Z' },
      { ID: '2026-Sep', DocumentTitle: 'September 2026 Security Updates', InitialReleaseDate: '2026-09-08T07:00:00Z' },
      { ID: '2026-Jul', DocumentTitle: 'July 2026 Security Updates', InitialReleaseDate: '2026-07-14T07:00:00Z' },
    ] };
    expect(pickPatchMonths(list, 3)).toEqual([
      { id: '2026-Oct', released: '2026-10-13T07:00:00Z' },
      { id: '2026-Sep', released: '2026-09-08T07:00:00Z' },
      { id: '2026-Aug', released: '2026-08-11T07:00:00Z' },
    ]);
    expect(pickPatchMonths(null, 3)).toEqual([]);
  });
});

describe('refreshPatchMonths', () => {
  const list = { value: [
    { ID: '2026-Aug', DocumentTitle: 'August 2026 Security Updates', InitialReleaseDate: '2026-08-11T07:00:00Z' },
    { ID: '2026-Sep', DocumentTitle: 'September 2026 Security Updates', InitialReleaseDate: '2026-09-08T07:00:00Z' },
    { ID: '2026-Oct', DocumentTitle: 'October 2026 Security Updates', InitialReleaseDate: '2026-10-13T07:00:00Z' },
  ] };
  const docFor = (id: string) => ({ ...doc, DocumentTracking: { ...doc.DocumentTracking, Identification: { ID: { Value: id } } } });
  const fakeApi = (fail: string[] = []) => {
    const calls: string[] = [];
    const getJson = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/updates')) return list;
      const id = url.split('/').pop()!;
      if (fail.includes(id)) throw new Error('HTTP 503');
      return docFor(id);
    };
    return { calls, getJson };
  };
  const previous: MsrcData = {
    months: ['2026-Oct', '2026-Sep', '2026-Aug'].map((id) => ({ id, title: id, released: '', cves: [] })),
    updates: { '2026-Oct': '2026-10-30T06:00:00Z', '2026-Sep': '2026-09-12T00:00:00Z', '2026-Aug': '2026-08-14T00:00:00Z' },
  };
  const now = Date.parse('2026-10-30T12:00:00Z');

  it('fetches every month on the first run, newest first', async () => {
    const api = fakeApi();
    const r = await refreshPatchMonths(null, api.getJson, now);
    expect(r.data.months.map((m) => m.id)).toEqual(['2026-Oct', '2026-Sep', '2026-Aug']);
    expect(r.fetched).toHaveLength(3);
    expect(r.data.updates?.['2026-Oct']).toBe(new Date(now).toISOString());
  });

  it('carries older months over and refreshes the newest one daily', async () => {
    const api = fakeApi();
    const r = await refreshPatchMonths(previous, api.getJson, now);
    expect(r.carried).toEqual(['2026-Oct', '2026-Sep', '2026-Aug']); // October fetched 6 hours ago
    expect(api.calls).toHaveLength(1);
    const later = await refreshPatchMonths(previous, api.getJson, Date.parse('2026-10-31T07:00:00Z'));
    expect(later.fetched).toEqual(['2026-Oct']);
    expect(later.data.months[0].cves).toHaveLength(2);
  });

  it('refreshes the newest month every run in its first three days', async () => {
    const r = await refreshPatchMonths(previous, fakeApi().getJson, Date.parse('2026-10-15T12:00:00Z'));
    expect(r.fetched).toEqual(['2026-Oct']);
  });

  it('keeps the previous copy when a fetch fails, and everything when the list does', async () => {
    const r = await refreshPatchMonths(previous, fakeApi(['2026-Oct']).getJson, Date.parse('2026-10-31T07:00:00Z'));
    expect(r.failed).toEqual([{ id: '2026-Oct', error: 'HTTP 503' }]);
    expect(r.data.months.map((m) => m.id)).toEqual(['2026-Oct', '2026-Sep', '2026-Aug']);
    const down = await refreshPatchMonths(previous, async () => { throw new Error('offline'); }, now);
    expect(down.listError).toBe('offline');
    expect(down.data.months).toBe(previous.months);
  });
});
