# npm Vulnerability Watch, plus Audit Batch (SEC-004, PERF-001/002/004, UI-001–003, FEAT-001/002)

Audit IDs refer to `docs/audit/2026-11-01-audit.md`, which holds each finding's evidence and
recommended fix. This document records what the owner decided and the calls I made. It is the
binding description for both parts.

## Intent

Make ThreatFeed faster and safer for every visitor, and turn it into something a developer can rely
on: tell it the npm packages you use, and it shows and notifies you when a vulnerability or a
malicious release affects them. The owner asked for the npm part to be **extensive and detailed**.

## Part A — Audit batch (owner decided: do these)

### A1. SEC-004: feed HTML can't use the app's own classes
- Feed HTML loses its `class` attributes in the sanitizer (keep only `language-*` on `code`/`pre`
  for code blocks).
- The reader's article container gets `contain: layout paint`, so nothing positioned inside it can
  escape it.
- Sanitizer tests (audit TEST-002): script, event-handler, `javascript:` and `data:text/html` links,
  `style`/`class` stripped, link `rel`/`target`, the existing image and size caps.

### A2. PERF-002: article text no longer ships in the main snapshot
- `snapshot.json` keeps every list field plus a description capped at about 600 characters.
- Full article HTML moves to content shards, `data/content/<YYYY-MM-DD>.json` (by publish day,
  keyed by article id), written by the snapshot job.
- The reader shows the description at once, then loads the article's shard and shows the full
  text. When the shard is missing or offline, it shows the description and the "Read original"
  link.
- Bookmarking an article fetches its content and stores it, so bookmarks still work offline and in
  backups.
- Stored articles keep content only while it is needed: content is not written to IndexedDB for
  every article on every refresh.
- The service worker caches shards like the other data files (network first).
- **Backward compatible:** an older snapshot that still has `content` keeps working.
- **Target:** the snapshot is under about 1 MB gzipped (today 2.4 MB), and the reader opens with
  content in under about 300 ms from a warm cache.

### A3. PERF-001 and PERF-004: duplicate check and story clustering
- Dedup becomes incremental. New items are checked only against the already-deduplicated list,
  word sets are cached per article, candidates come from an inverted word index, and the merge
  runs once per flush instead of twice.
- Clustering uses an inverted token/CVE index, cached tokens, and a memo keyed on ids and titles,
  so read and bookmark toggles don't re-cluster.
- **Results must not change:** equivalence tests against the current functions on a 2,000-article
  fixture. The published RSS feeds' story identity depends on clustering.
- **Target:** dedup under 100 ms and clustering under 150 ms on a cold load (profiled; today
  2.8 s and 1.3 s).

### A4. UI-001: compact mobile toolbar (owner decided: phones only, desktop unchanged)
- Below the `sm` breakpoint, the view switcher, TV, Mark read, Sections and Customize controls move
  into the existing Filter sheet, and the masthead is smaller.
- Search, the category menu and the Watchlist button stay visible.
- **Acceptance:** at 390×844 the lead headline's top is under 300 px, every control is reachable
  in two taps or fewer, and nothing scrolls sideways.
- No other visual changes (the owner asked not to redesign the UI).

### A5. UI-002: "new since your last visit" (my calls)
- A `lastVisitAt` is stored and updated when the tab is hidden or closed. On a first visit, the
  baseline is now minus 24 hours.
- The header shows "37 new since 08:12" (articles first seen after the baseline).
- Latest shows a thin divider where the new items end.
- A "Catch up" action marks everything older than the baseline as read.
- The Unread tab and count are unchanged.

### A6. UI-003: watchlist badges that mean something (my calls)
- Terms the user added get the strong yellow badge.
- Terms that only come from the default presets get a subtle label instead, not a badge.
- Settings → Watchlist shows, for each term, how many stories it matched in the last 7 days.
- Matching itself is unchanged; this is display only.

### A7. FEAT-001: alerts for "my stack" (my calls)

*Found while planning:* the built-in `stack-vulns` rule and custom Vulns rules already support
the vendor, CVSS, EPSS and KEV conditions. What remains is two one-click rule templates (see the
Part A plan, Task 8); the bullets below describe the behaviour they produce.

- New alert-rule conditions on vulnerability data, evaluated whenever `vulns.json` is newer:
  - a new CVE for a stack product with CVSS at or above X
  - a stack CVE added to CISA KEV
  - a stack CVE whose EPSS rose above Y
