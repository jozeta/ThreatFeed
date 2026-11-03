# Published RSS Feeds — News, Vulnerabilities, Ransomware

## Intent

ThreatFeed already curates, deduplicates, clusters and scores security news, and it gathers KEV, NVD,
exploit, Patch Tuesday and leak-site data every 30 minutes. Today that value is only visible inside
the app. The owner wants it to reach people and tools where they already are: their own RSS reader,
a Slack or Teams channel, colleagues, and machine readers such as a SIEM or scripts. Three public RSS
feeds do this with no server, and every item brings the reader back into ThreatFeed.

## Goals (owner decided)

1. Three public RSS 2.0 feeds: **news**, **vulnerabilities**, **ransomware**.
2. Audience: the owner's own reader, Slack/Teams channel RSS apps, colleagues and the public, and
   machine readers (SIEM, scripts). One feed serves all of them.
3. **News feed:** important stories only. That means critical and high severity, **one item per
   story cluster** (the same story from several outlets appears once). Roughly 10–30 items a day.
4. **Vulnerabilities feed:** four kinds of items in one feed:
   - new **CISA KEV** entries
   - new **critical CVEs** (CVSS ≥ 9.0)
   - newly seen **public exploits**
   - a monthly **Patch Tuesday** summary
5. **Ransomware feed:** **leak-site victims and ransomware news stories mixed** in one feed.
6. **Item links go to ThreatFeed itself**, not to the source (owner decided). The source is still
   named and linked inside the item text.
7. **RSS only**: no JSON Feed or Atom version (owner decided). Structured values travel as RSS
   `<category>` elements.

## Non-goals

- No server, push service or WebSub hub. The feeds are static files rebuilt by the existing workflow.
- No per-user or filtered feeds (category toggles, watchlists, stack). They are the same for everyone.
- No new data sources, and no more requests to sources than today (CLAUDE.md: be polite to APIs).
- No email digests and no webhooks (separate audit items FEAT-002 and FEAT-003).

## Anti-goals

- **Re-announcing old items.** A reader or Slack channel must never see the same item twice, and
  never a burst of old items, after a redeploy, a failed run or a change of item text.
- **Lost history.** A failed snapshot run must not publish empty or truncated feeds that make
  readers drop items. Keep the previously published feeds instead.
- **Invalid XML.** Feeds that fail the W3C validator, or break on titles with `&`, `<`, emoji or
  non-Latin text.
- **Untrusted HTML passed on.** Feed text must not carry HTML from the sources: plain text only,
  escaped.
- **Dead links.** An item link that opens ThreatFeed with nothing on screen.
- **Making the normal app slower.** Feed generation runs only in the Action; the app gains only the
  deep links and the Subscribe section.

## The feeds

**Files** (my call): `data/feeds/news.xml`, `data/feeds/vulns.xml`, `data/feeds/ransomware.xml` under
the site, for example `https://jozeta.github.io/ThreatFeed/data/feeds/news.xml`. They are written by
`scripts/build-snapshot.ts`, or a small module it calls, in the same run as the other data files.

**Window** (my call): items from the **last 7 days**, newest first, capped at **100 items** for news
and vulnerabilities and **400 items** for ransomware (owner chose every victim, about 35 a day, plus
about 12 ransomware stories a day: the whole week must fit). The size budget below applies.

**Every item has:**
- **`<title>`:** prefixed by kind where it isn't a news headline:
  - `KEV: Fortinet FortiOS — CVE-2026-1234`
  - `Critical CVE (9.8): Ivanti EPMM — CVE-…`
  - `Exploit: CVE-… (Metasploit module)`
  - `Patch Tuesday October 2026: 87 CVEs, 3 zero-days`
  - `Victim: Acme Corp (Qilin · SE · Manufacturing)`
  - The headline itself for news.
- **`<description>`:** plain-text summary of at most about 400 characters, ending with
  `Source: <name> <url>` (the original article, NVD/CISA, or the leak-site tracker) and the
  severity, CVSS or EPSS where known. It reads well as a Slack or Teams post on its own.
