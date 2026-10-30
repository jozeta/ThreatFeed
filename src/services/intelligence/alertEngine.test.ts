import { describe, expect, it } from 'vitest';
import {
  runAlertCheck, emptyAlertStore, feedMatches, isNew, AlertStore, CheckInput, AlertMatch, PENDING_CAP,
} from './alertEngine';
import { AlertRule, Article, ConditionGroup, KevEntry, NewsCondition, VulnCondition, VulnData } from '../../types';
import { article } from '../../test/fixtures';
import { createBuiltInRules } from './alertRules';

const NOW = new Date('2026-10-30T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const later = (ms: number, from = NOW) => new Date(from.getTime() + ms);
const ago = (ms: number, from = NOW) => new Date(from.getTime() - ms).toISOString();

const kev = (cve: string, vendor: string, product: string, extra: Partial<KevEntry> = {}): KevEntry => ({
  cve, vendor, product, name: `${vendor} ${product} flaw`, dateAdded: '2026-10-01', ransomware: false, cwes: [], ...extra,
});

const CISCO = kev('CVE-2026-1000', 'Cisco', 'IOS XE', { cvss: 9.8 });
const MSFT = kev('CVE-2026-2000', 'Microsoft', 'Windows', { cvss: 7.5 });

const vulnData = (entries: KevEntry[] = [CISCO, MSFT]): VulnData => ({
  updatedAt: '2026-10-30', kev: entries, nvd: null, notable: [], advisories: [], epssTop: [],
});

const rule = (id: string, kind: AlertRule['kind'], root: AlertRule['root'], overrides: Partial<AlertRule> = {}): AlertRule => ({
  id, name: `Rule ${id}`, kind, enabled: true, notify: true, root,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides,
});
const news = (...items: ConditionGroup<NewsCondition>['items']): ConditionGroup<NewsCondition> => ({ op: 'all', items });
const vulnsRoot = (...items: ConditionGroup<VulnCondition>['items']): ConditionGroup<VulnCondition> => ({ op: 'all', items });

const ransomRule = rule('ransom', 'news', news({ field: 'keyword', values: ['ransomware'] }));
const kevRule = rule('kev', 'vulns', vulnsRoot({ field: 'kev' }));

const fresh = (id: string, title = `Ransomware news ${id}`, overrides: Partial<Article> = {}) =>
  article(id, { title, publishedAt: ago(HOUR), ...overrides });

const input = (overrides: Partial<CheckInput> = {}, settings: Partial<CheckInput['settings']> = {}): CheckInput => ({
  rules: [ransomRule],
  settings: { watchlistKeywords: [], stackKeywords: [], watchedCves: [], alertGapHours: 0, ...settings },
  articles: [],
  vulns: vulnData(),
  cveIntel: {},
  epss: new Map(),
  feedCategory: () => undefined,
  now: NOW,
  permissionGranted: true,
  ...overrides,
});

const ids = (ms: AlertMatch[]) => ms.map(m => m.itemId).sort();

describe('runAlertCheck', () => {
  it('first run baselines silently', () => {
    const { store, notify } = runAlertCheck(input({ articles: [fresh('a1')], rules: [ransomRule, kevRule] }), emptyAlertStore(NOW));
    expect(notify).toEqual([]);
    expect(Object.keys(store.rules.ransom.handled)).toEqual(['a1']);
    expect(Object.keys(store.rules.kev.handled).sort()).toEqual(['CVE-2026-1000', 'CVE-2026-2000']);
    expect(store.pending).toEqual([]);
  });

  it('new match after baseline notifies once', () => {
    const first = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const second = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], now: later(HOUR) }), first.store);
    expect(ids(second.notify)).toEqual(['a2']);
    expect(second.notify[0]).toMatchObject({ ruleId: 'ransom', ruleName: 'Rule ransom', kind: 'news', ref: 'a2', title: 'Ransomware news a2', notifiable: true });
    const third = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], now: later(2 * HOUR) }), second.store);
    expect(third.notify).toEqual([]);
  });

  it('new custom rule does not flood', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const added = rule('ms', 'vulns', vulnsRoot({ field: 'vendor', values: ['Microsoft'] }, { field: 'kev' }), { updatedAt: '2026-10-30T12:30:00Z' });
    const next = runAlertCheck(input({ articles: [fresh('a1')], rules: [ransomRule, added], now: later(HOUR) }), store);
    expect(next.notify).toEqual([]);
    expect(Object.keys(next.store.rules.ms.handled)).toEqual(['CVE-2026-2000']);
  });

  it('editing conditions rebaselines', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const edited = { ...ransomRule, root: news({ field: 'keyword', values: ['phishing'] }), updatedAt: '2026-10-30T12:30:00Z' };
    const next = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2', 'Phishing wave')], rules: [edited], now: later(HOUR) }), store);
    expect(next.notify).toEqual([]);
    expect(next.store.rules.ransom.handled.a2).toBeDefined();
  });

  it('notify off still records; turning it on sends no backlog', () => {
    const quiet = { ...ransomRule, notify: false };
    const { store } = runAlertCheck(input({ articles: [fresh('a1')], rules: [quiet] }), emptyAlertStore(NOW));
    const second = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], rules: [quiet], now: later(HOUR) }), store);
    expect(second.notify).toEqual([]);
    expect(second.store.rules.ransom.handled.a2).toBeDefined();
    const third = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], rules: [ransomRule], now: later(2 * HOUR) }), second.store);
    expect(third.notify).toEqual([]);
  });

  it('a disabled rule records but never notifies, and re-enabling sends no backlog', () => {
    const off = { ...ransomRule, enabled: false };
    const { store } = runAlertCheck(input({ articles: [fresh('a1')], rules: [off] }), emptyAlertStore(NOW));
    const second = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], rules: [off], now: later(HOUR) }), store);
    expect(second.notify).toEqual([]);
    const third = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], rules: [ransomRule], now: later(2 * HOUR) }), second.store);
    expect(third.notify).toEqual([]);
  });

  it('adding a My Stack term records its existing matches silently', () => {
    const stack = createBuiltInRules(false, NOW).find(r => r.builtIn === 'stack-vulns')!;
    const stackOn = { ...stack, notify: true };
    const { store } = runAlertCheck(input({ rules: [stackOn] }, { stackKeywords: ['Cisco'] }), emptyAlertStore(NOW));
    expect(Object.keys(store.rules['stack-vulns'].handled)).toEqual(['CVE-2026-1000']);

    const second = runAlertCheck(input({ rules: [stackOn], now: later(HOUR) }, { stackKeywords: ['Cisco', 'Microsoft'] }), store);
    expect(second.notify).toEqual([]);
    expect(second.store.rules['stack-vulns'].handled['CVE-2026-2000']).toBeDefined();
    expect(second.store.rules['stack-vulns'].terms).toEqual(['Cisco', 'Microsoft']);

    const office = kev('CVE-2026-3000', 'Microsoft', 'Office');
    const third = runAlertCheck(
      input({ rules: [stackOn], vulns: vulnData([CISCO, MSFT, office]), now: later(2 * HOUR) }, { stackKeywords: ['Cisco', 'Microsoft'] }),
      second.store,
    );
    expect(ids(third.notify)).toEqual(['CVE-2026-3000']);
  });

  it('a new term alongside a genuinely new item for an old term still notifies the new item', () => {
    const stackOn = { ...createBuiltInRules(false, NOW).find(r => r.builtIn === 'stack-vulns')!, notify: true };
    const { store } = runAlertCheck(input({ rules: [stackOn] }, { stackKeywords: ['Cisco'] }), emptyAlertStore(NOW));
    const asa = kev('CVE-2026-4000', 'Cisco', 'ASA');
    const next = runAlertCheck(
      input({ rules: [stackOn], vulns: vulnData([CISCO, MSFT, asa]), now: later(HOUR) }, { stackKeywords: ['Cisco', 'Microsoft'] }),
      store,
    );
    expect(ids(next.notify)).toEqual(['CVE-2026-4000']);
  });

  it('vulns not loaded skips vulns rules', () => {
    const rules = [ransomRule, kevRule];
    const { store } = runAlertCheck(input({ rules, articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const office = kev('CVE-2026-3000', 'Microsoft', 'Office');

    const skipped = runAlertCheck(input({ rules, articles: [fresh('a1')], vulns: null, now: later(HOUR) }), store);
    expect(skipped.store.rules.kev).toEqual(store.rules.kev);
    expect(skipped.store.watch).toEqual(store.watch);

    const loaded = runAlertCheck(input({ rules, articles: [fresh('a1')], vulns: vulnData([CISCO, MSFT, office]), now: later(2 * HOUR) }), skipped.store);
    const direct = runAlertCheck(input({ rules, articles: [fresh('a1')], vulns: vulnData([CISCO, MSFT, office]), now: later(2 * HOUR) }), store);
    expect(ids(loaded.notify)).toEqual(['CVE-2026-3000']);
    expect(loaded.notify).toEqual(direct.notify);
    expect(loaded.store.rules.kev).toEqual(direct.store.rules.kev);
  });

  it('a vulns rule created while vulns are not loaded still baselines once they load', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const skipped = runAlertCheck(input({ rules: [ransomRule, kevRule], articles: [fresh('a1')], vulns: null, now: later(HOUR) }), store);
    expect(skipped.store.rules.kev).toBeUndefined();
    const loaded = runAlertCheck(input({ rules: [ransomRule, kevRule], articles: [fresh('a1')], now: later(2 * HOUR) }), skipped.store);
    expect(loaded.notify).toEqual([]);
  });

  it('vulns not loaded leaves the watch store untouched', () => {
    const watched = createBuiltInRules(true, NOW).find(r => r.builtIn === 'watched-cves')!;
    const store: AlertStore = { ...emptyAlertStore(NOW), watch: { 'CVE-2026-9999': { kev: false, articleIds: [] } } };
    const first = runAlertCheck(input({ rules: [watched] }, { watchedCves: ['CVE-2026-9999'] }), store);
    const skipped = runAlertCheck(
      input({ rules: [watched], vulns: null, articles: [fresh('n1', 'x', { cves: ['CVE-2026-9999'] })], now: later(HOUR) }, { watchedCves: ['CVE-2026-9999'] }),
      first.store,
    );
    expect(skipped.store.watch).toEqual(first.store.watch);
    expect(skipped.store.rules['watched-cves']).toEqual(first.store.rules['watched-cves']);
  });

  describe('watched CVEs', () => {
    const watched = createBuiltInRules(true, NOW).find(r => r.builtIn === 'watched-cves')!;
    const CVE = 'CVE-2026-5000';
    const settings = { watchedCves: [CVE] };
    const start = (): AlertStore => {
      const base = { ...emptyAlertStore(NOW), watch: { [CVE]: { kev: false, epss: 0.02, articleIds: [] } } };
      return runAlertCheck(input({ rules: [watched], vulns: vulnData([]), epss: new Map([[CVE, 0.02]]) }, settings), base).store;
    };

    it('watched CVE alerts on each change', () => {
      const store = start();
      const listed = vulnData([kev(CVE, 'Acme', 'Router', { dateAdded: '2026-10-30' })]);
      const kevCheck = runAlertCheck(input({ rules: [watched], vulns: listed, epss: new Map([[CVE, 0.02]]), now: later(HOUR) }, settings), store);
      expect(ids(kevCheck.notify)).toEqual([`${CVE}#kev`]);
      expect(kevCheck.notify[0].ref).toBe(CVE);
      expect(kevCheck.notify[0].title).toBe(`${CVE} Acme Router: added to CISA KEV on 2026-10-30`);

      const epssCheck = runAlertCheck(input({ rules: [watched], vulns: listed, epss: new Map([[CVE, 0.3]]), now: later(2 * HOUR) }, settings), kevCheck.store);
      expect(ids(epssCheck.notify)).toEqual([`${CVE}#epss:0.3`]);

      const repeat = runAlertCheck(input({ rules: [watched], vulns: listed, epss: new Map([[CVE, 0.3]]), now: later(3 * HOUR) }, settings), epssCheck.store);
      expect(repeat.notify).toEqual([]);
    });

    it('gives each new article its own event', () => {
      const store = start();
      const articles = [fresh('n1', 'Story one', { cves: [CVE] }), fresh('n2', 'Story two', { cves: [CVE] })];
      const next = runAlertCheck(input({ rules: [watched], vulns: vulnData([]), articles, epss: new Map([[CVE, 0.02]]), now: later(HOUR) }, settings), store);
      expect(ids(next.notify)).toEqual([`${CVE}#news:n1`, `${CVE}#news:n2`]);
      expect(next.notify.find(m => m.itemId === `${CVE}#news:n1`)!.title).toBe(`${CVE}: new article: Story one`);
      expect(next.store.watch[CVE].articleIds).toEqual(['n1', 'n2']);
      const rows = feedMatches(input({ rules: [watched], vulns: vulnData([]), articles }, settings), next.store);
      expect(rows.find(m => m.itemId === `${CVE}#news:n1`)!.title).toBe(`${CVE}: new article: Story one`);
    });

    it('articles missing from one check never come back as news events', () => {
      const n1 = fresh('n1', 'Story one', { cves: [CVE] });
      // n1 is already known at the first sighting (the baseline), so it is never an event
      const { store } = runAlertCheck(input({ rules: [watched], vulns: vulnData([]), articles: [n1] }, settings), emptyAlertStore(NOW));
      expect(store.watch[CVE].articleIds).toEqual(['n1']);
      const empty = runAlertCheck(input({ rules: [watched], vulns: vulnData([]), articles: [], now: later(HOUR) }, settings), store);
      expect(empty.notify).toEqual([]);
      const back = runAlertCheck(input({ rules: [watched], vulns: vulnData([]), articles: [n1], now: later(2 * HOUR) }, settings), empty.store);
      expect(back.notify).toEqual([]);
      expect(back.store.rules['watched-cves'].handled).toEqual({});
    });

    it('a news event for an article older than 24 h is recorded but does not notify', () => {
      const store = start();
      const old = fresh('old', 'Old story', { cves: [CVE], publishedAt: ago(3 * DAY) });
      const next = runAlertCheck(input({ rules: [watched], vulns: vulnData([]), articles: [old], epss: new Map([[CVE, 0.02]]), now: later(HOUR) }, settings), store);
      expect(next.notify).toEqual([]);
      expect(next.store.rules['watched-cves'].handled[`${CVE}#news:old`]).toBeDefined();
    });

    it('baselines a newly watched CVE and drops unwatched ones', () => {
      const store = start();
      const other = 'CVE-2026-6000';
      const next = runAlertCheck(
        input({ rules: [watched], vulns: vulnData([kev(other, 'Acme', 'Switch')]), now: later(HOUR) }, { watchedCves: [other] }),
        store,
      );
      expect(next.notify).toEqual([]);
      expect(Object.keys(next.store.watch)).toEqual([other]);
    });

    it('watched AND cvss ≥ 8 fires on an event only when the CVE scores 8 or more', () => {
      const LOW = 'CVE-2026-7000';
      const r = rule('hot', 'vulns', vulnsRoot({ field: 'watched' }, { field: 'cvss', min: 8 }));
      const s = { watchedCves: [CVE, LOW] };
      const base = { ...emptyAlertStore(NOW), watch: { [CVE]: { kev: false, articleIds: [] }, [LOW]: { kev: false, articleIds: [] } } };
      const { store } = runAlertCheck(input({ rules: [r], vulns: vulnData([]) }, s), base);
      const both = vulnData([kev(CVE, 'Acme', 'Router', { cvss: 9.1 }), kev(LOW, 'Acme', 'Printer', { cvss: 5 })]);
      const next = runAlertCheck(input({ rules: [r], vulns: both, now: later(HOUR) }, s), store);
      expect(ids(next.notify)).toEqual([`${CVE}#kev`]);
    });
  });

  it('old news never notifies but is recorded', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const old = fresh('old', 'Ransomware retrospective', { publishedAt: ago(2 * DAY, later(HOUR)) });
    const next = runAlertCheck(input({ articles: [fresh('a1'), old], now: later(HOUR) }), store);
    expect(next.notify).toEqual([]);
    expect(next.store.rules.ransom.handled.old).toBeDefined();
  });

  it('gap holds and merges', () => {
    const ten = new Date('2026-10-30T10:00:00Z');
    const gap = { alertGapHours: 1 };
    const { store } = runAlertCheck(input({ articles: [fresh('a1', undefined, { publishedAt: ago(HOUR, ten) })], now: ten }, gap), emptyAlertStore(ten));
    const notified = { ...store, lastNotifiedAt: ten.toISOString() };
    const arts = [fresh('a1', undefined, { publishedAt: ago(HOUR, ten) }), fresh('a2', undefined, { publishedAt: ten.toISOString() })];
    const held = runAlertCheck(input({ articles: arts, now: later(30 * 60_000, ten) }, gap), notified);
    expect(held.notify).toEqual([]);
    expect(held.store.pending).toHaveLength(1);
    const sent = runAlertCheck(input({ articles: arts, now: later(61 * 60_000, ten) }, gap), held.store);
    expect(ids(sent.notify)).toEqual(['a2']);
    expect(sent.store.pending).toEqual([]);
    expect(sent.store.lastNotifiedAt).toBe(later(61 * 60_000, ten).toISOString());
  });

  it('one notification for many rules', () => {
    const rules = [ransomRule, kevRule];
    const { store } = runAlertCheck(input({ rules, articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const next = runAlertCheck(
      input({ rules, articles: [fresh('a1'), fresh('a2')], vulns: vulnData([CISCO, MSFT, kev('CVE-2026-3000', 'Microsoft', 'Office')]), now: later(HOUR) }),
      store,
    );
    expect(ids(next.notify)).toEqual(['CVE-2026-3000', 'a2']);
    expect(next.notify.find(m => m.kind === 'vulns')!.title).toBe('CVE-2026-3000 Microsoft Office');
  });

  it('prune after 45 days', () => {
    const base = emptyAlertStore(NOW);
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), base);
    store.rules.ransom.handled.gone44 = ago(44 * DAY);
    store.rules.ransom.handled.gone46 = ago(46 * DAY);
    store.rules.ransom.handled.a1 = ago(46 * DAY); // still matching, so kept (it would otherwise come back as new)
    const next = runAlertCheck(input({ articles: [fresh('a1')] }), store);
    expect(next.store.rules.ransom.handled.gone44).toBeDefined();
    expect(next.store.rules.ransom.handled.gone46).toBeUndefined();
    expect(next.store.rules.ransom.handled.a1).toBe(ago(46 * DAY));
    expect(next.notify).toEqual([]);
  });

  it('pending capped and cleared without permission', () => {
    const { store } = runAlertCheck(input(), emptyAlertStore(NOW));
    const notified = { ...store, lastNotifiedAt: NOW.toISOString() };
    const many = Array.from({ length: 250 }, (_, i) => fresh(`m${i}`));
    const held = runAlertCheck(input({ articles: many, now: later(60_000) }, { alertGapHours: 1 }), notified);
    expect(held.notify).toEqual([]);
    expect(held.store.pending.length).toBeLessThanOrEqual(PENDING_CAP);
    expect(held.store.pending[held.store.pending.length - 1].itemId).toBe('m249');
    const denied = runAlertCheck(input({ articles: many, now: later(2 * HOUR), permissionGranted: false }, { alertGapHours: 1 }), held.store);
    expect(denied.notify).toEqual([]);
    expect(denied.store.pending).toEqual([]);
    expect(denied.store.lastNotifiedAt).toBe(NOW.toISOString());
  });

  it('drops pending matches of rules that were switched off or deleted', () => {
    const { store } = runAlertCheck(input(), emptyAlertStore(NOW));
    const notified = { ...store, lastNotifiedAt: NOW.toISOString() };
    const held = runAlertCheck(input({ articles: [fresh('a1')], now: later(60_000) }, { alertGapHours: 1 }), notified);
    expect(held.store.pending).toHaveLength(1);
    const muted = runAlertCheck(input({ rules: [{ ...ransomRule, notify: false }], articles: [fresh('a1')], now: later(2 * HOUR) }, { alertGapHours: 1 }), held.store);
    expect(muted.notify).toEqual([]);
    expect(muted.store.pending).toEqual([]);
  });

  it('does not mutate the store it is given', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const copy = structuredClone(store);
    runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], now: later(HOUR) }), store);
    expect(store).toEqual(copy);
  });

  it('a new vulns rule does not make old articles about its CVEs notify through cveMatchesVulnRule', () => {
    const viaVulns = rule('via', 'news', news({ field: 'cveMatchesVulnRule' }));
    const article1 = fresh('c1', 'Patch story', { cves: ['CVE-2026-2000'] });
    const { store } = runAlertCheck(input({ rules: [viaVulns], articles: [article1] }), emptyAlertStore(NOW));
    expect(store.rules.via.handled).toEqual({});
    const msRule = rule('ms', 'vulns', vulnsRoot({ field: 'vendor', values: ['Microsoft'] }));
    const next = runAlertCheck(input({ rules: [viaVulns, msRule], articles: [article1], now: later(HOUR) }), store);
    expect(next.notify).toEqual([]);
    expect(next.store.rules.via.handled.c1).toBeDefined();
    const article2 = fresh('c2', 'Another patch story', { cves: ['CVE-2026-2000'] });
    const third = runAlertCheck(input({ rules: [viaVulns, msRule], articles: [article1, article2], now: later(2 * HOUR) }), next.store);
    expect(ids(third.notify)).toEqual(['c2']);
  });
});

