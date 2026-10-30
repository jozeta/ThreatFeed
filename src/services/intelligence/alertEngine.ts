import { AlertRule, AlertRuleKind, Article, ConditionGroup, CveIntel, NewsCondition, UserSettings, VulnCondition, VulnData } from '../../types';
import { buildVulnItems, builtInTerms, matchesNews, matchesVuln, resolveRoot, EvalContext, VulnItem } from './alertRules';
import { buildWatchState, diffCveWatch, CveWatchState } from './cveWatch';

export interface AlertMatch {
  ruleId: string;
  ruleName: string;
  kind: AlertRuleKind;
  itemId: string;
  ref: string; // article id or CVE
  title: string;
  firstMatchedAt: string;
  notifiable: boolean;
}

/**
 * What one rule has already handled. `version` changing (a custom rule edited, or a different built-in) starts
 * a new baseline. `quiet` lists the handled items recorded silently (baseline or a newly added list term), so
 * they show in My Feed without NEW even when the rule was created long after "Mark all seen".
 */
export interface RuleState {
  version: string;
  terms: string[];
  handled: Record<string, string>; // itemId → firstMatchedAt
  quiet?: string[];
  enabled?: boolean; // at the last check, so a Vulns rule switched back on doesn't count as having matched all along
}

export interface AlertStore {
  rules: Record<string, RuleState>;
  watch: Record<string, CveWatchState>; // last seen state per watched CVE, the baseline for its events
  pending: AlertMatch[]; // notifiable matches held back by the gap
  lastNotifiedAt?: string;
  seen: { news?: string; vulns?: string }; // "Mark all seen" per My Feed sub-tab
}

type RuleLists = Pick<UserSettings, 'watchlistKeywords' | 'stackKeywords' | 'watchedCves'>;

export interface CheckInput {
  rules: AlertRule[];
  settings: RuleLists & Pick<UserSettings, 'alertGapHours'>;
  articles: Article[];
  vulns: VulnData | null;
  cveIntel: Record<string, CveIntel>;
  epss: Map<string, number>;
  feedCategory: (sourceId: string) => string | undefined;
  now: Date;
  permissionGranted: boolean;
}

export interface CheckResult {
  store: AlertStore;
  notify: AlertMatch[]; // empty unless the gap allows
}

export const ALERT_STORE_KEY = 'alertEngine';
export const PENDING_CAP = 200;
export const HANDLED_TTL_DAYS = 45;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const NEWS_MAX_AGE_MS = DAY_MS; // older articles are recorded but never notify, like today's article alert

/** `seen` starts at creation time, so whatever is baselined on day one isn't NEW */
export function emptyAlertStore(now: Date = new Date()): AlertStore {
  const stamp = now.toISOString();
  return { rules: {}, watch: {}, pending: [], seen: { news: stamp, vulns: stamp } };
}

// isNew runs once per My Feed row; a Set per quiet list keeps that from scanning thousands of baseline IDs each time
const quietSets = new WeakMap<string[], Set<string>>();
const quietSet = (quiet: string[]) => {
  let set = quietSets.get(quiet);
  if (!set) quietSets.set(quiet, (set = new Set(quiet)));
  return set;
};

export function isNew(m: AlertMatch, store: AlertStore): boolean {
  const quiet = store.rules[m.ruleId]?.quiet;
  if (quiet && quietSet(quiet).has(m.itemId)) return false;
  const seen = store.seen[m.kind];
  return !seen || m.firstMatchedAt > seen;
}

/** One matching item for a rule; set for articles and per-article events, `published` keeps old news from notifying */
interface Hit {
  ref: string;
  title: string;
  published?: string;
}

interface WatchEvent {
  id: string;
  text: string;
  published?: string;
}

interface MatchData {
  articles: Article[];
  items: Map<string, VulnItem> | null;
  events: Map<string, WatchEvent[]>; // CVE → its watched-CVE events this check
  now: Date;
  feedCategory: (sourceId: string) => string | undefined;
}

