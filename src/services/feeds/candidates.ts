import type { Article, KevEntry, LeakSiteVictim, MsrcData, VulnData } from '../../types';
import { clusterArticles } from '../articles/clustering';
import { plainText } from './rss';
import { cveLink, patchLink, storyLink, victimLink } from './links';

export type FeedName = 'news' | 'vulns' | 'ransomware';
export type ItemKind = 'news' | 'kev' | 'critical-cve' | 'exploit' | 'patch-tuesday' | 'victim';

export interface FeedCandidate {
  feed: FeedName;
  guid: string;
  kind: ItemKind;
  title: string;
  description: string;
  link: string;
  sourceTime?: string; // real source timestamp, if any
  categories: string[]; // kind first, then CVEs, severity, cvss bucket, group/country/sector
  keys: string[]; // identity keys: 'a:<article id>', 'u:<normalized url>', 'c:<CVE>', 'v:<group>|<name>'
  baseline?: boolean; // exploits: on the very first run, record without publishing
  rank: number; // processing order within a run: lower first
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DESCRIPTION = 400;
const KEV_SOURCE = 'CISA KEV https://www.cisa.gov/known-exploited-vulnerabilities-catalog';

const inWindow = (iso: string | undefined, now: number): boolean => {
  const t = iso ? Date.parse(iso) : NaN;
  return !isNaN(t) && t >= now - WINDOW_MS;
};

/** Lowercases the host; strips the hash, utm_* params and a trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/#.*$/, '').replace(/\/$/, '');
  }
}

const clip = (text: string, max: number): string =>
  text.length <= max ? text : max <= 0 ? '' : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * Joins a summary, an optional middle part and the Source line, at most 400 characters in all.
 * Too long: the summary shrinks first, then the middle part, and only as a last resort the source.
 */
function describe(summary: string | undefined, rawMax: number, extra: string, source: string): string {
  const prefix = ' Source: ';
  let src = source ? `${prefix}${source}` : '';
  if (src.length > MAX_DESCRIPTION) src = `${prefix}${clip(source, MAX_DESCRIPTION - prefix.length)}`;
  const mid = clip(extra, MAX_DESCRIPTION - src.length);
  const room = Math.min(rawMax, MAX_DESCRIPTION - src.length - mid.length - 1);
  const head = room > 0 ? plainText(summary, room) : '';
  return `${head}${mid}${src}`.trim();
}

function newsFrom(articles: Article[], feed: FeedName, requireSevere: boolean, now: number, site: string): FeedCandidate[] {
  const recent = articles.filter((a) => inWindow(a.publishedAt, now));
  const out: FeedCandidate[] = [];
  for (const cluster of clusterArticles(recent)) {
    const members = [cluster.primaryArticle, ...cluster.relatedArticles];
    const qualifying = requireSevere
      ? members.filter((a) => a.severity === 'critical' || a.severity === 'high')
      : members;
    if (qualifying.length === 0) continue;
    // Deterministic lead: highest score, then earliest publication, then smallest id
    const lead = [...qualifying].sort((a, b) =>
      (b.severityScore ?? 0) - (a.severityScore ?? 0)
      || Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    const others = members.length - 1;
    const extra = others > 0 ? ` Also covered by ${others} other outlets.` : '';
    const severity = lead.severity ?? 'info';
    out.push({
      feed,
      guid: `news:${lead.id}`,
      kind: 'news',
      title: lead.title,
      description: describe(lead.description, 300, extra, `${lead.sourceName} ${lead.url}`),
      link: storyLink(site, lead),
      sourceTime: lead.publishedAt,
      categories: feed === 'ransomware' ? ['news', 'ransomware', severity, ...(lead.cves ?? [])] : ['news', severity, ...(lead.cves ?? [])],
      keys: members.flatMap((m) => [`a:${m.id}`, `u:${normalizeUrl(m.url)}`]),
      rank: 10,
    });
  }
  return out;
}

export function newsCandidates(articles: Article[], now: number, site: string): FeedCandidate[] {
  return newsFrom(articles, 'news', true, now, site);
}

export function ransomwareCandidates(articles: Article[], victims: LeakSiteVictim[], now: number, site: string): FeedCandidate[] {
  const tagged = articles.filter((a) => a.tags?.some((t) => t.toLowerCase() === 'ransomware'));
  const out = newsFrom(tagged, 'ransomware', false, now, site);
  for (const v of victims) {
    if (!inWindow(v.discoveredAt, now)) continue;
    const parts = [v.group, v.country, v.sector].filter(Boolean).join(' · ');
    out.push({
      feed: 'ransomware',
      guid: `victim:${v.id}`,
      kind: 'victim',
      title: `Victim: ${v.victim}${parts ? ` (${parts})` : ''}`,
      description: describe(v.description, 250, ` Group: ${v.group}.`, v.url ? `ransomware.live ${v.url}` : ''),
      link: victimLink(site, v),
      sourceTime: v.discoveredAt,
      categories: ['victim', v.group, ...(v.country ? [v.country] : []), ...(v.sector ? [v.sector] : [])],
      keys: [`v:${v.group.toLowerCase()}|${v.victim.toLowerCase().replace(/\s+/g, ' ').trim()}`],
      rank: 20,
    });
  }
  return out;
}

export function vulnCandidates(vulns: VulnData | null, msrc: MsrcData | null, now: number, site: string): FeedCandidate[] {
  const out: FeedCandidate[] = [];
  const kevById = new Map<string, KevEntry>();

  if (vulns) {
    const windowDay = new Date(now - WINDOW_MS).toISOString().slice(0, 10);
    for (const k of vulns.kev ?? []) {
      kevById.set(k.cve, k);
      if (!(k.dateAdded >= windowDay)) continue;
      let extra = `${k.name}. Added to CISA KEV ${k.dateAdded}; due ${k.dueDate ?? 'n/a'}.`;
      if (k.cvss != null) extra += ` CVSS ${k.cvss}.`;
      if (k.epss != null) extra += ` EPSS ${Math.round(k.epss * 100)}%.`;
      if (k.ransomware) extra += ' Known ransomware use.';
      out.push({
        feed: 'vulns',
        guid: `kev:${k.cve}`,
        kind: 'kev',
        title: `KEV: ${k.vendor} ${k.product} — ${k.cve}`,
        description: describe(undefined, 0, extra, KEV_SOURCE),
        link: cveLink(site, k.cve),
        sourceTime: `${k.dateAdded}T00:00:00Z`,
        categories: ['kev', k.cve, ...(k.cvss != null ? [`cvss-${Math.floor(k.cvss)}`] : []), ...(k.ransomware ? ['ransomware'] : [])],
        keys: [`c:${k.cve}`],
        rank: 0,
      });
    }

    const critical = new Set<string>();
    for (const c of vulns.notable ?? []) {
      if ((c.score ?? 0) < 9) continue;
      critical.add(c.id);
      if (!inWindow(c.published, now)) continue;
      out.push({
        feed: 'vulns',
        guid: `cve:${c.id}`,
        kind: 'critical-cve',
        title: `Critical CVE (${c.score}): ${c.assigner || 'NVD'} — ${c.id}`,
        description: describe(c.description, 280, ` CVSS ${c.score}.`, `NVD https://nvd.nist.gov/vuln/detail/${c.id}`),
        link: cveLink(site, c.id),
        sourceTime: c.published,
        categories: ['critical-cve', c.id, 'critical', 'cvss-9'],
        keys: [`c:${c.id}`],
        rank: 1,
      });
    }

    for (const [cve, info] of Object.entries(vulns.exploits ?? {})) {
      if (!kevById.has(cve) && !critical.has(cve)) continue;
      const kev = kevById.get(cve);
      const product = kev ? `${kev.vendor} ${kev.product}` : 'a critical vulnerability';
      const base = { feed: 'vulns' as const, kind: 'exploit' as const, link: cveLink(site, cve), categories: ['exploit', cve], baseline: true, rank: 2 };
      if ((info.pocs ?? 0) > 0) {
        const src = info.pocUrls?.[0] ?? `https://github.com/search?q=${cve}`;
        out.push({
          ...base,
          guid: `exploit:${cve}:poc`,
          title: `Exploit: ${cve} — public proof of concept`,
          description: describe(undefined, 0, `${info.pocs} public proof-of-concept repositories for ${cve} (${product}).`, src),
          keys: [`x:${cve}:poc`],
        });
      }
      if (info.msf?.length) {
        out.push({
          ...base,
          guid: `exploit:${cve}:metasploit`,
          title: `Exploit: ${cve} — Metasploit module`,
          description: describe(undefined, 0, `${info.msf.length} Metasploit module${info.msf.length > 1 ? 's' : ''} for ${cve} (${product}).`, 'Metasploit https://github.com/rapid7/metasploit-framework'),
          keys: [`x:${cve}:metasploit`],
        });
      }
    }
  }

  for (const m of msrc?.months ?? []) {
    if (!inWindow(m.released, now)) continue;
    const exploited = m.cves.filter((c) => c.exploited).length;
    const disclosed = m.cves.filter((c) => c.publiclyDisclosed).length;
    const critical = m.cves.filter((c) => c.severity === 'Critical').length;
    out.push({
      feed: 'vulns',
      guid: `pt:${m.id}`,
      kind: 'patch-tuesday',
      title: `Patch Tuesday ${m.title.replace(/ Security Updates$/, '')}: ${m.cves.length} CVEs, ${exploited} exploited`,
      description: describe(undefined, 0, `${critical} critical, ${exploited} exploited and ${disclosed} publicly disclosed CVEs.`, 'Microsoft MSRC https://msrc.microsoft.com/update-guide'),
      link: patchLink(site, m.id),
      sourceTime: m.released,
      categories: ['patch-tuesday'],
      keys: [`p:${m.id}`],
      rank: 3,
    });
  }
  return out;
}
