# Intel Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the five suggested features (keyword monitors, actor/malware profiles, IoC lookups, Trends, Patch Tuesday), 46 verified feeds, vendor pages, and a frosted, glossy modal look to ThreatFeed.

**Architecture:**
- Server-side data (MSRC CVRF, ATT&CK groups and software, Malpedia families, the trend history) is built by `scripts/build-snapshot.ts`. It ships as static JSON next to the existing files and is lazily loaded through FeedContext's `ensure*` pattern, the same way `vulns.json` and `ransomware.json` are.
- UI pieces are new pages and tabs that follow the existing page/panel conventions: `VulnerabilitiesPage` tabs, `CvePanel`/`GroupPanel` side panels, and hash routes in `useHashRoute`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind with `theme-*` tokens, idb, Vitest + jsdom, lucide-react. Charts are hand-rolled SVG, as in `ActivityChart.tsx`, `StackedBars.tsx` and `Sparkline.tsx`. No new dependencies.

**Origin:** the user asked for features 1–5 from the research list, the suggested feeds, vendor pages and frosted modals, and chose to skip the design questions. Decisions below marked *(controller)* were made without the user.

## Global Constraints

- No new npm dependencies. Charts use SVG in the style of `src/pages/incidents/ActivityChart.tsx`, `src/pages/vulns/StackedBars.tsx` and `src/components/Common/Sparkline.tsx`.
- Every new external fetch in the snapshot goes through the existing `tryJson`/`report` helpers. It must report its status in `dataSources` and must never fail the run, so a missing source means "no data", not an error.
- Data refreshed daily is carried over from the previous run, the way the `updates.attack`/`updates.malpedia` pattern does it in `build-snapshot.ts:~380-406`.
- New JSON files load only when a view needs them, the same way `ensureVulns`/`ensureRansomwareIntel` work in FeedContext.
- Every new page and panel lives in the URL hash (`useHashRoute`/`useHashParam`), so Back works and views can be shared.
- Links go to public reference sites (VirusTotal, GreyNoise, AbuseIPDB, URLhaus, MITRE, Malpedia, MSRC, Wikipedia), never to leak sites.
- Use the Tailwind `theme-*` tokens. The UI must work at phone width.
- Match surrounding code style and comment density. Pure logic goes in `src/services/…` with Vitest tests.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Add the 46 verified feeds

**Files:** `public/data/feeds.json` (bump `version` to `1.6` and set `updatedAt` to `2026-10-30T10:00:00Z`).

Add each feed as `{ id, name, url, category, tags, enabled: true }`. Use a kebab-case `id` that is unique against the existing ids and not in `retiredFeedIds`. Give each feed 2–4 lowercase tags. The category for each feed is fixed by the group below:

- **Blue Team:** Windows Incident Response (Harlan Carvey) `https://windowsir.blogspot.com/feeds/posts/default`, Inversecos `https://www.inversecos.com/feeds/posts/default`, Invictus IR `https://www.invictus-ir.com/news/rss.xml`, AboutDFIR `https://aboutdfir.com/feed/`, DFIR Diva `https://dfirdiva.com/feed/`, Arctic Wolf Labs `https://arcticwolf.com/feed/`
- **Threat Intelligence:** Rapid7 Blog `https://www.rapid7.com/blog/rss/`, Sekoia.io Blog `https://blog.sekoia.io/feed/`, Group-IB Blog `https://www.group-ib.com/feed/blogfeed/`, Proofpoint Threat Insight `https://www.proofpoint.com/us/threat-insight-blog.xml`, Trend Micro Research `https://feeds.feedburner.com/TrendMicroResearch`, Bitdefender Labs `https://www.bitdefender.com/blog/api/rss/labs/`, BushidoToken `https://blog.bushidotoken.net/feeds/posts/default`
- **Vulnerabilities:** NCSC UK News `https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml`, CISA ICS Advisories `https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml`
- **Research:** Wiz Blog `https://www.wiz.io/feed/rss.xml`, Datadog Security Labs `https://securitylabs.datadoghq.com/rss/feed.xml`, Sysdig Blog `https://sysdig.com/feed/`, AWS Security Blog `https://aws.amazon.com/blogs/security/feed/`, Google Cloud Security Blog `https://cloudblog.withgoogle.com/products/identity-security/rss/`, Cloudflare Blog `https://blog.cloudflare.com/rss/`
- **Malware:** Malware Traffic Analysis `https://www.malware-traffic-analysis.net/blog-entries.rss`, Didier Stevens `https://blog.didierstevens.com/feed/`, Hexacorn `https://www.hexacorn.com/blog/feed/`, Emsisoft Blog `https://www.emsisoft.com/en/blog/feed/`
- **CISO & Leadership:** Resilient Cyber `https://www.resilientcyber.io/feed`, tl;dr sec `https://tldrsec.com/feed.xml`
- **Platform Ecosystems:** The Keyword (Google Blog) `https://blog.google/rss/`, Google Workspace Updates `https://workspaceupdates.googleblog.com/feeds/posts/default`, Android Developers Blog `https://android-developers.googleblog.com/feeds/posts/default`, Apple Newsroom `https://www.apple.com/newsroom/rss-feed.rss`, Apple Developer News `https://developer.apple.com/news/rss/news.rss`, The Eclectic Light Company `https://eclecticlight.co/feed/`, Michael Tsai `https://mjtsai.com/blog/feed/`, Windows Blog `https://blogs.windows.com/feed/`
- **Microsoft Security:** Office 365 for IT Pros `https://office365itpros.com/feed/`, Practical 365 `https://practical365.com/feed/`, Born's Tech and Windows World `https://borncity.com/win/feed/`, AskWoody `https://www.askwoody.com/feed/`, 4sysops `https://4sysops.com/feed/`, Petri IT Knowledgebase `https://petri.com/feed/`
- **General Tech:** LWN.net `https://lwn.net/headlines/rss`, Phoronix `https://www.phoronix.com/rss.php`, GitHub Blog `https://github.blog/feed/`, Kubernetes Blog `https://kubernetes.io/feed.xml`, Hacker News (front page) `https://hnrss.org/frontpage`