function hasField(node: unknown, field: string): boolean {
  if (Array.isArray(node)) return node.some(n => hasField(n, field));
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    return obj.field === field || hasField(obj.items, field);
  }
  return false;
}

const vulnTitle = (cve: string, item?: VulnItem) => [cve, item?.vendor, item?.product].filter(Boolean).join(' ');

const minimalItem = (cve: string, epss?: number): VulnItem => ({
  cve, epss, products: [], cwes: [], kev: false, ransomware: false, publicExploit: false, isNew: false,
});

/** The rule evaluated with a built-in's list replaced by `terms` (the list as it was at the last check) */
function withTerms(rule: AlertRule, lists: RuleLists, terms: string[]): RuleLists {
  switch (rule.builtIn) {
    case 'watchlist': return { ...lists, watchlistKeywords: terms };
    case 'stack-news':
    case 'stack-vulns': return { ...lists, stackKeywords: terms };
    case 'watched-cves': return { ...lists, watchedCves: terms };
    default: return lists;
  }
}

/**
 * Current matches of one rule, keyed by item ID. A rule containing `watched` matches events rather than CVEs,
 * and only for CVEs on `lists.watchedCves`; its other conditions are checked against the CVE's current data.
 */
function ruleHits(rule: AlertRule, lists: RuleLists, d: MatchData, vulnRuleCves: Set<string>): Map<string, Hit> {
  const hits = new Map<string, Hit>();
  const root = resolveRoot(rule, lists);
  if (rule.kind === 'news') {
    const ctx: EvalContext = { now: d.now, feedCategory: d.feedCategory, vulnRuleMatches: cve => vulnRuleCves.has(cve) };
    for (const a of d.articles) {
      if (matchesNews(root as ConditionGroup<NewsCondition>, a, ctx)) hits.set(a.id, { ref: a.id, title: a.title, published: a.publishedAt });
    }
    return hits;
  }
  if (!d.items) return hits;
  const group = root as ConditionGroup<VulnCondition>;
  if (hasField(group, 'watched')) {
    for (const cve of lists.watchedCves) {
      const events = d.events.get(cve);
      if (!events?.length) continue;
      const item = d.items.get(cve);
      const ctx: EvalContext = { now: d.now, feedCategory: d.feedCategory, watchedEvent: c => c === cve };
      if (!matchesVuln(group, item ?? minimalItem(cve), ctx)) continue;
      for (const e of events) hits.set(e.id, { ref: cve, title: `${vulnTitle(cve, item)}: ${e.text}`, published: e.published });
    }
    return hits;
  }
  const ctx: EvalContext = { now: d.now, feedCategory: d.feedCategory };
  for (const item of d.items.values()) {
    if (matchesVuln(group, item, ctx)) hits.set(item.cve, { ref: item.cve, title: vulnTitle(item.cve, item) });
  }
  return hits;
}

/** Each change to a watched CVE becomes its own event ID, so it alerts once per KEV listing, EPSS jump or article */
function watchEvents(input: CheckInput, vulns: VulnData, before: Record<string, CveWatchState>) {
  const events = new Map<string, WatchEvent[]>();
  const next: Record<string, CveWatchState> = {};
  const byId = new Map(input.articles.map(a => [a.id, a]));
  for (const cve of input.settings.watchedCves) {
    const state = buildWatchState(cve, vulns, input.cveIntel, input.articles, input.epss);
    const prev = before[cve];
    const list: WatchEvent[] = [];
    for (const change of diffCveWatch(cve, prev, state)) {
      if (change.kind === 'kev') list.push({ id: `${cve}#kev`, text: change.text });
      else if (change.kind === 'epss') list.push({ id: `${cve}#epss:${state.epss}`, text: change.text });
      else {
        const known = new Set(prev?.articleIds);
        for (const id of state.articleIds) {
          if (known.has(id)) continue;
          const a = byId.get(id)!;
          list.push({ id: `${cve}#news:${id}`, text: `new article: ${a.title}`, published: a.publishedAt });
        }
      }
    }
    events.set(cve, list);
    // Every watched CVE moves on, not only the changed ones; unwatched ones are dropped. Article IDs accumulate,
    // so an article missing from one check (a partial or empty list) isn't an event when it comes back.
    next[cve] = { ...state, articleIds: [...new Set([...(prev?.articleIds ?? []), ...state.articleIds])] };
  }
  return { events, next };
}

