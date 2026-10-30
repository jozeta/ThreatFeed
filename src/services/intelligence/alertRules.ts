import {
  AlertRule, Article, BuiltInRule, ConditionGroup, CveIntel, CveRecord, NewsCondition, ThreatSeverity, UserSettings, VulnCondition, VulnData,
} from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { checkWatchlistMatch } from './watchlist';
import { isRemoteNoAuth } from './vulns';
import { fieldsFor } from './ruleForm';

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

// A blank value would match at every word boundary, so it is skipped rather than matching everything.
// A non-array (a malformed rule that slipped past validation) matches nothing instead of throwing mid-render.
const anyTerm = (text: string, values: string[]) => Array.isArray(values) && values.some(v => v.trim() !== '' && containsTerm(text, v));
const anyEqual = (have: string[], values: string[]) => {
  if (!Array.isArray(values)) return false;
  const want = new Set(values.map(v => v.toLowerCase()));
  return have.some(h => want.has(h.toLowerCase()));
};

function newsCondition(c: NewsCondition, a: Article, ctx: EvalContext): boolean {
  switch (c.field) {
    case 'keyword': return Array.isArray(c.values) && checkWatchlistMatch(a, c.values).matched;
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

export const ALERT_GAP_OPTIONS = [1, 2, 3, 4, 6, 12, 24] as const;

export const BUILT_IN_NAMES: Record<BuiltInRule, string> = {
  'watchlist': 'Watchlist',
  'stack-news': 'My Stack (news)',
  'stack-vulns': 'My Stack (vulns)',
  'watched-cves': 'Watched CVEs',
};

const BUILT_IN_ORDER: BuiltInRule[] = ['watchlist', 'stack-news', 'stack-vulns', 'watched-cves'];
const BUILT_IN_KIND: Record<BuiltInRule, AlertRule['kind']> = {
  'watchlist': 'news', 'stack-news': 'news', 'stack-vulns': 'vulns', 'watched-cves': 'vulns',
};

type RuleLists = Pick<UserSettings, 'watchlistKeywords' | 'stackKeywords' | 'watchedCves'>;

/** The four built-in rules; their conditions are derived live from the settings lists, so `root` is stored empty */
export function createBuiltInRules(watchlistNotifications: boolean, now: Date): AlertRule[] {
  const stamp = now.toISOString();
  return BUILT_IN_ORDER.map(builtIn => ({
    id: builtIn,
    name: BUILT_IN_NAMES[builtIn],
    kind: BUILT_IN_KIND[builtIn],
    enabled: true,
    notify: watchlistNotifications && (builtIn === 'watchlist' || builtIn === 'watched-cves'),
    root: { op: 'any', items: [] },
    builtIn,
    createdAt: stamp,
    updatedAt: stamp,
  }));
}

/** The live list behind a built-in rule; [] for custom rules */
export function builtInTerms(rule: AlertRule, s: RuleLists): string[] {
  switch (rule.builtIn) {
    case 'watchlist': return s.watchlistKeywords;
    case 'stack-news':
    case 'stack-vulns': return s.stackKeywords;
    case 'watched-cves': return s.watchedCves;
    default: return [];
  }
}

export function resolveRoot(rule: AlertRule, s: RuleLists): AlertRule['root'] {
  switch (rule.builtIn) {
    case 'watchlist': return { op: 'any', items: [{ field: 'keyword', values: s.watchlistKeywords }] };
    case 'stack-news': return { op: 'any', items: [{ field: 'vendor', values: s.stackKeywords }] };
    case 'stack-vulns': return { op: 'any', items: [{ field: 'vendor', values: s.stackKeywords }] };
    case 'watched-cves': return { op: 'any', items: [{ field: 'watched' }] };
    default: return rule.root;
  }
}

/**
 * Deep copy; each `watched` condition becomes "watched AND cve is any of <current list>", so the copy stays
 * event-driven but limited to the CVEs watched now. Watch events only exist for CVEs on the live watched list,
 * so the copy covers CVEs that are in both: unstarring one later also stops the copy from following it.
 */
function freeze(node: unknown, watchedCves: string[]): unknown {
  if (Array.isArray(node)) return node.map(n => freeze(n, watchedCves));
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj.field === 'watched') return { op: 'all', items: [{ field: 'watched' }, { field: 'cve', values: [...watchedCves] }] };
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, freeze(v, watchedCves)]));
  }
  return node;
}

