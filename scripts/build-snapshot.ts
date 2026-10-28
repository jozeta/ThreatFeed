/**
 * Builds public/data/snapshot.json: every enabled default feed fetched server-side (no CORS, no
 * proxy), parsed with the app's own parser, plus CVE intelligence (CISA KEV + FIRST EPSS).
 *
 * Runs in the deploy workflow on a schedule, so the published site always carries a recent
 * snapshot and the browser only needs live fetching for feeds the user added themselves.
 *
 *   npm run snapshot
 */
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The parser and DOMPurify need a DOM; it must exist before they are imported
const dom = new JSDOM('');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser });

const { parseFeedXml } = await import('../src/services/rss/parser');
const { filterAndLimitArticles } = await import('../src/services/rss/fetcher');
const { normalizeVictim, normalizeGroup, normalizeBreach, mergeVictims } = await import('../src/services/intelligence/incidents');
type Feed = import('../src/types').Feed;
type FeedHealth = import('../src/types').FeedHealth;
type Article = import('../src/types').Article;
type CveIntel = import('../src/types').CveIntel;
type IncidentData = import('../src/types').IncidentData;
type LeakSiteVictim = import('../src/types').LeakSiteVictim;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/data/snapshot.json');
const USER_AGENT = 'ThreatFeed snapshot bot (+https://github.com/jozeta/ThreatFeed)';
const MAX_ARTICLES_PER_FEED = 25;
const MAX_AGE_DAYS = 30;
const MAX_CONTENT_CHARS = 10000; // keeps the snapshot small; the reader links to the original for the rest
const CONCURRENCY = 8;
const TIMEOUT_MS = 20000;

async function fetchText(url: string, accept: string): Promise<{ status: number; text: string; ms: number }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: accept } });
    return { status: res.status, text: await res.text(), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

async function snapshotFeed(feed: Feed): Promise<{ articles: Article[]; health: FeedHealth }> {
  const now = new Date().toISOString();
  const base = { feedId: feed.id, lastFetchedAt: now, gatewayUsed: 'snapshot', attemptedGateways: ['Server-side snapshot'] };
  try {
    const { status, text, ms } = await fetchText(feed.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*');
    if (status < 200 || status >= 300) {
      return { articles: [], health: { ...base, status: 'http_error', httpStatus: status, latencyMs: ms, articleCount: 0, errorMessage: `HTTP ${status}` } };
    }
    const articles = filterAndLimitArticles(parseFeedXml(text, feed, MAX_ARTICLES_PER_FEED), MAX_ARTICLES_PER_FEED, MAX_AGE_DAYS)
      .map(a => ({ ...a, content: a.content && a.content.length > MAX_CONTENT_CHARS ? a.content.slice(0, MAX_CONTENT_CHARS) + '<p><em>[Truncated, open the original article for the rest]</em></p>' : a.content }));
    return { articles, health: { ...base, status: 'healthy', lastSuccessAt: now, httpStatus: status, latencyMs: ms, articleCount: articles.length } };
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    const message = String(err?.message || err);
    return {
      articles: [],
      health: {
        ...base,
        status: timedOut ? 'timeout' : message.includes('XML') ? 'invalid_xml' : 'network_error',
        articleCount: 0,
        errorMessage: timedOut ? `Timed out after ${TIMEOUT_MS}ms` : `${message}${err?.cause?.code ? ` (${err.cause.code})` : ''}`.slice(0, 200),
      },
    };
  }
}

async function loadKev(): Promise<Map<string, CveIntel>> {
  const kev = new Map<string, CveIntel>();
  try {
    const { status, text } = await fetchText('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'application/json');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    for (const v of JSON.parse(text).vulnerabilities || []) {
      kev.set(String(v.cveID).toUpperCase(), {
        kev: true,
        kevDateAdded: v.dateAdded,
        kevRansomware: v.knownRansomwareCampaignUse === 'Known',
        kevName: v.vulnerabilityName,
      });
    }
  } catch (err) {
    console.warn('KEV catalog unavailable:', err);
  }
  return kev;
}

async function loadEpss(cves: string[]): Promise<Map<string, { epss: number; percentile: number }>> {
  const scores = new Map<string, { epss: number; percentile: number }>();
  for (let i = 0; i < cves.length; i += 100) {
    const batch = cves.slice(i, i + 100);
    try {
      const { status, text } = await fetchText(`https://api.first.org/data/v1/epss?cve=${batch.join(',')}`, 'application/json');
      if (status !== 200) throw new Error(`HTTP ${status}`);
      for (const row of JSON.parse(text).data || []) {
        scores.set(String(row.cve).toUpperCase(), { epss: Number(row.epss), percentile: Number(row.percentile) });
      }
    } catch (err) {
      console.warn('EPSS batch failed:', err);
    }
  }
  return scores;
}

const feeds: Feed[] = JSON.parse(readFileSync(resolve(root, 'public/data/feeds.json'), 'utf8')).feeds.filter((f: Feed) => f.enabled);
const t0 = Date.now();
const results: { articles: Article[]; health: FeedHealth }[] = [];
const queue = [...feeds];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let feed = queue.shift(); feed; feed = queue.shift()) {
    const started = Date.now();
    const result = await snapshotFeed(feed);
    results.push(result);
    console.log(`  ${result.health.status === 'healthy' ? '✓' : '✗'} ${feed.id} (${result.articles.length} articles, ${Date.now() - started}ms)`);
  }
}));

