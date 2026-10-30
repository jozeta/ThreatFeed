# Custom alert rules and My Feed: design

Date: 2026-10-30
Status: draft, awaiting approval

## Intent

Today ThreatFeed has one on/off switch (`settings.watchlistNotifications`) that sends a notification when new
articles match the watchlist keywords and when watched CVEs change. The user wants to decide for themselves what
is worth interrupting them for, mostly per vendor: "tell me when Fortinet has a CVE that is in KEV, scores CVSS 8
or higher, or is being exploited". They also want one place to see everything their rules caught, whether or not
a rule sends notifications.

Everything stays in the browser. The site has no backend, so notifications only fire while a ThreatFeed tab is
open (minimised counts). Push notifications with the browser closed are out of scope. A later option is to send
alerts from the GitHub Actions snapshot job to a webhook.

## Goals

1. **User-defined rules.** Each rule has a name, a type (**News** or **Vulns**), a 🔔 notify switch, an enabled
   switch, and a condition tree: "match **all** / **any** of", with nested groups. It is edited like an email
   filter, using the condition builder (option B in the mockups).
2. **One notification for everything.** However many rules match on a check, the user gets at most one
   notification. It lists matches from every rule that has 🔔 on, each line tagged with the rule that matched.
3. **My Feed.** A new top-level tab where the notification leads. It has two sub-tabs, **News** and **Vulns**, and
   shows matches from **all** enabled rules, whether 🔔 is on or off. Each item says which rule(s) matched it. Items
   that arrived since the user last marked the feed as seen are tagged **NEW**. Layout is option A from the
   mockups: one newest-first list per sub-tab, with rule filter chips above it, plus "Mark all seen" and
   "Manage rules".
4. **Ready-made rules replace the old setup.** The watchlist, My Stack and watched CVEs become rules, and the old
   on/off switch becomes those rules' 🔔. On the day this ships, users get the same alerts as before.
5. **Notification timing setting.** A minimum gap between notifications, in hourly steps (1, 2, 3, 4, 6, 12 or
   24 h; default 1 h). Matches that arrive during the gap are held and go into the next notification.

## Non-goals

- Push or background notifications with no tab open (needs a server).
- Email, Slack or webhook delivery.
- Rules about ransomware victims or breaches (possible later, as a third rule type).
- Sharing rules between users.

## Anti-goals (what would make this a failure even if it works)

- **A flood on creation.** A new "Microsoft + in KEV" rule must not notify about the 1,000 existing Microsoft KEV
  entries. What already exists when a rule is created (or edited) is its starting point and never notifies.
  Those older matches still appear in My Feed, without NEW, so the feed isn't empty on day one.
- **Repeat alerts.** An item notifies at most once per rule on a device, across reloads.
- **Silent behaviour change for existing users.** After migration, someone with watchlist alerts on gets the same
  alerts as before. Someone with alerts off gets none.
- **Notifications that lead nowhere.** Clicking a notification always opens My Feed with the matching items
  visible.

## Constraints and existing code to build on

- Notification plumbing: `src/services/notifications.ts`. It handles permission and shows a notification with a
  fixed `tag` so a newer one replaces the older one. Clicking it focuses the window and sets the hash.
- Today's article alert: `src/context/FeedContext.tsx:305`. It only considers articles that are new since the
  last merge and published in the last 24 hours, and does nothing on a first-ever load.
- Watched-CVE changes: `src/services/intelligence/cveWatch.ts` and `src/components/CveWatchMonitor.tsx`. These
  keep two records per CVE: `notified` moves on every check, `seen` moves only when the user marks the feed as
  seen. The first sighting is the baseline. The rule engine should follow the same pattern; the watched-CVE rule
  can reuse `diffCveWatch` for its KEV, EPSS-jump and new-coverage conditions.
- Data for Vulns rules (`src/types/index.ts`):
  - `KevEntry` has vendor, product, products, cvss, epss, ransomware, ssvc, vector, cwes and dateAdded.
  - `VulnData.exploits` holds public exploit info per CVE.
  - `VulnData.notable` is the only individual record of new NVD CVEs, and today it only holds CVSS ≥ 9
    (`scripts/build-snapshot.ts:449`).
  - `CveIntel` holds KEV and EPSS data for CVEs mentioned in articles.
- `vulns.json` loads lazily (`ensureVulns`). If any enabled Vulns rule exists, it must be loaded at startup, the
  same way `CveWatchMonitor` does for watched CVEs.
- Routing: hash routes in `src/hooks/useHashRoute.ts`. My Feed needs a slug (proposed `#/feed/news` and
  `#/feed/vulns`) and an `ActiveNavTab` value.
- Settings live in IndexedDB through `SettingsContext`. Gist sync (`src/services/sync/gistSync.ts`) keeps settings
  local except for the keyword lists, which it combines from both devices.
