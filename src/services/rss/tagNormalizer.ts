/**
 * Normalizes cybersecurity tags and extracts relevant threat intelligence terms
 * from article titles, categories, and content.
 */

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

export function normalizeAndEnrichTags(
  rawTags: string[],
  title: string,
  description: string
): string[] {
  const result = new Set<string>();

  // Process raw tags from feed categories
  for (const raw of rawTags) {
    if (!raw) continue;
    const clean = raw.trim();
    if (!clean) continue;

    const lower = clean.toLowerCase();
    if (KNOWN_TAGS_MAP[lower]) {
      result.add(KNOWN_TAGS_MAP[lower]);
    } else if (clean.length > 2 && clean.length < 35) {
      // Capitalize first letter of each word
      const formatted = clean
        .split(/[\s-_]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      result.add(formatted);
    }
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

  // Scan text for important keywords
  for (const [key, standardTag] of Object.entries(KNOWN_TAGS_MAP)) {
    if (key.length >= 3 && combinedText.includes(key)) {
      result.add(standardTag);
    }
  }

  return Array.from(result).slice(0, 8);
}
