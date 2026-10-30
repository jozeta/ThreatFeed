import { describe, it, expect } from 'vitest';
import { iocLookupLinks } from './iocLinks';

const SHA256 = 'a'.repeat(64);
const SHA1 = 'b'.repeat(40);
const MD5 = 'c'.repeat(32);

describe('iocLookupLinks', () => {
  it('links sha256 to VirusTotal and MalwareBazaar', () => {
    expect(iocLookupLinks({ type: 'hash_sha256', value: SHA256 })).toEqual([
      { label: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${SHA256}` },
      { label: 'MalwareBazaar', url: `https://bazaar.abuse.ch/sample/${SHA256}/` },
    ]);
  });

  it('gives sha1 and md5 only VirusTotal', () => {
    expect(iocLookupLinks({ type: 'hash_sha1', value: SHA1 })).toEqual([
      { label: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${SHA1}` },
    ]);
    expect(iocLookupLinks({ type: 'hash_md5', value: MD5 })).toEqual([
      { label: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${MD5}` },
    ]);
  });

  it('links an IPv4 address to four lookups', () => {
    expect(iocLookupLinks({ type: 'ipv4', value: '203.0.113.7' })).toEqual([
      { label: 'VirusTotal', url: 'https://www.virustotal.com/gui/ip-address/203.0.113.7' },
      { label: 'GreyNoise', url: 'https://viz.greynoise.io/ip/203.0.113.7' },
      { label: 'AbuseIPDB', url: 'https://www.abuseipdb.com/check/203.0.113.7' },
      { label: 'URLhaus', url: 'https://urlhaus.abuse.ch/browse.php?search=203.0.113.7' },
    ]);
  });

  it('links ATT&CK techniques, with sub-techniques as a path segment', () => {
    expect(iocLookupLinks({ type: 'mitre', value: 'T1059' })).toEqual([
      { label: 'ATT&CK', url: 'https://attack.mitre.org/techniques/T1059/' },
    ]);
    expect(iocLookupLinks({ type: 'mitre', value: 'T1059.001' })).toEqual([
      { label: 'ATT&CK', url: 'https://attack.mitre.org/techniques/T1059/001/' },
    ]);
  });

  it('links a CVE to NVD and to the in-app panel', () => {
    expect(iocLookupLinks({ type: 'cve', value: 'CVE-2024-3400' })).toEqual([
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3400' },
      { label: 'In app', url: '#/vulns/kev?cve=CVE-2024-3400' },
    ]);
  });

  it('URI-encodes values and ignores unknown types', () => {
    expect(iocLookupLinks({ type: 'ipv4', value: '1.2.3.4/x y' })[0].url).toBe('https://www.virustotal.com/gui/ip-address/1.2.3.4%2Fx%20y');
    expect(iocLookupLinks({ type: 'domain', value: 'example.com' })).toEqual([]);
  });
});
