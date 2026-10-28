import { Article, BreachRecord, LeakSiteVictim, RansomwareGroupProfile } from '../../types';
import { stripHtmlToText } from '../rss/sanitizer';
import { containsTerm } from '../../utils/textMatch';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANSOMWARE_LIVE = 'https://www.ransomware.live/';

const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || /^(none|null|not found|n\/a)$/i.test(text)) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * One record from the Ransomware.live /v2 API. Leak-site URLs (claim_url, usually .onion) and
 * screenshots are deliberately dropped: the app never links to criminal infrastructure.
 */
export function normalizeVictim(raw: any): LeakSiteVictim | null {
  const victim = clean(raw?.victim, 200);
  const group = clean(raw?.group, 80);
  // Groups sometimes post their own channels as "victims" (e.g. a t.me link): not a victim, and not worth promoting
  if (victim && /^https?:\/\//i.test(victim)) return null;
  const discoveredAt = typeof raw?.discovered === 'string' ? new Date(raw.discovered) : null;
  if (!victim || !group || !discoveredAt || isNaN(discoveredAt.getTime())) return null;

  const url = typeof raw.url === 'string' && raw.url.startsWith(RANSOMWARE_LIVE) ? raw.url : undefined;
  const attacked = typeof raw.attackdate === 'string' ? new Date(raw.attackdate) : null;
  const country = typeof raw.country === 'string' && /^[A-Za-z]{2}$/.test(raw.country) ? raw.country.toUpperCase() : undefined;
  const domain = clean(raw.domain, 120)?.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

  return {
    id: url || `${group.toLowerCase()}:${victim.toLowerCase()}`,
    victim,
    group,
    country,
    sector: clean(raw.activity, 60),
    discoveredAt: discoveredAt.toISOString(),
    attackedAt: attacked && !isNaN(attacked.getTime()) ? attacked.toISOString() : undefined,
    domain: domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain.toLowerCase() : undefined,
    description: clean(raw.description, 300),
    url,
  };
}

/** Combines victim lists (newest data wins per id) and keeps the last `days` days, newest first. */
export function mergeVictims(lists: LeakSiteVictim[][], days = 30, now = Date.now()): LeakSiteVictim[] {
  const byId = new Map<string, LeakSiteVictim>();
  for (const list of lists) for (const v of list) byId.set(v.id, v);
  const cutoff = now - days * DAY_MS;
  return [...byId.values()]
    .filter(v => new Date(v.discoveredAt).getTime() >= cutoff)
    .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
}

export function normalizeGroup(raw: any): RansomwareGroupProfile | null {
  const name = clean(raw?.name, 80);
  if (!name) return null;
  return {
    name,
    description: clean(raw.description ? stripHtmlToText(String(raw.description)) : undefined, 600),
    url: `${RANSOMWARE_LIVE}group/${encodeURIComponent(name.toLowerCase())}`,
  };
}

/** One breach from Have I Been Pwned; spam lists, fabricated and retired breaches are skipped. */
export function normalizeBreach(raw: any): BreachRecord | null {
  if (!raw || raw.IsSpamList || raw.IsFabricated || raw.IsRetired) return null;
  const title = clean(raw.Title, 120);
  if (!title || typeof raw.AddedDate !== 'string' || typeof raw.BreachDate !== 'string') return null;
  return {
    name: String(raw.Name || title),
    title,
    domain: clean(raw.Domain, 120),
    breachDate: raw.BreachDate,
    addedAt: raw.AddedDate,
    records: Number(raw.PwnCount) || 0,
    dataClasses: Array.isArray(raw.DataClasses) ? raw.DataClasses.filter((c: unknown) => typeof c === 'string') : [],
    verified: Boolean(raw.IsVerified),
    description: clean(raw.Description ? stripHtmlToText(String(raw.Description)) : undefined, 400),
  };
}

export type IncidentKind = 'ransomware' | 'breach';

/**
 * Automated leak-site victim posts ("Akira has just published a new victim", "[AKIRA] – Ransomware Victim: X"),
 * from Ransomware.live or mirrors of it. They belong with the victims data, not with news reporting.
 */
export function isLeakSitePost(article: Article): boolean {
  return article.sourceId === 'ransomware-live' || /has just published a new victim|^\s*\[[^\]]+\]\s*[–-]\s*ransomware victim:/i.test(article.title);
}

// Phrases that mark an article as reporting an actual incident, rather than e.g. a product review
const RANSOMWARE_TERMS = ['ransomware attack', 'ransomware gang', 'ransomware group', 'ransomware operators', 'hit by ransomware', 'ransom demand', 'leak site', 'double extortion', 'encrypted systems'];
const BREACH_TERMS = ['data breach', 'data leak', 'breached', 'hacked', 'cyberattack', 'cyber attack', 'stolen data', 'data stolen', 'exposed data', 'records exposed', 'customer data', 'compromised accounts', 'unauthorized access'];

/** Classifies an article as ransomware / breach incident coverage (or null). Ransomware wins when both match. */
export function classifyIncident(article: Article, groupNames: string[] = []): IncidentKind | null {
  const text = `${article.title} ${article.description || ''}`;
  // Group names alone are ambiguous ("Play" matches "Google Play"), so they need ransomware context too
  const namesGroup = groupNames.some(g => containsTerm(article.title, g)) && /ransom|extortion|leak/i.test(text);
  if (RANSOMWARE_TERMS.some(t => containsTerm(text, t)) || namesGroup) return 'ransomware';
  if (BREACH_TERMS.some(t => containsTerm(text, t))) return 'breach';
  return null;
}