- **`<link>`:** a ThreatFeed deep link (see below).
- **`<guid isPermaLink="false">`:** a stable ID per item:
  - `news:<article id>`
  - `kev:<CVE>`
  - `cve:<CVE>`
  - `exploit:<CVE>:<kind>`
  - `pt:<yyyy-mm>`
  - `victim:<victim id>`

  The ID never changes when the item text changes.
- **`<pubDate>`:** when ThreatFeed first published that item (see "First seen"), not the run time.
- **`<category>` elements:**
  - the kind (`news`, `kev`, `critical-cve`, `exploit`, `patch-tuesday`, `victim`)
  - every CVE ID
  - severity (`critical`/`high`)
  - CVSS bucket
  - for victims: group, country code and sector

**Channel:** title (`ThreatFeed — News`, `— Vulnerabilities`, `— Ransomware`), the site link,
description, `language` `en`, `lastBuildDate`, `ttl` 30, and an `atom:link rel="self"`.

### What goes in each feed

**News**
- Stories whose ThreatFeed severity is critical or high (the same score the app shows), from the
  default feeds the snapshot covers.
- One item per cluster: the app's existing clustering decides the clusters. The item is the
  cluster's lead article, and the description names how many other outlets covered it.
- Muting, categories and watchlists play no part (they are per user).

**Vulnerabilities**
- **KEV:** each CVE added to the CISA KEV catalog (`dateAdded` within the window).
- **Critical CVE:** each CVE with CVSS ≥ 9.0 from the existing `notable` list. A CVE that is
  already in the feed as KEV gets no second "critical" item, and the reverse is also true: the
  first kind seen wins.
- **Exploit:** the first time a public exploit (PoC repository or Metasploit module) is seen for a
  CVE that is in KEV or has CVSS ≥ 9.0. One item per CVE and exploit kind, not one per repository.
- **Patch Tuesday:** one item per month once that month's MSRC release is in the data, with the
  totals, zero-days/exploited, and critical counts.

**Ransomware**
- **Victim (owner decided): every leak-site victim** (`discoveredAt` within the window), about 35 a
  day (243 in the week measured on 3 Nov 2026). The feed uses the victim history the snapshot already
  keeps, which covers more than 7 days.
- **News (owner decided): all ransomware stories**, one item per story cluster, whatever their
  severity (about 87 a week measured on 3 Nov 2026, against 2 that were critical or high). A story
  counts as ransomware when the app's own tagging marks it so (the Ransomware tag/topic), not by a
  new keyword rule.
- The two are mixed, newest first. Victim names are published as the Ransomware page already shows
  them.

## Links into ThreatFeed (owner decided: items open ThreatFeed)

| Item | Link | Exists today? |
|---|---|---|
| News story | `#/latest?article=<id>` opens the story in the reader | **New** |
| KEV, critical CVE, exploit | `#/vulns?cve=CVE-…` opens the CVE panel | Yes |
| Patch Tuesday | the Patch Tuesday tab, on that month | The tab exists; selecting the month by link is **new** if not already supported |
| Victim | `#/ransomware?victim=<id>` opens the victim list scrolled to that victim, highlighted, with its group's panel open | **New** |

**New app behaviour:**
- **Story link:**
  - When the link's article exists in the visitor's data, the reader opens on it.
  - When it doesn't (older than the visitor's age limit, category turned off, data not loaded yet,
    or a very first visit before the snapshot loads), the app waits for the first sync.
  - If the story is still missing, a small notice says the story isn't available here and offers
    the original link. To have that link, the feed puts the original URL in the deep link, for
    example `&src=<encoded url>`, validated with `safeHttpUrl`.
- **Victim link:** same pattern. When the victim isn't in the data, a notice is shown and the
  victim list opens unfiltered.

## First seen (my call, settled after the builder check)

KEV entries carry only a date, and exploits carry no date at all. Items must keep the date they first
appeared and must never come back as new, also after they leave the 7-day window. So the feed builder
keeps a **published-items ledger**, `data/feeds/seen.json`, separate from the feeds:

- It maps every guid ever published (and every baseline exploit, see below) to its first-seen time,
  plus, for news, the member article ids and normalized URLs of the story's cluster. Entries are
  kept until **90 days** after they were last seen in the data, then pruned. That is far beyond any source's look-back, so an
  aged-out item can't return.