- Stack products are the existing stack keywords, using the vendor/product normalisation in
  `vendor.ts`.
- Delivered like other alerts (history and desktop notifications). Each fires once per CVE and
  condition, and never again after a reload.

### A8. FEAT-002: share the Briefing (my calls)

*Found while planning:* Copy and download as Markdown, and the 24 h and 7 d periods, already
exist. What remains is Copy as rich text and Download HTML.

- A "Share" menu on Briefing offers Copy as Markdown, Copy as rich text (HTML clipboard) and
  Download .html (print-friendly).
- Period: last 24 h or 7 days. It covers the sections the Briefing shows, with the top items per
  section and links.
- Pure generator functions with tests.

## Part B — npm vulnerability watch (owner decided: extensive and detailed)

### Data (owner decided: both private matching and opt-in OSV)
- The snapshot job publishes `data/npm-advisories.json`. The app loads it only when an npm view
  needs it. It contains:
  - **Reviewed GitHub advisories for npm, last 90 days** (about 900 today), each with:
    - GHSA id, CVE ids, summary, description (capped at about 1,500 characters)
    - severity, CVSS v3/v4 score and vector, CWE ids and names, EPSS (when a CVE)
    - KEV status (from the existing KEV data)
    - affected packages, each with its vulnerable version range and first patched version
    - published, updated and withdrawn dates, references, credits
  - **Malware advisories for npm, last 90 days** (3,000+ today), compact: id, package, affected
    versions, summary, published date. These are malicious, typosquatted or hijacked releases.
  - Fetched incrementally: each run asks only for advisories updated since the previous file
    (carried over like `nvd-cache.json`). It must stay within the GitHub API rate limit the job
    already uses (`GITHUB_TOKEN`).
- **Private matching (default):** the user's package list never leaves the device. It is matched
  locally against `npm-advisories.json`.
- **Full history (opt-in setting, off by default):** "Also check full history with OSV.dev".
  - When on, the app queries `https://api.osv.dev/v1/querybatch` for the watched packages.
    Measured on 4 Nov: it allows browser requests from the site.
  - The setting text says that this sends the package names (and versions) to Google's OSV
    service.
  - Results are cached per package and version, and re-checked at most once a day or when the
    list changes.
  - OSV records are shown with the same detail fields where available.
  - The CSP's `connect-src https:` already allows it.

### Watched packages (owner decided: type names; version-aware)
- Settings → Vulnerabilities gets a "My npm packages" editor. Entries are typed as `name` or
  `name@version`, for example `lodash`, `@scope/pkg@1.2.3`.
- Names and versions are validated against npm's naming rules and exact semver.
- An entry with an exact version is flagged only for advisories whose affected range includes
  that version. An entry without a version is flagged for every advisory on the package.
- The list syncs with Gist sync, including deletions (`syncLog` collection `npmPackages`), and is
  part of JSON backups.
- **Version matching:** a small in-repo evaluator for GitHub's range syntax (`>= 1.0.0, < 1.4.2`,
  `= 2.0.0`, `<= 3.1`) and OSV's introduced/fixed events. Prerelease rules follow semver. It is
  fully unit-tested, with no new dependency.

### Vulnerabilities → npm tab (extensive)
- **Advisory list:** newest first.
  - Filters: severity, type (vulnerability or malware), "affects my packages", has fix, KEV, has
    CVE, date range, and text search over package, title and ids.
  - Each row shows severity, package, title, affected range to fixed version, GHSA and CVE ids,
    EPSS and KEV badges, and published date.
  - Rows that affect a watched package are highlighted, with the matched version.
- **Advisory panel:** opens like the CVE panel and is linkable (`#/vulns/npm?advisory=GHSA-…`). It
  shows:
  - full description, CVSS vectors, CWE names
  - every affected package and range with its patched version
  - references, credits, dates
  - related news stories (by CVE or GHSA id)
  - "Your packages affected" with the suggested upgrade
- **My packages view:** the watched list with a status per package:
  - affected / not affected / unknown version
  - count of advisories by severity
  - highest severity
  - the minimum safe version (the highest first-patched version among the advisories affecting
    it)
  - a malware flag
  - Packages with malware advisories come first, then critical.
- **Stats strip:** advisories last 7 and 30 days, critical/high counts, malware count, top affected
  packages.
