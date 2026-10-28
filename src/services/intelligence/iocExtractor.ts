import { Article, CveIntel, ExtractedIOC, ThreatSeverity } from '../../types';
import { containsTerm } from '../../utils/textMatch';

// Regex patterns
const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/gi;
const MITRE_TECHNIQUE_REGEX = /\bT\d{4}(?:\.\d{3})?\b/g;
// Standard IPv4 excluding obvious private / localhost noise (127.0.0.1, 0.0.0.0, 255.255.255.255)
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const MD5_REGEX = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_REGEX = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_REGEX = /\b[a-fA-F0-9]{64}\b/g;

/**
 * Extracts and deduplicates all CVE identifiers from text.
 */
export function extractCVEs(text: string): string[] {
  if (!text) return [];
  const matches = text.match(CVE_REGEX);
  if (!matches) return [];
  const unique = new Set(matches.map(c => c.toUpperCase()));
  return Array.from(unique);
}

/**
 * Extracts all indicators of compromise (IOCs) from text.
 */
export function extractIOCs(text: string): ExtractedIOC[] {
  if (!text) return [];
  const results: ExtractedIOC[] = [];
  const seen = new Set<string>();

  const add = (type: ExtractedIOC['type'], val: string) => {
    const key = `${type}:${val.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type, value: val });
    }
  };

  // 1. CVEs
  const cves = extractCVEs(text);
  cves.forEach(c => add('cve', c));

  // 2. MITRE Techniques
  const mitre = text.match(MITRE_TECHNIQUE_REGEX);
  if (mitre) {
    mitre.forEach(m => add('mitre', m));
  }

  // 3. Hashes
  const sha256 = text.match(SHA256_REGEX);
  if (sha256) {
    sha256.slice(0, 15).forEach(h => add('hash_sha256', h.toLowerCase()));
  }

  const sha1 = text.match(SHA1_REGEX);
  if (sha1) {
    sha1.slice(0, 15).forEach(h => add('hash_sha1', h.toLowerCase()));
  }

  const md5 = text.match(MD5_REGEX);
  if (md5) {
    md5.slice(0, 15).forEach(h => add('hash_md5', h.toLowerCase()));
  }

  // 4. IPv4 Addresses (filter private/loopback/bogons)
  const ips = text.match(IPV4_REGEX);
  if (ips) {
    for (const ip of ips) {
      const [o1, o2] = ip.split('.').map(Number);
      if (
        o1 === 127 ||
        o1 === 10 ||
        (o1 === 192 && o2 === 168) ||
        (o1 === 172 && o2 >= 16 && o2 <= 31) ||
        ip === '0.0.0.0' ||
        ip === '255.255.255.255'
      ) {
        continue;
      }
      add('ipv4', ip);
      if (results.length > 50) break; // guard limit
    }
  }

  return results;
}

export interface ThreatSeverityResult {
  severity: ThreatSeverity;
  score: number;
  factors: string[];
}

/**
 * Calculates threat severity based on zero-day indicators, exploit status,
 * CVE presence, and threat-actor attribution keywords.
 *
 * Keywords are only matched against evidence about this specific article: its title,
 * description, and `tags` — which callers must set to the publisher's own per-item categories.
 * Feed-level tags and keyword-derived tags are deliberately excluded: they describe the source
 * or were guessed from the same text, and scoring them made every item of some feeds "critical".
 * `categories` (the curated feed category) only contributes the fixed category weight below.
 */
export function calculateThreatSeverity(
  article: Partial<Article>,
  detectedCVEs?: string[],
  cveIntel?: Record<string, CveIntel>
): ThreatSeverityResult {
  let score = 10; // Baseline
  const factors: string[] = [];

  const textToAnalyze = [
    article.title || '',
    article.description || '',
    (article.tags || []).join(' ')
  ].join(' ').toLowerCase();

  const cves = detectedCVEs || extractCVEs(textToAnalyze);

  // Critical Tier Indicators (Zero-day, active exploitation, unauthenticated RCE, KEV)
  const criticalKeywords = [
    'zero-day', '0-day', 'actively exploited', 'in the wild', 'under active attack',
    'remote code execution', 'unauthenticated rce', 'cisa kev', 'known exploited',
    'critical flaw', 'critical vulnerability', 'pre-auth rce', 'ransomware attack'
  ];

  for (const kw of criticalKeywords) {
    if (containsTerm(textToAnalyze, kw)) {
      factors.push(`Active threat keyword: "${kw}"`);
    }
  }
  // First indicator +35; corroborating ones (e.g. zero-day + actively exploited + RCE) add +10 each, up to +20
  const criticalHits = factors.length;
  if (criticalHits > 0) {
    score += 35 + Math.min(20, (criticalHits - 1) * 10);
  }

  // High Tier Indicators (Exploit PoC, APT campaigns, supply chain, privilege escalation)
  const highKeywords = [
    'exploit code', 'proof-of-concept', 'poc released', 'privilege escalation',
    'apt', 'nation-state', 'backdoor', 'supply chain', 'data breach', 'extortion',
    'threat actor', 'credential dumping', 'bypass authentication', 'patch tuesday'
  ];

  for (const kw of highKeywords) {
    if (containsTerm(textToAnalyze, kw)) {
      score += 20;
      factors.push(`Exploit/APT indicator: "${kw}"`);
      break;
    }
  }

  // CVE presence
  if (cves.length > 0) {
    const cveBonus = Math.min(25, cves.length * 10);
    score += cveBonus;
    factors.push(`${cves.length} CVE identifier(s) detected`);
  }

  // High priority security sources
  const prioritySources = ['cisa-advisories', 'google-project-zero', 'cisco-talos', 'the-hacker-news', 'bleeping-computer'];
  if (article.sourceId && prioritySources.includes(article.sourceId)) {
    score += 15;
    factors.push('Dispatched from high-authority threat intelligence feed');
  }

  // Category weight
  if (article.categories?.includes('Vulnerabilities') || article.categories?.includes('Threat Intelligence')) {
    score += 15;
  }

  // Authoritative exploitation data beats keyword guessing: a CVE in CISA's Known Exploited
  // Vulnerabilities catalog makes the article critical; a high EPSS score raises it.
  let inKev = false;
  if (cveIntel && cves.length > 0) {
    const intel = cves.map(c => cveIntel[c.toUpperCase()]).filter((i): i is CveIntel => Boolean(i));
    const kevHits = intel.filter(i => i.kev);
    if (kevHits.length > 0) {
      inKev = true;
      score += 40;
      factors.push(`CISA KEV: ${kevHits.length} CVE(s) known to be exploited${kevHits.some(i => i.kevRansomware) ? ', used in ransomware campaigns' : ''}`);
    }
    const maxEpss = Math.max(0, ...intel.map(i => i.epss ?? 0));
    if (maxEpss >= 0.5) {
      score += 20;
      factors.push(`EPSS ${(maxEpss * 100).toFixed(0)}%: likely to be exploited`);
    } else if (maxEpss >= 0.1) {
      score += 10;
      factors.push(`EPSS ${(maxEpss * 100).toFixed(0)}%`);
    }
  }

  // Normalize score between 0 and 100
  score = Math.min(100, Math.max(5, score));
  if (inKev) score = Math.max(score, 75);

  let severity: ThreatSeverity = 'info';
  if (score >= 75) {
    severity = 'critical';
  } else if (score >= 50) {
    severity = 'high';
  } else if (score >= 30) {
    severity = 'medium';
  } else if (score >= 15) {
    severity = 'low';
  }

  return { severity, score, factors };
}
