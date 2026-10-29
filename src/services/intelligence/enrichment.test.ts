import { describe, expect, it } from 'vitest';
import {
  aggregatePayments, attackProfiles, cvesFromArticles, cvesInTtps, exploitInfo, isPubliclyReported, normalizeGroupDetail,
  malpediaProfiles, normalizeGroupName, normalizePublicAttack, stopRansomwareAdvisories, parseMetasploit, parseNuclei, parsePocIndex, paymentFamilyFor, publicReportIndex,
} from './enrichment';
import { Article } from '../../types';

describe('exploit datasets', () => {
  it('reads Metasploit, Nuclei and PoC-in-GitHub', () => {
    const msf = parseMetasploit({
      a: { fullname: 'auxiliary/scanner/http/log4shell_scanner', references: ['CVE-2021-44228', 'URL-https://x'] },
      b: { fullname: 'exploit/multi/http/log4shell_header_injection', references: ['cve-2021-44228'] },
    });
    expect(msf.get('CVE-2021-44228')).toEqual(['exploit/multi/http/log4shell_header_injection', 'auxiliary/scanner/http/log4shell_scanner']);

    const nuclei = parseNuclei('{"ID":"CVE-2021-44228","file_path":"http/cves/2021/CVE-2021-44228.yaml"}\nnot json\n');
    expect(nuclei.get('CVE-2021-44228')).toBe('http/cves/2021/CVE-2021-44228.yaml');

    const pocs = parsePocIndex([
      '## 2021', '### CVE-2021-44228 (2021-12-10)', '<code>Log4j</code>', '',
      '- [a/one](https://github.com/a/one)', '- [b/two](https://github.com/b/two)', '### CVE-2021-0001 (2021-01-01)', '',
    ].join('\n'));
    expect(pocs.get('CVE-2021-44228')).toEqual(['https://github.com/a/one', 'https://github.com/b/two']);
    expect(pocs.has('CVE-2021-0001')).toBe(false);

    expect(exploitInfo('CVE-2021-44228', msf, nuclei, pocs)).toMatchObject({ pocs: 2, nuclei: 'http/cves/2021/CVE-2021-44228.yaml' });
    expect(exploitInfo('CVE-1999-0001', msf, nuclei, pocs)).toBeUndefined();
  });
});

describe('group names', () => {
  it('normalizes versions and filler words', () => {
    expect(normalizeGroupName('LockBit 3.0')).toBe('lockbit');
    expect(normalizeGroupName('lockbit5')).toBe('lockbit');
    expect(normalizeGroupName('Black Basta')).toBe('blackbasta');
    expect(normalizeGroupName('Rhysida Ransomware Group')).toBe('rhysida');
  });
});

describe('Ransomware.live group detail', () => {
  it('keeps TTPs, tools and first-seen but never leak-site locations', () => {
    const d = normalizeGroupDetail({
      name: 'akira', added_date: '2023-04-26', altname: 'Storm-1567, Howling Scorpius', description: '<p>Akira <b>emerged</b></p>',
      locations: [{ fqdn: 'x.onion', available: true, enabled: true, type: 'DLS' }, { fqdn: 'y.onion', available: false, enabled: true, type: 'Chat' }, { fqdn: 'z.onion', enabled: false }],
      ttps: [{ tactic_id: 'TA0001', tactic_name: 'Initial Access', techniques: [{ technique_id: 'T1190', technique_name: 'Exploit Public-Facing Application', technique_details: 'Exploits CVE-2023-20269 in Cisco ASA.' }] }],
      tools: [{ CredentialTheft: ['Mimikatz', 'LaZagne'] }],
    });
    expect(d).toMatchObject({ firstSeen: '2023-04-26', altNames: ['Storm-1567', 'Howling Scorpius'], description: 'Akira emerged', tools: { CredentialTheft: ['Mimikatz', 'LaZagne'] } });
    expect(JSON.stringify(d)).not.toContain('onion');
    expect(d?.leakSites).toEqual({ total: 2, online: 1, types: { DLS: 1, Chat: 1 } });
    expect(cvesInTtps(d?.ttps)).toEqual(['CVE-2023-20269']);
  });
});

describe('publicly reported attacks', () => {
  it('normalizes reports and matches leak-site victims by domain or name', () => {
    const a = normalizePublicAttack({
      victim: 'Turner Construction Company', domain: 'https://turnerconstruction.com/', country: 'us', date: '2026-07-15', added: '2026-10-01',
      summary: 'Unauthorized access.', url: 'https://oag.ca.gov/notice.pdf', claim_gang: false, link: 'https://www.ransomware.live/id/abc',
    });
    expect(a).toMatchObject({ domain: 'turnerconstruction.com', country: 'US', group: undefined, sourceUrl: 'https://oag.ca.gov/notice.pdf' });
    const index = publicReportIndex([a!]);
    expect(isPubliclyReported({ victim: 'Someone', domain: 'turnerconstruction.com' }, index)).toBe(true);
    expect(isPubliclyReported({ victim: 'Turner Construction Co.' }, index)).toBe(true);
    expect(isPubliclyReported({ victim: 'Other Corp' }, index)).toBe(false);
  });
});

