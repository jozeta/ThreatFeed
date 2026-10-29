import { Article, ExploitInfo, GroupIntel, GroupTactic, PaymentFamily, PublicAttack } from '../../types';
import { stripHtmlToText } from '../rss/sanitizer';
import { containsTerm } from '../../utils/textMatch';

/**
 * Parsers that turn large public datasets into the small per-CVE / per-group facts the app shows.
 * They run in the snapshot build; only their output ships with the site.
 */

const CVE_RE = /CVE-\d{4}-\d{4,}/gi;

const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || /^(none|null|n\/a)$/i.test(text)) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// ---------- Exploits ----------

/** Metasploit's db/modules_metadata_base.json: module path(s) per CVE, exploit modules first */
export function parseMetasploit(metadata: Record<string, any>): Map<string, string[]> {
  const byCve = new Map<string, string[]>();
  for (const mod of Object.values(metadata ?? {})) {
    if (!mod || typeof mod.fullname !== 'string' || !Array.isArray(mod.references)) continue;
    for (const ref of mod.references) {
      if (typeof ref !== 'string' || !/^CVE-\d{4}-\d{4,}$/i.test(ref)) continue;
      const cve = ref.toUpperCase();
      const list = byCve.get(cve) ?? [];
      if (!list.includes(mod.fullname)) list.push(mod.fullname);
      byCve.set(cve, list);
    }
  }
  for (const list of byCve.values()) list.sort((a, b) => Number(b.startsWith('exploit/')) - Number(a.startsWith('exploit/')));
  return byCve;
}

/** Nuclei's cves.json: one JSON object per line with ID and file_path */
export function parseNuclei(text: string): Map<string, string> {
  const byCve = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row?.ID === 'string' && typeof row.file_path === 'string' && /^CVE-/i.test(row.ID)) byCve.set(row.ID.toUpperCase(), row.file_path);
    } catch {
      // skip malformed lines
    }
  }
  return byCve;
}

/** PoC-in-GitHub README: "### CVE-… (date)" headings followed by "- [owner/repo](https://github.com/owner/repo)" */
export function parsePocIndex(markdown: string): Map<string, string[]> {
  const byCve = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^### (CVE-\d{4}-\d{4,})/i);
    if (heading) {
      current = [];
      byCve.set(heading[1].toUpperCase(), current);
      continue;
    }
    const repo = current && line.match(/^- \[[^\]]+\]\((https:\/\/github\.com\/[^)\s]+)\)/);
    if (repo && current) current.push(repo[1]);
  }
  for (const [cve, list] of byCve) if (list.length === 0) byCve.delete(cve);
  return byCve;
}

export function exploitInfo(cve: string, msf: Map<string, string[]>, nuclei: Map<string, string>, pocs: Map<string, string[]>): ExploitInfo | undefined {
  const info: ExploitInfo = {};
  const modules = msf.get(cve);
  if (modules?.length) info.msf = modules.slice(0, 3);
  const template = nuclei.get(cve);
  if (template) info.nuclei = template;
  const repos = pocs.get(cve);
  if (repos?.length) {
    info.pocs = repos.length;
    info.pocUrls = repos.slice(0, 3);
  }
  return Object.keys(info).length ? info : undefined;
}

export const hasPublicExploit = (info: ExploitInfo | undefined) => Boolean(info && (info.msf?.length || info.pocs || info.nuclei));

// ---------- Group names ----------

/** "LockBit 3.0", "lockbit5", "Black Basta" → "lockbit", "blackbasta": compare names across sources */
export const normalizeGroupName = (name: string) =>
  name.toLowerCase().replace(/ransomware|team|group|gang/g, '').replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');

// ---------- Ransomware.live group details ----------

/** /v2/group/<name>. Leak-site locations (.onion addresses) are deliberately not kept. */
export function normalizeGroupDetail(raw: any, now = new Date()): Partial<GroupIntel> | null {
  const g = Array.isArray(raw) ? raw[0] : raw;
  if (!g || typeof g.name !== 'string') return null;
  const ttps: GroupTactic[] = (Array.isArray(g.ttps) ? g.ttps : [])
    .map((t: any) => ({
      id: String(t?.tactic_id ?? ''),
      name: clean(t?.tactic_name, 60) ?? 'Other',
      techniques: (Array.isArray(t?.techniques) ? t.techniques : [])
        .filter((x: any) => typeof x?.technique_id === 'string')
        .map((x: any) => ({ id: x.technique_id, name: clean(x.technique_name, 80) ?? x.technique_id, details: clean(x.technique_details, 240) })),
    }))
    .filter((t: GroupTactic) => t.techniques.length > 0);
  const tools: Record<string, string[]> = {};
  for (const block of Array.isArray(g.tools) ? g.tools : [g.tools]) {
    for (const [category, list] of Object.entries(block && typeof block === 'object' ? block : {})) {
      const names = (Array.isArray(list) ? list : []).map(x => clean(x, 60)).filter((x): x is string => Boolean(x));
      if (names.length) tools[category] = names.slice(0, 12);
    }
  }
  const altNames = (typeof g.altname === 'string' ? g.altname.split(/[,;]/) : Array.isArray(g.altname) ? g.altname : [])
    .map((x: unknown) => clean(x, 40)).filter((x: string | undefined): x is string => Boolean(x));
  return {
    firstSeen: typeof g.added_date === 'string' && !isNaN(Date.parse(g.added_date)) ? g.added_date.slice(0, 10) : undefined,
    altNames: altNames.length ? altNames : undefined,
    description: clean(g.description ? stripHtmlToText(String(g.description)) : undefined, 800),
    ttps: ttps.length ? ttps : undefined,
    tools: Object.keys(tools).length ? tools : undefined,
    detailFetchedAt: now.toISOString(),
  };
}