export function duplicateRule(rule: AlertRule, s: RuleLists, now: Date, id: string): AlertRule {
  const stamp = now.toISOString();
  return {
    ...rule,
    id,
    name: `${rule.name} (copy)`,
    builtIn: undefined,
    notify: false,
    root: freeze(resolveRoot(rule, s), s.watchedCves) as AlertRule['root'],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** A group with a known op whose items are all valid groups or conditions of this rule kind */
function isValidGroup(g: unknown, kind: AlertRule['kind']): boolean {
  if (!g || typeof g !== 'object') return false;
  const x = g as ConditionGroup<unknown>;
  return (x.op === 'all' || x.op === 'any') && Array.isArray(x.items) && x.items.every(i => isValidItem(i, kind));
}

const isFiniteNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n);

function isValidItem(item: unknown, kind: AlertRule['kind']): boolean {
  if (!item || typeof item !== 'object') return false;
  if ('op' in item || 'items' in item) return isValidGroup(item, kind);
  return isValidCondition(item as Record<string, unknown>, kind);
}

/** A known field for this kind carrying the value its NewsCondition/VulnCondition variant needs */
function isValidCondition(c: Record<string, unknown>, kind: AlertRule['kind']): boolean {
  const def = fieldsFor(kind).find(f => f.field === c.field);
  switch (def?.value) {
    case 'list': return Array.isArray(c.values) && c.values.every(v => typeof v === 'string');
    case 'cvss':
    case 'epss': return isFiniteNumber(c.min);
    case 'severity': return typeof c.min === 'string' && Object.prototype.hasOwnProperty.call(SEVERITY_RANK, c.min);
    case 'days': return isFiniteNumber(c.days);
    case 'none': return true;
    default: return false;
  }
}

/**
 * Validates a rule from outside the app (saved settings, a synced device) and returns a clean copy, or null if
 * it is malformed. Built-ins are forced back to their canonical name/kind/id and empty root; only enabled/notify
 * and the timestamps are taken from the data.
 */
export function sanitizeRule(r: unknown): AlertRule | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Partial<AlertRule>;
  if (typeof x.id !== 'string' || typeof x.name !== 'string') return null;
  if (x.kind !== 'news' && x.kind !== 'vulns') return null;
  if (typeof x.enabled !== 'boolean' || typeof x.notify !== 'boolean') return null;
  if (x.builtIn !== undefined && !BUILT_IN_ORDER.includes(x.builtIn)) return null;
  const builtIn = BUILT_IN_ORDER.find(b => b === x.id) ?? x.builtIn;
  if (!builtIn && !isValidGroup(x.root, x.kind)) return null;
  const stamp = new Date(0).toISOString();
  const createdAt = typeof x.createdAt === 'string' ? x.createdAt : stamp;
  const updatedAt = typeof x.updatedAt === 'string' ? x.updatedAt : createdAt;
  if (builtIn) {
    return {
      id: builtIn, name: BUILT_IN_NAMES[builtIn], kind: BUILT_IN_KIND[builtIn], enabled: x.enabled, notify: x.notify,
      root: { op: 'any', items: [] }, builtIn, createdAt, updatedAt,
    };
  }
  return { ...(x as AlertRule), createdAt, updatedAt };
}

/** Validates, dedupes by id (newer updatedAt wins) and sorts built-ins first, then by createdAt */
export function cleanRuleList(rules: unknown): AlertRule[] {
  const byId = new Map<string, AlertRule>();
  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = sanitizeRule(raw);
    if (!rule) continue;
    const have = byId.get(rule.id);
    if (!have || Date.parse(rule.updatedAt) > Date.parse(have.updatedAt)) byId.set(rule.id, rule);
  }
  const rank = (r: AlertRule) => (r.builtIn ? BUILT_IN_ORDER.indexOf(r.builtIn) : BUILT_IN_ORDER.length);
  return [...byId.values()].sort((a, b) => rank(a) - rank(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Keeps valid saved rules (dropping malformed ones) and re-adds any missing built-in; first run seeds the built-ins from the old toggle */
export function migrateAlertRules(saved: Partial<UserSettings>, now: Date): AlertRule[] {
  const builtIns = createBuiltInRules(saved.watchlistNotifications ?? false, now);
  if (!Array.isArray(saved.alertRules)) return builtIns;
  const kept = cleanRuleList(saved.alertRules);
  const have = new Set(kept.map(r => r.builtIn).filter(Boolean));
  return [...kept, ...builtIns.filter(r => !have.has(r.builtIn))];
}