That is 46 feeds. Rapid7 is in `retiredFeedIds` as `rapid7-blog`, so use the id `rapid7-research-blog` and don't touch the retired list.

- [ ] Add a check script under the scratchpad, not the repo. It uses the app's parser (`src/services/rss/parser.ts`) through `npx tsx`, fetches each new URL server-side, and reports item counts. Drop any feed that returns 0 items or fails to parse, and list the dropped ones in the report.
- [ ] Run the existing feeds test, if there is one (`grep -rl feeds.json src`), plus `npm test`.
- [ ] Update the README's "Established Security Feeds" section with the new names, grouped like the existing list.
- [ ] Commit `feat(feeds): add 46 verified security, IR, cloud, platform and IT feeds`.

---

### Task 2: Frosted, glossy modals

**Files:**
- Modify: `src/index.css` (add component classes)
- Modify: the 8 overlays found by `grep -rn "fixed inset-0" src`:
  - `ReaderModal.tsx`
  - `CustomizeSectionsModal.tsx`
  - `ClusterModal.tsx`
  - `KeyboardShortcutsModal.tsx`
  - `SourcesPage.tsx`
  - `FeedHealthPage.tsx`
  - `CvePanel.tsx`
  - `GroupPanel.tsx`

**What to build:**
- `.modal-backdrop`
  - A dark grey, very subtly translucent backdrop: `background-color: rgb(24 26 30 / 0.72)`, with `backdrop-filter: blur(6px) saturate(140%)` and the `-webkit-` prefix.
  - Keep the dark grey reading when `backdrop-filter` is unsupported: use `@supports not (backdrop-filter: blur(1px))` and fall back to `/0.85`.
  - The same backdrop in light and dark themes.
- `.modal-glass` for the panel/card itself:
  - The existing panel background at 0.94 opacity: use `color-mix(in srgb, var(--color-surface-or-card) 94%, transparent)`, with the actual token variable name taken from `index.css`.
  - `backdrop-filter: blur(14px) saturate(160%)`.
  - A 1px border of `rgb(255 255 255 / 0.08)`, or `/0.6` in light mode.
  - A glossy top highlight: `background-image: linear-gradient(180deg, rgb(255 255 255 / 0.06), transparent 40%)`, at a lower alpha in light mode.
  - `box-shadow: 0 24px 64px -12px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.06)`.
- Replace each overlay's `bg-black/NN backdrop-blur-sm` with `modal-backdrop`, and add `modal-glass` to each modal's panel element. Keep layout classes (flex, justify, padding, z-index, animation) unchanged.
- Respect `reducedMotion`; there should be no new animations.
- The print stylesheet must still hide overlays.
- [ ] `npm run build` and `npm test`. Describe in the report which element got `modal-glass` in each of the 8 files.
- [ ] Commit `style: frosted dark-grey modal backdrop and glossy modal panels`.

---

### Task 3: IoC lookup links in the reader

**Files:**
- Create: `src/services/intelligence/iocLinks.ts` and `iocLinks.test.ts`
- Modify: wherever the reader renders extracted IOCs (`grep -n extractIOCs src/components/Reader/ReaderModal.tsx`)

