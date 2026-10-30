import { Article, CveRecord, CvssSeverity, KevEntry, VulnData } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { threatTopic } from '../rss/tagNormalizer';
import { severityFromScore } from './vulns';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A vulnerability in a tag's list: a KEV entry, or a notable or watchable CVE from the NVD window */
export interface TagVuln {
  cve: string;
  title: string; // the KEV name, or the CVE's description
  date: string; // added to KEV, or published (YYYY-MM-DD…)
  score?: number;
  severity?: CvssSeverity;
  kev: boolean;
  ransomware: boolean;
}

export interface TagMatches {
  articles: Article[]; // newest first
  vulns: TagVuln[]; // newest first, each CVE once
  cwe?: string; // the CWE the tag names, e.g. CWE-79
}

/** A chip's text without its # or + prefix */
export const cleanTag = (tag: string) => tag.trim().replace(/^[#+]/, '').trim();

/** The CWE a tag names: an id (cwe-79), or a weakness name the snapshot knows ("Cross-site Scripting") */
export function cweOfTag(tag: string, cweNames: Record<string, string> = {}): string | undefined {
  const t = cleanTag(tag);
  if (/^cwe-\d+$/i.test(t)) return t.toUpperCase();
  const lower = t.toLowerCase();
  return Object.keys(cweNames).find((id) => cweNames[id].toLowerCase() === lower);
}

const kevVuln = (k: KevEntry): TagVuln => ({
  cve: k.cve, title: k.name, date: k.dateAdded, score: k.cvss, severity: k.cvss === undefined ? undefined : severityFromScore(k.cvss), kev: true, ransomware: k.ransomware,
});
const nvdVuln = (c: CveRecord): TagVuln => ({
  cve: c.id, title: c.description || c.products?.join(', ') || c.id, date: c.published, score: c.score,
  severity: c.severity ?? (c.score === undefined ? undefined : severityFromScore(c.score)), kev: false, ransomware: false,
});

/**
 * Everything a tag stands for. Articles carry it among their tags, categories or custom tags (any case), or
 * carry a tag of the same threat topic ("Trojan" is Malware). Vulnerabilities mention it as a whole word in
 * their name, description, weakness or products; a CWE tag lists every CVE with that weakness, and the
 * articles about those CVEs. "Ransomware" also finds KEV entries CISA marks as used by ransomware.
 */
export function tagMatches(tag: string, articles: Article[], vulns: VulnData | null): TagMatches {
  const t = cleanTag(tag);
  if (!t) return { articles: [], vulns: [] };
  const lower = t.toLowerCase();
  const topic = threatTopic(t);
  const cweNames = vulns?.cweNames ?? {};
  const cwe = cweOfTag(t, cweNames);

  const found = new Map<string, TagVuln>();
  for (const k of vulns?.kev ?? []) {
    const text = [k.name, k.description, k.vendor, k.product, ...(k.products ?? []), ...k.cwes.map((c) => cweNames[c] ?? '')].join(' ');
    if ((cwe && k.cwes.includes(cwe)) || (topic === 'Ransomware' && k.ransomware) || containsTerm(text, t)) found.set(k.cve, kevVuln(k));
  }
  for (const c of [...(vulns?.notable ?? []), ...(vulns?.watchable ?? [])]) {
    if (found.has(c.id)) continue; // the KEV entry says more
    const text = [c.description, ...(c.products ?? []), c.cwe ? cweNames[c.cwe] : ''].join(' ');
    if ((cwe && c.cwe === cwe) || containsTerm(text, t)) found.set(c.id, nvdVuln(c));
  }
  const matchedVulns = [...found.values()].sort((a, b) => b.date.localeCompare(a.date));

  const isTag = (label: string) => label.toLowerCase() === lower || (topic !== undefined && threatTopic(label) === topic);
  const cweCves = cwe ? new Set(matchedVulns.map((v) => v.cve)) : undefined;
  const matchedArticles = articles
    .filter((a) => [...a.tags, ...a.categories, ...(a.customTags ?? [])].some(isTag) || Boolean(cweCves && a.cves?.some((c) => cweCves.has(c))))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return { articles: matchedArticles, vulns: matchedVulns, ...(cwe ? { cwe } : {}) };
}

/** Articles per local calendar day over the last `days` days, oldest first and today last */
export function dailyCounts(articles: Article[], days: number, now = Date.now()): number[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * DAY_MS;
  const counts = new Array(days).fill(0);
  for (const a of articles) {
    const day = new Date(a.publishedAt);
    day.setHours(0, 0, 0, 0);
    // Rounded, so a daylight-saving change in the window doesn't shift a day
    const i = Math.round((day.getTime() - start) / DAY_MS);
    if (i >= 0 && i < days) counts[i]++;
  }
  return counts;
}
