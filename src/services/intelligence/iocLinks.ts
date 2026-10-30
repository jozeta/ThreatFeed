import { nvdUrl } from './vulns';

export interface IocLookupLink {
  label: string;
  url: string;
}

/** One-click lookup links for an extracted IOC; unknown types get none. */
export function iocLookupLinks(ioc: { type: string; value: string }): IocLookupLink[] {
  const v = encodeURIComponent(ioc.value);
  switch (ioc.type) {
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256': {
      const links = [{ label: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${v}` }];
      if (ioc.type === 'hash_sha256') links.push({ label: 'MalwareBazaar', url: `https://bazaar.abuse.ch/sample/${v}/` });
      return links;
    }
    case 'ipv4':
      return [
        { label: 'VirusTotal', url: `https://www.virustotal.com/gui/ip-address/${v}` },
        { label: 'GreyNoise', url: `https://viz.greynoise.io/ip/${v}` },
        { label: 'AbuseIPDB', url: `https://www.abuseipdb.com/check/${v}` },
        { label: 'URLhaus', url: `https://urlhaus.abuse.ch/browse.php?search=${v}` },
      ];
    case 'mitre':
      // T1059.001 lives at /techniques/T1059/001/
      return [{ label: 'ATT&CK', url: `https://attack.mitre.org/techniques/${ioc.value.split('.').map(encodeURIComponent).join('/')}/` }];
    case 'cve':
      return [
        { label: 'NVD', url: nvdUrl(ioc.value) },
        { label: 'In app', url: `#/vulns/kev?cve=${v}` },
      ];
    default:
      return [];
  }
}