describe('cveMatchesVulnRule floods', () => {
  const viaVulns = rule('via', 'news', news({ field: 'cveMatchesVulnRule' }));
  const msRule = rule('ms', 'vulns', vulnsRoot({ field: 'vendor', values: ['Microsoft'] }));
  const c1 = fresh('c1', 'Patch story', { cves: ['CVE-2026-2000'] });

  it('re-enabling a Vulns rule does not make recent articles on its CVEs notify', () => {
    const off = { ...msRule, enabled: false };
    const { store } = runAlertCheck(input({ rules: [viaVulns, off], articles: [c1] }), emptyAlertStore(NOW));
    const second = runAlertCheck(input({ rules: [viaVulns, off], articles: [c1], now: later(HOUR) }), store);
    const enabled = runAlertCheck(input({ rules: [viaVulns, msRule], articles: [c1], now: later(2 * HOUR) }), second.store);
    expect(enabled.notify).toEqual([]);
    expect(enabled.store.rules.via.handled.c1).toBeDefined();
    const c2 = fresh('c2', 'Another patch story', { cves: ['CVE-2026-2000'] });
    const next = runAlertCheck(input({ rules: [viaVulns, msRule], articles: [c1, c2], now: later(3 * HOUR) }), enabled.store);
    expect(ids(next.notify)).toEqual(['c2']);
  });

  it('a News rule using cveMatchesVulnRule created while vulns are not loaded baselines once they load', () => {
    const { store } = runAlertCheck(input({ rules: [msRule], articles: [c1] }), emptyAlertStore(NOW));
    const skipped = runAlertCheck(input({ rules: [msRule, viaVulns], articles: [c1], vulns: null, now: later(HOUR) }), store);
    expect(skipped.store.rules.via).toBeUndefined();
    const loaded = runAlertCheck(input({ rules: [msRule, viaVulns], articles: [c1], now: later(2 * HOUR) }), skipped.store);
    expect(loaded.notify).toEqual([]);
  });
});