**Interface:**
- `iocLookupLinks(ioc: { type: string; value: string }): { label: string; url: string }[]`
- The IOC types come from `iocExtractor.ts`. Read it for the exact type names: cve, mitre (ATT&CK technique), md5/sha1/sha256, ipv4.
- Links per type:
  - **hashes:** VirusTotal `https://www.virustotal.com/gui/file/<hash>`, MalwareBazaar `https://bazaar.abuse.ch/sample/<sha256>/` (sha256 only)
  - **ipv4:** VirusTotal `https://www.virustotal.com/gui/ip-address/<ip>`, GreyNoise `https://viz.greynoise.io/ip/<ip>`, AbuseIPDB `https://www.abuseipdb.com/check/<ip>`, URLhaus `https://urlhaus.abuse.ch/browse.php?search=<ip>`
  - **ATT&CK technique:** `https://attack.mitre.org/techniques/<T1234>/`, and `T1234/001` for `T1234.001`
  - **cve:** NVD (reuse `nvdUrl`) and a link that opens the in-app CVE panel (`#/vulns/kev?cve=`)
- Values are URI-encoded.
- Each IOC row shows small link chips (`target="_blank" rel="noopener noreferrer"`).
- [ ] TDD: the test asserts the exact URLs for one of each type, including the ATT&CK sub-technique path, and that sha1/md5 get no MalwareBazaar link.
- [ ] Commit `feat(reader): one-click IoC lookups`.

---

### Task 4: Keyword monitors (Google News RSS)

**Files:**
- Create: `src/services/rss/keywordMonitor.ts` and its test
- Modify: `src/pages/SourcesPage.tsx` (an "Add keyword monitor" form next to "Add feed")

**Interface:**
- `googleNewsFeedUrl(query: string, opts?: { lang?: string; country?: string; days?: number }): string`. It returns `https://news.google.com/rss/search?q=<encoded query>[+when:<days>d]&hl=<lang>&gl=<country>&ceid=<country>:<lang>`. The defaults are `lang 'en-US'`, `country 'US'`, `days 7`, and `ceid` uses the language without its region (`US:en`).
- `isKeywordMonitor(feed: Feed): boolean`. It is true when the url host is `news.google.com` and the path starts with `/rss/search`.
- `monitorQuery(feed): string | null`. It reads `q` back out of the URL, without the `when:` part.

**UI:**
- A text input for the query (supports quotes and OR, as Google News does).
- An optional language/region select with a small list: English (US), English (UK), Svenska (SE), Deutsch (DE).
- On Add, call the existing `addCustomFeed({ name: 'Monitor: <query>', url, category: 'Keyword Monitors', tags: ['monitor'], enabled: true })`.
- Monitors are listed with a "Monitor" badge on the Sources page.
- **Controller ruling:** monitors are ordinary custom feeds, fetched live through the user's fetch chain like other custom feeds. Add a one-line note in the form: "Google News is fetched through your CORS gateway; if it's blocked, Feed Health will show it."
- [ ] TDD the helpers: encoding of quotes, `OR` and Swedish characters; `when:7d`; the `ceid` format; and the round trip with `monitorQuery`.
- [ ] Commit `feat(sources): keyword monitors via Google News RSS`.

---

### Task 5: Patch Tuesday (MSRC CVRF)

**Snapshot (`scripts/build-snapshot.ts`):**
- Fetch `https://api.msrc.microsoft.com/cvrf/v3.0/updates` with the `Accept: application/json` header. Pick the latest 3 monthly IDs whose `DocumentTitle` matches `/^\w+ \d{4} Security Updates$/`.
- Fetch each `cvrf/v3.0/cvrf/<ID>`. The latest month is refreshed every run during the first 3 days after its `InitialReleaseDate`, and daily otherwise. Older months are carried over from the previous `msrc.json` (`PREVIOUS_MSRC_URL`, which you add to `.github/workflows/deploy.yml` next to `PREVIOUS_NVD_CACHE_URL`, using the same pattern).
- Normalize each document into a `PatchMonth`, implemented as a pure function `normalizeCvrf(doc)` in `src/services/intelligence/patchTuesday.ts` with a unit test using a small inline fixture:

```ts
{
  id: '2026-Oct';
  title: string;
  released: string;
  cves: {
    cve: string;
    title: string;
    severity?: 'Critical' | 'Important' | 'Moderate' | 'Low';
    impact?: string;      // e.g. 'Remote Code Execution'
    cvss?: number;
    exploited: boolean;   // from Threats Type 1 "Exploited:Yes"
    publiclyDisclosed: boolean;
    products: string[];   // product names via ProductTree, max 5
    kb?: string[];
  }[];
}
```

