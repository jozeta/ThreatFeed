# Part C: TV, Dashboards and Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add donut/pie, ranked-bar, stacked-daily-bar and histogram charts; use them for npm, vulnerabilities, ransomware and news on the pages and the TV dashboards. Also add an npm dashboard and npm advisory tiles on the TV wall.

**Architecture:**
- **Charts:** chart blocks in `src/components/charts/` (SVG, no library) and pure figure builders in `src/services/charts/`, all unit-tested.
- **Dashboard panels:** they reuse the existing `PanelDef` and `pool()` pattern in `src/components/tv/dashPanels.tsx`. A new `npmPanels` pool backs a new `NpmDashboard`.
- **npm tiles:** they extend `src/services/tv/tiles.ts` and the TV routing (`tvRoute.ts`, `TvShell.tsx`).

**Tech Stack:** React 18, TypeScript, Tailwind, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-npm-watch-and-audit-batch-design.md` (Part C).

## Global Constraints

- **No chart library.** Charts are SVG, following `src/components/charts/` and `src/components/tv/dashParts.tsx`.
- **Donut/pie:** at most 6 slices plus "Other", a legend with value and percentage, the total in the centre, and an empty state.
- **Every chart:**
  - an accessible title, plus an `aria-label` that says the numbers in words
  - readable in light and dark mode, using the existing theme colours (`SEVERITY_*` in `charts/shared.tsx` for severities)
  - animated on arrival in TV mode, scaled by the speed setting as the existing panels are (`--k`/`wallMotion`)
  - static under reduce motion
- **Dashboard panels:** each computes its figures from fresh data when it appears (the `OnArrival` pattern) and skips itself when it has no data.
- **No visual redesign:** on the pages, the new charts go into each tab's existing stats area, in the existing card style.
- **npm data:** malware covers 30 days (`npm-malware.json`) and advisories 90 days of detail (`npm-advisories.json`). Withdrawn advisories never chart.
- **Project rules:**
  - CLAUDE.md: tests go next to the code, and feed and advisory text renders as text.
  - The CSP is unchanged.
  - `npm run lint`, `npx tsc --noEmit` and `npx vitest run` stay clean.
  - Docs (README, CHANGELOG) are updated in Task 6.

## Review Focus

1. **Empty and single-category data.** A donut with one slice, or all zero, shows the empty state or a full ring, never NaN or `NaN%`. Pinned in Task 1.
2. **Many categories.** More than 6 slices fold into "Other", the percentages add up to 100, and rounding is stable. Pinned in Task 1 (`slices fold to Other and percentages sum to 100`).
3. **TV pages that can't fill.** The npm dashboard on X-Small with few panels steps to a roomier grid, the existing rule. Pinned in Task 4.
4. **npm data not loaded or failing on TV.** The panels skip themselves and the wall shows the others, never a blank screen. Pinned in Task 4.
5. **Untrusted package names and summaries in tiles and legends.** They render as text. Pinned in Task 5.

---

### Task 1: chart blocks

**Files:**
- Create: `src/components/charts/DonutChart.tsx`, `src/components/charts/RankedBars.tsx`, `src/components/charts/Histogram.tsx`, `src/components/charts/chartData.ts` (pure helpers) and `chartData.test.ts`
- Move and generalise: `src/pages/vulns/StackedBars.tsx` into `src/components/charts/StackedBars.tsx`. Update its existing importers, which keep their behaviour.

**Interfaces (produces):**
- `foldSlices(items: { label: string; value: number }[], max = 6): { label: string; value: number; pct: number; other?: true }[]`:
  - Sorts by value, descending.
  - The 7th item onwards fold into "Other".
  - `pct` are whole numbers that sum to exactly 100 (largest-remainder method).
  - Zero and negative values are dropped.
  - Returns `[]` when the total is 0.
- `bucketize(values: number[], edges: number[]): { from: number; to: number; count: number }[]` builds histogram buckets. The last bucket is inclusive.
- `<DonutChart title data colors? centerLabel? size? animate? />`, where `data` comes from `foldSlices`.
- `<RankedBars title data={[{label, value}]} max? format? color? />`
- `<StackedBars>`: the generalised version, keeping the existing props, plus an optional legend.
- `<Histogram title buckets color? />`
- **Shared by every chart:**
  - Each takes an `ariaSummary` (default built from the data, for example "Critical 12 (40%), High 9 (30%) …").
  - Each renders its empty state when there is no data.

- [ ] **Step 1: Write the failing tests** in `chartData.test.ts`:
  - `slices fold to Other and percentages sum to 100`: 9 items give 7 slices, the last with `other: true`, and the percentages sum to 100.
  - A single item gives `pct` 100.
  - All zero gives `[]`.
  - Percentage rounding is stable for ties.
  - `bucketize` handles edges and the inclusive last bucket.
- [ ] **Step 2: Run** `npx vitest run src/components/charts/chartData.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and the components. Keep the move of `StackedBars` behaviour-neutral (run the existing tests).
- [ ] **Step 4: Run** lint, tsc and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(charts): donut, ranked bars, histogram; shared StackedBars`.

### Task 2: figure builders for the new charts

**Files:** Create `src/services/charts/figures.ts` and `figures.test.ts`

**Interfaces (produces):** pure functions. Each takes the data and `now` and returns chart-ready data.

- **Vulnerabilities:**
  - `kevByVendor(kev: KevEntry[], now, days = 90)` returns slices.
  - `cvssBands(cves: CveRecord[], now, days = 30)` returns bars for the bands 9–10, 7–8.9, 4–6.9 and 0.1–3.9.
  - `epssHistogram(kev: KevEntry[])` returns buckets with edges [0, 0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 1].
  - `criticalPerDayByCweFamily(notable: CveRecord[], now, days = 30)` returns stacked days. The top 4 CWE families are kept and the rest become "Other". Names come from `shortCwe` in `services/tv/dashboard.ts`.
- **Ransomware:**
  - `victimsBySector(victims, now, days = 30)` and `groupShare(victims, now, days = 30)` return slices.
  - `victimsPerDayTopGroups(victims, now, days = 30, top = 5)` returns stacked days.
- **News:**
  - `storiesByCategory(articles, feeds, now, days = 7)` returns slices.
  - `storiesPerDayBySeverity(articles, now, days = 14)` returns stacked days.
  - `topVendorsThisWeek(articles, now)` returns ranked bars, using the existing vendor detection in `services/intelligence/vendor.ts` or entity matching.
- **npm:**
  - `npmPerDayBySeverity(data, now, days = 30)` and `npmSeverityShare(data, now, days = 30)`.
  - `npmVulnVsMalware(data, malware, now, days = 7)`.
  - `npmTopPackages(data, now, days = 30)` and `npmTopCwes(data, now, days = 30)`.
  - `npmFixShare(data, now, days = 30)` gives fix available vs no fix.
  - `myPackagesStatus(results: PackageResult[])` gives affected / clean / no version / unknown.
  - `newestCriticalNpm(data)` and `malwarePerDay(malware, now, days = 7)` (for the sparkline).
- **Rules for every builder:**
  - Days use `localDayKey` (`src/utils/date.ts`).
  - Withdrawn advisories are excluded.
  - Builders never mutate their inputs.

- [ ] **Step 1: Write the failing tests:** each builder is tested on a small fixture with exact expected output, plus the window edges, the withdrawn exclusion and empty inputs.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(charts): figure builders for vulnerabilities, ransomware, news and npm`.

