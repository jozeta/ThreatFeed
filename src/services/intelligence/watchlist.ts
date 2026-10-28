import { Article } from '../../types';
import { containsTerm } from '../../utils/textMatch';

export interface WatchlistPreset {
  id: string;
  label: string;
  keywords: string[];
  /** Part of the default watchlist for new installs */
  isDefault: boolean;
}

// Terms are matched as whole words, case-insensitively, against title, summary, tags and CVEs.
// Prefer specific phrases: broad words ("hack", "breach") would flag almost every security story.
export const WATCHLIST_PRESETS: WatchlistPreset[] = [
  {
    id: 'active-exploitation',
    label: 'Active Exploitation & Zero-Days',
    keywords: [
      'zero-day', '0-day', 'actively exploited', 'exploited in the wild', 'under active exploitation',
      'CISA KEV', 'Known Exploited Vulnerabilities', 'emergency patch', 'out-of-band',
    ],
    isDefault: true,
  },
  {
    id: 'critical-cves',
    label: 'Critical CVEs',
    keywords: [
      'remote code execution', 'unauthenticated', 'authentication bypass', 'pre-auth',
      'CVSS 10', 'CVSS 9.8', 'CVSS 9.9', 'critical vulnerability', 'critical flaw', 'proof-of-concept',
    ],
    isDefault: true,
  },
  {
    id: 'ransomware',
    label: 'Ransomware Groups & Extortion',
    keywords: [
      'ransomware attack', 'LockBit', 'Akira', 'Qilin', 'RansomHub', 'Black Basta', 'BlackCat', 'ALPHV',
      'Cl0p', 'Clop', 'Medusa', 'Scattered Spider', 'double extortion', 'leak site',
    ],
    isDefault: true,
  },
  {
    id: 'hacking-attacks',
    label: 'Hacking Attacks & Campaigns',
    keywords: [
      'cyberattack', 'supply chain attack', 'data breach', 'wiper',
      'Salt Typhoon', 'Volt Typhoon', 'Lazarus', 'Sandworm',
    ],
    isDefault: true,
  },
  {
    id: 'edge-devices',
    label: 'Frequently Exploited Products',
    keywords: [
      'Fortinet', 'FortiGate', 'Ivanti', 'Palo Alto', 'PAN-OS', 'Cisco', 'Citrix', 'NetScaler', 'SonicWall',
      'Juniper', 'BIG-IP', 'VMware', 'ESXi', 'Veeam', 'MOVEit', 'Exchange', 'SharePoint', 'Confluence',
      'CrowdStrike', 'Active Directory',
    ],
    isDefault: true,
  },
  {
    id: 'cloud',
    label: 'Cloud Infrastructure',
    keywords: ['AWS', 'Azure', 'Google Cloud', 'Kubernetes'],
    isDefault: false,
  },
  {
    id: 'identity',
    label: 'Identity & Access',
    keywords: ['Okta', 'Active Directory', 'Entra ID', 'Kerberos'],
    isDefault: false,
  },
  {
    id: 'apt',
    label: 'Nation-State & APT Actors',
    keywords: ['Lazarus', 'APT28', 'APT29', 'Midnight Blizzard', 'Volt Typhoon', 'Salt Typhoon', 'Sandworm'],
    isDefault: false,
  },
];

export const DEFAULT_WATCHLIST_KEYWORDS: string[] = Array.from(
  new Set(WATCHLIST_PRESETS.filter(p => p.isDefault).flatMap(p => p.keywords))
);

// Bump when DEFAULT_WATCHLIST_KEYWORDS gains terms that existing users should receive.
export const WATCHLIST_DEFAULTS_VERSION = 2;

// The defaults shipped before versioning (v1), used to tell "new default" from "user removed it".
const LEGACY_DEFAULT_KEYWORDS = [
  'Fortinet', 'Ivanti', 'Palo Alto', 'CrowdStrike', 'LockBit', 'Salt Typhoon', 'Active Directory', 'Exchange', 'Cisco',
];

/**
 * Adds default keywords introduced after the user's saved defaults version, without
 * re-adding older defaults the user deliberately removed or touching their own terms.
 */
export function upgradeWatchlistKeywords(saved: string[], savedVersion: number): string[] {
  if (savedVersion >= WATCHLIST_DEFAULTS_VERSION) return saved;
  const legacy = new Set(LEGACY_DEFAULT_KEYWORDS.map(k => k.toLowerCase()));
  const existing = new Set(saved.map(k => k.toLowerCase()));
  const added = DEFAULT_WATCHLIST_KEYWORDS.filter(k => !legacy.has(k.toLowerCase()) && !existing.has(k.toLowerCase()));
  return [...saved, ...added];
}

export interface WatchlistMatchResult {
  matched: boolean;
  matchedTerms: string[];
}

/**
 * Checks an article against the user's active watchlist terms.
 * Performs word-boundary / case-insensitive search across title, description, custom tags, and CVEs.
 */
export function checkWatchlistMatch(
  article: Article,
  watchlistKeywords: string[] = []
): WatchlistMatchResult {
  if (!watchlistKeywords || watchlistKeywords.length === 0) {
    return { matched: false, matchedTerms: [] };
  }

  // Auto-generated tags are left out: feed-level tags (e.g. BleepingComputer's "data-breach") sit on
  // every item of a feed and would flag it regardless of content. Tags the user added are deliberate.
  const searchableText = [
    article.title || '',
    article.description || '',
    (article.customTags || []).join(' '),
    (article.cves || []).join(' ')
  ].join(' ').toLowerCase();

  const matchedTerms: string[] = [];

  for (const rawTerm of watchlistKeywords) {
    const term = rawTerm.trim();
    if (!term) continue;

    // Whole-word match so short terms like "APT" don't hit "adapt"
    if (containsTerm(searchableText, term)) {
      matchedTerms.push(term);
    }
  }

  return {
    matched: matchedTerms.length > 0,
    matchedTerms
  };
}