/** CVEs a group's documented techniques name, e.g. "Exploits CVE-2023-20269 in Cisco ASA" */
export const cvesInTtps = (ttps: GroupTactic[] | undefined): string[] =>
  [...new Set((ttps ?? []).flatMap(t => t.techniques.flatMap(x => (x.details?.match(CVE_RE) ?? []).map(c => c.toUpperCase()))))];

// ---------- Publicly reported attacks ----------

/** /v2/recentcyberattacks: attacks reported by the press or in official breach notices */
export function normalizePublicAttack(raw: any): PublicAttack | null {
  const victim = clean(raw?.victim, 160) || clean(raw?.title, 160);
  const added = typeof raw?.added === 'string' && !isNaN(Date.parse(raw.added)) ? raw.added.slice(0, 10) : undefined;
  if (!victim || !added) return null;
  const domain = clean(raw.domain, 120)?.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  const country = typeof raw.country === 'string' && /^[A-Za-z]{2}$/.test(raw.country) ? raw.country.toUpperCase() : undefined;
  const url = (u: unknown) => (typeof u === 'string' && /^https:\/\//i.test(u) && !/\.onion(\/|$)/i.test(u) ? u : undefined);
  const link = url(raw.link);
  return {
    id: link || `${victim.toLowerCase()}:${added}`,
    victim,
    domain: domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : undefined,
    country,
    date: typeof raw.date === 'string' && !isNaN(Date.parse(raw.date)) ? raw.date.slice(0, 10) : undefined,
    added,
    summary: clean(raw.summary || raw.description, 400),
    sourceUrl: url(raw.url),
    group: typeof raw.claim_gang === 'string' && raw.claim_gang ? clean(raw.claim_gang, 60) : undefined,
    link: link?.startsWith('https://www.ransomware.live/') ? link : undefined,
  };
}

/** Normalized victim names and domains that appear in a public report, for "publicly reported" badges */
export function publicReportIndex(attacks: PublicAttack[]): { domains: Set<string>; names: Set<string> } {
  const name = (n: string) => n.toLowerCase().replace(/\b(inc|llc|ltd|gmbh|corp|corporation|company|co|plc|sa|ag|ab)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
  return {
    domains: new Set(attacks.map(a => a.domain).filter((d): d is string => Boolean(d))),
    names: new Set(attacks.map(a => name(a.victim)).filter(n => n.length >= 4)),
  };
}

export function isPubliclyReported(victim: { victim: string; domain?: string }, index: ReturnType<typeof publicReportIndex>): boolean {
  const name = victim.victim.toLowerCase().replace(/\b(inc|llc|ltd|gmbh|corp|corporation|company|co|plc|sa|ag|ab)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
  return Boolean((victim.domain && index.domains.has(victim.domain)) || (name.length >= 4 && index.names.has(name)));
}

// ---------- CVEs exploited by groups ----------

/**
 * CVEs linked to a group by reporting: CISA "#StopRansomware: <Group>" advisories (strong) and news
 * articles naming the group alongside a ransomware-linked KEV CVE (weaker, counted per article).
 */
export function cvesFromArticles(
  articles: Article[],
  groupNames: string[],
  ransomwareKev: Set<string>
): Map<string, { cve: string; source: 'cisa' | 'news'; articles: number }[]> {
  const byGroup = new Map<string, Map<string, { cve: string; source: 'cisa' | 'news'; articles: number }>>();
  const add = (group: string, cve: string, source: 'cisa' | 'news') => {
    const list = byGroup.get(group) ?? new Map();
    const entry = list.get(cve) ?? { cve, source, articles: 0 };
    entry.articles++;
    if (source === 'cisa') entry.source = 'cisa';
    list.set(cve, entry);
    byGroup.set(group, list);
  };
  const keyed = new Map(groupNames.map(g => [normalizeGroupName(g), g.toLowerCase()]));
  for (const a of articles) {
    const cves = (a.cves ?? []).map(c => c.toUpperCase());
    if (cves.length === 0) continue;
    const advisory = a.title.match(/#StopRansomware:?\s*(.+)/i);
    if (advisory) {
      const group = keyed.get(normalizeGroupName(advisory[1]));
      if (group) for (const cve of cves) add(group, cve, 'cisa');
      continue;
    }
    const text = `${a.title} ${a.description ?? ''}`;
    if (!/ransom|extortion/i.test(text)) continue;
    for (const g of groupNames) {
      if (g.length < 4 || !containsTerm(text, g)) continue;
      for (const cve of cves) if (ransomwareKev.has(cve)) add(g.toLowerCase(), cve, 'news');
    }
  }
  return new Map([...byGroup].map(([g, m]) => [g, [...m.values()]]));
}

// ---------- MITRE ATT&CK ----------

/**
 * Ransomware groups and families in the ATT&CK enterprise bundle, matched to leak-site group names.
 * Only intrusion sets and malware that ATT&CK itself describes as ransomware are considered, so a name
 * clash with an unrelated operation can't match.
 */
export function attackProfiles(bundle: any, groupNames: string[]): Map<string, NonNullable<GroupIntel['attack']>> {
  const objects: any[] = Array.isArray(bundle?.objects) ? bundle.objects : [];
  const byId = new Map(objects.map(o => [o.id, o]));
  const extId = (o: any) => (o?.external_references ?? []).find((r: any) => r?.source_name === 'mitre-attack') ?? {};
  const candidates = objects.filter(o =>
    (o.type === 'intrusion-set' || o.type === 'malware') && !o.revoked && !o.x_mitre_deprecated && /ransomware/i.test(o.description ?? '')
  );
  const index = new Map<string, any>();
  for (const o of candidates) {
    for (const n of [o.name, ...(o.aliases ?? []), ...(o.x_mitre_aliases ?? [])]) {
      if (typeof n !== 'string') continue;
      // Tracking codes like "Storm-2603" or "UNC1878" keep their number, or they'd all collapse into "storm"
      const key = /[-\s]?\d{3,}$/.test(n) && /^[a-z]+[-\s]?\d+$/i.test(n.trim()) ? n.toLowerCase().replace(/[^a-z0-9]/g, '') : normalizeGroupName(n);
      // Prefer the intrusion set (the group) over its malware when both match
      if (key.length >= 3 && (!index.has(key) || o.type === 'intrusion-set')) index.set(key, o);
    }
  }
  const uses = new Map<string, any[]>();
  for (const r of objects) {
    if (r.type === 'relationship' && r.relationship_type === 'uses' && !r.revoked) {
      const target = byId.get(r.target_ref);
      if (target) uses.set(r.source_ref, [...(uses.get(r.source_ref) ?? []), target]);
    }
  }
  const result = new Map<string, NonNullable<GroupIntel['attack']>>();
  for (const group of groupNames) {
    const o = index.get(normalizeGroupName(group));
    if (!o) continue;
    const used = uses.get(o.id) ?? [];
    const ref = extId(o);
    result.set(group.toLowerCase(), {
      id: ref.external_id ?? o.name,
      name: o.name,
      url: typeof ref.url === 'string' ? ref.url : 'https://attack.mitre.org/',
      aliases: [...new Set([...(o.aliases ?? []), ...(o.x_mitre_aliases ?? [])].filter((a: string) => a !== o.name))].slice(0, 8),
      techniques: used.filter(t => t.type === 'attack-pattern' && !t.revoked && !t.x_mitre_deprecated)
        .map(t => ({ id: extId(t).external_id ?? '', name: t.name }))
        .filter(t => t.id)
        .sort((a, b) => a.id.localeCompare(b.id)),
      software: used.filter(t => t.type === 'malware' || t.type === 'tool').map(t => t.name).slice(0, 15),
    });
  }
  return result;
}

// ---------- Ransomwhere payments ----------

/** Ransomwhere export: known ransom payment addresses with transactions, summed per family and year */
export function aggregatePayments(exportData: any): PaymentFamily[] {
  const rows: any[] = Array.isArray(exportData?.result) ? exportData.result : Array.isArray(exportData) ? exportData : [];
  const families = new Map<string, PaymentFamily>();
  for (const row of rows) {
    const family = clean(row?.family, 60);
    if (!family || /^unlabeled$/i.test(family)) continue;
    const entry = families.get(family) ?? { family, totalUsd: 0, transactions: 0, byYear: {} };
    for (const tx of Array.isArray(row.transactions) ? row.transactions : []) {
      const usd = Number(tx?.amountUSD);
      const time = Number(tx?.time);
      if (!(usd > 0) || !(time > 0)) continue;
      const year = String(new Date(time * 1000).getUTCFullYear());
      entry.totalUsd += usd;
      entry.transactions++;
      entry.byYear[year] = (entry.byYear[year] ?? 0) + usd;
    }
    if (entry.transactions) families.set(family, entry);
  }
  return [...families.values()]
    .map(f => ({ ...f, totalUsd: Math.round(f.totalUsd), byYear: Object.fromEntries(Object.entries(f.byYear).map(([y, v]) => [y, Math.round(v)])) }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

/** The Ransomwhere family for a leak-site group, e.g. "REvil / Sodinokibi" for "revil" */
export function paymentFamilyFor(group: string, families: PaymentFamily[]): PaymentFamily | undefined {
  const key = normalizeGroupName(group);
  if (key.length < 3) return undefined;
  return families.find(f => f.family.split(/[/(),]/).some(part => normalizeGroupName(part) === key));
}
