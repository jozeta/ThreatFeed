# Part B: npm Vulnerability Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an extensive npm vulnerability section. The snapshot job publishes GitHub's npm advisories (detailed for 90 days, plus a compact index of all reviewed advisories) and 90 days of malware advisories. Users list the npm packages they use. ThreatFeed matches them on the device, with an optional OSV.dev lookup, then highlights affected packages and notifies once per new advisory. The npm advisories also get a Vulns → npm tab, an advisory panel and an RSS feed.

**Architecture:**
- **Pure modules** in `src/services/npm/`, all unit-tested:
  - `semver.ts`: versions and ranges
  - `advisories.ts`: normalising the GitHub data and carrying it over between runs
  - `match.ts`: matching and package status
  - `osv.ts`: the opt-in OSV lookup
- **Snapshot job:** `scripts/build-snapshot.ts` writes `public/data/npm-advisories.json`. It reads its previous copy like the other `PREVIOUS_*` files.
- **App:**
  - a `useNpmAdvisories` hook that loads the file only in npm views and for matching
  - a Settings editor
  - a Vulns tab with an advisory panel
  - a built-in alert rule
  - a fourth RSS feed

**Tech Stack:** React 18, TypeScript, Vite 8, Vitest 4, ESLint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-npm-watch-and-audit-batch-design.md` (Part B, "Settled after the builder check").

## Global Constraints

- **Data window:**
  - The detailed list covers reviewed npm advisories published or updated in the last **90 days**.
  - The index covers **all** reviewed npm advisories.
  - Malware covers the last **30 days**, in its own file `npm-malware.json`.
  - Size budgets: `npm-advisories.json` under about **800 KB** raw and **600 KB** gzipped. Log a warning when over, as the other files do.
- **Statuses:**
  - `affected`
  - `not-affected`: checked against all reviewed advisories, plus OSV when that is on.
  - `no-version`: the package has no version, so it is flagged for every advisory on the package.
  - `unknown`: a range couldn't be parsed. This is never shown as safe.
- **Privacy:**
  - The package list never leaves the device unless the user turns on "Also check full history with OSV.dev" (off by default).
  - The setting text says that this sends package names and versions to Google's OSV service.
  - OSV results are re-checked at most once a day, or when the list changes.
- **Notifications:**
  - Notifications are per device. Advisory keys that already affect a package when it is added, or when the list is first seen, are stored as seen.
  - The key is `advisoryId + package + version`, or `advisoryId + package` for an unversioned entry.
  - An advisory notifies the first time it becomes affecting on that device.
  - Withdrawn advisories never match, alert, chart or appear in RSS. They are listed struck through.
- **RSS:** `data/feeds/npm.xml` carries reviewed npm advisories only, capped at **100**. Items link to `#/vulns/npm?advisory=<GHSA id>`.
- **CLAUDE.md and standards:**
  - Feed and advisory text is untrusted: render it as text, or sanitize it when it is markdown or HTML.
  - Static hosting only, and no new dependencies.
  - The CSP is unchanged (OSV is covered by `connect-src https:`).
  - Tests go next to the code.
  - `npm run lint`, `npx tsc --noEmit` and `npx vitest run` stay clean.
  - README, CHANGELOG ("Unreleased") and the audit status table (FEAT rows) are updated in Task 8.
- **No visual redesign:** new views follow the existing Vulns tab patterns (KevTab and OpenSourceTab are the reference).

## Review Focus

1. **Version formats and range syntax on the edges.** These are prereleases (`1.0.0-beta.2`), `= 1.2.3`, `>= 0`, `<= 3.1` without a patch, unparseable input, a `v` prefix, and scoped names. An unparseable range must give `unknown`, never `not-affected`. Pinned in Task 1 (`ranges never read as safe when unparseable`).
2. **The first run and an outage.** A missing previous file means a full backfill. A previous file that is unreadable (not a 404) means the file is not written and the workflow keeps the published copy. Pinned in Task 2.
3. **Adding a package with existing advisories.** It is shown as affected but doesn't notify. A later advisory notifies once. Pinned in Task 6 (`baseline on add, notify once later`).
4. **OSV off by default, and OSV unreachable.** Off means no request is made. Unreachable means the private result is shown with "OSV unavailable", never an error page. Pinned in Task 3.
5. **Hostile advisory text** (`<script>`, markdown links to `javascript:`). It renders as text, or sanitized markdown with safe links only. Pinned in Task 5.

---

### Task 1: semver and package-entry helpers

