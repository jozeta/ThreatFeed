# Glass Panels, Entity Links and Plots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- Restyle every panel and modal after the user's reference glass.
- Remove the Trends and Actors tabs.
- Turn vendors, ransomware groups, actors, malware and CVEs in text into quiet links that open a detail panel on the right.
- Make every tag clickable, opening a list of matching articles and vulns.
- Add a severity-over-time scatter plot (and other plots) to the panels.
- Add slide and fade panel transitions and smooth micro-animations.

**Origin (user's words):**
- "the frosted glass effect is not what i wanted … look at the left side [of web01/index.html], that is the effect i want"
- "remove Trends and actors tabs"
- "make every vendor, ransomware group and similar keywords a link, when clicking the link the right panel is displayed with detailed info. the link should look like the rest of the text, only when the user is hovering over the link a line under the text is displayed, keep the same color"
- "add a sliding effect to the right panel then fade in the opaque part on the left side"
- "all tags should be clickable, when clicked all articles or vulns is displayed in a list"
- "for the vendor right side panel add a plot graph for vulnerabilities, vertical axis severity, horizontal axis time/date, color coding and nice graphics; other plot graphs where they fit"
- "add smooth micro animations to panels and other elements"

Decisions marked *(controller)* were made without the user, who skipped design questions in this project.

**Reference glass** (from `/Users/zeta/Desktop/code/web01/css/style.css` `.glass`, verified by a screenshot):

```css
background: rgba(255,255,255,0.05);
box-shadow: 0 8px 32px 0 rgba(0,0,0,0.3);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
border: 1px solid rgba(255,255,255,0.18);
```

The pane is clear and strongly blurred, with no dark tint. The page behind it stays visible, just blurred.

**Tech:** React 18, TS, Vite, Tailwind (`theme-*` tokens), Vitest + jsdom. No new npm dependencies; charts use hand-rolled SVG.

**Visual check:**

```
node /private/tmp/claude-501/-Users-zeta-Desktop-code-ThreatFeed/3bb06ecb-bec6-45ca-8a06-6df1ae6e1f4f/scratchpad/shot/shot.mjs <url> <out.png> [w] [h] [dark|light] [waitMs]
```

This drives headless Microsoft Edge. Run `npx vite --port 5199 --strictPort` in the background, screenshot `http://localhost:5199/#/…` routes, view the PNGs with the Read tool, and stop the server afterwards. Every UI task must include screenshots: dark and light, at 1366×900 and 390×844. Look at them and fix what looks wrong before reporting. Local data exists in `public/data`.

## Global Constraints

- **Glass:** use the reference values above for every side panel and centred modal, in both themes. In light theme the 1px edge becomes `rgba(0,0,0,0.08)` so the edge stays visible on white *(controller)*.
- **Backdrop:** the dark grey `rgb(24 26 30 / 0.55)` covers only the area outside a side panel, so the panel's blur shows the page directly. For centred modals it covers the whole page.
- **Motion:**
  - Panel open: the panel slides in from the right with `transform: translateX(100%) → 0` over 280 ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Then the left backdrop fades in from opacity 0 to 1 over 220 ms, starting at 160 ms.
  - Close reverses it: the backdrop fades out over 140 ms, then the panel slides out over 220 ms, then the panel unmounts.
  - Centred modals fade and scale from 0.98 to 1 over 200 ms.
  - Micro-animations last 120–200 ms and use transform and opacity only, never layout properties.
  - All motion is disabled when `settings.reducedMotion` is on or when `prefers-reduced-motion: reduce` is set.
- **Entity links** look like the surrounding text: same colour, no underline. On hover and keyboard focus they show an underline (`text-underline-offset: 3px`, same colour). The cursor is a pointer. They are keyboard accessible (`role="link"`, `tabIndex=0`, Enter opens). Clicking opens the right panel and pushes the hash param, so Back closes it.
- Every detail view is a right side panel on the shared `SidePanel`. There is one Escape stack: Escape closes the topmost panel only.
- **Layering:**
  - side panels are z-[60] and above, increasing in open order
  - the reader is z-[70]
  - the shortcuts modal is z-[80]
  - the More sheet and other centred modals are z-50
- No HTML from external data is ever rendered. Linkifying the sanitized reader HTML walks text nodes only.
- Hash routes and existing shared links keep working where possible. Removed pages redirect *(controller)*:
  - `#/trends` goes to `#/`
  - `#/actors?actor=G0007` goes to `#/?actor=G0007`, which opens the panel
- Keep all existing tests green and add tests for pure logic.
- Match code style and comment density.
- Commits end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: SidePanel foundation, reference glass and slide/fade motion

**Files:**
- Create `src/components/Common/SidePanel.tsx` and `src/components/Common/panelStack.ts`
- Modify `src/index.css`
- Migrate these panels onto `SidePanel`:
  - CvePanel (`src/pages/vulns/CvePanel.tsx`)
  - VendorPanel (`src/components/VendorPanel.tsx`)
  - GroupPanel (`src/pages/incidents/GroupPanel.tsx`)
  - actor ProfilePanel (`src/pages/actors/shared.tsx`)
- Restyle the centred modals with the glass and the fade/scale motion: Reader, Cluster, CustomizeSections, KeyboardShortcuts, the Sources modals, the FeedHealth debugger and the More sheet.

**SidePanel API:**

```ts
<SidePanel open onClose title? width="md"|"lg" labelledBy?>{children}</SidePanel>
```

- It handles mount/unmount with exit animation, the left-side backdrop (`right` offset = panel width, click closes), focus moving into the panel on open and back to the opener on close, and `aria-modal`.
- `panelStack.ts` is a module-level stack. A panel registers on open and unregisters on close, and a single window capture-phase Escape handler closes only the top entry.
- Replace the per-panel Escape listeners (CvePanel, VendorPanel `covered` logic, ProfilePanel `closeUnlessCve`, GroupPanel, the shortcuts modal) with the stack. The reader and the shortcuts modal register too, so they sit on top.
- The stack is pure enough to unit-test. Test push/pop order and that Escape closes only the top entry.
- Update `src/components/escapeStacking.test.ts` to the new mechanism. It must still assert that Escape closes only the top panel.

**Steps:**
- [ ] CSS: add `.glass-panel`, `.glass-modal`, `.panel-backdrop`, and the keyframes/transition classes (or Tailwind config) per Global Constraints. Remove the old `.modal-glass`/`.modal-backdrop` look, keeping the class names only if that's simpler, but with the new values.
- [ ] Panel content must stay readable on the clear glass:
  - Headings use `text-theme-text`.
  - Secondary text uses `text-theme-text-muted`.
  - Inner cards inside panels use a very light fill: `bg-white/[0.04]` in dark, `bg-black/[0.03]` in light.
  - Check readability in the screenshots over a busy newspaper page.
- [ ] Use screenshots of a CVE panel and a vendor panel over the newspaper (dark/light, desktop/phone), plus a reader modal. For the animation, take one frame at 120 ms after open to show the panel mid-slide with no backdrop yet: use a small script that clicks, waits 120 ms and screenshots.
- [ ] Commit `feat(ui): reference glass side panels with slide-in and fading backdrop`.

### Task 2: Remove the Trends and Actors tabs; global entity panel hosts

- [ ] Remove the `trends` and `actors` tabs: ActiveNavTab values, SLUGS (and update their test), NavigationTabs entries, the App routes, and the pages `src/pages/TrendsPage.tsx` and `src/pages/ActorsPage.tsx` (delete them, plus any helpers only they used).
- [ ] `parseHash` maps an unknown or removed slug to the newspaper but keeps its params. That makes `#/actors?actor=G0007` open the actor panel over the newspaper. Test it.
- [ ] Keep the `actors.json` and `trends.json` pipelines and loaders; panels use them.
- [ ] Global hosts mounted once in App, all on SidePanel:
  - `?actor=<id>` → ActorPanel
  - `?malware=<id>` → MalwarePanel
  - `?group=<key>` → GroupPanel
  - `?vendor=` (already exists) → VendorPanel
  - `?cve=` → CvePanel (make CvePanelHost global and remove the per-page CvePanel renderings and `PAGES_WITH_CVE_PANEL`, so a CVE panel works on every page)
  - `?tag=` → TagPanel (Task 4)
- [ ] The Ransomware page's group list sets `?group=` with push and no longer renders its own GroupPanel.
- [ ] Trending chips (actor, ransomware) open these panels. Product chips keep the search behaviour.
- [ ] Screenshots: the newspaper with an actor panel from a trending chip, and the Ransomware page with a group panel.
- [ ] Commit `refactor(nav): drop Trends and Actors tabs; detail panels open from any page`.

### Task 3: Entity links everywhere

**Snapshot:** write `public/data/entities.json`:

```ts
{
  version: 1;
  generatedAt;
  vendors: string[];   // KEV vendors, canonical names, with everyday-word vendors excluded
                       // (reuse the stoplist from trends.ts)
  groups: { key: string; name: string; aliases: string[] }[];  // ransomware groups:
                       // ransomware.json profiles + leak-site group names
  actors: { id: string; name: string; aliases: string[] }[];
  malware: { id: string; name: string; aliases: string[] }[];  // from the actors/malware builders;
                       // apply the same ambiguity rules as actorMentions
}
```

- Budget about 80 KB raw; log the size.
- Use a shared `decodeEntities` validator. Load it lazily in the app via the existing ensure* loader helper (`src/services/snapshotLoader.ts`), requested shortly after first paint (`requestIdleCallback` or `setTimeout(…, 1500)`), so text can be linked without loading the big files.

**Pure linker** (`src/services/intelligence/entityLinks.ts`), with thorough tests:

```ts
type EntityRef =
  | { kind: 'vendor'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'actor'; id: string }
  | { kind: 'malware'; id: string }
  | { kind: 'cve'; id: string };
type Segment = { text: string; entity?: EntityRef };
buildEntityMatcher(entities): Matcher   // builds one combined case-insensitive whole-word regex
                                        // (or a first-word index, like actorMentions), longest match first
linkify(text: string, matcher): Segment[]
```

- CVE ids match `CVE-\d{4}-\d{4,}`.
- Ambiguous everyday-word names (the `AMBIGUOUS_TERMS` from actors.ts, e.g. Play or Royal) link only when a threat word is adjacent.
- Every occurrence links.
- Overlaps resolve to the longest match. Ties go in this order: group > actor > malware > vendor.

**Rendering:**
- `<EntityText text={…} />` renders segments. Links are a `<span class="entity-link" role="link" tabIndex=0>` that sets the matching hash param with push.
- `useEntityMatcher()` memoizes the matcher.
- For the reader's sanitized HTML, `linkifyHtmlTextNodes(container, matcher)` walks text nodes, skipping text inside `<a>`, `<code>` and `<pre>`. It replaces matches with spans carrying `data-entity-kind` and `data-entity-id`. One delegated click/keydown handler on the container opens the panel. Test it with jsdom.

**Apply to:**
- the reader (title stays plain; description and content linked)
- article summaries/descriptions in every card and list layout (not titles, because titles open the article)
- the cluster modal summaries
- CvePanel description and KEV name
- Patch Tuesday CVE titles
- VendorPanel/GroupPanel/ActorPanel/MalwarePanel descriptions
- Briefing text blocks
- My Feed vuln rows
- KEV table vendor cells (replace the VendorButton look with the entity-link look)
- Incident news

**Do not** link inside elements that are themselves buttons or links. If a whole card is a button, the link must `stopPropagation`.

- [ ] Screenshots: reader with links, and a hover state (use `page.hover` on a link before screenshotting).
- [ ] Commit `feat(ui): vendors, groups, actors, malware and CVEs link to their panels`.

### Task 4: Clickable tags → TagPanel

- `?tag=<value>` opens the TagPanel, a SidePanel with:
  - the tag name and counts
  - a small bar plot of matching articles per day (30 days)
  - Articles: every article whose `tags`/`categories`/`customTags` include the tag (case-insensitive), or whose threat-topic tag matches; newest first; paged; clicking opens the reader
  - Vulns: KEV entries and notable/watchable CVEs whose name, description, CWE name or products match the tag via `containsTerm`; also, when the tag is a CWE id or name, every CVE with that CWE; clicking opens the CVE panel
- Matching is a pure `tagMatches(tag, articles, vulns)` with tests.
- **Make clickable** (each opens the TagPanel, with push):
  - every article tag chip and custom tag chip (cards, reader, bookmarks, cluster modal)
  - threat-topic tags in the newspaper
  - CWE chips in KEV/New CVEs/CvePanel
  - Patch Tuesday impact chips
  - incident/vuln news tag chips
  - Chips keep their look, plus a subtle hover micro-animation.
- [ ] Screenshots: a TagPanel for "Ransomware" and for a CWE.
- [ ] Commit `feat(ui): every tag opens a list of matching articles and vulns`.

### Task 5: Plots

**Vendor severity-over-time scatter** (`src/components/charts/SeverityScatter.tsx`, SVG, responsive width):

- **Axes:** x is time (the last 24 months; for KEV CVEs use `dateAdded`, for new CVEs use `published`); y is CVSS 0–10 with gridlines at 4, 7 and 9.
- **Background:** faint horizontal severity bands coloured low (green), medium (amber), high (orange) and critical (red) at about 6% opacity.
- **Dots:** coloured by severity (same palette, solid). Dots without CVSS sit on a dashed "unscored" lane at y = 0 in grey. KEV entries get a ring, ransomware-linked entries a small diamond marker. Radius scales slightly with EPSS.
- **Interaction:**
  - A hover tooltip shows the CVE, product, CVSS, date, KEV and ransomware status. It is HTML positioned over the SVG and keeps inside the panel.
  - Clicking a dot opens the CVE panel.
  - Hovering a dot shows a small crosshair.
- **Entrance:** dots fade and scale in, staggered by x over about 400 ms (honour reduced motion).
- **Legend:** severity colours, plus the ring = KEV and diamond = ransomware markers.
- **Data:** from `vendorSummary` (extend it with a `points` array: `{cve, date, cvss?, kev, ransomware, epss?, product}`); test the points.

**Other plots *(controller)*, sharing a small `src/components/charts/` module:**
- `MentionsArea`: news mentions per week from trends.json (vendor/group/actor key), shown in the Vendor, Group, Actor and Malware panels. Hidden when the history has fewer than 2 weeks.
- TagPanel: articles-per-day bars (from Task 4; move them into charts/ if they were built ad hoc).
- Patch Tuesday tab: a severity × impact matrix heatmap (rows Critical/Important/Moderate/Low, columns the top 6 impact types, cell shade = count, click filters the table).
- [ ] Screenshots of each plot in dark and light, including a tooltip.
- [ ] Commit `feat(ui): severity-over-time scatter, mention trends and Patch Tuesday heatmap`.

### Task 6: Micro-animations

All of these use transform and opacity only, last 120–200 ms, and are off under reduced motion:

- **Cards and list rows:** hover lift (`translateY(-1px)` plus a slightly stronger shadow) on article cards and panel list rows.
- **Buttons and chips:** press feedback (`scale(0.97)` on `:active`).
- **Tabs:** an underline that slides between tabs (desktop nav and the Vulns/Ransomware/My Feed sub-tabs), or a fade if a slide is impractical.
- **Panel content:** fade-up stagger of sections (40 ms steps, 6 at most) after the slide-in.
- **Stat tiles:** numbers count up over 400 ms the first time a panel opens (`useCountUp`).
- **Badges:** the NEW and notification badges pop in (scale 0.9 → 1).
- **Charts:** bars and sparklines draw in (`scaleY` / `stroke-dashoffset`).

- [ ] Put the shared bits in `src/index.css` utilities (`.lift`, `.press`, `.fade-up`) and small hooks. Don't sprinkle ad hoc inline styles.
- [ ] Screenshots of a hover state on a card; check there's no layout shift.
- [ ] Commit `feat(ui): micro-animations for cards, chips, tabs, panels and charts`.

### Task 7: Docs and cleanup

- [ ] README:
  - Remove the Trends and Actors tabs from the Intelligence Views.
  - Describe entity links, clickable tags, the panels, the plots and `entities.json`.
  - Keep `trends.json`/`actors.json` in the snapshot list, noting that panels use them.
- [ ] Remove dead code left by the deletions (`npx tsc --noEmit` plus a grep for unused exports of the removed pages).
- [ ] Run `npm test && npx tsc --noEmit && npm run build`.
- [ ] Commit `docs: entity links, tag panels, plots; Trends and Actors tabs removed`.