describe('isNew', () => {
  it('compares firstMatchedAt with store.seen[kind]; baselined matches are never new', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const second = runAlertCheck(input({ articles: [fresh('a1'), fresh('a2')], now: later(HOUR) }), store);
    const rows = feedMatches(input({ articles: [fresh('a1'), fresh('a2')] }), second.store);
    expect(rows.filter(m => isNew(m, second.store)).map(m => m.itemId)).toEqual(['a2']);
    const seen = { ...second.store, seen: { ...second.store.seen, news: later(HOUR).toISOString() } };
    expect(rows.filter(m => isNew(m, seen))).toEqual([]);
  });

  it('a rule created later still shows its starting matches without NEW', () => {
    const { store } = runAlertCheck(input({ articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const added = rule('kev', 'vulns', vulnsRoot({ field: 'kev' }), { updatedAt: '2026-10-30T13:00:00Z' });
    const next = runAlertCheck(input({ rules: [ransomRule, added], articles: [fresh('a1')], now: later(DAY) }), store);
    const rows = feedMatches(input({ rules: [ransomRule, added], articles: [fresh('a1')] }), next.store);
    expect(rows.filter(m => m.kind === 'vulns')).toHaveLength(2);
    expect(rows.filter(m => isNew(m, next.store))).toEqual([]);
  });
});

describe('feedMatches', () => {
  it('lists recorded current matches of enabled rules with their first-match time', () => {
    const rules = [ransomRule, kevRule, { ...rule('off', 'news', news({ field: 'keyword', values: ['ransomware'] })), enabled: false }];
    const { store } = runAlertCheck(input({ rules, articles: [fresh('a1')] }), emptyAlertStore(NOW));
    const rows = feedMatches(input({ rules, articles: [fresh('a1'), fresh('a2')] }), store);
    expect(rows.map(r => `${r.ruleId}:${r.itemId}`).sort()).toEqual(['kev:CVE-2026-1000', 'kev:CVE-2026-2000', 'ransom:a1']);
    expect(rows.find(r => r.itemId === 'a1')!.firstMatchedAt).toBe(NOW.toISOString());
  });

  it('skips vulns rules while vulns are not loaded', () => {
    const rules = [ransomRule, kevRule];
    const { store } = runAlertCheck(input({ rules, articles: [fresh('a1')] }), emptyAlertStore(NOW));
    expect(feedMatches(input({ rules, articles: [fresh('a1')], vulns: null }), store).map(r => r.ruleId)).toEqual(['ransom']);
  });

  it('lists recorded watched-CVE events for currently watched CVEs', () => {
    const watched = createBuiltInRules(true, NOW).find(r => r.builtIn === 'watched-cves')!;
    const CVE = 'CVE-2026-5000';
    const base = { ...emptyAlertStore(NOW), watch: { [CVE]: { kev: false, articleIds: [] } } };
    const listed = vulnData([kev(CVE, 'Acme', 'Router')]);
    const { store } = runAlertCheck(input({ rules: [watched], vulns: listed }, { watchedCves: [CVE] }), base);
    const rows = feedMatches(input({ rules: [watched], vulns: listed }, { watchedCves: [CVE] }), store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId: `${CVE}#kev`, ref: CVE, kind: 'vulns', firstMatchedAt: NOW.toISOString() });
    expect(rows[0].title).toContain(`${CVE} Acme Router`);
    expect(feedMatches(input({ rules: [watched], vulns: listed }, { watchedCves: [] }), store)).toEqual([]);
  });
});