**Files:** Create `src/services/npm/semver.ts` and `src/services/npm/semver.test.ts`

**Interfaces (produces):**
- `parseVersion(v: string): Version | null`
  - Strict semver `MAJOR.MINOR.PATCH[-pre][+build]`, with an optional leading `v` stripped.
  - `Version = { major: number; minor: number; patch: number; pre: (string|number)[] }`
- `compareVersions(a: Version, b: Version): -1 | 0 | 1`: semver precedence, including prerelease rules; build metadata is ignored.
- `parseGhsaRange(range: string): RangeTest | null`
  - GitHub syntax: comma-separated comparators `>=`, `>`, `<=`, `<`, `=`. Bare versions may lack minor or patch (`<= 3.1` means `<= 3.1.0`).
  - `RangeTest = (v: Version) => boolean`
  - Returns null when unparseable.
- `osvAffected(v: Version, events: { introduced?: string; fixed?: string; last_affected?: string }[]): boolean | null` follows OSV `SEMVER` range semantics and returns null when unparseable.
- `parsePackageEntry(s: string): { name: string; version?: string } | null`
  - Accepts `name`, `name@1.2.3`, `@scope/name` and `@scope/name@1.2.3`.
  - The name follows npm rules: lowercase, at most 214 characters, URL-safe, and `@scope/` allowed.
  - The version must be exact semver.
- `formatPackageEntry(e): string` is the inverse.

- [ ] **Step 1: Write the failing tests.**
  - compare: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0 < 1.0.1`.
  - `parseGhsaRange('>= 4.0.0, < 4.17.21')` matches 4.17.20 and not 4.17.21. `'= 2.0.0'` and `'<= 3.1'` behave as described above. `'>= 0'` matches everything.
  - **`ranges never read as safe when unparseable`:** `parseGhsaRange('garbage')` is null.
  - `osvAffected` with introduced 0 / fixed 1.2.3, and with `last_affected`.
  - `parsePackageEntry` accepts `lodash`, `lodash@4.17.15`, `@types/node@20.1.0` and `v`-less versions. It rejects `Lodash`, `lodash@^4`, `a b` and `lodash@` with null.
- [ ] **Step 2: Run** `npx vitest run src/services/npm/semver.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(npm): semver and package-entry helpers`.

### Task 2: npm advisory data in the snapshot job

**Files:**
- Create: `src/services/npm/advisories.ts` (types, normalising, carry-over, pruning) and `advisories.test.ts`
- Modify:
  - `scripts/build-snapshot.ts` (fetch, carry-over, write and report)
  - `src/types/index.ts` (export the types)
  - `.github/workflows/deploy.yml`: add `PREVIOUS_NPM_URL` to the snapshot env, and add `npm-advisories` to the existing "Keep the published Patch Tuesday, actor and entity data" loop
  - `.gitignore`: add `public/data/npm-advisories.json`

**Interfaces (produces), in `src/services/npm/advisories.ts`:**

```ts
interface NpmRange { package: string; vulnerable: string; patched?: string }
interface NpmAdvisory {
  id: string; cves: string[]; summary: string; description: string; // description ≤ 1,500 chars, plain markdown text from GitHub
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  cvss: { version: '3' | '4'; score: number; vector: string }[]; cwes: { id: string; name: string }[];
  epss?: { score: number; percentile: number }; kev?: boolean;
  ranges: NpmRange[]; published: string; updated: string; withdrawn?: string;
  references: string[]; credits: string[]; url: string; // html_url
}
type NpmIndexEntry = [id: string, severity: NpmAdvisory['severity'], ranges: NpmRange[], withdrawn?: 1];
interface NpmMalware { id: string; package: string; vulnerable: string; summary: string; published: string }
interface NpmAdvisoryData { version: 1; generatedAt: string; updatedAt: string; recent: NpmAdvisory[]; index: NpmIndexEntry[]; malware: NpmMalware[] }
```

Functions:
- `normalizeGhsaNpm(raw: unknown): NpmAdvisory | null` keeps npm ranges only and caps the description.
- `toIndexEntry(a): NpmIndexEntry` and `normalizeGhsaMalware(raw): NpmMalware[]`.
- `mergeNpmData(previous: NpmAdvisoryData | null, updated: NpmAdvisory[], malware: NpmMalware[], kevCves: Set<string>, epss: Map<string, {score, percentile}>, now: number): NpmAdvisoryData`:
  - Upserts by id into `index` and `recent`.
  - Prunes `recent` and `malware` to 90 days, by `max(published, updated)` and `published` respectively.
  - Re-applies KEV and EPSS.
  - Sorts newest first.
- `decodeNpmData(raw: unknown): NpmAdvisoryData | null`.

**Snapshot job:**
- **Fetch:**
  - Fetch `https://api.github.com/advisories?ecosystem=npm&type=reviewed&per_page=100&sort=updated&direction=desc`, paging via the `link` header. On incremental runs, stop at the first advisory with `updated_at` before the previous file's `updatedAt`.
  - With no previous file (404), backfill the whole reviewed set, up to 80 pages.
  - Fetch `type=malware` the same way and stop after 90 days, up to 40 pages.
  - Send `GITHUB_TOKEN` as the existing GitHub Advisory loader does.
