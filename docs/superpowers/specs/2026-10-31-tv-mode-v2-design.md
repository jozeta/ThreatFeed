# TV Mode & Dashboard Mode v2 — Living Tiles

Builds on `docs/superpowers/specs/2026-10-30-tv-mode-design.md` (shipped in ab68328). Everything in that
spec still holds unless this one replaces it.

## Intent

The first version swaps a whole screen at once. On a lobby TV that reads as a slideshow: nothing moves
for two minutes, then everything changes together. The owner wants the wall to feel **alive**: individual
tiles leaving and arriving at slightly different moments, the layout itself shifting (a wide tile becomes
two small ones and back), and the dashboards animating their numbers and charts as they arrive. The
owner also wants control over density (tile size) and a faster default tempo.

## Goals

- Tile size setting: **Large / Medium / Small**, applies to the TV wall and the dashboards.
- Tiles swap **one at a time**, each on its own randomised timer.
- Wide (2×1) and single (1×1) tiles turn into each other while swapping.
- Faster tempo: interval **30 s – 5 min in 30 s steps, default 1 min**.
- A small **"Page x of y"** in the bottom-right corner.
- Dashboards: panels animate in (count-up numbers, growing bars, drawn lines, staggered list rows), there
  are more panels than fit on screen, and panels swap in/out like the TV wall.

## Non-goals

- **No highlight-colour setting.** The owner considered it and dropped it. Dashboards keep their current
  colours, including the meaning colours (critical red, KEV orange, exploit amber, ransomware purple).
- No per-page or per-mode settings: one size, one interval and one transition apply everywhere.
- No new data sources or new fields in the snapshot. Every new panel is built from data the app already
  loads (`vulns.json`, `msrc.json`, `stats.json`, leak-site victims, settings).
- Tiles stay non-interactive.

## Anti-goals (a failure even if it works)

- Holes in the grid, overlapping tiles, or a tile stuck half-animated.
- Most tiles swapping in the same second (the point is that they don't).
- A tile that is gone again before it can be read.
- Charts or lists shrunk to a size you can't read from across the room.
- The whole screen going blank during a swap.

## Settings (owner decided)

In the existing "TV & dashboard" section:

- **Tile size** — Large / Medium / Small. Large: 3–5 tiles on screen. Medium: 5–7. Small: 6–10.
  Default **Medium** (owner decided).
- **Interval** — 30 s to 5 min in 30 s steps, default **1 min**. Stored in seconds *(builder's call on the
  field name; the old `tvIntervalMinutes` is migrated: saved minutes × 60, clamped to 30–300 s, so a saved
  10 min becomes 5 min)*.
- **Transition** — Fade / Slide / Reveal, kept, now per tile (see below).

## TV wall

### Grid (my call, owner agreed)
| Size | Grid | Tiles on screen |
|------|------|-----------------|
| Large | 3 × 2 | 3–5 (1–3 wide) |
| Medium | 4 × 2 | 5–7 (1–3 wide) |
| Small | 4 × 3 | 6–10 (2–6 wide) |

Every cell is always covered: a wide tile spans two horizontally adjacent cells, a single tile one cell.
The grid never has holes, before, during or after a swap (the leaving tile's spot is filled by the arriving
one; during the animation the spot may show the empty tile background, but never a gap in the layout).
Fonts scale with tile size class as today; small tiles show a shorter summary (or headline only if that's
all that fits — the existing whole-line clamp rules apply).

### Timers (owner decided)
- Each tile on screen has its **own** timer: the interval plus a random offset of up to **±20 s**.
  With 1 min, a tile changes somewhere between 40 and 80 s after it arrived.
- At **30 s** the offset is ±10 s *(my call, owner agreed)*, so nothing stays up less than 20 s. General rule:
  offset = min(20 s, interval − 20 s).
- When a tile's time is up it animates out, then the next story animates in **in the same spot**.
- New timers are drawn when a tile arrives, so tiles drift apart naturally.
- Timers pause while the tab is hidden (as today).

### Wide ↔ single swaps (owner decided; mechanics my call, owner agreed)
- A leaving **wide** tile may be replaced by **two single tiles** (the next two stories), both arriving
  together in its two cells.
- When a **single** tile's time is up and its horizontal neighbour (forming an aligned pair of cells) is also
  single, the two may leave **together** and be replaced by **one wide tile**. The neighbour leaves early
  rather than waiting.
- The choice is random but bounded so the tile count stays inside the size's range (e.g. Large never
  drops below 3 or rises above 5). The most important upcoming stories prefer wide spots.