export function runAlertCheck(input: CheckInput, store: AlertStore): CheckResult {
  const { now, settings: lists, vulns } = input;
  const stamp = now.toISOString();
  const isOld = (published?: string) => {
    const t = published ? Date.parse(published) : NaN;
    return Number.isNaN(t) || now.getTime() - t > NEWS_MAX_AGE_MS;
  };

  // While vulns aren't loaded the watch store stays put, so the next loaded check sees the same baseline
  const watch = vulns ? watchEvents(input, vulns, store.watch) : null;
  const data: MatchData = {
    articles: input.articles,
    items: vulns ? buildVulnItems(vulns, input.cveIntel) : null,
    events: watch?.events ?? new Map(),
    now,
    feedCategory: input.feedCategory,
  };

  // CVEs matched by enabled Vulns rules: `current` drives cveMatchesVulnRule, `prior` leaves out what only
  // matches because a Vulns rule was just created, edited, switched back on or given a new list term, so a
  // News rule depending on it records those articles silently instead of notifying
  const current = new Set<string>();
  const prior = new Set<string>();
  const rules: Record<string, RuleState> = {};
  const fresh: AlertMatch[] = [];
  const ordered = [...input.rules.filter(r => r.kind === 'vulns'), ...input.rules.filter(r => r.kind === 'news')];

  for (const rule of ordered) {
    const prev = store.rules[rule.id];
    const dependsOnVulns = rule.kind === 'news' && hasField(resolveRoot(rule, lists), 'cveMatchesVulnRule');
    // News rules looking at Vulns matches wait for vulns too, or they would baseline against nothing
    if ((rule.kind === 'vulns' || dependsOnVulns) && !vulns) {
      if (prev) rules[rule.id] = prev;
      continue;
    }
    const version = rule.builtIn ?? rule.updatedAt;
    const terms = builtInTerms(rule, lists);
    const baseline = !prev || prev.version !== version;
    const termsAdded = !baseline && terms.some(t => !prev.terms.includes(t));

    const hits = ruleHits(rule, lists, data, current);
    // What the rule would have matched anyway: new hits outside this set are recorded silently
    const expected = baseline ? new Map<string, Hit>()
      : termsAdded || dependsOnVulns ? ruleHits(rule, termsAdded ? withTerms(rule, lists, prev.terms) : lists, data, prior)
      : hits;

    if (rule.kind === 'vulns' && rule.enabled) {
      for (const h of hits.values()) current.add(h.ref);
      if (prev?.enabled !== false) for (const h of expected.values()) prior.add(h.ref);
    }

    const handled = { ...prev?.handled };
    const quiet = new Set(prev?.quiet);
    for (const [itemId, hit] of hits) {
      if (handled[itemId]) continue;
      handled[itemId] = stamp;
      if (!expected.has(itemId)) {
        quiet.add(itemId);
        continue;
      }
      if (!rule.enabled || !rule.notify || (hit.published !== undefined && isOld(hit.published))) continue;
      fresh.push({ ruleId: rule.id, ruleName: rule.name, kind: rule.kind, itemId, ref: hit.ref, title: hit.title, firstMatchedAt: stamp, notifiable: true });
    }

    // Only items that no longer match are pruned: a still-matching item would otherwise come back as new
    for (const [itemId, at] of Object.entries(handled)) {
      if (!hits.has(itemId) && now.getTime() - Date.parse(at) > HANDLED_TTL_DAYS * DAY_MS) {
        delete handled[itemId];
        quiet.delete(itemId);
      }
    }
    rules[rule.id] = { version, terms: [...terms], handled, enabled: rule.enabled, ...(quiet.size ? { quiet: [...quiet] } : {}) };
  }

  // Held matches of rules since switched off, muted or deleted are dropped; duplicates keep the newest
  const live = new Set(input.rules.filter(r => r.enabled && r.notify).map(r => r.id));
  const queue = new Map<string, AlertMatch>();
  for (const m of [...store.pending.filter(p => live.has(p.ruleId)), ...fresh]) {
    const key = `${m.ruleId}\u0000${m.itemId}`;
    queue.delete(key);
    queue.set(key, m);
  }
  let pending = [...queue.values()].slice(-PENDING_CAP);

  let notify: AlertMatch[] = [];
  let lastNotifiedAt = store.lastNotifiedAt;
  const last = lastNotifiedAt ? Date.parse(lastNotifiedAt) : NaN;
  const gapOver = Number.isNaN(last) || now.getTime() - last >= lists.alertGapHours * HOUR_MS;
  if (pending.length > 0 && gapOver) {
    if (input.permissionGranted) {
      notify = pending;
      lastNotifiedAt = stamp;
    }
    pending = []; // without permission nothing can be shown, and it must not pile up into a backlog
  }

  return {
    store: {
      rules,
      watch: watch?.next ?? store.watch,
      pending,
      ...(lastNotifiedAt ? { lastNotifiedAt } : {}),
      seen: { news: store.seen?.news ?? stamp, vulns: store.seen?.vulns ?? stamp },
    },
    notify,
  };
}

