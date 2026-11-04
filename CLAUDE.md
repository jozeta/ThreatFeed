# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ThreatFeed ("Security Intelligence Daily") is a client-side-only security news reader: it
aggregates curated RSS/Atom feeds and presents them as a digital newspaper, with CVE/KEV/EPSS
enrichment, ransomware, actor and incident views, TV/dashboard modes and a printable broadsheet.
React 18 + TypeScript + Vite + Tailwind, IndexedDB (`idb`), DOMPurify, MiniSearch, PWA. Live at
https://jozeta.github.io/ThreatFeed/.

## Commands

```sh
npm install
npm run dev          # Vite dev server (without a local snapshot it fetches feeds live via the CORS gateway)
npm test             # vitest + jsdom
npm run lint         # ESLint: typescript-eslint, React hook rules, no-unsanitized (unsafe DOM sinks)
npm run build        # tsc && vite build → dist/
npm run preview
npm run snapshot     # tsx scripts/build-snapshot.ts → public/data/snapshot.json etc. (hits real feeds/APIs)
npm run world-map    # regenerate public/data/world-map.json
```

CI (`ci.yml`): `npm ci`, `npm run lint`, `npm test`, `npm run build` on Node 22. `deploy.yml` runs **every 30
minutes** and on push to `main`: test → snapshot → build → deploy to Pages.

## Architecture

- **No backend.** The only server-side work is the scheduled GitHub Action that builds static data
  files (`snapshot.json`, `vulns.json`, `ransomware.json`, `nvd-cache.json`, `msrc.json`,
  `actors.json`, `entities.json`, the RSS feeds `data/feeds/*.xml` and `data/feeds/seen.json`, the
  published-items ledger). Several read their previous published copy so NVD/MSRC are
  fetched incrementally.
- In the browser, feeds not covered by the snapshot are fetched by 6 workers through a fetch-mode
  chain (CORSFix → direct → RSS2JSON by default; custom proxy with `%s`). Shared per-proxy pacing:
  a 429 pauses that proxy for every worker (`Retry-After` or exponential backoff with jitter).
- `src/services/`: `rss/` (fetch, parse), `articles/`, `intelligence/`, `storage/` (IndexedDB),
  `sync/`, `tv/`, `snapshot.ts` / `snapshotLoader.ts`, notifications.
- `src/context/`: `FeedContext`, `FilterContext`, `SettingsContext`. `src/hooks/` holds the
  routing (`useHashRoute`), keyboard navigation, entity matching, vulns and leak-site hooks.
- `src/pages/`: My Feed, Briefing, Vulnerabilities, Ransomware, actors, incidents, Bookmarks,
  Sources, Feed Health, Settings. `src/components/` has the newspaper layouts, reader, charts and
  TV views.
- Default feeds: `public/data/feeds.json`; service worker: `public/sw.js`.

## Rules

- Follow the shared rulebook `~/Desktop/code/tools/standards/STANDARDS.md`; this repo's decisions and
  waivers are in `.claude-standards`.
- The built site has a Content-Security-Policy (meta tag, added at build time in `vite.config.ts`):
  no inline scripts, fonts are self-hosted under `public/vendor/<name>-<version>/`.

- **All feed HTML is untrusted.** Render article content only after DOMPurify; entity linking
  works on DOM text nodes (`entityDom.ts`), never on HTML strings.
- Keep it static-hostable: no server code, no secrets in the client. Snapshot API keys live only
  in GitHub Actions secrets.
- Be polite to public proxies and APIs (pacing, cooldowns, caching); don't increase request
  volume casually.
- Backups/OPML imports must be validated before saving. Keep the JSON backup format backward
  compatible.
- Add tests next to the code (`*.test.ts`) for logic changes.
