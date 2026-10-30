/**
 * Normalizes cybersecurity tags and extracts relevant threat intelligence terms
 * from article titles, categories, and content.
 */

import { containsTerm } from '../../utils/textMatch';

const KNOWN_TAGS_MAP: Record<string, string> = {
  'ransomware': 'Ransomware',
  'malware': 'Malware',
  'trojan': 'Malware',
  'stealer': 'Malware',
  'infostealer': 'Malware',
  'spyware': 'Malware',
  'botnet': 'Botnet',
  'apt': 'APT',
  'nation-state': 'APT',
  'threat intelligence': 'Threat Intelligence',
  'threat-intelligence': 'Threat Intelligence',
  'threat actor': 'Threat Intelligence',
  'cyber espionage': 'Threat Intelligence',
  'vulnerability': 'Vulnerability',
  'vulnerabilities': 'Vulnerability',
  'cve': 'CVE',
  'zero-day': 'Zero-Day',
  '0-day': 'Zero-Day',
  'zeroday': 'Zero-Day',
  'exploit': 'Exploit',
  'poc': 'Exploit',
  'rce': 'Remote Code Execution',
  'privilege escalation': 'Privilege Escalation',
  'incident response': 'Incident Response',
  'dfir': 'Incident Response',
  'red team': 'Red Team',
  'offensive security': 'Red Team',
  'penetration testing': 'Red Team',
  'blue team': 'Blue Team',
  'detection engineering': 'Detection Engineering',
  'siem': 'Detection Engineering',
  'soc': 'Blue Team',
  'reverse engineering': 'Reverse Engineering',
  'binary analysis': 'Reverse Engineering',
  'cloud security': 'Cloud Security',
  'aws': 'Cloud Security',
  'azure': 'Cloud Security',
  'gcp': 'Cloud Security',
  'kubernetes': 'Cloud Security',
  'application security': 'Application Security',
  'appsec': 'Application Security',
  'web security': 'Web Security',
  'xss': 'Web Security',
  'sql injection': 'Web Security',
  'sqli': 'Web Security',
  'ssrf': 'Web Security',
  'mobile security': 'Mobile Security',
  'android': 'Mobile Security',
  'ios': 'Mobile Security',
  'iot': 'IoT Security',
  'firmware': 'IoT Security',
  'privacy': 'Privacy',
  'osint': 'OSINT',
  'digital forensics': 'Forensics',
  'forensics': 'Forensics',
  'cryptography': 'Cryptography',
  'crypto': 'Cryptography',
  'supply chain': 'Supply Chain',
  'phishing': 'Phishing',
  'social engineering': 'Social Engineering',
  'data breach': 'Data Breach',
  'leak': 'Data Breach'
};

/** The threat topic a tag or keyword stands for ("trojan" and "Malware" are both Malware), if it is one */
export function threatTopic(raw: string): string | undefined {
  return KNOWN_TAGS_MAP[raw.trim().toLowerCase()];
}

function normalizeTag(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;

  const lower = clean.toLowerCase();
  if (KNOWN_TAGS_MAP[lower]) return KNOWN_TAGS_MAP[lower];
  if (clean.length > 2 && clean.length < 35) {
    // Capitalize first letter of each word
    return clean
      .split(/[\s-_]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return null;
}

/**
 * Builds an article's display tags, most specific first: the publisher's own item categories,
 * CVE IDs, then keyword topics found in the text. Feed-level tags (`feedTags`, describing the
 * source rather than the article) go last so they never crowd article-specific tags out of the cap.
 */
export function normalizeAndEnrichTags(
  rawTags: string[],
  title: string,
  description: string,
  feedTags: string[] = []
): string[] {
  const result = new Set<string>();

  // Process raw tags from the item's own categories
  for (const raw of rawTags) {
    const tag = raw && normalizeTag(raw);
    if (tag) result.add(tag);
  }

  const combinedText = `${title} ${description}`.toLowerCase();

  // Extract CVE numbers e.g. CVE-2024-1234
  const cveMatches = combinedText.match(/cve-\d{4}-\d{4,7}/gi);
  if (cveMatches) {
    for (const cve of cveMatches.slice(0, 3)) {
      result.add(cve.toUpperCase());
    }
    result.add('CVE');
    result.add('Vulnerability');
  }

  // Scan text for important keywords (whole words only: "rce" must not match "source")
  for (const [key, standardTag] of Object.entries(KNOWN_TAGS_MAP)) {
    if (key.length >= 3 && containsTerm(combinedText, key)) {
      result.add(standardTag);
    }
  }

  for (const raw of feedTags) {
    const tag = raw && normalizeTag(raw);
    if (tag) result.add(tag);
  }

  return Array.from(result).slice(0, 8);
}