- Each run reads the published `seen.json` (like the other `PREVIOUS_*` files) and writes the
  updated one. The feeds themselves are rebuilt from the ledger plus this run's data.
- **Failures:** if `seen.json` can't be read (anything but a 404), feed generation is skipped for
  that run: the three feeds and the ledger are not written, and the workflow's existing "keep the
  published copy" step restores all four files. **The rest of the snapshot still deploys.** A 404
  means the very first run, which starts fresh. Any error inside feed generation is caught and
  handled the same way (log, skip, keep the published copies).
- **pubDate:** the item's first-seen time. When the source has a real timestamp (article
  `publishedAt`, victim `discoveredAt`, CVE `published`) that is earlier than first-seen by less
  than 24 hours, that timestamp is used instead. A late-arriving item (older source date) is dated
  when ThreatFeed first saw it, so it isn't buried below older items. Never in the future.
- **First run:** current exploits are recorded in the ledger as "baseline, not published", so only
  exploits seen later become items. KEV, critical CVEs, victims and news in the window are published
  normally on the first run.

### Stable identity (my call)

- **News:** a story keeps the guid of the **first article ever published for it**. Before creating
  an item for a cluster, the builder checks the ledger. If any member article id **or normalized
  URL** of the cluster is already recorded, the story is already published: its existing guid is
  kept and its item is updated (newer coverage count), never re-announced. Otherwise the guid is
  `news:<article id>` of the chosen article, and all members are recorded.
- The **chosen article** is deterministic: highest stored `severityScore`, then earliest
  `publishedAt`, then article id. There are no per-user boosts (stack, bookmarks) and no random
  tie-breaks.
- **Victims:** `victim:<id>`. The ledger also records `group + normalized victim name`, so a victim
  whose source id changes isn't announced twice.
- **CVEs:** keyed by CVE ID, which is stable by nature.

## Finding the feeds

- **Sources page:** a "Subscribe" section with the three feed URLs, a short line on what each
  contains, and a copy button for each.
- **`index.html`:** three `<link rel="alternate" type="application/rss+xml">` tags so browsers and
  readers auto-detect them.
- **README:** a short "RSS feeds" section.

## Constraints

- Static-hostable; generation runs only in the GitHub Action. No new runtime requests in the app.
- **No new npm dependencies** (my call): the XML is small and written with a tested escape helper.
- All text in the feeds is plain text, escaped for XML. HTML from sources is stripped (the existing
  `stripHtmlToText` / sanitizer path); control characters that are invalid in XML are removed.
- **Feed-size budget:** news and vulns stay under about 300 KB each, ransomware under about 500 KB;
  `seen.json` under about 2 MB (90 days of guids). Descriptions are capped so the budget holds.
- Each pure function has unit tests next to it (CLAUDE.md):
  - selection per feed
  - guid and pubDate carry-over
  - XML escaping
  - deep-link parsing
- The workflow's existing "keep the published copy" step is extended to the three feed files.
- Docs: README, CHANGELOG (Unreleased) and CLAUDE.md, the latter mentioning the feeds as outputs.

## Left to the builder

- The module layout, for example `src/services/feeds/*.ts` (pure, testable) called from
  `build-snapshot.ts`.
- How the Patch Tuesday tab selects a month from the link, if it doesn't already.
- How the victim row is highlighted and scrolled into view.
- The exact wording of descriptions, within the rules above.

## Calls I made (owner can override)

- Seven-day window; caps of 100 items (news, vulns) and 400 (ransomware); `ttl` 30.
- A published-items ledger `data/feeds/seen.json`, kept 90 days, so nothing is re-announced.
- A news story keeps the guid of its first published article, matched by member ids and URLs.
- pubDate is first-seen time (source time when it is less than 24 h earlier).
- A failed feed build skips only the feeds; the rest of the snapshot still deploys.
- File paths under `data/feeds/`.
- Critical CVE threshold CVSS ≥ 9.0; an exploit item only for KEV or CVSS ≥ 9.0 CVEs.
- KEV vs critical-CVE: one item per CVE, whichever appears first.
- No exploit backlog on the first run.
- The original URL is carried in the story deep link so a missing story can still be reached.
- No new dependencies.