### Pages (owner decided)
- The story list is split into **pages**, each about one screen's worth of stories.
- "Page x of y" sits in the bottom-right corner, small and dim (like the ×, but always visible).
- Arriving tiles take the next story from the next page. When every tile on screen has been
  replaced by stories from the following page, the counter moves up.
- After the last page it starts over with a freshly rebuilt list (same "frozen for one cycle" rule as
  today). With only one page, the counter shows "Page 1 of 1" and tiles still swap so new data appears.
- The page split is what the counter means; the exact rule for which spot takes which story is left to the
  builder, as long as no story shows twice on screen at the same time and every story in the cycle appears.

### Per-tile transitions
- **Fade:** the tile fades out, the new one fades in.
- **Slide:** the tile slides out, the new one slides in.
- **Reveal:** arriving tiles pop in quickly **one by one** (owner decided): each arrival is a short
  scale-and-fade, and when several tiles arrive together (a wide tile replaced by two singles, the first
  screen, a new page's batch) they come in staggered, about 100–150 ms apart.
- Reduce motion (app setting or OS): a quick plain fade, as today.

## Dashboards

### Panels swap like tiles (owner decided)
- Same grid sizes, timers (interval ± jitter), pages and "Page x of y" as the TV wall.
- **Headline numbers are panels too** *(my call, owner agreed)*: a number panel takes one cell; charts and lists
  take a wide spot (2 cells) and, where the grid has the rows, may take 2×2. Charts and lists never shrink
  below a size readable from across the room; on Small, number panels fill the space around them.
- A panel shows the latest data each time it arrives *(my call, owner agreed)*.
- Panels with nothing to show (e.g. no Patch Tuesday data, an empty watchlist with no stack set) are
  skipped for that round, except the watchlist, which shows a calm "Nothing new for your vendors" when the
  stack is set but quiet.

### Panel pool

**Vulns** — existing: Critical CVEs 7 d, Added to KEV 7 d, Public exploits 7 d, Patch Tuesday,
Exploited right now, 90-day trend. New:
- **Watchlist** (owner asked): latest critical or exploited CVEs for vendors/products in the user's
  "my stack" (`settings.stackKeywords`), plus the user's followed CVEs (`settings.watchedCves`) with
  their status (in KEV, public exploit, EPSS where the data already has it). Empty stack and no
  followed CVEs → panel skipped.
- **Top vendors** with critical CVEs, last 7 days.
- **Latest critical CVEs** (id, score, short title).
- **Patch Tuesday breakdown**: latest month's critical / important / zero-days (and exploited).
- **CVSS spread** of recent CVEs (distribution chart).
- **KEV used by ransomware**: KEV entries flagged as known ransomware use (`KevEntry.ransomware`).

**Ransomware** — existing: Victims 24 h, Victims 7 d, Active groups, Most hit sector, Top groups,
Victims per day 30 d, Top countries, Latest victims. New:
- **Top sectors**, 7 days.
- **New groups this week**.
- **Group spotlight**: the most active group of the week with its recent victims.
- **Victims by weekday**.
- **90-day victim trend** (fills in over time as `stats.json` grows, like the existing history charts).

### Animations (owner decided)
Each time a panel arrives:
- numbers count up from 0 quickly (about 1 s, easing out);
- bars grow from zero;
- chart lines draw from left to right;
- list rows come in one after another.
Reduce motion → final values shown at once, plain quick fade.

## Settled after the builder check (my calls)

- **Shapes:** tiles and panels are 1×1 or 2×1 on Medium and Small. Number panels are always 1×1; charts and
  lists are never 1×1. *(Amended while planning:)* on the 3-column Large grid a row holds at most one wide
  tile, so 3 tiles is impossible without a **2×2 hero**; Large therefore also allows 2×2 (stories, charts,
  lists). Swaps generalise: 2×2 splits into two stacked 2×1, two stacked 2×1 merge into 2×2.
- **Fewer items than the size's minimum:** items split the screen into equal full-height columns and only
  re-arrive in place until there are enough.
- **Wide placement:** a wide tile may start in any column as long as both cells are in the same row (on
  the 3-column Large grid a row is either wide+single or single+wide or three singles).
- **Merging:** a single merges with its left or right neighbour only if that neighbour is also single and
  has been on screen at least 20 s; otherwise the single is simply replaced. A leaving tile/panel is always
  replaced by tiles covering exactly its own cells.
- **Dashboard pages:** each dashboard has its own pool and counter. Panels with data are ordered (current
  v1 panels first, then the new ones) and split into pages of one screen each; every panel appears once
  per cycle. If the whole pool fits on one screen, it shows "Page 1 of 1" and panels are replaced by
  themselves with fresh data (re-animated) so the screen keeps moving.
- **Panel data:** computed when the panel arrives (not frozen); the count-up and other arrival animations
  run on every arrival. Which panels exist is decided once per cycle (a panel without data is left out of
  that cycle).
- **Page counter:** shows the lowest page number among the tiles/panels currently on screen. It just
  changes text, no animation.
- **New panel data:** CVSS spread uses `vulns.notable` + `vulns.watchable` scores (CVSS 7+) published in
  the last 30 days, bucketed by whole score. Victims by weekday and the 90-day victim trend (weekly bars)
  come from the same per-day victim union the v1 dashboard uses (live + `stats.json`). New groups and the
  spotlight come from the live leak-site victim list. Any panel that can't be built from loaded data is
  dropped, never approximated.
- **Settings field:** the interval is stored as `tvIntervalSeconds`; `tvIntervalMinutes` is read once to
  migrate and then no longer written. The UI is a select of the ten 30 s steps.

## Categories in use (owner asked; applies to the whole app, not just TV)

A new setting lists every news category (from the feeds' `category`), all on by default. A category that is
turned off is gone from the **whole app**: every tab and category tab, search, the newspaper, Briefing,
trends, alerts and desktop notifications, and the TV wall.

- Articles from feeds in an off category are dropped where articles are loaded, so no view has to filter
  them itself *(my call)*.
- Live fetches skip feeds in off categories *(my call)*.
- Bookmarked articles stay visible in Bookmarks even if their category is off, like muted keywords
  *(my call)*.
- The existing "Categories on the front page" setting stays for categories wanted in the app but not on the
  front page; off categories disappear from that list *(my call)*.
- At least one category must stay on *(my call)*.
- Stored as a list of turned-off category names, so categories added later are on by default.

## Unchanged from v1

Entry/exit, URL params, full screen + overlay fallback, wake lock, auto-hiding × and pointer, suppressed app
chrome, the content rules per page (front, briefing, ransomware), dark theme, lazy loading, reduce-motion
rules.

## Constraints

- Existing stack, no new libraries (no animation or chart library); SVG charts in `src/components/tv/`.
- Lazy TV chunk; main bundle must not grow noticeably (settings UI only).
- Animations via CSS/`requestAnimationFrame`; must stay smooth on a TV's weak browser — animate
  `opacity`/`transform` where possible, not layout.
- Must run for hours without timers piling up or memory growing.

## Left to the builder

- The swap scheduler's data model (how cells, tiles and timers are tracked) and exact animation timings.
- Exact placement rules for which story/panel takes which spot, within the page rule above.
- Which existing dashboard panels are 1-cell vs wide, and exact chart forms for the new panels.
- How many items each list panel shows per size.

## Calls I made (owner can override)

- Old saved intervals over 5 min become 5 min.
- Jitter = min(20 s, interval − 20 s).
- Two singles merge by leaving together when the first one's timer fires.
- Headline numbers are swappable 1-cell panels; charts/lists are wide.
- Panels with no data are skipped; the watchlist shows a quiet message instead when the stack is set.
