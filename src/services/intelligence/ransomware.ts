import { Article } from '../../types';

export interface RansomwareVictim {
  id: string;
  group: string;
  victim: string;
  sector?: string;
  country?: string;
  publishedAt: string;
  url: string;
  description?: string;
}

// "🏴‍☠️ Aurora has just published a new victim : Meleghy Automotive & Cie. GmbH"
const TITLE_PATTERN = /^\W*(.+?) has just published a new victim\s*:\s*(.+)$/u;

let regionNames: Intl.DisplayNames | null = null;
let countryByName: Map<string, string> | null = null;

function regions(): { names: Intl.DisplayNames; byName: Map<string, string> } | null {
  if (typeof Intl === 'undefined' || !('DisplayNames' in Intl)) return null;
  if (!regionNames || !countryByName) {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    countryByName = new Map();
    // Every two-letter code that resolves to a real region name (unknown codes echo back unchanged)
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = regionNames.of(code);
        if (name && name !== code) countryByName.set(name.toLowerCase(), name);
      }
    }
  }
  return { names: regionNames, byName: countryByName };
}

/** Best-effort country: an explicit "· Country" in the description, else the victim domain's ccTLD. */
function detectCountry(victim: string, description: string): string | undefined {
  const r = regions();
  if (!r) return undefined;
  for (const part of description.split(/[·|]/).map(p => p.trim().toLowerCase())) {
    const name = r.byName.get(part);
    if (name) return name;
  }
  const tld = victim.toLowerCase().match(/\.([a-z]{2})(?:\/|$)/)?.[1];
  if (tld && !['io', 'ai', 'co', 'tv', 'me', 'cc', 'ly', 'gg', 'sh'].includes(tld)) {
    const name = r.names.of(tld === 'uk' ? 'GB' : tld.toUpperCase());
    if (name && name.toUpperCase() !== tld.toUpperCase()) return name;
  }
  return undefined;
}

function detectSector(description: string): string | undefined {
  const bracketed = description.match(/^\s*\[([^\]]{2,40})\]/)?.[1];
  if (bracketed) return bracketed.trim();
  // "telecommunications services · Malaysia | ..."
  const lead = description.split('·')[0]?.trim();
  if (description.includes('·') && lead && lead.length <= 40 && !/[.:]/.test(lead)) return lead;
  return undefined;
}

export function parseRansomwareVictim(article: Article): RansomwareVictim | null {
  const match = article.title.match(TITLE_PATTERN);
  if (!match) return null;
  const description = article.description || '';
  return {
    id: article.id,
    group: match[1].trim(),
    victim: match[2].trim(),
    sector: detectSector(description),
    country: detectCountry(match[2], description),
    publishedAt: article.publishedAt,
    url: article.url,
    description,
  };
}

export function ransomwareVictims(articles: Article[]): RansomwareVictim[] {
  return articles
    .map(parseRansomwareVictim)
    .filter((v): v is RansomwareVictim => v !== null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
