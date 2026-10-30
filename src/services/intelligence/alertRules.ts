import {
  Article, ConditionGroup, CveIntel, CveRecord, NewsCondition, ThreatSeverity, VulnCondition, VulnData,
} from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { checkWatchlistMatch } from './watchlist';
import { isRemoteNoAuth } from './vulns';

export const SEVERITY_RANK: Record<ThreatSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** One CVE with everything the vulnerability conditions can look at, merged across data sources */
export interface VulnItem {
  cve: string;
  vendor?: string;
  product?: string;
  name?: string;
  products: string[];
  cvss?: number;
  epss?: number; // 0–1
  kev: boolean;
  kevDateAdded?: string;
  ransomware: boolean;
  ssvcExploitation?: 'none' | 'poc' | 'active';
  vector?: string;
  cwes: string[];
  published?: string;
  publicExploit: boolean;
  isNew: boolean; // came from the recent NVD window (notable / watchable)
}

export interface EvalContext {
  now: Date;
  feedCategory: (sourceId: string) => string | undefined;
  vulnRuleMatches?: (cve: string) => boolean;
  watchedEvent?: (cve: string) => boolean;
}

const DAY_MS = 86_400_000;

/** Union of KEV, notable, watchable and cveIntel; KEV fields win when a CVE is in several sources */
export function buildVulnItems(vulns: VulnData, cveIntel: Record<string, CveIntel>): Map<string, VulnItem> {
  const items = new Map<string, VulnItem>();
  const get = (cve: string): VulnItem => {
    let item = items.get(cve);
    if (!item) {
      item = { cve, products: [], cwes: [], kev: false, ransomware: false, publicExploit: false, isNew: false };
      items.set(cve, item);
    }
    return item;
  };

  for (const [cve, intel] of Object.entries(cveIntel)) {
    const item = get(cve);
    item.epss = intel.epss;
    item.kev = intel.kev;
    item.kevDateAdded = intel.kevDateAdded;
    item.ransomware = !!intel.kevRansomware;
    item.name = intel.kevName;
  }

  for (const r of [...vulns.notable, ...(vulns.watchable ?? [])] as CveRecord[]) {
    const item = get(r.id);
    item.isNew = true;
    item.cvss = r.score;
    item.epss ??= r.epss;
    item.vector = r.vector;
    item.published = r.published;
    item.ssvcExploitation = r.ssvc?.exploitation;
    item.products = r.products ?? [];
    item.cwes = r.cwe ? [r.cwe] : [];
  }

  for (const k of vulns.kev) {
    const item = get(k.cve);
    item.vendor = k.vendor;
    item.product = k.product;
    item.name = k.name;
    item.products = k.products ?? item.products;
    item.cvss = k.cvss ?? item.cvss;
    item.epss = k.epss ?? item.epss;
    item.kev = true;
    item.kevDateAdded = k.dateAdded;
    item.ransomware = k.ransomware;
    item.ssvcExploitation = k.ssvc?.exploitation ?? item.ssvcExploitation;
    item.vector = k.vector ?? item.vector;
    item.cwes = k.cwes.length ? k.cwes : item.cwes;
    item.published = k.published ?? item.published;
  }

  for (const item of items.values()) {
    const x = vulns.exploits?.[item.cve];
    item.publicExploit = !!x && ((x.msf?.length ?? 0) > 0 || !!x.nuclei || (x.pocs ?? 0) > 0);
    if ((vulns.cveGroups?.[item.cve]?.length ?? 0) > 0) item.ransomware = true;
  }
  return items;
}

const isGroup = <C,>(node: C | ConditionGroup<C>): node is ConditionGroup<C> =>
  'op' in (node as object) && 'items' in (node as object);

/** An empty group matches nothing, so a half-built rule never alerts on everything */
function evalGroup<C>(group: ConditionGroup<C>, test: (c: C) => boolean): boolean {
  if (group.items.length === 0) return false;
  const run = (node: C | ConditionGroup<C>): boolean => (isGroup(node) ? evalGroup(node, test) : test(node));
  return group.op === 'all' ? group.items.every(run) : group.items.some(run);
}

const anyTerm = (text: string, values: string[]) => values.some(v => containsTerm(text, v));
const anyEqual = (have: string[], values: string[]) => {
  const want = new Set(values.map(v => v.toLowerCase()));
  return have.some(h => want.has(h.toLowerCase()));
};

function newsCondition(c: NewsCondition, a: Article, ctx: EvalContext): boolean {
  switch (c.field) {
    case 'keyword': return checkWatchlistMatch(a, c.values).matched;
    case 'vendor': return anyTerm(`${a.title} ${a.description ?? ''}`, c.values);
    case 'severity': return a.severity !== undefined && SEVERITY_RANK[a.severity] >= SEVERITY_RANK[c.min];
    case 'category': {
      const category = ctx.feedCategory(a.sourceId);
      return !!category && anyEqual([category], c.values);
    }
    case 'source': return anyEqual([a.sourceId], c.values);
    case 'tag': return anyEqual([...a.tags, ...(a.customTags ?? [])], c.values);
    case 'hasCve': return (a.cves?.length ?? 0) > 0;
    case 'cveMatchesVulnRule': return !!ctx.vulnRuleMatches && (a.cves ?? []).some(ctx.vulnRuleMatches);
  }
}

function vulnCondition(c: VulnCondition, v: VulnItem, ctx: EvalContext): boolean {
  switch (c.field) {
    case 'vendor': return anyTerm([v.vendor, v.product, v.name, ...v.products].filter(Boolean).join(' '), c.values);
    case 'cvss': return v.cvss !== undefined && v.cvss >= c.min;
    case 'epss': return v.epss !== undefined && v.epss >= c.min;
    case 'kev': return v.kev;
    case 'activelyExploited': return v.ssvcExploitation === 'active';
    case 'publicExploit': return v.publicExploit;
    case 'ransomware': return v.ransomware;
    case 'remoteNoAuth': return isRemoteNoAuth(v.vector);
    case 'newCve': return v.isNew;
    case 'kevAddedWithinDays': {
      if (!v.kev || !v.kevDateAdded) return false;
      const added = Date.parse(v.kevDateAdded);
      return !Number.isNaN(added) && ctx.now.getTime() - added <= c.days * DAY_MS;
    }
    case 'cwe': return anyEqual(v.cwes, c.values);
    case 'cve': return anyEqual([v.cve], c.values);
    case 'watched': return !!ctx.watchedEvent && ctx.watchedEvent(v.cve);
  }
}

export function matchesNews(group: ConditionGroup<NewsCondition>, a: Article, ctx: EvalContext): boolean {
  return evalGroup(group, c => newsCondition(c, a, ctx));
}

export function matchesVuln(group: ConditionGroup<VulnCondition>, v: VulnItem, ctx: EvalContext): boolean {
  return evalGroup(group, c => vulnCondition(c, v, ctx));
}
