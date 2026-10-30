import { describe, expect, it } from 'vitest';
import {
  buildVulnItems, matchesNews, matchesVuln, EvalContext, VulnItem,
  createBuiltInRules, resolveRoot, builtInTerms, duplicateRule, migrateAlertRules,
} from './alertRules';
import { ConditionGroup, NewsCondition, VulnCondition, VulnData, AlertRule, KevEntry, CveRecord } from '../../types';
import { article } from '../../test/fixtures';

const ctx = (overrides: Partial<EvalContext> = {}): EvalContext => ({
  now: new Date('2026-10-30T12:00:00Z'),
  feedCategory: () => undefined,
  ...overrides,
});

const vuln = (overrides: Partial<VulnItem> = {}): VulnItem => ({
  cve: 'CVE-2026-0001', products: [], cwes: [], kev: false, ransomware: false, publicExploit: false, isNew: false,
  ...overrides,
});

const all = (...items: ConditionGroup<VulnCondition>['items']): ConditionGroup<VulnCondition> => ({ op: 'all', items });
const newsAll = (...items: ConditionGroup<NewsCondition>['items']): ConditionGroup<NewsCondition> => ({ op: 'all', items });

describe('matchesVuln', () => {
  const rule = all(
    { field: 'vendor', values: ['Fortinet'] },
    { field: 'cvss', min: 8 },
    { op: 'any', items: [{ field: 'kev' }, { field: 'publicExploit' }] },
  );

  it('evaluates nested groups', () => {
    expect(matchesVuln(rule, vuln({ vendor: 'Fortinet', cvss: 9.1, kev: true }), ctx())).toBe(true);
    expect(matchesVuln(rule, vuln({ vendor: 'Fortinet', cvss: 7.9, kev: true }), ctx())).toBe(false);
    expect(matchesVuln(rule, vuln({ vendor: 'Fortinet', cvss: 9.1, kev: false, publicExploit: false }), ctx())).toBe(false);
  });

  it('fails a numeric threshold when the value is missing', () => {
    expect(matchesVuln(all({ field: 'cvss', min: 8 }), vuln({ cvss: undefined }), ctx())).toBe(false);
    expect(matchesVuln(all({ field: 'epss', min: 0.1 }), vuln({ epss: 0.5 }), ctx())).toBe(true);
  });

  it('matches nothing for empty groups and empty value lists', () => {
    expect(matchesVuln({ op: 'all', items: [] }, vuln(), ctx())).toBe(false);
    expect(matchesVuln({ op: 'any', items: [] }, vuln(), ctx())).toBe(false);
    expect(matchesVuln(all({ field: 'vendor', values: [] }), vuln({ vendor: 'Cisco' }), ctx())).toBe(false);
  });

  it('matches vendors as whole words across vendor, product, name and products', () => {
    const g = all({ field: 'vendor', values: ['Cisco'] });
    expect(matchesVuln(g, vuln({ products: ['Cisco IOS XE'] }), ctx())).toBe(true);
    expect(matchesVuln(g, vuln({ vendor: 'Ciscom' }), ctx())).toBe(false);
  });

  it('detects remote unauthenticated vectors', () => {
    const g = all({ field: 'remoteNoAuth' });
    expect(matchesVuln(g, vuln({ vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }), ctx())).toBe(true);
    expect(matchesVuln(g, vuln({ vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H' }), ctx())).toBe(false);
  });

  it('checks KEV recency against ctx.now', () => {
    const g = all({ field: 'kevAddedWithinDays', days: 7 });
    expect(matchesVuln(g, vuln({ kev: true, kevDateAdded: '2026-10-25' }), ctx())).toBe(true);
    expect(matchesVuln(g, vuln({ kev: true, kevDateAdded: '2026-10-01' }), ctx())).toBe(false);
    expect(matchesVuln(g, vuln({ kev: false }), ctx())).toBe(false);
  });

  it('handles flag, cwe, cve and watched conditions', () => {
    expect(matchesVuln(all({ field: 'activelyExploited' }), vuln({ ssvcExploitation: 'active' }), ctx())).toBe(true);
    expect(matchesVuln(all({ field: 'activelyExploited' }), vuln({ ssvcExploitation: 'poc' }), ctx())).toBe(false);
    expect(matchesVuln(all({ field: 'ransomware' }), vuln({ ransomware: true }), ctx())).toBe(true);
    expect(matchesVuln(all({ field: 'newCve' }), vuln({ isNew: true }), ctx())).toBe(true);
    expect(matchesVuln(all({ field: 'cwe', values: ['cwe-79'] }), vuln({ cwes: ['CWE-79'] }), ctx())).toBe(true);
    expect(matchesVuln(all({ field: 'cve', values: ['cve-2026-0001'] }), vuln(), ctx())).toBe(true);
    expect(matchesVuln(all({ field: 'watched' }), vuln(), ctx())).toBe(false);
    expect(matchesVuln(all({ field: 'watched' }), vuln(), ctx({ watchedEvent: c => c === 'CVE-2026-0001' }))).toBe(true);
  });
});

describe('matchesNews', () => {
  it('matches nothing for an empty group', () => {
    expect(matchesNews({ op: 'any', items: [] }, article('a'), ctx())).toBe(false);
  });

  it('keyword ignores auto tags but matches custom tags', () => {
    const g = newsAll({ field: 'keyword', values: ['LockBit'] });
    expect(matchesNews(g, article('a', { tags: ['LockBit'] }), ctx())).toBe(false);
    expect(matchesNews(g, article('a', { customTags: ['LockBit'] }), ctx())).toBe(true);
  });

  it('vendor matches title and description as whole words', () => {
    const g = newsAll({ field: 'vendor', values: ['Fortinet'] });
    expect(matchesNews(g, article('a', { title: 'Fortinet patches bug' }), ctx())).toBe(true);
    expect(matchesNews(g, article('a', { description: 'about Fortinetx' }), ctx())).toBe(false);
  });

  it('severity compares by rank', () => {
    const g = newsAll({ field: 'severity', min: 'high' });
    expect(matchesNews(g, article('a', { severity: 'critical' }), ctx())).toBe(true);
    expect(matchesNews(g, article('a', { severity: 'high' }), ctx())).toBe(true);
    expect(matchesNews(g, article('a', { severity: 'medium' }), ctx())).toBe(false);
    expect(matchesNews(g, article('a'), ctx())).toBe(false);
  });

  it('category uses the feed category; source uses the feed id', () => {
    const c = ctx({ feedCategory: id => (id === 'test-feed' ? 'Vendor Advisories' : undefined) });
    expect(matchesNews(newsAll({ field: 'category', values: ['vendor advisories'] }), article('a'), c)).toBe(true);
    expect(matchesNews(newsAll({ field: 'category', values: ['Other'] }), article('a'), c)).toBe(false);
    expect(matchesNews(newsAll({ field: 'source', values: ['test-feed'] }), article('a'), c)).toBe(true);
  });

  it('hasCve and cveMatchesVulnRule', () => {
    expect(matchesNews(newsAll({ field: 'hasCve' }), article('a', { cves: ['CVE-1'] }), ctx())).toBe(true);
    expect(matchesNews(newsAll({ field: 'hasCve' }), article('a'), ctx())).toBe(false);
    const g = newsAll({ field: 'cveMatchesVulnRule' });
    const a = article('a', { cves: ['CVE-1', 'CVE-2'] });
    expect(matchesNews(g, a, ctx({ vulnRuleMatches: c => c === 'CVE-2' }))).toBe(true);
    expect(matchesNews(g, a, ctx({ vulnRuleMatches: () => false }))).toBe(false);
    expect(matchesNews(g, a, ctx())).toBe(false);
  });
});

describe('buildVulnItems', () => {
  const kevEntry: KevEntry = {
    cve: 'CVE-2026-1', vendor: 'Fortinet', product: 'FortiOS', name: 'FortiOS RCE', dateAdded: '2026-10-25',
    ransomware: false, cwes: ['CWE-787'], cvss: 9.8, epss: 0.9, products: ['fortinet fortios'],
  };
  const rec = (id: string, extra: Partial<CveRecord> = {}): CveRecord => ({ id, published: '2026-10-20', score: 7.5, ...extra });
  const vulns: VulnData = {
    updatedAt: '', kev: [kevEntry], nvd: null,
    notable: [rec('CVE-2026-2', { score: 9.5, products: ['acme widget'] })],
    watchable: [rec('CVE-2026-1', { score: 7.1, products: ['other thing'] }), rec('CVE-2026-3', { cwe: 'CWE-79', vector: 'v', ssvc: { exploitation: 'poc' } })],
    advisories: [], epssTop: [],
    exploits: { 'CVE-2026-3': { pocs: 2 }, 'CVE-2026-2': { pocs: 0 } },
    cveGroups: { 'CVE-2026-3': ['LockBit'] },
  };

  it('merges sources with KEV fields winning', () => {
    const items = buildVulnItems(vulns, { 'CVE-2026-1': { kev: true, epss: 0.1 }, 'CVE-2026-4': { kev: false, epss: 0.7 } });
    expect([...items.keys()].sort()).toEqual(['CVE-2026-1', 'CVE-2026-2', 'CVE-2026-3', 'CVE-2026-4']);
    const k = items.get('CVE-2026-1')!;
    expect(k).toMatchObject({ vendor: 'Fortinet', product: 'FortiOS', cvss: 9.8, kev: true, kevDateAdded: '2026-10-25', epss: 0.9 });
    expect(items.get('CVE-2026-4')).toMatchObject({ kev: false, epss: 0.7 });
  });

  it('marks exploits, ransomware groups and new CVEs', () => {
    const items = buildVulnItems(vulns, {});
    const w = items.get('CVE-2026-3')!;
    expect(w).toMatchObject({ publicExploit: true, ransomware: true, isNew: true, cwes: ['CWE-79'], ssvcExploitation: 'poc', cvss: 7.5 });
    expect(items.get('CVE-2026-2')).toMatchObject({ publicExploit: false, ransomware: false, products: ['acme widget'], isNew: true });
    expect(items.get('CVE-2026-1')!.isNew).toBe(true);
  });
});

describe('blank values', () => {
  it('ignores blank and whitespace-only values', () => {
    expect(matchesVuln(all({ field: 'vendor', values: [''] }), vuln({ vendor: 'Fortinet, Inc.' }), ctx())).toBe(false);
    expect(matchesNews(newsAll({ field: 'keyword', values: ['  '] }), article('Anything, at all.'), ctx())).toBe(false);
    expect(matchesNews(newsAll({ field: 'vendor', values: [' '] }), article('Anything, at all.'), ctx())).toBe(false);
  });
});

describe('built-in rules', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const byId = (rules: AlertRule[], id: string) => rules.find(r => r.id === id)!;

  it('migrates the old watchlist toggle onto Watchlist and Watched CVEs only', () => {
    const on = migrateAlertRules({ watchlistNotifications: true }, now);
    expect(on).toHaveLength(4);
    expect(on.map(r => [r.id, r.notify])).toEqual([
      ['watchlist', true], ['stack-news', false], ['stack-vulns', false], ['watched-cves', true],
    ]);
    expect(on.every(r => r.enabled)).toBe(true);
    expect(migrateAlertRules({ watchlistNotifications: false }, now).every(r => !r.notify)).toBe(true);
  });

  it('keeps saved custom rules and re-adds missing built-ins', () => {
    const custom: AlertRule = {
      id: 'c1', name: 'Mine', kind: 'vulns', enabled: true, notify: true,
      root: { op: 'all', items: [{ field: 'kev' }] }, createdAt: 'x', updatedAt: 'x',
    };
    const out = migrateAlertRules({ alertRules: [custom, { bogus: true } as unknown as AlertRule] }, now);
    expect(out).toHaveLength(5);
    expect(out).toContainEqual(custom);
    expect(out.filter(r => r.builtIn)).toHaveLength(4);
  });

  it('resolves built-in roots from the live lists', () => {
    const rules = createBuiltInRules(false, now);
    const s = { watchlistKeywords: ['ransomware'], stackKeywords: ['Fortinet'], watchedCves: [] };
    expect(resolveRoot(byId(rules, 'stack-vulns'), s)).toEqual({ op: 'any', items: [{ field: 'vendor', values: ['Fortinet'] }] });
    expect(resolveRoot(byId(rules, 'watchlist'), s)).toEqual({ op: 'any', items: [{ field: 'keyword', values: ['ransomware'] }] });
    expect(resolveRoot(byId(rules, 'watched-cves'), s)).toEqual({ op: 'any', items: [{ field: 'watched' }] });
    expect(builtInTerms(byId(rules, 'stack-news'), s)).toEqual(['Fortinet']);
  });

  it('duplicates as a frozen custom copy', () => {
    const rules = createBuiltInRules(true, now);
    const stack = ['Fortinet'];
    const s = { watchlistKeywords: [], stackKeywords: stack, watchedCves: ['CVE-2026-1'] };
    const watched = duplicateRule(byId(rules, 'watched-cves'), s, now, 'new1');
    expect(watched.builtIn).toBeUndefined();
    expect(watched.id).toBe('new1');
    expect(watched.name).toBe('Watched CVEs (copy)');
    expect(watched.notify).toBe(false);
    expect(watched.root.items).toContainEqual({ field: 'cve', values: ['CVE-2026-1'] });
    const copy = duplicateRule(byId(rules, 'stack-vulns'), s, now, 'new2');
    stack.push('Cisco');
    expect(copy.root).toEqual({ op: 'any', items: [{ field: 'vendor', values: ['Fortinet'] }] });
  });
});
