# Part A — Audit Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Part A of the approved design: SEC-004, PERF-002, PERF-001, PERF-004, UI-001, UI-002, UI-003, and the missing pieces of FEAT-001 and FEAT-002.

**Architecture:** Each task is an independent change with its own tests. The two performance tasks
(PERF-001 dedup, PERF-004 clustering) must keep results identical, which equivalence tests prove.
PERF-002 splits article HTML out of the snapshot into per-day content shards written by the
snapshot job and loaded by the reader.

**Tech Stack:** React 18, TypeScript (tsc 7, TS 6 API for ESLint), Vite 8, Vitest 4 (jsdom), ESLint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-npm-watch-and-audit-batch-design.md` (Part A, plus "Settled after the builder check"). Each finding's evidence is in `docs/audit/2026-11-01-audit.md`.

## Global Constraints

- CLAUDE.md rules:
  - All feed HTML is untrusted and reaches the DOM only through DOMPurify.
  - Static hosting only, with no secrets in the client.
  - Validate imports, and keep the JSON backup format backward compatible.
  - Tests go next to the code.
- No new npm dependencies. `npm run lint`, `npx tsc --noEmit` and `npx vitest run` all stay clean.
- The CSP (vite.config.ts) is unchanged, and there are no inline scripts.
- No visual redesign. UI-001 changes the layout on phones only (below the `sm` breakpoint); desktop
  is unchanged.
- Every user-visible change gets a CHANGELOG "Unreleased" line, and the README is updated where
  behaviour is described.
- Update the status table in `docs/audit/2026-11-01-audit.md` for each finding fixed.

## Review Focus

1. **An old snapshot (with `content`) or old IndexedDB data after upgrade.** The reader still shows
   content, and nothing is lost or re-downloaded in a loop. Pinned in Task 2:
   `reads content from old snapshots and stored articles`.
2. **A bookmarked article whose shard has aged out, and offline use.** The reader shows the stored
   content, or the description plus the original link, and never blanks. Pinned in Task 2:
   `falls back to the description when the shard is missing`.
3. **Dedup or clustering results changing after the performance rewrite.** That would re-post RSS
   stories under new guids. Pinned in Tasks 3 and 4 with equivalence tests on a 2,000-article
   fixture.
4. **A first visit and a clock change for "new since last visit".** The baseline is now minus 24 h
   on a first visit, and a future `lastVisitAt` is clamped. Pinned in Task 6:
   `baseline handles first visit and future timestamps`.
5. **Feed HTML that tries to overlay the reader.** `class="fixed inset-0 z-50"` is stripped. Pinned
   in Task 1.

---

### Task 1: SEC-004: strip classes from feed HTML, contain the reader, and sanitizer tests

**Files:**
- Modify: `src/services/rss/sanitizer.ts` (`sanitizeHtml`)
- Modify: `src/components/Reader/ReaderModal.tsx`, the content container (`.reader-html-content`): add `contain: layout paint`, using `src/index.css` or a Tailwind arbitrary property
- Test: create `src/services/rss/sanitizer.test.ts`

**Interfaces:** `sanitizeHtml(rawHtml: string): string` (unchanged signature).

- [ ] **Step 1: Write the failing tests.** They cover:
  - `class` is removed from every element, except `language-<x>` classes on `code` and `pre`. For example `<code class="language-js foo">` becomes `class="language-js"`.
  - `<a class="fixed inset-0 z-50" href="https://x">` keeps no class.
  - `<script>`, `onerror`, `style`, and `javascript:` / `data:text/html` hrefs are removed.
  - Links get `target="_blank"` and `rel="noopener noreferrer"`.
  - The 300,000-character truncation note and the large base64 image stripping still apply.
  - `safeHttpUrl` accepts http/https and rejects `JAVASCRIPT:alert(1)`, `//evil`, `data:` and an empty string.
- [ ] **Step 2: Run** `npx vitest run src/services/rss/sanitizer.test.ts`. Expected: the class tests FAIL.
- [ ] **Step 3: Implement.** Remove `class` from `ALLOWED_ATTR`. In a DOMPurify `uponSanitizeAttribute` hook, keep `class` only on `CODE`/`PRE` and only the `language-*` tokens. Add the containment to the reader container.
- [ ] **Step 4: Run** the sanitizer tests and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `fix(security): feed HTML can't use the app's classes; reader content is contained (SEC-004)`.

### Task 2: PERF-002: content shards

