# Custom Alert Rules and My Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-defined News and Vulns alert rules that feed a new My Feed tab and send one combined, rate-limited browser notification.

**Architecture:** Pure functions in `src/services/intelligence/alertRules.ts` (rule model, condition evaluation, built-in rules) and `src/services/intelligence/alertEngine.ts` (handled records, baselines, watched-CVE events, pending queue and gap) are tested in Vitest. A render-nothing `AlertMonitor` component runs the engine after each refresh and persists its store in IndexedDB. A new `MyFeedPage` and an `AlertRulesSettings` card make up the UI. The snapshot adds a slim CVSS 7–8.9 list to `vulns.json`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, idb, Vitest + jsdom, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-30-custom-alert-rules-design.md`

## Global Constraints

- Browser only. Notifications fire only while a ThreatFeed tab is open. No push, no backend.
- At most **one** notification per check, covering all 🔔 rules. Title `ThreatFeed: N new matches`, at most 4 lines tagged with the rule name, then `…and N more`. Fixed tag `threatfeed-alerts`.
- Notification gap options: `1, 2, 3, 4, 6, 12, 24` hours. Default `1`.
- Click → focus and go to `#/feed/vulns` if any match is a Vulns item, else `#/feed/news`.
- Only News articles published in the last 24 h can notify. Older matches still show in My Feed.
- Missing data does not match (no CVSS → `cvss ≥ n` is false). It is re-evaluated on every check.
- Creating a rule or changing its conditions records all its current matches without notifying. Turning on 🔔 or re-enabling never sends a backlog.
- Built-in rules (`watchlist`, `stack-news`, `stack-vulns`, `watched-cves`) are fixed. Users can enable/disable them and toggle 🔔, but can't edit or delete them. They read the live `watchlistKeywords` / `stackKeywords` / `watchedCves` lists. "Duplicate as custom rule" copies the current values.
- Migration: 🔔 on Watchlist and Watched CVEs = old `watchlistNotifications`. My Stack rules start with 🔔 off.
- Handled records are per device and not synced.
- Snapshot: keep `notable` (CVSS ≥ 9) unchanged. Add a slim CVSS 7.0–8.9 list without descriptions. Budget is about +100 KB gzipped; log its size.
- Match the existing code style: comment density, `containsTerm` whole-word matching, and the Tailwind `theme-*` tokens.

## Review Focus

1. **`vulns.json` not loaded yet when a check runs.** Vulns rules must be *skipped* (store untouched), not evaluated against an empty catalog, which would wrongly look like "nothing matched". The test goes in Task 4.
2. **First-ever run (no stored engine state).** Every current match of every rule is recorded silently, with zero notifications. The test goes in Task 4.
3. **A rule with an empty group, or an empty live list** (e.g. My Stack has no products) matches nothing, never everything. The test goes in Task 2.
4. **An expired article is fetched again after its handled ID was pruned.** Prune handled IDs only after 45 days (longer than the 30-day default article age), so the article doesn't alert twice. The test goes in Task 4.
5. **Permission revoked or notifications blocked while matches are pending.** The pending queue is capped at 200 and never grows past that. With permission not granted, the matches are kept in the feed and the pending queue is cleared without a notification. The test goes in Task 4.

---

### Task 1: Snapshot keeps CVSS 7–8.9 CVEs (`watchable`)

**Files:**
- Modify: `src/types/index.ts` (`VulnData`, around line 217)
- Modify: `src/services/intelligence/vulns.ts` (next to `encodeNvdCache`)
- Modify: `src/services/snapshot.ts:38-50` (`loadVulnData`)
- Modify: `scripts/build-snapshot.ts:449-490` and the log line at `:602`
- Test: `src/services/intelligence/vulns.test.ts`

**Interfaces:**
- Produces: `VulnData.watchable?: CveRecord[]` (decoded, with no `description`), `encodeWatchable(records: CveRecord[]): unknown[]`, `decodeWatchable(raw: unknown): CveRecord[]`.

- [ ] **Step 1: Write the failing tests** in `vulns.test.ts`:

```ts
describe('watchable CVEs', () => {
  const rec = (id: string, score: number): CveRecord => ({
    id, published: '2026-10-20T00:00:00.000Z', score, severity: severityFromScore(score), cwe: 'CWE-79',
    description: 'long text', vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    ssvc: { exploitation: 'poc', automatable: 'yes' }, products: ['Fortinet FortiOS', 'Fortinet FortiProxy'],
  });
  it('round-trips id, score, cwe, short vector, ssvc and products and drops the description', () => {
    const [r] = decodeWatchable(encodeWatchable([rec('CVE-2026-1', 7.5)]));
    expect(r).toMatchObject({ id: 'CVE-2026-1', score: 7.5, severity: 'HIGH', cwe: 'CWE-79', vector: 'AV:N/PR:N/UI:N', products: ['Fortinet FortiOS', 'Fortinet FortiProxy'] });
    expect(r.ssvc?.exploitation).toBe('poc');
    expect(r.description).toBeUndefined();
  });
  it('ignores malformed input', () => {
    expect(decodeWatchable(null)).toEqual([]);
    expect(decodeWatchable([['bad'], 5])).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/services/intelligence/vulns.test.ts`. Expected: FAIL, `encodeWatchable` is not exported.
- [ ] **Step 3: Implement** `encodeWatchable` and `decodeWatchable` in `vulns.ts`. Reuse `toTuple(r, false, false)`, but keep products: pass `full` for products while still using `statsVector` for the vector. The simplest way is a new tuple builder that reuses `statsVector` and `encodeSsvc`, then decodes through `fromTuple`. Add `watchable?: CveRecord[]; // CVSS 7–8.9 CVEs from the NVD window, no descriptions (alert rules)` to `VulnData`. In `loadVulnData`, replace a raw `watchable` array with `decodeWatchable(data.watchable)`.
- [ ] **Step 4:** In `build-snapshot.ts`, after `notable`, build `const watchable = records.filter(r => (r.score ?? 0) >= 7 && (r.score ?? 0) < 9)` and write `watchable: encodeWatchable(watchable)` into `vulns`. Compute EPSS for it only if it's cheap; it isn't required. Add `, ${watchable.length} CVSS 7–8.9 (${kb(JSON.stringify(vulns.watchable))})` to the log line. Use whatever size helper the file has (`mb`).
- [ ] **Step 5:** Run `npm test` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(snapshot): keep CVSS 7–8.9 CVEs in vulns.json for alert rules`.

---

### Task 2: Rule model and condition evaluation

**Files:**
- Create: `src/services/intelligence/alertRules.ts`
- Modify: `src/types/index.ts` (add the types below, plus `alertRules: AlertRule[]` and `alertGapHours: number` on `UserSettings`)
- Test: `src/services/intelligence/alertRules.test.ts`

**Interfaces:**
- Consumes: `containsTerm` (`src/utils/textMatch.ts`), `checkWatchlistMatch` (`watchlist.ts`), `isRemoteNoAuth` (`vulns.ts`), `VulnData.watchable` (Task 1).
- Produces (types in `src/types/index.ts`):

```ts
export type AlertRuleKind = 'news' | 'vulns';
export type BuiltInRule = 'watchlist' | 'stack-news' | 'stack-vulns' | 'watched-cves';
export type NewsCondition =
  | { field: 'keyword'; values: string[] }            // checkWatchlistMatch semantics
  | { field: 'vendor'; values: string[] }             // containsTerm on title + description
  | { field: 'severity'; min: ThreatSeverity }
  | { field: 'category' | 'source' | 'tag'; values: string[] }   // category = the feed's category; source = feed id
  | { field: 'hasCve' }
  | { field: 'cveMatchesVulnRule' };
export type VulnCondition =
  | { field: 'vendor'; values: string[] }             // containsTerm on vendor, product, name, products
  | { field: 'cvss' | 'epss'; min: number }           // epss as 0–1
  | { field: 'kev' | 'activelyExploited' | 'publicExploit' | 'ransomware' | 'remoteNoAuth' | 'newCve' }
  | { field: 'kevAddedWithinDays'; days: number }
  | { field: 'cwe' | 'cve'; values: string[] }
  | { field: 'watched' };                             // the live watchedCves list; event-driven (Task 4)