describe('CVEs linked to groups', () => {
  const article = (title: string, cves: string[], description = '') => ({ id: title, title, description, cves } as Article);

  it('trusts CISA #StopRansomware advisories and counts news co-mentions of ransomware-linked KEV CVEs', () => {
    const links = cvesFromArticles([
      article('#StopRansomware: Akira Ransomware', ['CVE-2024-1', 'CVE-2024-2']),
      article('Akira ransomware hits hospitals via Cisco flaw', ['CVE-2024-3', 'CVE-2024-9']),
      article('Akira ransomware again exploits the Cisco flaw', ['CVE-2024-3']),
      article('Play store update', ['CVE-2024-3']), // no ransomware context
    ], ['akira', 'play'], new Set(['CVE-2024-3']));
    expect(links.get('akira')).toEqual([
      { cve: 'CVE-2024-1', source: 'cisa', articles: 1 },
      { cve: 'CVE-2024-2', source: 'cisa', articles: 1 },
      { cve: 'CVE-2024-3', source: 'news', articles: 2 },
    ]);
    expect(links.has('play')).toBe(false);
  });
});

describe('MITRE ATT&CK', () => {
  it('matches only objects ATT&CK describes as ransomware, preferring the group', () => {
    const bundle = { objects: [
      { type: 'intrusion-set', id: 'is1', name: 'Akira', aliases: ['Akira', 'Storm-1567'], description: 'Akira is a ransomware group', external_references: [{ source_name: 'mitre-attack', external_id: 'G1024', url: 'https://attack.mitre.org/groups/G1024' }] },
      { type: 'malware', id: 'm1', name: 'Akira', description: 'Akira ransomware', external_references: [{ source_name: 'mitre-attack', external_id: 'S1129' }] },
      { type: 'malware', id: 'm2', name: 'Hydraq', aliases: ['Aurora'], description: 'Backdoor used in Operation Aurora', external_references: [{ source_name: 'mitre-attack', external_id: 'S0203' }] },
      { type: 'intrusion-set', id: 'is2', name: 'The Gentlemen', aliases: ['Storm-2603'], description: 'A ransomware group', external_references: [{ source_name: 'mitre-attack', external_id: 'G1058' }] },
      { type: 'attack-pattern', id: 'ap1', name: 'Valid Accounts', external_references: [{ source_name: 'mitre-attack', external_id: 'T1078' }] },
      { type: 'relationship', relationship_type: 'uses', source_ref: 'is1', target_ref: 'ap1' },
      { type: 'relationship', relationship_type: 'uses', source_ref: 'is1', target_ref: 'm1' },
    ] };
    const profiles = attackProfiles(bundle, ['akira', 'aurora', 'storm', 'thegentlemen']);
    expect(profiles.has('storm')).toBe(false); // "Storm-2603" is a tracking code, not the "Storm" group
    expect(profiles.get('thegentlemen')?.id).toBe('G1058');
    expect(profiles.get('akira')).toMatchObject({ id: 'G1024', aliases: ['Storm-1567'], techniques: [{ id: 'T1078', name: 'Valid Accounts' }], software: ['Akira'] });
    expect(profiles.has('aurora')).toBe(false);
  });
});

describe('Ransomwhere payments', () => {
  it('sums per family and year, skipping unlabeled addresses', () => {
    const families = aggregatePayments({ result: [
      { family: 'REvil / Sodinokibi', transactions: [{ time: 1609459200, amountUSD: 1000.4 }, { time: 1640995200, amountUSD: 500 }] },
      { family: 'Unlabeled', transactions: [{ time: 1609459200, amountUSD: 99999 }] },
    ] });
    expect(families).toEqual([{ family: 'REvil / Sodinokibi', totalUsd: 1500, transactions: 2, byYear: { 2021: 1000, 2022: 500 } }]);
    expect(paymentFamilyFor('revil', families)?.family).toBe('REvil / Sodinokibi');
    expect(paymentFamilyFor('akira', families)).toBeUndefined();
  });
});

describe('Malpedia', () => {
  it('matches ransomware families only, keeping the variant with the most references', () => {
    const profiles = malpediaProfiles({
      'win.akira': { common_name: 'Akira', alt_names: ['REDBIKE'], attribution: ['Storm-1567'], urls: ['https://a.example/akira-ransomware', 'https://b.example/x'] },
      'elf.akira': { common_name: 'Akira', urls: ['https://a.example/akira-ransomware'] },
      'win.helix': { common_name: 'Helix', description: 'A banking trojan', urls: ['https://c.example/helix'] },
    }, ['akira', 'helix']);
    expect(profiles.get('akira')).toEqual({
      attribution: ['Storm-1567'], altNames: ['REDBIKE'],
      references: ['https://a.example/akira-ransomware', 'https://b.example/x'],
      malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.akira',
    });
    expect(profiles.has('helix')).toBe(false);
  });

  it('finds CISA #StopRansomware advisories per group', () => {
    const advisories = stopRansomwareAdvisories([
      { id: '1', title: '#StopRansomware: Akira Ransomware', url: 'https://www.cisa.gov/a', publishedAt: '2026-10-01T00:00:00Z' } as Article,
      { id: '2', title: 'Akira hits again', url: 'https://news.example/b', publishedAt: '2026-10-02T00:00:00Z' } as Article,
    ], ['akira']);
    expect(advisories.get('akira')).toEqual([{ title: '#StopRansomware: Akira Ransomware', url: 'https://www.cisa.gov/a', date: '2026-10-01' }]);
  });
});