**Files:**
- Modify: `scripts/build-snapshot.ts`, the output section. Write the shards, and cap the snapshot description at 600 characters with `plainText`-style trimming.
- Create: `src/services/articleContent.ts` (shard loading and cache) and `src/services/articleContent.test.ts`
- Modify:
  - `src/components/Reader/ReaderModal.tsx` (load content when the article has none)
  - `src/context/FeedContext.tsx` (bookmarking stores content; snapshot articles aren't persisted with content)
  - `public/sw.js` (only if `/data/content/` needs a rule: it is under `/data/`, so it is already network-first)
  - `src/test/serviceWorker.test.ts` (only if `sw.js` changes)

**Interfaces:**
- Shard file: `data/content/<YYYY-MM-DD>.json` = `{ version: 1, day: string, content: Record<articleId, string> }`.
  - Day = the article's `publishedAt` UTC day.
  - Written for every snapshot article that has content.
  - Shards are rebuilt each run, and the directory is emptied first.
- `shardDay(publishedAt: string): string | null` gives the UTC `YYYY-MM-DD`, or null when the date is invalid.
- `loadArticleContent(article: Pick<Article,'id'|'publishedAt'|'content'>, fetchJson?: (url: string) => Promise<unknown>): Promise<string | null>`:
  - Returns `article.content` when present (old snapshots and live-fetched articles).
  - Otherwise fetches `${BASE_URL}data/content/<day>.json` once per day file (in-memory cache, with concurrent calls shared).
  - Returns the article's entry or null.
  - Returned content is raw HTML; callers sanitize it as today.
- Snapshot article objects carry no `content` field. Old snapshots that still carry it keep working, and `applyFetched` stores whatever it is given.

**Steps:**
- [ ] **Step 1: Write the failing tests.** In `articleContent.test.ts`:
  - `shardDay` handles an ISO date, an offset date and an invalid date.
  - `loadArticleContent` returns existing content without fetching.
  - It fetches the right day file once for two articles of the same day.
  - `falls back to the description when the shard is missing`: a 404 or a missing id returns null.
  - `reads content from old snapshots and stored articles` (content already present).
- [ ] **Step 2: Run** them. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `articleContent.ts`, then wire it up:**
  - **Reader:** show `article.description` immediately. When `content` is missing, call `loadArticleContent` and render the result through the existing `sanitizeHtml` and `useLinkedHtml` path. Run IOC extraction over the loaded content too. If it returns null, keep the description and the "Read original" link.
  - **Bookmark:** when bookmarking an article without content, load it and save the article with content (`saveArticlesToDB`).
  - **Snapshot job:**
    - Write shards to `public/data/content/`.
    - Strip `content` from the snapshot articles.
    - Cap descriptions at 600 characters.
    - Log the shard count and total KB.
    - Add `public/data/content/` to `.gitignore`.
- [ ] **Step 4: Verify.**
  - Run `npx vitest run` and `npx tsc --noEmit`.
  - Run `npm run snapshot` once. It hits the real feeds, so run it once only.
  - Expected: the snapshot is under about 3.5 MB raw (`ls -la public/data/snapshot.json`), and shards exist.
  - Then, against the user's dev server at http://localhost:5173 (do not start one), open a story: the full text appears.
  - Report the before and after `snapshot.json` sizes, raw and gzipped (`gzip -c | wc -c`).
- [ ] **Step 5: Commit** `perf(snapshot): ship article text in per-day content shards (PERF-002)`.

### Task 3: PERF-001: incremental, indexed dedup with identical results

**Files:**
- Modify: `src/services/articles/deduplication.ts`, `src/services/articles/merge.ts`, `src/context/FeedContext.tsx` (`applyFetched`: merge once)
- Test: `src/services/articles/deduplication.test.ts` (extend), and create `src/test/fixtures/articles2000.ts` (a generator, not a data file)

**Interfaces:**
- `deduplicateArticles(articles: Article[]): Article[]` keeps exactly today's output. Internally it caches word sets per article object (a `WeakMap`) and finds candidates through an inverted index of words within the ±48 h window.
- `mergeFetchedArticles(existing, fetched, maxAgeDays, shown?)` is unchanged in output.
- In `applyFetched`, compute the merge once per flush. Use that one result both for the IndexedDB diff and for state: `setArticles` with an id-based apply that keeps concurrent read and bookmark toggles. That is, state = merged result, but each article's user-state fields are taken from `prev`.

**Steps:**
- [ ] **Step 1: Copy the current implementation into the test file** as a reference (`referenceDedup`).
- [ ] **Step 2: Write the generator and the tests.** `makeArticles(n, seed)` builds 2,000 articles over 30 days with deterministic pseudo-random titles: shared words, near-duplicates, non-Latin titles, the same URL twice, invalid dates.
  - Test `dedup matches the reference on 2,000 articles`: the output ids are identical and in the same order.
  - Test `dedup is fast`: under 200 ms for 2,000 articles in CI (a loose bound).
- [ ] **Step 3: Run** them. The equivalence test passes against the unchanged code, and the speed test may fail.
- [ ] **Step 4: Implement** the index, the cache and the single merge.
- [ ] **Step 5: Run** the equivalence and speed tests, `merge.test.ts` and the full suite. Expected: PASS.
- [ ] **Step 6: Commit** `perf(articles): indexed incremental dedup, merged once per flush (PERF-001)`.

### Task 4: PERF-004: indexed clustering with identical results

**Files:**
- Modify: `src/services/articles/clustering.ts`, `src/components/Newspaper/NewspaperView.tsx` (memo key)
- Test: extend `src/services/articles/clustering.test.ts`

**Interfaces:**
- `clusterArticles(articles: Article[]): StoryCluster[]` keeps exactly today's output: the same clusters, primary articles and order.
- Inside, an inverted index (token → indices, CVE → indices) is used within the 96 h window, with tokens cached per article object.
- NewspaperView memoises clustering on `articles.map(a => a.id + '|' + a.title).join('\n')`, so read and bookmark toggles don't re-cluster. The cluster objects must still carry the current article objects. If the key is unchanged, re-map the cluster members to the current article objects by id, which is cheap.

**Steps:**
- [ ] **Step 1: Add a reference copy** and the test `clustering matches the reference on 2,000 articles`, deep-equal on ids, primaries and order, using Task 3's fixture generator.
- [ ] **Step 2: Add** `clustering is fast` (under 300 ms in CI).
- [ ] **Step 3: Implement** the index and the memo key with member re-mapping.
- [ ] **Step 4: Run** the clustering tests, `src/services/feeds` (the RSS builder uses clustering) and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `perf(newspaper): indexed clustering, memo on ids and titles (PERF-004)`.

### Task 5: UI-001: compact mobile toolbar (phones only)

**Files:**
- Modify: `src/components/Header/Header.tsx` (masthead size below `sm`), `src/components/Newspaper/NewspaperView.tsx` (section toolbar), `src/components/FilterBar/FilterBar.tsx` (the sheet gains the moved controls on mobile), and whichever component renders the view switcher, TV and Mark read row (find it from the screenshot layout)

**Behaviour:**
- Below `sm` (640 px):
  - The view switcher, TV button, Mark read, Sections toggle, Clustering toggle and Customize Sections are hidden in the page and shown in the Filter sheet. Each is the same control with the same handler.
  - The masthead title uses a smaller size, and the date line stays.
- At `sm` and above, nothing changes. Search, the category menu and Watchlist stay visible on phones.

- [ ] **Step 1: Implement** with Tailwind responsive classes (`hidden sm:flex` and a mobile-only block inside the sheet). Do not duplicate handler logic: render the same control component in both places.
- [ ] **Step 2: Verify** with Playwright-core and Edge against http://localhost:5173 (the user's server; don't start one).
  - At 390×844: the lead headline's top is under 300 px, every moved control works from the sheet, and `scrollWidth <= innerWidth`.
  - At 1440×900: a screenshot is pixel-identical in layout to the one before the change. Compare bounding boxes of the header, toolbar and first headline.
  - Save the screenshots to the scratchpad.
- [ ] **Step 3: Run** lint, tsc and the full suite. Commit `feat(mobile): compact toolbar on phones (UI-001)`.

### Task 6: UI-002: "new since your last visit"

**Files:**
- Create: `src/services/lastVisit.ts` and `src/services/lastVisit.test.ts`
- Modify: `src/context/FeedContext.tsx` (or a small hook that stores and updates `lastVisitAt` in IndexedDB on `visibilitychange` to hidden and on `pagehide`), `src/components/Header/Header.tsx` (the "N new since HH:MM" text plus a Catch up button), the Latest list views (the divider), and `src/context/FeedContext.tsx` (`markAllAsRead(ids)` already exists; use it)

**Interfaces:**
- `visitBaseline(stored: string | null, now: number): number`:
  - With no value, it returns now minus 24 h.
  - A stored time in the future is clamped to now.
  - Otherwise it returns the stored time.
- `newSince(articles: Article[], baseline: number): Article[]` returns the articles whose `fetchedAt` (or `publishedAt` when there is no `fetchedAt`) is after the baseline.
- The baseline is read once per page load; it doesn't move while the user reads. `lastVisitAt` is written when the tab is hidden or the page is closed.

- [ ] **Step 1: Write the failing tests** for `visitBaseline` (`baseline handles first visit and future timestamps`) and `newSince` (fetchedAt vs publishedAt, invalid dates excluded).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement the module, then the UI:**
  - **Header:** "37 new since 08:12" in the existing header stats style.
  - **Latest:** a thin labelled divider "Earlier" at the first article older than the baseline. Apply it to all three layouts on Latest only.
  - **Catch up:** a button that calls `markAllAsRead(ids of articles older than baseline)`.
- [ ] **Step 4: Verify** in the browser at http://localhost:5173 that the text, divider and Catch up work. Then run lint, tsc and the suite.
- [ ] **Step 5: Commit** `feat(news): new since your last visit (UI-002)`.

### Task 7: UI-003: watchlist badges for your own terms, plus term counts

**Files:**
- Modify: `src/components/Common/ThreatBadges.tsx` (the watchlist badge), `src/pages/settings/IntelligenceSettings.tsx` (or wherever the watchlist editor is), `src/services/intelligence/watchlist.ts`
- Test: extend `src/services/intelligence/watchlist.test.ts`

**Interfaces:**
- `isDefaultTerm(term: string): boolean` is true when the term (case-insensitive) is in `DEFAULT_WATCHLIST_KEYWORDS`.
- `termCounts(articles: Article[], terms: string[], since: number): Map<string, number>` uses the same matching as `checkWatchlistMatch`.
- **Badge:**
  - If any matched term is user-added (not a default term), show the existing strong badge with that term.
  - If all matched terms are defaults, show a subtle text label instead (`text-theme-text-muted`, no border or background, same font size).
  - The watchlist filter is unchanged.
- **Settings:** each term shows "N stories, 7 days".

- [ ] **Step 1: Write the failing tests** for `isDefaultTerm` and `termCounts`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the UI.
- [ ] **Step 4: Verify** in the browser that the front page shows strong badges only for non-default terms. Add a test term in Settings, check, then remove it. Run lint, tsc and the suite.
- [ ] **Step 5: Commit** `feat(watchlist): strong badges for your own terms, 7-day term counts (UI-003)`.

### Task 8: FEAT-001 presets and FEAT-002 rich export (only the missing pieces)

**Context:** the built-in `stack-vulns` alert rule and custom Vulns rules already support the
`vendor`, `cvss`, `epss`, `kev` and `kevAddedWithinDays` conditions
(`src/services/intelligence/alertRules.ts`). Briefing already copies and downloads Markdown
(`briefingToMarkdown`) for 24 h or 7 d.

**Files:**
- Modify: `src/pages/settings/AlertRulesSettings.tsx` (or `RuleEditor.tsx`), `src/services/intelligence/briefing.ts`, `src/pages/BriefingPage.tsx`
- Test: extend `src/services/intelligence/alertRules.test.ts` and create `src/services/intelligence/briefingExport.test.ts`

**Interfaces:**
- `stackRuleTemplates(stack: string[], now: Date): AlertRule[]` returns two ready-made custom Vulns rules for the "Add from template" control. They are disabled until the user saves them, with notify on:
  - "My stack: critical CVEs": vendor in the stack AND CVSS ≥ 9.0
  - "My stack: exploited": vendor in the stack AND (KEV OR EPSS ≥ 0.5)
- `briefingToHtml(b: Briefing): string`: a self-contained HTML document.
  - Inline styles only (it is a download, not part of the site, so the CSP doesn't apply).
  - All text escaped, and links checked with `safeHttpUrl`.
  - The same sections as the Markdown.
- **Briefing UI:** "Copy rich text" writes `text/html` plus `text/plain` with `ClipboardItem`, falling back to Markdown when unsupported. "Download HTML" saves `threatfeed-briefing-<date>.html`. The existing buttons stay.

- [ ] **Step 1: Write the failing tests:**
  - The templates' structure, which must pass `sanitizeRule`.
  - `briefingToHtml` escapes `<script>` in a story title, contains the section headings, and drops a `javascript:` link.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the UI.
- [ ] **Step 4: Verify** in the browser that the template adds the two rules and the HTML download opens. Run lint, tsc and the suite.
- [ ] **Step 5: Commit** `feat(alerts,briefing): stack rule templates, rich-text and HTML briefing export (FEAT-001/002)`.
- [ ] **Step 6: Update docs.** Update the audit status table (SEC-004, PERF-001, PERF-002, PERF-004, UI-001, UI-002, UI-003, FEAT-001, FEAT-002), the CHANGELOG and the README. Commit `docs: Part A status, changelog and README`.