- **Malware section:** recent malicious releases, with an explanation that they are usually
  typosquats or hijacked versions. A watched package that matches is shown as critical.

### Notifications and highlighting
- A built-in alert rule, "My npm packages", enabled by default once the list is non-empty. It
  fires for a new advisory (reviewed or malware) that affects a watched package.
- It notifies for advisories ThreatFeed first sees after the package was added. Advisories that
  already existed when the package was added are shown as affected but don't notify, so there is
  no flood.
- Delivered like other alerts.
- The Vulns tab shows a count badge for unseen affecting advisories.

### RSS (my call)
- A fourth published feed, `data/feeds/npm.xml`, built on the existing feed builder and ledger.
- It carries reviewed npm advisories only (about 10 a day). Malware is excluded as too noisy.
- Item links open the advisory panel.

## Part C — TV, dashboards and charts (owner asked: npm on both TV and dashboards; interesting bar and pie charts for npm and the other data too)

### New chart building blocks (no chart library; SVG like the existing charts)
- **Donut / pie chart**
  - Slices for at most 6 categories plus "Other", with a legend showing value and percentage.
  - The total goes in the centre (donut). An empty state is handled.
  - Uses the existing theme colours and the dataviz conventions already in `src/components/charts`.
- **Horizontal bar chart** (ranked lists) and **stacked daily bars** (per-day bars split by
  category). These extend the existing `DailyBars` and `StackedBars` patterns, so the code is
  reused, not duplicated.
- **Histogram** (value distribution in buckets), for example EPSS or CVSS.
- **All charts:**
  - an accessible title, plus an `aria-label` summary that says the numbers in words
  - readable in light and dark mode
  - animated on arrival in TV mode using the existing speed setting
  - static under reduce motion

### npm on TV
- **npm dashboard** (`#/vulns/npm?dash=1`) built from a new npm panel pool:
  - advisories per day, 30 days, as stacked bars by severity
  - severity donut, 30 days
  - vulnerabilities vs malware donut
  - top affected packages (bar chart)
  - top CWE weaknesses (bar chart)
  - "My packages" status donut: affected / clean / unknown version
  - newest critical advisory (big tile)
  - malware releases, 7 days (number with sparkline)
  - median days from publish to fix (number)
- The npm panels also join the Vulns dashboard's pool, so they can appear there.
- **npm advisory tiles on the TV news wall:**
  - In mixed mode (TV+), critical/high npm advisories and any advisory affecting a watched
    package appear as tiles, like the number panels do today.
  - A dedicated wall at `#/vulns/npm?tv=1` shows npm advisory tiles.
  - The tiles use the existing tile sizes, breaking-news rule and QR code setting. The QR code
    links to the GitHub advisory.

### More charts for the other data (pages and dashboards)
| Where | New chart |
|---|---|
| Vulns page and dashboard | KEV additions by vendor (donut, 90 d) |
| Vulns page and dashboard | CVSS band distribution of new CVEs (bars, 30 d) |
| Vulns page and dashboard | EPSS distribution of KEV CVEs (histogram) |
| Vulns page and dashboard | New critical CVEs per day by CWE family (stacked bars, 30 d) |
| Ransomware page and dashboard | Victims by sector (donut, 30 d) |
| Ransomware page and dashboard | Top groups' share (donut, 30 d) |
| Ransomware page and dashboard | Victims per day for the top 5 groups (stacked bars, 30 d) |
| Briefing and news (TV mixed mode panels) | Stories by category (donut, 7 d) |
| Briefing and news (TV mixed mode panels) | Stories per day by severity (stacked bars, 14 d) |
| Briefing and news (TV mixed mode panels) | Most-mentioned vendors this week (bar chart) |

- Each dashboard panel computes its figures from fresh data when it appears, like the existing
  panels, and skips itself when it has no data (the existing rule).
- On the pages, the new charts go into each tab's existing stats area. The layout follows what is
  already there (no redesign).

## Settled after the builder check (my calls)

- **Complete private matching:**
  - Besides the 90-day detailed list, `npm-advisories.json` carries a compact **matching index of
    every reviewed npm advisory** (all time): id, package, vulnerable ranges, first patched
    version, severity, withdrawn flag.
  - A "not affected" is therefore backed by GitHub's whole reviewed dataset, not just 90 days. The
    detailed fields are loaded for the 90-day list and fetched from the advisory link for older
    ones.
  - Malware stays at 90 days, so the "My packages" view says "malware: last 90 days checked".