const articles = results.flatMap(r => r.articles);
const feedHealth = Object.fromEntries(results.map(r => [r.health.feedId, r.health]));

const cves = Array.from(new Set(articles.flatMap(a => a.cves || [])));
const [kev, epss] = await Promise.all([loadKev(), loadEpss(cves)]);
const cveIntel: Record<string, CveIntel> = {};
for (const cve of cves) {
  const entry: CveIntel = { ...(kev.get(cve) || { kev: false }), ...(epss.get(cve) || {}) };
  if (entry.kev || entry.epss !== undefined) cveIntel[cve] = entry;
}

/**
 * Ransomware leak-site victims (Ransomware.live) and verified breaches (Have I Been Pwned).
 * The victims endpoint only returns the latest ~100, so history accumulates by carrying over the
 * victims from the previously published snapshot (PREVIOUS_SNAPSHOT_URL, set in the workflow).
 * Every source is optional: a failure or rate limit just means less data, never a failed build.
 */
async function loadIncidents(): Promise<IncidentData> {
  const getJson = async (url: string) => {
    const { status, text } = await fetchText(url, 'application/json');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const data = JSON.parse(text);
    if (data && !Array.isArray(data) && typeof data.message === 'string') throw new Error(data.message); // rate limited
    return data;
  };
  const tryJson = async (label: string, url: string) => {
    try {
      return await getJson(url);
    } catch (err) {
      console.warn(`  ${label} unavailable: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  };
  const victimsFrom = (list: unknown): LeakSiteVictim[] =>
    Array.isArray(list) ? list.map(normalizeVictim).filter((v): v is LeakSiteVictim => v !== null) : [];

  const previousUrl = process.env.PREVIOUS_SNAPSHOT_URL;
  const previous = previousUrl ? await tryJson('previous snapshot', previousUrl) : null;
  const recent = await tryJson('Ransomware.live recent victims', 'https://api.ransomware.live/v2/recentvictims');
  const now = new Date();
  const month = await tryJson('Ransomware.live month victims', `https://api.ransomware.live/v2/victims/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`);
  // Carried-over victims were normalized by an earlier run; still check their shape since they come over the network
  const carried: LeakSiteVictim[] = (Array.isArray(previous?.incidents?.victims) ? previous.incidents.victims : []).filter((v: any) =>
    v && typeof v.id === 'string' && typeof v.victim === 'string' && typeof v.group === 'string' && !isNaN(Date.parse(v.discoveredAt))
  );
  const victims = mergeVictims([carried, victimsFrom(month), victimsFrom(recent)]);

  const groupNames = new Set(victims.map(v => v.group.toLowerCase()));
  const groups: IncidentData['groups'] = { ...(previous?.incidents?.groups ?? {}) };
  const groupList = await tryJson('Ransomware.live groups', 'https://api.ransomware.live/v2/groups');
  for (const raw of Array.isArray(groupList) ? groupList : []) {
    const profile = normalizeGroup(raw);
    if (profile && groupNames.has(profile.name.toLowerCase())) groups[profile.name.toLowerCase()] = profile;
  }
  for (const key of Object.keys(groups)) if (!groupNames.has(key)) delete groups[key];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const hibp = await tryJson('Have I Been Pwned breaches', 'https://haveibeenpwned.com/api/v3/breaches');
  const breaches = Array.isArray(hibp)
    ? hibp.map(normalizeBreach).filter((b): b is NonNullable<typeof b> => b !== null && b.addedAt >= ninetyDaysAgo).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    : previous?.incidents?.breaches ?? [];

  return { updatedAt: new Date().toISOString(), victims, groups, breaches };
}

const incidents = await loadIncidents();

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), feedHealth, cveIntel, incidents, articles });
writeFileSync(OUT, json);

const healthy = results.filter(r => r.health.status === 'healthy').length;
console.log(`Snapshot: ${healthy}/${feeds.length} feeds healthy, ${articles.length} articles, ${Object.keys(cveIntel).length} CVEs with intel (${[...kev.keys()].filter(k => cveIntel[k]).length} in KEV), ${(json.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`Incidents: ${incidents.victims.length} leak-site victims (30d), ${Object.keys(incidents.groups).length} group profiles, ${incidents.breaches.length} HIBP breaches (90d)`);
for (const r of results.filter(r => r.health.status !== 'healthy')) console.log(`  ✗ ${r.health.feedId}: ${r.health.status} ${r.health.errorMessage ?? ''}`);
