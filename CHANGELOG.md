# Changelog

All notable changes to ThreatFeed are listed here, newest first.

The project has no tagged releases yet, so changes are grouped by date. Entries before November 2026 were reconstructed from the commit history.

## Unreleased

- Gist sync no longer brings back muted keywords, watchlist/stack terms, saved searches, bookmark folders or alert rules that were deleted on another device (deletions are remembered for 90 days)
- CISA deadline highlights ("due today", this week, next 14 days) now use your local date instead of the UTC date, which was wrong for a few hours every day
- Titles in Japanese, Chinese, Russian, Greek, Arabic and accented Swedish are no longer treated as duplicates or merged into one story just because they share a Latin word
- Auto-refresh no longer re-applies an unchanged snapshot and pauses in background tabs (catches up when the tab becomes visible; tabs that can send alert notifications keep refreshing)
- Feeds added, imported or refreshed one by one while a refresh is running are now fetched right after it instead of being skipped
- Publish RSS feeds for news, vulnerabilities and ransomware (data/feeds/*.xml), with story and victim deep links

## 2026-11-02

- Upgrade dev tooling to fix 17 Dependabot alerts (3 critical): Vite 8, @vitejs/plugin-react 6, Vitest 4.1.12, tsx 4.23; `npm audit` now reports 0 vulnerabilities
- Add Dependabot config, security policy

## 2026-11-01

- Ignore macOS, Claude Code and secret files; add MIT license
- Add CLAUDE.md with project guidance for Claude Code

## 2026-10-31

- docs: TV mode implementation plan; spec keeps the sector card
- feat(data): daily-count history for dashboards (stats.json)
- fix(data): stats history counts a CVE once across days
- feat(tv): build TV tiles and sets from front page, briefing and ransomware data
- feat(tv): full-screen TV shell, settings and entry buttons
- fix(tv): leave full screen whenever the shell unmounts
- feat(tv): rotating news wall with fade, slide and reveal
- fix(tv): pick up late data, whole-line text, steady single set, no page scroll, wider front window
- fix(tv): clamp summaries inside a measured box, word trend direction
- feat(tv): dashboard figures for vulns and ransomware
- fix(tv): hide exploits delta when live exploit data is shallow
- feat(tv): vulnerability and ransomware dashboards
- fix(tv): dashboard chart readiness needs two live points; measure rows fractionally
- docs: TV and dashboard modes
- fix(tv): sets of five so every full screen gets a wide tile; drop short tails
- fix(tv): no critical bar for weeks before critical history exists
- fix(tv): exit goes back over the pushed history entry
- fix(tv): error boundary around the lazy TV shell; stats.json size budget log
- docs: TV mode v2 design (living tiles, sizes, dashboard panels)
- docs: TV v2 spec — Medium default, reveal one by one, categories setting
- docs: TV v2 plan; spec amended for the Large 2x2 hero
- feat(tv): interval in seconds, tile size setting, categories field
- feat: choose which news categories the app uses
- feat(tv): tile engine with jittered per-tile swaps, splits, merges and pages
- fix(tv): tile engine never stalls, fallback rotates items, keys stay unique
- feat(tv): useLivingWall drives per-tile swaps with pause on hidden tab
- fix(tv): useLivingWall ignores stale swaps after a rebuild, follows reduce-motion
- fix(ui): light-theme modals show the glass again
- feat(tv): living tile wall with sizes, per-tile transitions and page counter
- fix(tv): reveal swaps land when the leaving tile's 250 ms fade ends
- feat(tv): data for the new dashboard panels
- fix(tv): watchlist stack matches only consider the last 30 days
- feat(tv): dashboards swap panels like the wall, with count-up, growing bars and drawn lines
- fix(tv): 90-day victim bars skip weeks before history; count-up waits for the revealed cell
- docs: TV v2 and categories in use
- fix(sync): disabled categories stay local instead of being unioned
- fix(tv): debounce data-driven wall rebuilds and skip them when the first screen is unchanged; on-screen tiles keep their content
- fix(feeds): shown articles win near-duplicate checks over those of turned-off categories
- fix(filters): a category filter resets to All when its category is turned off
- feat(tv): animation speed setting and an X-Small size
- test(tv): speed factor keeps the JS out phase in step with the CSS
- docs: TV v3 design (unattended running, breaking news, QR, mixed mode, map, link settings)
- docs: TV v3 plan
- feat(tv): per-screen settings from the link; QR codes setting
- feat(tv): stale-data indicator, reload on new version and nightly, single exit
- fix(tv): uncached version check, no reload flash or cut animation, skip late nightly
- feat(tv): breaking news jumps the queue with a NEW badge
- fix(tv): breaking news only after the first sync and a settled wall; throttle detection
- feat(tv): QR codes on wide and big tiles
- feat(tv): mixed mode with Vulns numbers on the Latest wall
- fix(tv): keep content for every item the live wall holds, not the last render's
- feat(tv): ransomware world map panel
- fix(tv): refills refresh content again; on-screen tiles pinned per slot
- docs: TV v3
- fix(tv): QR code scales with the tile (40% of a wide tile, 35% of the hero, min 88px)
- fix(tv): final review follow-ups
- fix(tv): too few panels for a size steps to a roomier grid instead of columns
- chore(tv): step-down review cleanups
- fix(newspaper): fill the empty space under the lead story with the next stories
- fix(newspaper): feature + stack rows stack from the top and fill the shorter column
- fix(newspaper): stream fills settle without an update storm; keyboard-open briefs
- fix(newspaper): lead filler pool of 6 so a third row of briefs can fill wide gaps
- feat(tv): ten more dashboard panels for Vulns and Ransomware
- fix(tv): review fixes for the new dashboard panels

## 2026-10-30

- docs: design for custom alert rules and My Feed
- docs: implementation plan for custom alert rules
- feat(snapshot): keep CVSS 7–8.9 CVEs in vulns.json for alert rules
- fix(snapshot): keep capped products for CVSS 7–8.9 CVEs in the NVD cache
- fix(snapshot): bump NVD cache format to 3 so products get refetched
- feat(alerts): rule model and condition evaluation
- feat(alerts): built-in rules, duplicate and settings migration
- feat(alerts): alert engine with baselines, watched-CVE events and notification gap
- fix(alerts): no cveMatchesVulnRule flood on re-enable or vulns-less edits; stable watched-CVE news events
- feat(alerts): AlertMonitor sends one combined notification
- fix(alerts): hold alert checks until initial load and first refresh settle
- feat(alerts): My Feed page with News and Vulns tabs
- feat(alerts): Alert Rules settings with condition builder
- fix(alerts): block blank rule values, merge editor saves onto live rule, duplicate opens unsaved
- feat(alerts): sync alert rules, docs
- fix(alerts): validate condition value shapes so a malformed rule can't crash render
- fix(alerts): Watched CVEs duplicate stays event-driven
- fix(alerts): reload vulns.json for each new snapshot in the background monitors
- fix(alerts): only one tab runs alert checks, with the saved settings
- feat(alerts): review follow-ups for previews, data coverage and navigation
- fix: layout buttons work on Latest and My Feed news, disabled on My Feed vulns
- fix: newspaper layout on Latest and My Feed runs newest first
- docs: plan for intel expansion (feeds, modals, IoC links, monitors, Patch Tuesday, actors, trends, vendor pages)
- feat(feeds): add 45 verified security, IR, cloud, platform and IT feeds
- style: frosted dark-grey modal backdrop and glossy modal panels
- feat(reader): one-click IoC lookups
- fix(style): let per-panel --glass-base overrides reach .modal-glass
- feat(sources): keyword monitors via Google News RSS
- feat(vulns): Patch Tuesday tab from MSRC CVRF
- fix(vulns): full product lists and revised months for Patch Tuesday
- feat(actors): threat actor and malware profiles
- fix(actors): unambiguous Malpedia merges and stricter mention matching
- fix(nav): five-item phone bar with a More sheet; resilient actor chips
- feat(trends): week/month/year trends with a 400-day history
- fix(trends): never lose the history; weekly rollup over two years
- feat(vulns): vendor pages
- fix(vulns): vendor panel on top of page panels; looser NVD vendor spellings
- fix(ui): Sources modals close on Escape/backdrop and autofocus; shortcuts modal above panels
- docs: describe Patch Tuesday, actors, trends, vendor pages and keyword monitors
- fix(msrc): refetch the newest month only when revised, space failed retries; check CVE field shapes
- perf(startup): load Patch Tuesday, actor and trend data on demand only
- fix(nav): desktop tabs fit beside the category and watchlist controls
- ci: restore the published msrc.json and actors.json if the snapshot left them missing
- fix(ui): Escape closes the shortcuts modal alone; regression tests for panel stacking and trends
- docs: plan for reference glass panels, entity links, tag panels and plots
- feat(ui): reference glass side panels with slide-in and fading backdrop
- style: darker dimming beside side panels and behind modals
- style: blur the page behind the dimmed area
- style: darker dim beside panels
- style: near-black dim instead of grey
- style: slightly more see-through dim
- fix(ui): modal blur sees the page again; no double blur beside stacked panels
- refactor(nav): drop Trends and Actors tabs; detail panels open from any page
- feat(data): entities.json and the entity linker
- feat(ui): vendors, groups, actors, malware and CVEs link to their panels
- fix(ui): reader keys pause under a panel; vendor links need their capital
- feat(ui): every tag opens a list of matching articles and vulns
- fix(ui): tag lists leave out leak-site posts; category labels open their tag
- feat(ui): severity-over-time scatter, mention trends and Patch Tuesday heatmap
- feat(ui): micro-animations for cards, chips, tabs, panels and charts
- fix(ui): shadowless lift on borderless cards, exact count-up decimals, hover-only lift
- docs: entity links, tag panels, plots; Trends and Actors tabs removed
- fix(routing): closing a panel goes Back, reading from one closes them all
- fix(entities): read only entities.json version 1 or an unversioned file
- fix(keys): hold global shortcuts while a side panel is open
- fix(panels): a panel opened over the reader dims the reader
- fix(ui): cards transition only what they change, not transition-all
- fix(routing): a panel swapped under the same key still closes Back
- docs: TV mode and dashboard mode design

## 2026-10-29

- feat: Vulnerabilities & KEV page with KEV, NVD, EPSS and GitHub advisory data
- feat: collapse the masthead after scrolling about 10 cm
- feat: vendor filter, CVSS scores and clickable breakdowns on the Vulns page
- feat: lazy vulns data, incremental NVD, source status, CVE watchlist, shareable links
- feat: enrich the Vulns and Ransomware pages
- fix: adapt the leak-site activity chart to the history available
- feat: richer ransomware group information and a Groups tab

## 2026-10-28

- feat: feed snapshot, exploitation intel, briefing views, and reliability fixes
- feat(feed-health): show when and how each feed was updated; remove Cloudflare Worker
- fix(sw): load pages network-first so new deploys show on the first visit
- chore: Node 22, PR-only CI, retire broken feeds, live fallback, smaller snapshot
- fix: remove demo bookmarks from seed articles
- fix(deploy): run the snapshot schedule at :07/:37 instead of :00/:30
- feat: Ransomware & Breaches tracker with structured leak-site and breach data
- test: add temporary schedule canary workflow
- test: remove temporary schedule canary workflow

## 2026-09-24

- Initial commit: ThreatFeed — Security Intelligence Daily RSS Reader
- Fix 401 error: switch to allorigins proxy gateway, add auto-fallback and seed articles
- Fix: enforce configured proxy gateway to eliminate un-proxied CORS errors and add mobile-web-app-capable meta tag
- Add referrerPolicy=no-referrer to prevent CDN hotlink blocks on article images
- feat: enhance newspaper layout variance, typography (Arial/Sans), and width controls
- fix(newspaper): eliminate gaps between articles with multi-article column packing
- feat: expand feed registry with verified security and tech publications, dynamic category filters
- fix: resolve empty categories with normalized matching, parser inheritance, and comprehensive seed data
- feat: threat intel features and GitHub Pages deployment
- docs: add live GitHub Pages URL to README
