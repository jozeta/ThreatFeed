# TV Mode & Dashboard Mode — Design

## Intent

ThreatFeed should be able to run unattended on a large TV in a lobby or conference room, acting as a
**daily IT-security news briefing**: someone walking past gets a short glimpse of what is happening in
security right now, in a few seconds, from several metres away.

Two full-screen modes:

1. **TV mode** — a wall of large news tiles that rotates through the top stories.
   Available on **Latest** (newspaper), **Briefing**, and **Ransomware**.
2. **Dashboard mode** — a single screen of headline numbers and charts.
   Available on **Vulns** and **Ransomware**.

## Goals

- Readable from 4–5 m: few, large tiles (the owner picked "few and large", 5–6 tiles per screen,
  over a 9–10 tile option).
- No scrolling, no menus, no app chrome. Only news (or dashboard panels) plus a small **×** in the
  top-right corner that exits.
- Runs unattended for hours: rotates on a timer, picks up new data, does not let the screen sleep.
- Configurable in Settings: rotation interval (minutes) and transition style.

## Non-goals

- No remote control, casting, or multi-screen sync.
- No new external data sources; everything is built from data the app already loads (articles,
  `vulns.json`, `msrc.json`, `ransomware.json`, briefing data, `trends.json`) plus one new daily-count
  history file (see "Dashboard history" below).
- No interaction with tiles (clicking a tile does nothing; this is a display, not a reader).
- No per-page settings; one interval and one transition style apply to all TV and dashboard screens.

## Anti-goals (would be a failure even if it works)

- Any scrollbar, clipped/overflowing text, or empty gaps in the grid on a 16:9 screen.
- Text too small to read across a room.
- Animations that stutter, flash white, or leave the screen half-empty for long.
- Leaking the app UI (header, tabs, panels, toasts, notification prompts) into the TV screen.

## Entering and leaving

- A **TV** button next to the existing layout buttons on Latest, Briefing and Ransomware.
- A **Dashboard** button on Vulns and Ransomware.
- Entering requests real browser full screen (Fullscreen API on the document element). If the browser
  refuses (or is already full screen via F11/kiosk), the mode still renders as a fixed overlay covering
  the viewport.
- Exit: the **×** in the top-right corner, or **Esc**, or the browser leaving full screen. Exiting
  returns to the page the user came from, unchanged.