- Tests: Vitest. The rule engine is plain functions and must have unit tests, like
  `cveWatch.test.ts` and `watchlist.test.ts`.

## Decisions made with the user

- Browser-only approach.
- One combined notification. Clicking it opens My Feed.
- My Feed has two sub-tabs (News, Vulns) and shows matches from all rules, not only those with 🔔.
- Layout option A for My Feed (stream with rule chips) and option B for the editor (condition builder with
  all/any and nested groups).
- Watchlist, My Stack and watched CVEs become ready-made rules.
- Notification gap in hourly steps.
- Built-in rules are fixed, with a "Duplicate as custom rule" button.
- What counts as worth an alert: a KEV listing, the CVSS score and active exploitation, each on its own or
  combined.

## Rule model

```ts
type RuleKind = 'news' | 'vulns';

interface AlertRule {
  id: string;
  name: string;
  kind: RuleKind;
  enabled: boolean;
  notify: boolean;          // 🔔
  root: ConditionGroup;
  builtIn?: 'watchlist' | 'stack-news' | 'stack-vulns' | 'watched-cves';
  createdAt: string;        // a new rule's starting point: older items never notify
  updatedAt: string;        // editing the conditions resets the starting point too
}

interface ConditionGroup { op: 'all' | 'any'; items: (Condition | ConditionGroup)[] }
type Condition = { field: string; operator: string; value?: unknown }   // exact union is the builder's call
```

### Conditions for Vulns rules

- vendor / product is any of. Case-insensitive whole-word match against the KEV vendor and product and the NVD
  `products` pairs, using the same matching as the My Stack vendor match in the KEV tab.
- CVSS ≥ n
- EPSS ≥ n %
- in KEV
- added to KEV in the last n days (optional; may be dropped)
- actively exploited (`ssvc.exploitation === 'active'`)
- public exploit (any of Metasploit, Nuclei or a PoC)
- ransomware-linked (`KevEntry.ransomware` or `cveGroups`)
- remote, no login (vector shows network access, no privileges, no user interaction; same test as the existing
  KEV quick filter)
- CWE is any of
- CVE is any of / CVE is in my watched list. The watched-CVE condition also fires on an EPSS jump and on new
  coverage, through `diffCveWatch`.

**Missing data does not match.** A CVE with no CVSS fails "CVSS ≥ 8". It is re-evaluated on every check, so it can
match and notify later once NVD scores it, because it was never counted as matched before.

### Conditions for News rules

- contains keyword (any of). Whole-word, case-insensitive, against the title, summary, CVEs and custom tags; reuse
  `checkWatchlistMatch`.
- mentions vendor / product (any of). Same matching as above.
- severity ≥ (critical / high / medium / low)
- category is, source is, tag is
- mentions any CVE
- mentions a CVE that matches one of my Vulns rules

### What is evaluated

- **News:** articles in memory, after each refresh merge. As today, only articles published in the last 24 hours
  can *notify*. Older ones can still appear in My Feed.
- **Vulns:** one item per CVE, built from the union of KEV entries, `notable` records (see the snapshot change)
  and CVEs that appear in articles with `CveIntel`. When the same CVE comes from several sources, the data is
  merged into one view.

## Matching, starting points and NEW

- Each rule records the item IDs it has already handled (`handled`). **Every** match goes into the record when
  it is first seen, whether 🔔 is on, off or the rule is disabled. Only matches that are new to the record *and*
  belong to a rule with 🔔 on (and enabled) notify. So turning on 🔔, or re-enabling a rule, never sends a backlog
  (*my call*). Store it in IndexedDB next to `cveWatch`, and prune IDs that no longer exist so the record doesn't
  grow forever.
- **Item IDs:** an article ID for News items, the CVE ID for Vulns items. The exception is the watched-CVE
  condition, which follows events: each change gets its own ID (`CVE-…#kev`, `CVE-…#epss:<new score>`,
  `CVE-…#news:<article id>`), so a watched CVE alerts again on each new KEV listing, EPSS jump or article,
  as it does today. Inside a group with other conditions, the watched-CVE condition matches when a change
  happened, and the other conditions are checked against the CVE's current data. For example, "watched AND
  CVSS ≥ 8" fires on each change to a watched CVE scoring 8 or higher (*my call*). In My Feed this shows as one
  row per CVE listing its recent changes, not one row per change (*my call*).
- **When a list behind a built-in rule changes** (a watchlist keyword added, a vendor added to My Stack, a CVE
  starred, or terms pulled in by gist sync), only items matched *because of the new entries* are added to the
  record without notifying. Adding "Microsoft" to My Stack does not notify about existing Microsoft KEV
  entries, and the rest of the rule's history is kept (*my call*).
- **Devices:** "at most once" is per device. The handled records stay local and aren't synced. Two devices with
  tabs open each notify once (*my call*; syncing the records is out of scope).
- On rule creation, and whenever its conditions change, every current match is added to the record without
  notifying. Old matches still show in My Feed.