### Task 3: charts on the pages

**Files:** Modify the stats areas of `src/pages/vulns/KevTab.tsx` (and/or `NewCvesTab.tsx`, `ExploitTab.tsx`, wherever the figure belongs), `src/pages/vulns/NpmTab.tsx`, `src/pages/incidents/VictimsTab.tsx`, and `src/pages/BriefingPage.tsx`

**Behaviour:**

| Page | Charts added |
|---|---|
| KEV tab | KEV additions by vendor (donut, 90 d); EPSS histogram of KEV CVEs |
| New CVEs tab | CVSS bands (bars, 30 d); critical CVEs per day by CWE family (stacked, 30 d) |
| npm tab | severity donut (30 d); vulnerabilities vs malware donut (7 d); fix-available donut (30 d); top CWEs (ranked bars); "My packages" status donut, when packages exist. The existing per-day stacked chart and top packages list stay. |
| Ransomware → Victims | victims by sector (donut, 30 d); top groups' share (donut, 30 d); victims per day for the top 5 groups (stacked, 30 d) |
| Briefing | stories by category (donut, 7 d); stories per day by severity (stacked, 14 d); most-mentioned vendors this week (ranked bars) |

- All in the existing card style, in a responsive grid. No horizontal scroll at 390 px.

- [ ] **Step 1: Implement**, reusing Task 1's components and Task 2's builders, memoised on their inputs.
- [ ] **Step 2: Browser-check** at http://localhost:5173 (the user's dev server):
  - every chart renders with real data, in light and dark mode, at 1440 and 390 px
  - screenshots in the scratchpad
  - no console errors
- [ ] **Step 3: Run** lint, tsc and the suite. Commit `feat(charts): new charts on the Vulns, npm, Ransomware and Briefing pages`.

### Task 4: dashboard panels, including the npm dashboard