- **EPSS:** for the CVEs in `recent`, use the existing FIRST batch helper (`loadEpss` or equivalent), at most once a day. Keep the previous scores otherwise; track this in a `epssAt` field of the file.
- **Previous file:** read it from `${PREVIOUS_BASE}npm-advisories.json`. A 404 means a full backfill. Any other failure means the file is not written this run, so the workflow keeps the published copy.
- Report `npm-advisories` in `sources` (Feed Health) with counts.

- [ ] **Step 1: Write the failing tests:**
  - normalising a real-shaped GHSA npm advisory, and its malware form (fixtures in the test file)
  - the description cap
  - merge: an updated advisory replaces the old copy, and the index keeps all entries
  - 90-day pruning of `recent` and `malware`
  - a withdrawn advisory keeps `withdrawn`
  - KEV and EPSS applied
  - `decodeNpmData` rejects malformed data
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement the module and the job wiring.**
- [ ] **Step 4: Verify.**
  - Run lint, tsc and the full suite.
  - Run `npm run snapshot` **once**. The first run is a full backfill; report its duration and request count.
  - Report the counts (index, recent, malware) and the file size.
  - The file must be under about 1.5 MB. If it isn't, trim (shorter descriptions first) and say what you trimmed.
- [ ] **Step 5: Commit** `feat(npm): publish GitHub npm advisories and malware from the snapshot job`.

### Task 3: matching engine and the OSV client

**Files:** Create `src/services/npm/match.ts`, `match.test.ts`, `src/services/npm/osv.ts` and `osv.test.ts`

**Interfaces (produces):**
- `type PackageStatus = 'affected' | 'not-affected' | 'no-version' | 'unknown'`
- `interface MatchedAdvisory { id: string; severity; summary?: string; vulnerable: string; patched?: string; source: 'ghsa' | 'osv'; malware?: boolean }`
- `interface PackageResult { entry: { name: string; version?: string }; status: PackageStatus; advisories: MatchedAdvisory[]; minSafeVersion?: string; highestSeverity?: string; malware: boolean; osv?: 'checked' | 'unavailable' | 'off' }`
- `matchPackages(entries, data: NpmAdvisoryData, osv?: Map<string, OsvResult>): PackageResult[]`:
  - It uses `index` and `malware`, and takes the summary from `recent` when present.
  - Withdrawn advisories are skipped.
  - `minSafeVersion` is the highest `patched` among the advisories affecting the entry.
  - The status is `unknown` when any relevant range fails to parse and nothing else marks the package affected.
  - Ordering: malware first, then by severity, then by name.
- `affectingKeys(results: PackageResult[]): string[]` gives the notification keys (see Global Constraints).
- `osvQueryBatch(entries, fetchImpl = fetch): Promise<Map<key, OsvResult>>`:
  - It calls `POST https://api.osv.dev/v1/querybatch` with `{ queries: [{ package: { name, ecosystem: 'npm' }, version? }] }`, in chunks of 500.
  - It then fetches `GET https://api.osv.dev/v1/vulns/<id>` for summary and ranges, only for ids missing from `index`, with a limit of 50.
  - It returns null on network failure.
- `osvCacheFresh(cachedAt: string | undefined, listKey: string, cachedKey: string, now: number): boolean` decides whether a re-check is due: once a day, or when the list changes.