const pct = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;

/** A readable line for a recorded watched-CVE event, rebuilt from its ID (the change text isn't stored) */
function eventText(itemId: string, articles: Article[]): string {
  const [, event = ''] = itemId.split('#');
  if (event === 'kev') return 'added to CISA KEV';
  if (event.startsWith('epss:')) {
    const score = Number(event.slice(5));
    return Number.isNaN(score) ? 'EPSS jump' : `EPSS rose to ${pct(score)}`;
  }
  const articleId = event.slice('news:'.length);
  const a = articles.find(x => x.id === articleId);
  return a ? `new article: ${a.title}` : 'new article';
}

/**
 * Matches of enabled rules for My Feed. Only recorded matches are listed (the time comes from the rule's record;
 * anything not yet recorded appears after the next check). Rules containing `watched` list their recorded events
 * for CVEs still watched, since events only exist at the check that saw them.
 */
export function feedMatches(input: Omit<CheckInput, 'now' | 'permissionGranted' | 'epss'>, store: AlertStore): AlertMatch[] {
  const lists = input.settings;
  const items = input.vulns ? buildVulnItems(input.vulns, input.cveIntel) : null;
  const data: MatchData = { articles: input.articles, items, events: new Map(), now: new Date(), feedCategory: input.feedCategory };
  const enabled = input.rules.filter(r => r.enabled && (r.kind === 'news' || items));
  const vulnRules = enabled.filter(r => r.kind === 'vulns');
  const newsRules = enabled.filter(r => r.kind === 'news');

  const out: AlertMatch[] = [];
  const current = new Set<string>();
  const watched = new Set(lists.watchedCves);
  for (const rule of [...vulnRules, ...newsRules]) {
    const handled = store.rules[rule.id]?.handled ?? {};
    const row = (itemId: string, ref: string, title: string): AlertMatch =>
      ({ ruleId: rule.id, ruleName: rule.name, kind: rule.kind, itemId, ref, title, firstMatchedAt: handled[itemId], notifiable: false });
    if (rule.kind === 'vulns' && hasField(resolveRoot(rule, lists), 'watched')) {
      for (const itemId of Object.keys(handled)) {
        const cve = itemId.split('#')[0];
        if (!itemId.includes('#') || !watched.has(cve)) continue;
        out.push(row(itemId, cve, `${vulnTitle(cve, items?.get(cve))}: ${eventText(itemId, input.articles)}`));
      }
      continue;
    }
    for (const [itemId, hit] of ruleHits(rule, lists, data, current)) {
      if (rule.kind === 'vulns') current.add(hit.ref);
      if (handled[itemId]) out.push(row(itemId, hit.ref, hit.title));
    }
  }
  return out.sort((a, b) => b.firstMatchedAt.localeCompare(a.firstMatchedAt));
}