export interface ConditionGroup<C> { op: 'all' | 'any'; items: (C | ConditionGroup<C>)[] }
export interface AlertRule {
  id: string; name: string; kind: AlertRuleKind; enabled: boolean; notify: boolean;
  root: ConditionGroup<NewsCondition> | ConditionGroup<VulnCondition>;
  builtIn?: BuiltInRule; createdAt: string; updatedAt: string;
}
```

- Produces (in `alertRules.ts`):
  - `interface VulnItem { cve: string; vendor?: string; product?: string; name?: string; products: string[]; cvss?: number; epss?: number; kev: boolean; kevDateAdded?: string; ransomware: boolean; ssvcExploitation?: 'none'|'poc'|'active'; vector?: string; cwes: string[]; published?: string; publicExploit: boolean }`
  - `buildVulnItems(vulns: VulnData, cveIntel: Record<string, CveIntel>): Map<string, VulnItem>`. Builds the union of `kev`, `notable`, `watchable` and `cveIntel` keys. When the same CVE appears in several sources, KEV fields win. `publicExploit` comes from `vulns.exploits[cve]` (msf, nuclei or pocs > 0). `ransomware` is `kev.ransomware || cveGroups[cve]?.length > 0`. `newCve` is true for items from `notable`/`watchable` (store a boolean `isNew` on the item).
  - `interface EvalContext { now: Date; feedCategory: (sourceId: string) => string | undefined; vulnRuleMatches?: (cve: string) => boolean; watchedEvent?: (cve: string) => boolean }`
  - `matchesNews(group: ConditionGroup<NewsCondition>, a: Article, ctx: EvalContext): boolean`
  - `matchesVuln(group: ConditionGroup<VulnCondition>, v: VulnItem, ctx: EvalContext): boolean`
  - `const SEVERITY_RANK: Record<ThreatSeverity, number>` (info 0 … critical 4).

- [ ] **Step 1: Write the failing tests** using `article()` from `src/test/fixtures.ts` and a local `vuln(overrides)` helper:
  - `fortinet AND cvss ≥ 8 AND (kev OR publicExploit)`: matches `{vendor:'Fortinet', cvss:9.1, kev:true}`. Doesn't match `cvss:7.9`. Doesn't match `{cvss:9.1, kev:false, publicExploit:false}`.
  - a missing CVSS fails `cvss ≥ 8`: `matchesVuln(group([{field:'cvss',min:8}]), vuln({cvss: undefined}), ctx) === false`.
  - an empty group matches nothing: `matchesVuln({op:'all',items:[]}, …) === false` and `matchesNews({op:'any',items:[]}, …) === false` *(Review Focus 3)*.
  - an empty values list matches nothing: `{field:'vendor', values:[]}` is false.
  - vendor matching is whole word: `values:['Cisco']` matches `products:['Cisco IOS XE']` but not `vendor:'Ciscom'`.
  - `remoteNoAuth` uses the vector `AV:N/PR:N/UI:N` → true, and `AV:N/PR:L/UI:N` → false.
  - `kevAddedWithinDays: 7` with `now = 2026-10-30` matches `kevDateAdded: '2026-10-25'`, not `'2026-10-01'`.
  - News: `keyword` ignores auto `tags` but matches `customTags` (as `checkWatchlistMatch` does). `severity min 'high'` matches `critical` and `high`, not `medium`. `category` uses `ctx.feedCategory(a.sourceId)`. `cveMatchesVulnRule` is true only when `ctx.vulnRuleMatches` returns true for one of `a.cves`.
  - `buildVulnItems` merges KEV, `watchable` and `cveIntel` entries for the same CVE into one item with KEV vendor fields. It marks `publicExploit` from `exploits` and `ransomware` from `cveGroups`.
- [ ] **Step 2:** Run `npx vitest run src/services/intelligence/alertRules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `alertRules.ts` with recursive group evaluation: `all` = every item, `any` = some item, and an empty `items` list → false.
- [ ] **Step 4:** Run the tests and `npx tsc --noEmit`. Expected: PASS. (`UserSettings` now has two new required fields. Add the defaults `alertRules: []` and `alertGapHours: 1` to `DEFAULT_SETTINGS` in `SettingsContext.tsx` so the build stays green; Task 3 does the real migration.)
- [ ] **Step 5: Commit** `feat(alerts): rule model and condition evaluation`.

---

### Task 3: Built-in rules, duplicate, and settings migration