- The mode is reflected in the URL hash (e.g. a `tv=1` / `dash=1` param on that page's route) so a
  kiosk browser can be pointed straight at it and survive a reload. *(Builder's call on exact param
  names; must follow `useHashRoute` conventions.)* When opened from a URL without a user gesture,
  full screen may be refused — fall back to the overlay silently.
- The **×** and the mouse pointer hide after ~3 s without mouse movement and reappear on movement.

## TV mode — the tile wall

### Layout
- Fills 100vw × 100vh, dark theme always (regardless of app theme), no scrolling.
- 5–6 tiles per screen in a grid of 1×1 and 2×1 (wide) tiles, as in the approved mockup
  (3 columns × 2 rows, one or two wide tiles).
- Wide tiles go to the most important stories in the set (critical severity, KEV / actively exploited,
  ransomware).
- Each tile: thin severity colour bar, source + age ("BleepingComputer · 2h"), headline, summary.
  Wide tiles show a longer summary. Text is clamped so it never overflows its tile.
- Font sizes scale with viewport (e.g. `clamp()` / `vw`-based) so a 1080p and a 4K TV look the same.
- If there are fewer stories than a full screen, tiles grow to fill the space — never empty gaps.
  If there are no stories at all, show a calm "No new stories" screen with the time.

### Content per page
- **Latest:** the top stories from the last 24 h, ranked by the same importance score the newspaper
  layout already uses (`calculateImportance` in `NewspaperView.tsx`; extract it to a shared, testable
  module). Up to ~30 stories. Respects the user's current source/filter settings.
- **Briefing:** tiles built client-side from `buildBriefing()` (`src/services/intelligence/briefing.ts`,
  the same data the Briefing page renders) — a thin adapter, no new aggregation. Sections: critical & high stories, new CISA KEV entries,
  ransomware activity, new breaches, trending items. Each kind becomes a tile with a headline + summary.
- **Ransomware:** news stories (the same articles the page's Public reports / Incident news tabs show) **with some victim tiles mixed in**
  (owner's answer). Victim tile: "Akira listed Example Logistics GmbH", sector/country, age.
  Roughly one in three tiles is a victim tile *(my call)*; if one kind runs short, the other fills
  the remaining tiles.

### Rotation
- Stories are split into sets of 5–6. Every *interval* minutes the current set animates out and the
  next set animates in. After the last set, it starts over from the first.
- The list is frozen for one full cycle (no story repeats or vanishes mid-cycle); at each wrap-around
  it is rebuilt from the latest data, so new stories appear without a
  page reload. The app's existing background refresh keeps data current.
- Transition styles (Setting):
  - **Fade** — the whole set fades out, the next fades in.
  - **Slide** — the set slides out, the next slides in.
  - **Reveal** — tiles leave, then the next set's tiles appear **one by one**.
- If "Reduce motion" (app setting or OS preference) is on, always use a plain quick fade.

## Dashboard mode

One fixed screen, dark theme, filling 16:9 with no scrolling, × top-right. Data refreshes on the same
interval as the TV rotation (re-reads the app's in-memory data, which the existing background refresh
keeps current; no own fetch; no animation required beyond subtle number/chart
updates).

### Vulns dashboard — "what's critical and exploited right now, and is it getting worse?"
- Top row, four headline numbers, each with change vs the previous 7 days:
  critical CVEs (7 d), added to CISA KEV (7 d), public exploits (7 d), latest Patch Tuesday
  (total, with critical count and zero-days).
- Left: **Exploited right now** — highest-CVSS CVEs that are in KEV or have a public exploit,
  with score, vendor/product title, KEV/PoC pill.
- Right: **90-day trend**, weekly: critical CVEs as bars, KEV additions as a line.

### Ransomware dashboard
- Top row: victims 24 h (vs previous 24 h), victims 7 d (vs previous 7 d), active groups 7 d
  (with "N new this week"), most-hit **country** (share %) — victim data has no sector field (owner approved the swap).
- Panels: top groups (7 d, horizontal bars), victims per day (30 d area), top countries (7 d),
  latest victims list.

Both dashboards follow the approved mockup in
`.superpowers/brainstorm/*/content/dashboards.html`; colours follow existing severity/ransomware
palette (critical red, KEV orange, exploit amber, ransomware purple).

## Dashboard history (owner approved)

Current data is shallow: `vulns.json` `notable` covers ~2 weeks, `ransomware.json` `attacks` is the
latest 100 rows. So the snapshot job (`scripts/build-snapshot.ts`, every 30 min) starts recording a
**daily-count history** in a new file (e.g. `public/data/stats.json`), merged into the previous copy
and kept durable across deploys the same way `trends.json` is (restore step + `actions/cache` +
guard against shrinking):
- per day: critical CVEs published, high CVEs published, KEV additions, public exploits, victims;
- per day: victims per group and per country.
Counting is de-duplicated by CVE id / victim id so re-runs within a day don't double count.
Keep ~400 days. Charts show whatever history exists and fill in over the coming weeks; the KEV line
can be back-filled from KEV `dateAdded` immediately. Headline "vs previous period" deltas are hidden
when the previous period has no history yet.

## Settings

New "TV & dashboard" section in Settings:
- **Rotation interval** — minutes, 1–30, default **2**.
- **Transition** — Fade / Slide / Reveal, default **Reveal**.
Stored with the existing settings mechanism.

## Unattended running

- Request a **Screen Wake Lock** while either mode is on; re-request it when the page becomes visible
  again; release on exit. Silently skip if unsupported.
- Suppress toasts, notification-permission prompts, side panels, keyboard shortcuts and the reader
  while a mode is on.
- Timers pause when the tab is hidden and resume when visible.

## Constraints

- Existing stack only: React 18 + TypeScript + Vite + Tailwind; charts reuse/extend
  `src/components/charts/` (SVG, no new chart library).
- Must work as a static GitHub Pages site; no backend.
- Lazy-load the TV/dashboard code so the main bundle does not grow noticeably.
- Respect the existing reduce-motion rules (`.reduce-motion` and `prefers-reduced-motion`).

## Left to the builder

- Exact grid patterns for 5 vs 6 tiles and how tile sizes are assigned within a set.
- Exact URL param names, component/file structure, animation timings.
- How briefing items map to tile text.
- Number formatting and chart details within the mockup's spirit.

## Calls I made (owner can override)

- Interval default 2 min, transition default Reveal.
- One interval/transition for all pages.
- Dashboard is a single fixed screen, not a rotation of screens.
- Always dark theme in both modes.
- ~1 in 3 tiles on Ransomware TV is a victim tile.
- Tiles are not clickable.
- Mode is URL-addressable for kiosk use.