- Write `public/data/msrc.json` as `{ version: 1, generatedAt, months: PatchMonth[] }`, newest month first. Log the size.

**App:**
- `loadMsrc()` in `src/services/snapshot.ts`, plus `ensureMsrc`/`msrc` in FeedContext and a `useMsrc()` hook, all following `ensureRansomwareIntel`.
- New Vulns tab `patch`, labelled "Patch Tuesday" (add `'patch'` to `TABS` in `VulnerabilitiesPage.tsx`), with `src/pages/vulns/PatchTuesdayTab.tsx`:
  - A month selector.
  - Stat tiles: total, critical, exploited (zero-days), publicly disclosed, RCE count.
  - A bar chart of CVEs by impact type, in SVG.
  - Chips listing the exploited/disclosed CVEs at the top.
  - A searchable table of CVE, title, severity, impact, CVSS, an exploited/disclosed badge, products and a "Your stack" badge (match `settings.stackKeywords` against the products with `containsTerm`).
  - Row click opens the existing `CvePanel` (`?cve=`).
  - A link to the MSRC release notes: `https://msrc.microsoft.com/update-guide/releaseNote/<ID>`.
- [ ] TDD `normalizeCvrf` covering: exploited/disclosed parsing from the Threats Description `"Publicly Disclosed:No;Exploited:Yes;..."`, severity from Threats Type 3, impact from Type 0, CVSS from `CVSSScoreSets` BaseScore (max), and the product-name lookup.
- [ ] Commit `feat(vulns): Patch Tuesday tab from MSRC CVRF`.

---

### Task 6: Threat actor and malware profiles

**Snapshot:**
- Reuse the daily ATT&CK bundle and the Malpedia families already fetched for ransomware.
- Build `public/data/actors.json` as `{ version: 1, generatedAt, actors: ActorProfile[], malware: MalwareProfile[] }`, carried over from `PREVIOUS_ACTORS_URL` on days when the bundles aren't refreshed (add it to deploy.yml).
- Use pure builders in `src/services/intelligence/actors.ts`, with tests on a tiny inline STIX fixture:
  - `ActorProfile`: `{ id: 'G0007', name, aliases, description (first paragraph, markdown links stripped), country?, firstSeen?, techniques: {id, name}[] (max 40), software: {id, name}[], url }`. The data comes from ATT&CK `intrusion-set` objects that are not revoked or deprecated. Techniques and software come via `uses` relationships. `country` comes from description phrases if present; it's optional, so leave it out if there's no simple signal.
  - `MalwareProfile`: `{ id, name, aliases, description, kind: 'malware'|'tool', attackId?, actors: string[] (names), malpediaUrl?, url? }`. The data is ATT&CK `malware`/`tool` objects merged with Malpedia families by normalized name/alias. Malpedia-only families are included only when they're mentioned in the current snapshot's articles, to keep the file small. Budget is about 400 KB raw, so log the size.
- Article mentions are computed in the browser: `actorMentions(articles, profiles)` matches name + aliases with `containsTerm`. Make it a pure function with a test.

**App:**
- `ensureActors`/`useActors` as for msrc.
- New top-level nav tab **Actors** (`ActiveNavTab` `'actors'`, slug `actors`, placed after Ransomware) with `src/pages/ActorsPage.tsx`:
  - sub-tabs `actors` and `malware`
  - search box
  - sort by "mentioned in your feeds (30 days)" or by name
  - each row shows the name, aliases, mention count with a sparkline, and technique count
- A side panel `ActorPanel` (`?actor=G0007`) and `MalwarePanel` (`?malware=<id>`), styled like GroupPanel and using `modal-backdrop`/`modal-glass` from Task 2:
  - description, aliases
  - techniques as chips linking to MITRE
  - software/actors cross-links that open the other panel
  - CVEs mentioned alongside it in articles (open CvePanel)
  - recent coverage in your feeds (open the reader)
  - external links (MITRE, Malpedia)
- Trending "actor" chips on the newspaper and briefing open the ActorPanel when the name resolves to a profile, and otherwise keep today's search behaviour.
- [ ] TDD the builders and `actorMentions`.
- [ ] Commit `feat(actors): threat actor and malware profiles`.

---

### Task 7: Trends (Chronicles view)