**Files:**
- Modify: `src/services/intelligence/alertRules.ts`
- Modify: `src/context/SettingsContext.tsx:109-145` (migration block)
- Test: `src/services/intelligence/alertRules.test.ts`

**Interfaces:**
- Produces:
  - `BUILT_IN_NAMES: Record<BuiltInRule, string>`: `'Watchlist'`, `'My Stack (news)'`, `'My Stack (vulns)'`, `'Watched CVEs'`.
  - `createBuiltInRules(watchlistNotifications: boolean, now: Date): AlertRule[]`. Four rules with an empty stored `root`. `notify` follows the Global Constraints migration line.
  - `resolveRoot(rule: AlertRule, s: Pick<UserSettings,'watchlistKeywords'|'stackKeywords'|'watchedCves'>): AlertRule['root']`. For built-ins it builds the condition from the live list: `keyword: watchlistKeywords`, `vendor: stackKeywords` (news or vulns), `{field:'watched'}`. For custom rules it returns `rule.root`.
  - `builtInTerms(rule, s): string[]`. Returns the live list behind a built-in, or `[]` for custom rules. Task 4 uses it to detect list changes.
  - `duplicateRule(rule: AlertRule, s, now: Date, id: string): AlertRule`. Returns `builtIn` undefined, name `"<name> (copy)"`, `root` = `resolveRoot(...)` frozen, except `watched` becomes `{field:'cve', values:[...watchedCves]}`, `notify: false`, and new `createdAt`/`updatedAt`.
  - `migrateAlertRules(saved: Partial<UserSettings>, now: Date): AlertRule[]`. If `saved.alertRules` is a valid array, it keeps it and adds any missing built-ins. Otherwise it returns `createBuiltInRules(saved.watchlistNotifications ?? false, now)`. It drops malformed entries.