- **NEW** = first matched after the last time the user pressed "Mark all seen" on that sub-tab (one timestamp per
  sub-tab). Opening the tab does not clear it.
- Badge: the My Feed nav tab shows the NEW count, like the Unread badge.

## Notification behaviour

- After each check (refresh settled and vulns loaded), gather the not-yet-notified matches from rules with 🔔 on.
- If the last notification was less than *gap* hours ago, keep the matches pending and send them in the next
  notification after the gap. Don't drop them.
- One notification: the title "ThreatFeed: N new matches", up to 4 lines, each tagged with its rule, then "…and N
  more". A fixed tag replaces the previous notification. Click → focus the window and open `#/feed/vulns` if any
  match is a Vulns item, otherwise `#/feed/news`.
- Permission is requested the first time the user turns on any 🔔. Existing blocked/unsupported messages from
  `IntelligenceSettings.tsx` are reused.

## Migration (one time, on settings load)

| Today | Becomes |
|---|---|
| `watchlistKeywords` | built-in News rule "Watchlist": contains keyword ∈ *the live watchlist list* |
| `stackKeywords` | built-in News rule "My Stack (news)" and Vulns rule "My Stack (vulns)": vendor/product ∈ *the live stack list* |
| `watchedCves` | built-in Vulns rule "Watched CVEs": CVE ∈ *the live watched list* |
| `watchlistNotifications` | 🔔 on Watchlist and Watched CVEs (both alerted before); My Stack rules start with 🔔 **off** (they never alerted) |

The built-in rules point to the existing lists rather than copying them. The watchlist editor, the My Stack editor
and the star button on CVE panels keep working, and gist sync of those lists keeps working.

**Built-in rules are fixed (decided with the user).** Users can switch them on or off and toggle their 🔔, but
can't edit their conditions or delete them. The editor shows them read-only, with a link to the list editor
that feeds them. Each one has a **"Duplicate as custom rule"** button. It creates an ordinary editable rule
whose condition is a *copy* of the list's current values (e.g. "vendor/product is any of Fortinet, Cisco, …").
The user then adds conditions such as "CVSS ≥ 8" to the copy. The copy doesn't follow later list changes (*my
call*). Like any new rule, the copy starts with its current matches as the starting point, with nothing
notified. On migration
their existing matches become the starting point, so nothing old notifies. The `notified` records in `cveWatch`
carry over for the watched-CVE rule so its history is kept.

`CveWatchMonitor`'s notification moves into the rule engine. The Vulns page's Watching tab stays as it is.

## Snapshot change: keep CVSS 7+ CVEs for matching

Today only CVSS ≥ 9 NVD CVEs are kept individually, so "vendor X and CVSS ≥ 7" can never match a new CVE that is
not in KEV. Measured on the current cache: 8,052 CVEs in the 14-day window, 2,997 with CVSS ≥ 7, and 593 with CVSS
≥ 9 (today's `notable`, about 355 KB raw with descriptions).

- Keep `notable` as is (CVSS ≥ 9, with descriptions).
- Add a slim list of CVSS 7.0–8.9 CVEs to `vulns.json`, with no description: id, published, score, products, CWE,
  short vector and SSVC. Tuples, as in `nvd-cache.json`, keep it small. The panel already loads descriptions from
  NVD on demand. Budget: about +100 KB gzipped at most. Measure it and report the size in the snapshot log.
- Rules with a CVSS threshold below 7 still work on KEV entries and on CVEs mentioned in articles. The editor shows
  a hint that new CVEs below 7 are not tracked.

## Settings and UI

- **Settings → Alert Rules** replaces the "Watchlist Alerts" card. It holds the rule list (name, type, enabled,
  🔔, match count, edit, delete), "+ New rule", the notification gap and a permission status line.
- **Rule editor (option B):** name, type, match all/any, condition rows (field ▾, operator ▾, value), "+ condition",
  "+ group" (one level of nesting is enough), and 🔔. A live preview shows how many current items match, which
  helps catch rules that would never fire.
- **My Feed (option A):** nav tab after Briefing, with sub-tabs News / Vulns and NEW counts. Rule chips filter the
  list. News items reuse an existing article row component and open the reader; Vulns items open the existing
  `CvePanel`. A "Manage rules" link goes to the settings card. It works on phones the same way the Vulns tables
  switch to cards.

## Left to the builder

- The exact condition and operator union types, and how the editor renders value inputs.
- Where rules are stored. Proposal: a new `alertRules` field in settings, synced through gist by rule id, newest
  `updatedAt` wins.
- Component structure and file names (suggested: `src/services/intelligence/alertRules.ts`,
  `src/pages/MyFeedPage.tsx`, `src/pages/settings/AlertRulesSettings.tsx`).
- How many rows My Feed renders (reuse `usePagedCount`).
- Whether "added to KEV in the last n days" makes it in.