**Snapshot:**
- Keep `public/data/trends.json` = `{ version: 1, days: { [YYYY-MM-DD]: { [entityKey]: count } } }`. Accumulate from `PREVIOUS_TRENDS_URL` (add it to deploy.yml) and keep 400 days.
- Each run recomputes the counts for the last 3 days from the snapshot's articles and replaces those days. Earlier days are kept as they are.
- `entityKey` is `${kind}:${name}`, using the same vocab as `computeTrending`, plus `vendor:<KEV vendor>` for vendors.
- Write a pure function `countEntitiesByDay(articles, vocab, days)` in `src/services/intelligence/trends.ts` and test it. Refactor `computeTrending` to share the matcher if that comes naturally; don't change its output.

**App:**
- `ensureTrends`/`useTrends`.
- New top-level nav tab **Trends** (`'trends'`, slug `trends`, after Briefing), with `src/pages/TrendsPage.tsx`:
  - A period toggle: Week / Month / Year. Week uses local articles merged with history; Month and Year use the history.
  - A kind filter: all, CVEs, ransomware, actors, products, vendors.
  - A ranked list of the top 25 with count, change vs the previous period, and a sparkline (daily for week/month, weekly buckets for year).
  - A "biggest risers" strip.
  - Clicking an entity opens the right panel where one exists (CVE → CvePanel, ransomware → GroupPanel route on the Ransomware page, actor → ActorPanel, vendor → VendorPanel from Task 8, product → search). Until Task 8 lands, vendor clicks may search; Task 8 wires them.
  - If the history covers fewer days than the period, show "History since <date>", the same way the adaptive ActivityChart does it.
- [ ] TDD `countEntitiesByDay` and a pure `rankTrends(history, period, kind, now)`, which returns the counts, change and sparkline series.
- [ ] Commit `feat(trends): week/month/year trends with a 400-day history`.

---

### Task 8: Vendor pages

**Files:**
- Create: `src/services/intelligence/vendor.ts` (pure aggregation + tests) and `src/components/VendorPanel.tsx`
- Wire a `?vendor=<name>` param that opens the panel from any page. Mount the panel once in `App.tsx`, reading the param with `useHashParam('vendor')`.

**Interface:** `vendorSummary(name, vulns, articles, msrc?) → { kevTotal, kevLast30, kevLast90, ransomwareLinked, avgCvss, maxCvss, kevPerMonth (12 months, reuse kevPerMonth), cvssBands, topProducts (max 8), recentKev (newest 10), newCves (notable + watchable whose products match the vendor, last 14 days), exploitsPublic (count), newsMentions (articles matching the vendor name via containsTerm, newest first), advisoryFeedArticles (articles from feeds whose name/id contains the vendor, e.g. Fortinet PSIRT), patchTuesday? (only for Microsoft: the latest month's totals) }`.
- Vendor matching is case-insensitive on `KevEntry.vendor`, plus `containsTerm` on `products`.
- Normalize obvious aliases with a small map: `{'Microsoft Corporation': 'Microsoft', 'Apple Inc.': 'Apple', 'Google LLC': 'Google'}`.

**Panel** (right-side panel like CvePanel, using `modal-backdrop`/`modal-glass`):
- Header: the vendor name, a "My stack" toggle (add/remove in `stackKeywords`), and a "Hide on Vulns page" toggle (`hiddenVulnVendors`).
- Summary: the Wikipedia REST summary `https://en.wikipedia.org/api/rest_v1/page/summary/<title>`, fetched on open and cached in memory. Show the extract and thumbnail, with a link. Fall back to nothing if it 404s.
- Stat tiles.
- Two SVG charts: KEV additions per month (bars, ransomware-linked highlighted, like the KEV tab) and CVSS bands.
- Top products as clickable chips that open the KEV tab filtered (`#/vulns/kev?vendor=<v>&product=<p>`).
- Recent KEV list (open CvePanel).
- New CVEs.
- Latest news (open the reader).
- Advisories.
- Patch Tuesday mini-tiles for Microsoft.

**Entry points** that make vendor names clickable, setting `vendor` with push:
- KEV tab vendor cells and top-vendor chips
- the CvePanel vendor line
- the Patch Tuesday tab header ("Microsoft")
- the Trends vendor rows
- trending "product" chips stay as they are

- [ ] TDD `vendorSummary` on a small fixture: counts, the 30/90-day windows, the alias map, product matching and news matching.
- [ ] Commit `feat(vulns): vendor pages`.

---

### Task 9: Docs

- [ ] README: add a short bullet for each new feature in the existing sections (Intelligence Views and the snapshot file list): `msrc.json`, `actors.json`, `trends.json`, and the `PREVIOUS_*` variables.
- [ ] Run `npm test && npx tsc --noEmit && npm run build`.
- [ ] Commit `docs: describe Patch Tuesday, actors, trends, vendor pages and keyword monitors`.