**Files:**
- Modify: `src/components/tv/dashPanels.tsx` (new panels in `vulnPanels` and `ransomPanels`; a new `npmPanels(ctx, fresh)` with `NpmCtx = { data, malware, results, now }`)
- Create: `src/components/tv/NpmDashboard.tsx` (like `VulnDashboard.tsx`, loading the npm data through the Part B hooks)
- Modify:
  - `src/components/tv/TvShell.tsx`: in dash mode, use NpmDashboard when the page is `vulnerabilities` and the route sub is `npm`
  - `src/components/tv/dashParts.tsx`: TV wrappers around the new charts, using the existing `Panel` and label styles
  - `dashPanels.test.ts`

**Behaviour:**
- **npm panels:** advisories per day by severity (stacked, 30 d), severity donut, vulnerabilities vs malware donut, top affected packages, top CWEs, "My packages" status donut (only when packages exist), newest critical advisory (wide), malware releases over 7 days (number with sparkline), and share with a fix (donut).
- **Joining the Vulns pool:** "npm advisories this week" and the npm severity donut also join the Vulns dashboard pool.
- **New Vulns panels:** KEV by vendor (donut), CVSS bands (bars), EPSS histogram, and critical per day by CWE family (stacked).
- **New Ransomware panels:** victims by sector (donut), group share (donut), and victims per day for the top 5 groups (stacked).
- Each panel skips itself without data, and charts are never smaller than a wide cell (`WIDE_SHAPES`).

- [ ] **Step 1: Write the failing tests** in `dashPanels.test.ts`:
  - the npm pool lists the expected panel ids when data exists
  - the pool is empty with no data (`npm data missing → no npm panels`)
  - "My packages" is present only with packages
  - the new Vulns and Ransomware panels appear when their data exists
  - each panel renders its figures from fresh data on mount (follow the existing tests)
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Browser-check:**
  - `#/vulns/npm?dash=1` at 1920×1080 for each size (`size=large|medium|small|xsmall`): the grid fills, or steps to a roomier size on X-Small
  - `#/vulns?dash=1` and `#/ransomware?dash=1` show the new panels within a cycle; use the `interval` param to speed it up
  - screenshots
- [ ] **Step 5: Run** lint, tsc and the suite. Commit `feat(tv): npm dashboard and new chart panels for Vulns and Ransomware`.

### Task 5: npm advisory tiles on the TV wall

**Files:**
- Modify:
  - `src/services/tv/tiles.ts`: `TvTileKind` gains `'npm'`, and add `tilesForNpm(data, malware, results, now, max = 30)`
  - `src/components/tv/TvTileCard.tsx`: render the npm tile
  - `src/components/tv/TvWall.tsx`: the page source for npm, plus mixed mode
  - `src/components/tv/tvRoute.ts`: `vulnerabilities` offers `tv` when the route sub is `npm`; the `tvAvailable` signature takes the sub, so update its callers
- Test: `tiles.test.ts` and `tvRoute.test.ts`

**Behaviour:**
- **The npm wall** (`#/vulns/npm?tv=1`) shows tiles for the newest npm advisories over 7 days: critical and high first, then medium, plus malware releases that affect a watched package.
- **Tile content:**
  - severity, package(s), summary as text, the affected range to the fixed version, GHSA and CVE ids
  - a "Yours: name@version" line when it affects a watched package
  - The QR code (when the QR setting is on) links to the GitHub advisory URL, which must be https://github.com/advisories/… with the id validated.
- **Mixed mode (TV+):** critical and high npm advisories from the last 48 h, and any advisory affecting a watched package, join the story pool. They are interleaved like the number panels, at most 1 in 6 tiles.
- **Breaking-news rule:** an npm advisory affecting a watched package that arrives during the session gets the NEW badge.

- [ ] **Step 1: Write the failing tests:**
  - `tilesForNpm` ordering and window
  - withdrawn excluded
  - the "Yours" line only when affecting
  - QR URL validation (a bad id gives no QR)
  - `tvAvailable('vulnerabilities', 'npm')` includes `tv`, and `tvAvailable('vulnerabilities', '')` doesn't
  - **`tile text is never HTML`:** a summary containing `<b>x</b>` renders as text
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Browser-check** `#/vulns/npm?tv=1` and `#/latest?tv=1&mix=1` with a watched package, and take screenshots.
- [ ] **Step 5: Run** lint, tsc and the suite. Commit `feat(tv): npm advisory tiles on the TV wall and in mixed mode`.

### Task 6: docs

- [ ] Update the README sections (charts on the pages, TV dashboards, the npm dashboard and wall, link params), the CHANGELOG Unreleased lines, and the README screenshots only if `claude-shots --write` is the documented way. Otherwise leave the images alone.
- [ ] Commit `docs: charts, npm dashboard and TV tiles`.