- [ ] **Step 1: Write the failing tests:**
  - an exact version inside or outside a range
  - an entry without a version gives `no-version` and lists all advisories
  - an unparseable range gives `unknown`
  - withdrawn advisories are ignored
  - the malware flag
  - `minSafeVersion` takes the highest patched version
  - ordering
  - `affectingKeys` formats
  - OSV: a mocked fetch maps results, a fetch failure returns null, and `osvCacheFresh` rules
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(npm): match watched packages against advisories; opt-in OSV lookup`.

### Task 4: watched packages in Settings, sync and backups

**Files:**
- Modify:
  - `src/types/index.ts` (`UserSettings.npmPackages: string[]`, `npmOsvLookup: boolean`)
  - `src/context/SettingsContext.tsx` (defaults `[]` and `false`, plus migration)
  - `src/services/sync/syncLog.ts` (`SYNCED_LISTS` gains `'npmPackages'`)
  - `src/services/storage/indexeddb.ts` (backup validation)
  - `src/pages/settings/VulnVendorSettings.tsx` (or the Vulnerabilities settings section): a "My npm packages" editor
- Test: extend `syncLog.test.ts` and `gistSync.test.ts`; create `src/pages/settings/npmPackagesForm.ts` with a pure validation helper and its test

**Behaviour:**
- **Editor:**
  - An input accepts `name` or `name@version` (one or several, comma- or space-separated). It is validated with `parsePackageEntry`; invalid entries show an inline error and aren't added.
  - Entries are stored with `formatPackageEntry`, deduplicated case-insensitively by name+version.
  - Each entry is a removable chip.
- **OSV toggle:** off by default. The text reads exactly: "Also check full history with OSV.dev — sends your package names and versions to Google's OSV service."
- **Sync:** the list syncs with Gist sync, including deletions.
- **Backups:** import and export include the list, and malformed entries are dropped on import.

- [ ] **Step 1: Write the failing tests:**
  - parsing the form input, including a multi-entry paste and an invalid one
  - syncLog records adds and removes for `npmPackages`
  - a Gist merge propagates a deletion
  - backup import drops invalid entries
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Browser-check the editor at http://localhost:5173 (do not start a server).
- [ ] **Step 4: Run** lint, tsc and the suite.
- [ ] **Step 5: Commit** `feat(npm): watched npm packages in Settings, synced and backed up`.

### Task 5: Vulnerabilities → npm tab and the advisory panel

**Files:**
- Create:
  - `src/hooks/useNpmAdvisories.ts`: loads `data/npm-advisories.json` the way the other ensure-loaders do (`createSnapshotLoader` pattern, IndexedDB offline copy)
  - `src/hooks/useNpmMatches.ts`: matching plus the OSV cache in IndexedDB
  - `src/pages/vulns/NpmTab.tsx`
  - `src/pages/vulns/NpmAdvisoryPanel.tsx` (+ host)
  - `src/services/npm/npmFilters.ts` (pure filtering and stats) with `npmFilters.test.ts`
- Modify:
  - `src/pages/VulnerabilitiesPage.tsx` (tab `npm`, label "npm packages", with a count badge of unseen affecting advisories, set in Task 6)
  - the panel registry, so that `?advisory=GHSA-…` opens the panel over any page like `?cve=`: add `'advisory'` to `PANEL_PARAMS` and its host in `App.tsx`
  - the service worker, only if needed (`/data/` is network-first already)

**Behaviour:**
- **My packages view**, at the top of the tab when the user has packages:
  - Each package shows its status chip, advisory count by severity, highest severity, minimum safe version and malware flag, plus the OSV state.
  - The list is ordered as `matchPackages` orders it.
  - With no packages, a prompt links to Settings.
- **Stats strip:** advisories in the last 7 and 30 days, critical/high counts, malware count over 7 days, and the top 5 affected packages over 30 days.
- **Advisory list** (`recent`, newest first):
  - Filters: severity, type (vulnerability or malware), affects my packages, has fix, KEV, has CVE, date range (7, 30 or 90 days), and text search over package, summary and ids.
  - URL state works like the other Vulns tabs.
  - Each row shows severity, package(s), summary, range to patched version, GHSA and CVE ids, EPSS and KEV badges and the date.
  - Rows that affect a watched package are highlighted, with the matched version shown.
  - Withdrawn rows are struck through.
- **Malware section:** recent malicious releases, with a one-line explanation. Watched matches are shown as critical.
- **Advisory panel** (`?advisory=`) shows:
  - the summary and the description, rendered as **text**, or as sanitized markdown if a safe renderer already exists in the repo; otherwise plain text with line breaks, with links only through `safeHttpUrl`
  - CVSS v3 and v4 vectors, CWE names, EPSS, KEV
  - every affected package range with its patched version
  - references (via `safeHttpUrl`), credits and dates
  - related news (articles whose `cves` include the advisory's CVEs, or whose text contains the GHSA id)
  - "Your packages affected" with the suggested upgrade
  - For an id found only in `index` (older than 90 days), it shows what it has plus the GitHub link.

- [ ] **Step 1: Write the failing tests:** filters and stats (`npmFilters.test.ts`), and **`advisory text is never HTML`**: a description containing `<script>` and `[x](javascript:alert(1))` renders no script element and no `javascript:` href. Test this through the panel's text-rendering helper.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Browser-check** at http://localhost:5173:
  - the tab, filters, panel deep link, highlighting with a watched package (for example `lodash@4.17.15`) and a malware row
  - screenshots at 1440 and 390 px
  - no horizontal overflow at 390
- [ ] **Step 5: Run** lint, tsc and the suite. Commit `feat(npm): npm packages tab, advisory panel and filters`.

### Task 6: notifications for watched packages

**Files:**
- Modify:
  - `src/types/index.ts` (`BuiltInRule` gains `'npm-packages'`; its kind is `'vulns'`)
  - `src/services/intelligence/alertRules.ts` (name "My npm packages", created enabled with notify on, added by migration for existing users)
  - `src/services/intelligence/alertEngine.ts` (an npm event source, and the `AlertStore` gains `npmSeen: string[]` with a cap of 5,000)
  - `src/components/AlertMonitor.tsx` (loads the npm data when the rule is enabled and the list is non-empty)
  - the Vulns tab badge (unseen affecting count)
- Test: extend `alertEngine.test.ts`

**Behaviour:**
- Each check computes `affectingKeys(matchPackages(...))`.
- **First time a package is seen on this device:** keys for packages not seen before (a new entry, or the first run after this ships) are added to `npmSeen` without notifying. Track known entries in the store (`npmKnownEntries`).
- **Later:** any key not in `npmSeen` becomes one alert ("lodash@4.17.15: Prototype pollution (GHSA-…)"), notifiable through the existing gap and permission rules, and is then added to `npmSeen`.
- Removing a package drops its keys.

- [ ] **Step 1: Write the failing tests:**
  - **`baseline on add, notify once later`:** add a package that already has 2 affecting advisories → no alert. A new advisory appears → 1 alert. The next check → no alert.
  - An updated range now covers the version → 1 alert.
  - Malware for a watched package → an alert.
  - Removing the package → no alert, and its keys are dropped.
  - Migration adds the built-in rule once.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** lint, tsc and the suite. Browser-check that the alert history shows an npm alert. Simulate one by removing a key from `npmSeen` in IndexedDB.
- [ ] **Step 5: Commit** `feat(npm): notify once per new advisory affecting your packages`.

### Task 7: npm RSS feed

**Files:**
- Modify:
  - `src/services/feeds/candidates.ts` (`FeedName` gains `'npm'`; new `npmCandidates(data: NpmAdvisoryData | null, now, site)`)
  - `src/services/feeds/build.ts` (`FEED_CAPS.npm = 100`, channel "ThreatFeed — npm advisories", description "Reviewed npm security advisories from the GitHub Advisory Database, via ThreatFeed.")
  - `src/services/feeds/links.ts` (`npmAdvisoryLink(site, id)` = `${site}#/vulns/npm?advisory=<enc id>`)
  - `scripts/build-snapshot.ts` (pass the npm data and write `npm.xml`)
  - the workflow keep step and cache list (four feed files plus `seen.json`)
  - `src/components/FeedSubscribe.tsx` (fourth row)
  - `index.html` (fourth alternate link)
- Test: extend the candidates and build tests

**Items:**
- guid `npm:<GHSA id>`
- title `npm <severity>: <package> — <summary>`
- description: the range, the patched version, CVEs and `Source: GitHub Advisory Database <html_url>`
- categories: `npm`, the severity, the CVEs and the package names
- sourceTime: `published`
- Withdrawn and malware advisories are excluded.

- [ ] **Step 1: Write the failing tests:** candidate shape; withdrawn excluded; the cap; a ledger round-trip that never re-announces.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite. Run `npm run snapshot` once and check that `public/data/feeds/npm.xml` passes `xmllint --noout`.
- [ ] **Step 5: Commit** `feat(feeds): npm advisories RSS feed`.

### Task 8: docs

**Files:** `README.md` (an npm section: data sources, privacy, statuses, notifications, RSS), `CHANGELOG.md` (Unreleased), `CLAUDE.md` (`npm-advisories.json` in the outputs list, `src/services/npm/`), and `docs/audit/2026-11-01-audit.md` (a status note: new feature, not an audit item)

- [ ] **Step 1: Update the docs** to match the shipped behaviour.
- [ ] **Step 2: Commit** `docs: npm vulnerability watch`.