- [ ] **Step 1: Write the failing tests:**
  - `migrateAlertRules({ watchlistNotifications: true }, now)` → 4 rules. `watchlist` and `watched-cves` have `notify: true`; both `stack-*` have `notify: false`.
  - `migrateAlertRules({ watchlistNotifications: false }, now)` → all `notify: false`.
  - The migration keeps saved custom rules and re-adds a missing built-in: `migrateAlertRules({ alertRules: [custom] }, now)` contains `custom` plus 4 built-ins.
  - `resolveRoot(stackVulns, { stackKeywords: ['Fortinet'] })` → `{op:'any', items:[{field:'vendor', values:['Fortinet']}]}`.
  - `duplicateRule(watchedCves, { watchedCves: ['CVE-2026-1'] }, …).root` contains `{field:'cve', values:['CVE-2026-1']}`, and `builtIn` is undefined.
  - Changing `stackKeywords` after duplicating doesn't change the duplicate's root (it's a frozen copy).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the functions. In `SettingsContext`'s migration add `alertRules: migrateAlertRules(saved, new Date())` and `alertGapHours: [1,2,3,4,6,12,24].includes(saved.alertGapHours) ? saved.alertGapHours : 1`. Export `ALERT_GAP_OPTIONS = [1, 2, 3, 4, 6, 12, 24] as const` from `alertRules.ts`. Set `DEFAULT_SETTINGS.alertRules` to `createBuiltInRules(false, new Date())`.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(alerts): built-in rules, duplicate and settings migration`.

---

### Task 4: Alert engine (records, baselines, events, pending queue and gap)

**Files:**
- Create: `src/services/intelligence/alertEngine.ts`
- Test: `src/services/intelligence/alertEngine.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3, plus `diffCveWatch`, `buildWatchState`, `CveWatchState` and `CveChange` from `cveWatch.ts`.
- Produces:

```ts
export interface AlertMatch { ruleId: string; ruleName: string; kind: AlertRuleKind; itemId: string; ref: string; // article id or CVE
  title: string; firstMatchedAt: string; notifiable: boolean }
export interface RuleState { version: string; terms: string[]; handled: Record<string, string> } // itemId → firstMatchedAt
export interface AlertStore { rules: Record<string, RuleState>; watch: Record<string, CveWatchState>;
  pending: AlertMatch[]; lastNotifiedAt?: string; seen: { news?: string; vulns?: string } }
export interface CheckInput { rules: AlertRule[]; settings: Pick<UserSettings,'watchlistKeywords'|'stackKeywords'|'watchedCves'|'alertGapHours'>;
  articles: Article[]; vulns: VulnData | null; cveIntel: Record<string, CveIntel>; epss: Map<string, number>;
  feedCategory: (sourceId: string) => string | undefined; now: Date; permissionGranted: boolean }
export interface CheckResult { store: AlertStore; notify: AlertMatch[] /* empty unless the gap allows */ }
export function emptyAlertStore(): AlertStore;
export function runAlertCheck(input: CheckInput, store: AlertStore): CheckResult;
export function feedMatches(input: Omit<CheckInput,'now'|'permissionGranted'|'epss'>, store: AlertStore): AlertMatch[]; // current matches of enabled rules, for My Feed
export function isNew(m: AlertMatch, store: AlertStore): boolean; // firstMatchedAt > store.seen[kind]
export const ALERT_STORE_KEY = 'alertEngine';
export const PENDING_CAP = 200;
export const HANDLED_TTL_DAYS = 45;
```

**Algorithm for `runAlertCheck`.** The test assertions don't settle this alone, so here it is:
1. For each rule (enabled or not) with `kind === 'vulns'`, if `vulns === null`, **skip it and leave its state untouched**.
2. `version = rule.builtIn ? rule.builtIn : rule.updatedAt`. Compute the current matching item IDs. A missing `RuleState`, or one whose `version` differs, is a **baseline**: record every match with `now` and notify nothing.
3. For built-ins, compare `builtInTerms` with `state.terms`. If terms were added, evaluate with only the old terms. Items that match now but didn't under the old terms are recorded silently. Then save `state.terms` as the current terms.
4. Item IDs are the article id for News and the CVE for Vulns. For a rule containing `watched`, the IDs are events from `diffCveWatch(cve, store.watch[cve], buildWatchState(...))`: `${cve}#kev`, `${cve}#epss:${now.epss}`, `${cve}#news:${articleId}`. The `watched` condition is true when the CVE has an event this check. The other conditions are evaluated on the CVE's current `VulnItem`; a watched CVE missing from the catalog becomes a minimal item with `kev:false`. Afterwards, update `store.watch` for every watched CVE (all of them, not only the changed ones). Drop entries for unwatched CVEs.
5. Evaluate Vulns rules before News rules. `ctx.vulnRuleMatches(cve)` is true when any *enabled custom or built-in* Vulns rule currently matches that CVE (computed from step 2's match sets); it is false for every CVE while `vulns` is null. Unrecorded matches are recorded. They are `notifiable` if the rule is `enabled && notify` and the item is not a News article older than 24 h. Push notifiable ones onto `pending`, removing duplicates by `ruleId+itemId`, then keep the newest `PENDING_CAP`.
6. Prune `handled` entries older than `HANDLED_TTL_DAYS`.
7. Gap: if `pending.length > 0 && (!lastNotifiedAt || now - lastNotifiedAt ≥ alertGapHours h)`. With `permissionGranted`, return `notify = pending`, clear `pending` and set `lastNotifiedAt = now`. Without permission, clear `pending` silently.

- [ ] **Step 1: Write the failing tests** (fixed `now`, the `article()` fixture, a minimal `VulnData` with two KEV entries):
  - `first run baselines silently`: `runAlertCheck(input, emptyAlertStore()).notify` is `[]`, and `store.rules[id].handled` contains the existing matches *(Review Focus 2)*.
  - `new match after baseline notifies once`: a second check with a new matching article returns it in `notify`. A third check returns `[]`.
  - `new custom rule does not flood`: adding a rule with a new `updatedAt` to an existing store → `notify` is `[]`.
  - `editing conditions rebaselines`: the same id with a changed `updatedAt` → `[]`.
  - `notify off still records; turning it on sends no backlog`: check with `notify:false` and a new match → `[]`. Flip to `notify:true` with no new items → `[]`.
  - `adding a My Stack term records its existing matches silently`: `stackKeywords` goes `['Cisco']` → `['Cisco','Microsoft']` → no notification for existing Microsoft KEV entries. A new Microsoft KEV entry on the next check does notify.
  - `vulns not loaded skips vulns rules` *(Review Focus 1)*: `vulns: null` leaves `store.rules[vulnRule]` deep-equal to its previous value, and the next check with vulns loaded behaves as if the skipped check never happened.
  - `watched CVE alerts on each change`: with watch state `{kev:false}` → now in KEV → `notify` has `CVE-X#kev`. A later EPSS jump from 0.02 to 0.3 → `CVE-X#epss:0.3`. A repeat check → `[]`.
  - `watched AND cvss ≥ 8` fires on an event only when the CVE's CVSS is ≥ 8.
  - `old news never notifies but is recorded`: an article published 2 days ago that matches → `notify` is `[]`, and it's in `handled`.
  - `gap holds and merges`: `alertGapHours: 1`, notified at 10:00. A new match at 10:30 → `notify` is `[]` with `pending.length === 1`. A check at 11:01 → `notify` has 1 match.
  - `one notification for many rules`: two rules matching different new items in one check → a single `notify` array holding both.
  - `prune after 45 days` *(Review Focus 4)*: a `handled` entry from 44 days ago is kept, one from 46 days ago is removed.
  - `pending capped and cleared without permission` *(Review Focus 5)*: 250 notifiable matches → `pending.length <= 200`. `permissionGranted:false` after the gap → `notify` is `[]` and `pending` is `[]`.
  - `isNew` compares `firstMatchedAt` with `store.seen[kind]`. Baselined (old) matches are never new, because baseline records use `now` and `seen` is initialised to `now` on the first run.
- [ ] **Step 2:** Run `npx vitest run src/services/intelligence/alertEngine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `alertEngine.ts` following the algorithm above. Initialise `seen.news`/`seen.vulns` to `now` in `emptyAlertStore()`'s first use, so items baselined on day one aren't NEW.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(alerts): alert engine with baselines, watched-CVE events and notification gap`.

---

### Task 5: AlertMonitor and the combined notification

**Files:**
- Create: `src/components/AlertMonitor.tsx`
- Create: `src/services/intelligence/alertStore.ts` (IndexedDB load/save plus a change event)
- Modify: `src/services/notifications.ts` (add `notifyAlertMatches`; remove `notifyWatchlistMatches` and `notifyCveChanges` once unused)
- Modify: `src/context/FeedContext.tsx:304-309` (remove the watchlist notification block and its import)
- Modify: `src/components/CveWatchMonitor.tsx:44` (remove the notification call; keep the store updates for the Watching tab)
- Modify: wherever `CveWatchMonitor` is mounted (`grep -rn "<CveWatchMonitor" src`) to also mount `<AlertMonitor />`
- Test: `src/services/notifications.test.ts`

**Interfaces:**
- Consumes: `runAlertCheck`, `emptyAlertStore`, `ALERT_STORE_KEY`, `AlertStore`, `AlertMatch` (Task 4).
- Produces:
  - `loadAlertStore(): Promise<AlertStore>`, `saveAlertStore(s: AlertStore): Promise<void>`, `ALERT_STORE_EVENT = 'threatfeed:alerts'`, all in `alertStore.ts`. They use `getStoredValue`/`saveStoredValue` the same way `cveWatch.ts` does. On the first load, when no `alertEngine` key exists, seed `store.watch` from `loadWatchStore().notified` so watched-CVE history carries over.
  - `formatAlertNotification(matches: AlertMatch[]): { title: string; body: string; hash: string }`, which is pure and tested.
  - `notifyAlertMatches(matches: AlertMatch[]): void`, using tag `threatfeed-alerts`.

- [ ] **Step 1: Write the failing test** for `formatAlertNotification`. Given 6 matches (5 news, 1 vulns): the title is `'ThreatFeed: 6 new matches'`, the body has 4 `•` lines each ending `[<ruleName>]` and then `'…and 2 more'`, and the hash is `'#/feed/vulns'`. Given 1 news match, the title is `'ThreatFeed: 1 new match'` and the hash is `'#/feed/news'`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** `formatAlertNotification`/`notifyAlertMatches` and `alertStore.ts`. `AlertMonitor` follows the shape of `CveWatchMonitor`: call `ensureVulns()` when any enabled Vulns rule exists; after `isRefreshing` turns false, fetch EPSS for the watched CVEs (`fetchEpssScores`), run `runAlertCheck`, save, and call `notifyAlertMatches(result.notify)`. Also run the check on a 5-minute interval so held matches are sent once the gap ends, even with auto-refresh off. `permissionGranted = notificationsSupported() && Notification.permission === 'granted'`. `feedCategory` comes from `feeds`.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Expected: PASS. Then grep: `grep -rn "notifyWatchlistMatches\|notifyCveChanges\|watchlistNotifications" src` should leave only the migration read in `SettingsContext` and the type field (mark it `/** @deprecated read once by migrateAlertRules */`).
- [ ] **Step 5: Commit** `feat(alerts): AlertMonitor sends one combined notification`.

---

### Task 6: My Feed page and routing

**Files:**
- Modify: `src/types/index.ts:371` (`ActiveNavTab` gets `'feed'`)
- Modify: `src/hooks/useHashRoute.ts:16-19` (`SLUGS.feed = 'feed'`) and `src/hooks/useHashRoute.test.ts`
- Modify: `src/components/Navigation/NavigationTabs.tsx:67-85` (tab after Briefing, `Inbox` icon, badge = NEW count)
- Modify: `src/App.tsx:179-200` (render `MyFeedPage`)
- Create: `src/pages/MyFeedPage.tsx`
- Create: `src/hooks/useAlertFeed.ts`

**Interfaces:**
- Consumes: `feedMatches`, `isNew` (Task 4); `loadAlertStore`, `saveAlertStore`, `ALERT_STORE_EVENT` (Task 5); `CvePanel` (`src/pages/vulns/CvePanel.tsx`); an existing article row (`ListArticle`); `usePagedCount`.
- Produces: `useAlertFeed(): { news: AlertMatch[]; vulns: AlertMatch[]; newCount: { news: number; vulns: number }; markSeen(kind: AlertRuleKind): Promise<void> }`. Matches are grouped by `ref`: an item matched by several rules appears once, with all rule names. Newest `firstMatchedAt` first.

- [ ] **Step 1: Write the failing test** in `useHashRoute.test.ts`: `parseHash('#/feed/vulns')` → `{ page: 'feed', sub: 'vulns' }`, and `buildHash('feed', 'news')` → `'#/feed/news'`.
- [ ] **Step 2:** Run it. Expected: FAIL. Implement the slug. Run again. Expected: PASS.
- [ ] **Step 3: Implement** `useAlertFeed` and `MyFeedPage` (layout A):
  - Sub-tabs News / Vulns with NEW counts; the default sub-tab is `news`.
  - Rule chips: the URL param `rule=<id>` filters the list (a replace-style hash update, like the other filters).
  - "Mark all seen" calls `markSeen(sub)`.
  - "Manage rules" links to `#/settings`.
  - News rows open the reader via `onOpenArticle`. Vulns rows show the CVE, vendor/product, CVSS, KEV/exploit badges and, for watched events, the change text. They open `CvePanel`.
  - NEW tag on `isNew` rows.
  - Empty state (`EmptyState`) pointing to Settings → Alert Rules.
  - On phones, rows become stacked cards (the same breakpoint pattern as the Vulns tables).
- [ ] **Step 4:** Run `npm run build`. Expected: success. Run `npm run dev` and check by hand: the nav tab shows, `#/feed/vulns` opens the Vulns sub-tab, and Back works.
- [ ] **Step 5: Commit** `feat(alerts): My Feed page with News and Vulns tabs`.

---

### Task 7: Alert Rules settings and rule editor

**Files:**
- Create: `src/pages/settings/AlertRulesSettings.tsx`
- Create: `src/pages/settings/RuleEditor.tsx`
- Modify: `src/pages/settings/IntelligenceSettings.tsx:68-81` (remove the Watchlist Alerts section and move its permission handling into the new card)
- Modify: `src/pages/SettingsPage.tsx:801` (mount `<AlertRulesSettings />` before `<IntelligenceSettings />`)

**Interfaces:**
- Consumes: `resolveRoot`, `duplicateRule`, `matchesNews`, `matchesVuln`, `buildVulnItems`, `ALERT_GAP_OPTIONS`, `BUILT_IN_NAMES` (Tasks 2–3); `requestNotificationPermission`, `notificationsSupported`.
- Produces: `RuleEditor` props `{ rule: AlertRule; onSave(rule: AlertRule): void; onCancel(): void; preview(rule: AlertRule): number }`.

- [ ] **Step 1: Implement** `AlertRulesSettings`:
  - Rule list: name, kind, enabled toggle, 🔔 toggle, current match count, edit and delete (custom rules only), "Duplicate as custom rule" (built-ins only).
  - "+ New rule".
  - The gap selector (`ALERT_GAP_OPTIONS`, labelled "At most one notification every N hour(s)").
  - A permission line that reuses the existing blocked/unsupported copy from `IntelligenceSettings.tsx:36-39,75-77`.
  - Turning on the first 🔔 requests permission. If it's denied, 🔔 stays off and the existing note is shown.
  - Built-in rows show their source list ("Uses your watchlist: 34 keywords") with a link that scrolls to that editor.
  - Saving a rule sets `updatedAt = new Date().toISOString()`. New ids come from `crypto.randomUUID()`.
- [ ] **Step 2: Implement** `RuleEditor` (option B):
  - Name, a kind toggle (disabled after the first save), match `all`/`any`, and condition rows of field ▾ / operator / value. Value inputs: a comma-separated text box for lists, a number input for CVSS (0–10, step 0.1) and EPSS (%), a select for severity.
  - "+ condition" and "+ group" (one nesting level), ✕ per row, and 🔔.
  - A live preview: "Matches N current items" from `preview(rule)`.
  - When a `cvss` condition's `min` is below 7: show the hint "New CVEs below CVSS 7 are only matched when they are in KEV or mentioned in an article."
  - Built-in rules open read-only, with a "Duplicate as custom rule" button.
  - Save is disabled while any group is empty.
- [ ] **Step 3:** Run `npm run build` and `npm test`. Expected: PASS. Check by hand in `npm run dev`:
  - Create "Fortinet AND CVSS ≥ 8 AND (KEV OR public exploit)"; the preview count is greater than 0.
  - Duplicate "My Stack (vulns)" and add CVSS ≥ 8.
  - Turn on a 🔔; a permission prompt appears.
  - The gap selector persists across a reload.
- [ ] **Step 4: Commit** `feat(alerts): Alert Rules settings with condition builder`.

---

### Task 8: Sync, README, final verification

**Files:**
- Modify: `src/services/sync/gistSync.ts:47-56` and `src/services/sync/gistSync.test.ts`
- Modify: `README.md`: sections 12 ("Watchlist alerts" bullet) and 13
- Modify: `src/pages/vulns/WatchingTab.tsx:72` (the copy mentions "watchlist alerts")

**Interfaces:**
- Produces: `mergeAlertRules(local: AlertRule[], remote: AlertRule[]): AlertRule[]`, exported from `gistSync.ts`. It merges by `id`, and the newer `updatedAt` wins. Built-ins are merged the same way.

- [ ] **Step 1: Write the failing tests:** a rule edited later on the remote wins; a rule that exists only locally is kept; the result is sorted built-ins first, then by `createdAt`.
- [ ] **Step 2:** Run them. Expected: FAIL. Implement it and add `alertRules: mergeAlertRules(...)` and `alertGapHours: local.settings.alertGapHours` to the merged settings. Run again. Expected: PASS. (Decision: deletes don't propagate. A rule deleted on one device comes back from the other on the next sync. This is acceptable for v1 and is noted in the README.)
- [ ] **Step 3:** Update the README. Replace the "Watchlist alerts" bullet with a "My Feed and alert rules" bullet covering: rules, built-ins, one notification, the gap, open-tab-only, and the CVSS 7 floor for new CVEs. Mention `watchable` in the `data/vulns.json` line of the snapshot section. Change the WatchingTab copy to "With the Watched CVEs rule's 🔔 on (Settings → Alert Rules)…".
- [ ] **Step 4: Final verification:** `npm test && npm run build`. Expected: all tests pass and the build succeeds. Run `npm run snapshot` locally if network access allows, and check that the log line reports the `watchable` count and size within the budget (about 100 KB gzipped: `gzip -c public/data/vulns.json | wc -c` before and after).
- [ ] **Step 5: Commit** `feat(alerts): sync alert rules, docs`.