- **Status words:**
  - **affected:** a matching advisory exists.
  - **not affected:** checked against all reviewed advisories, plus OSV when it is on.
  - **no version:** the package was entered without a version, so it is flagged for every advisory
    on the package and shown as "check your version".
  - **unknown:** a range couldn't be parsed. This is never shown as safe.
- **Notification baseline is per device:**
  - When a package is added, or the app first sees the list on a device, the advisory keys that
    already affect it are stored as seen. The key is advisory id + package + version, or the
    package name for unversioned entries.
  - An advisory notifies the first time it becomes affecting on that device. That includes an
    updated advisory whose new range now covers a watched version.
  - Each device alerts on its own, as with other notifications. The package list syncs; the seen
    set doesn't.
- **"Median days from publish to fix" is dropped** (no release dates without a new registry call).
  It is replaced by "Share of advisories with a fix available" (donut).
- **EPSS:**
  - The job looks up EPSS for the 90-day advisories' CVEs, in the existing FIRST batch calls,
    refreshed at most once a day.
  - A7's "EPSS rose above Y" stores the last-seen score per CVE in the alert state and fires on a
    below-to-above crossing.
  - Defaults are X = CVSS 9.0 and Y = 0.5 (50%). Both are editable in the existing alert-rule
    editor.
- **Carry-over:**
  - A missing previous file (404) means a full backfill.
  - A previous copy that can't be read means the file is not written, and the workflow keeps the
    published copy, the same pattern as trends, stats and feeds.
  - Withdrawn advisories stay in the list marked "withdrawn" (struck through) and are excluded
    from matching, alerts, charts and RSS.
- **Content shards:**
  - Rebuilt each run from the snapshot's articles, covering the snapshot's 30-day window, so
    nothing accumulates.
  - Live-fetched articles keep their content in IndexedDB as today.
  - An article whose shard has aged out shows its description and the original link.
- **npm RSS:** it uses the existing feed builder and ledger. Items link to the app's advisory panel
  (`#/vulns/npm?advisory=`), and the description names the GitHub advisory URL as the source.
- **Delivery:** three separately reviewed and merged parts, in order A, B, C. A2 and A3 (shards,
  dedup, clustering) carry the most regression risk, so they get equivalence tests and a browser
  check before A merges.
- **Charts:** `StackedBars` lives in `src/pages/vulns/StackedBars.tsx`. It moves to
  `src/components/charts/` and is generalised there; the existing page keeps using it.

## Non-goals
- No package.json or lockfile import (the owner chose typed names). This can come later.
- No other ecosystems (PyPI and others) in this round. The data model keeps an `ecosystem` field so
  they can be added.
- No account and no server: everything stays static and in the browser.

## Anti-goals
- A package list sent to a third party without the user turning that on.
- Alert floods: old advisories notifying when a package is added, or malware noise in RSS or alerts
  for unwatched packages.
- A wrong "not affected": when the version is unknown or the range can't be parsed, show
  "unknown" (and flag it), never "safe".
- Slowing the main page: npm data loads only in npm views and for matching, and matching runs off
  the main page's critical path.
- Breaking existing users: old snapshots, backups and sync data keep working.

## Constraints
- CLAUDE.md rules: feed text is untrusted (descriptions rendered as text or sanitized), static
  hosting, polite API use, validated imports, tests next to code.
- Standards: no new runtime dependencies; the CSP stays as is; no inline scripts.
- Size budget: `npm-advisories.json` under about 1.5 MB raw. Trim descriptions or the malware
  fields if needed, and log a warning when over budget, like the other files.

## Left to the builder
- Module layout, the exact shard format, the incremental-fetch bookkeeping, and the visual
  details of the npm tab within the existing Vulns page style.

## Calls I made (owner can override)
- 90-day window, malware compact, reviewed advisories detailed.
- OSV re-check at most daily.
- No notifications for advisories that existed before the package was added.
- An npm RSS feed of reviewed advisories only.
- Content shards by publish day.
- UI-002 baseline of now minus 24 h on a first visit.
- UI-003 strong badges only for user-added terms.
- FEAT-001 conditions: CVSS threshold, KEV addition, EPSS rise.
- FEAT-002 formats: Markdown, HTML and a download.
