/**
 * Builds public/data/snapshot.json: every enabled default feed fetched server-side (no CORS, no
 * proxy), parsed with the app's own parser, plus CVE intelligence (CISA KEV, FIRST EPSS, NVD, GitHub
 * advisories) and incident data (Ransomware.live, Have I Been Pwned).
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
const { normalizeKev, normalizeNvdCve, summarizeNvd, normalizeAdvisory, encodeNvdCache, decodeNvdCache, applyNvdUpdates } = await import('../src/services/intelligence/vulns');
type Feed = import('../src/types').Feed;
type FeedHealth = import('../src/types').FeedHealth;
type Article = import('../src/types').Article;
type CveIntel = import('../src/types').CveIntel;
type IncidentData = import('../src/types').IncidentData;
type LeakSiteVictim = import('../src/types').LeakSiteVictim;
type KevEntry = import('../src/types').KevEntry;
type CveRecord = import('../src/types').CveRecord;
type OssAdvisory = import('../src/types').OssAdvisory;
type VulnData = import('../src/types').VulnData;
type DataSourceStatus = import('../src/types').DataSourceStatus;
type NvdCache = import('../src/services/intelligence/vulns').NvdCache;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/data/snapshot.json');
const VULNS_OUT = resolve(root, 'public/data/vulns.json'); // loaded by the app only when a vulnerability view needs it
const NVD_CACHE_OUT = resolve(root, 'public/data/nvd-cache.json'); // read back by the next run, never by the app
const DAY_MS = 24 * 60 * 60 * 1000;

// How every external source fared this run; published in the snapshot and shown in Feed Health
const sources: DataSourceStatus[] = [];
const report = (status: DataSourceStatus) => {
  sources.push(status);
  if (status.status !== 'ok') console.warn(`  ${status.label}: ${status.status}${status.detail ? ` (${status.detail})` : ''}`);
};
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);
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

async function loadKev(): Promise<KevEntry[]> {
  try {
    const { status, text } = await fetchText('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'application/json');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const entries = (JSON.parse(text).vulnerabilities || []).map(normalizeKev).filter((k: KevEntry | null): k is KevEntry => k !== null);
    report({ id: 'kev', label: 'CISA KEV catalog', status: 'ok', count: entries.length });
    return entries;
  } catch (err) {
    report({ id: 'kev', label: 'CISA KEV catalog', status: 'failed', detail: errorText(err) });
    return [];
  }
}

async function loadEpss(cves: string[]): Promise<Map<string, { epss: number; percentile: number }>> {
  const scores = new Map<string, { epss: number; percentile: number }>();
  let failed = 0;
  for (let i = 0; i < cves.length; i += 100) {
    const batch = cves.slice(i, i + 100);
    try {
      const { status, text } = await fetchText(`https://api.first.org/data/v1/epss?cve=${batch.join(',')}`, 'application/json');
      if (status !== 200) throw new Error(`HTTP ${status}`);
      for (const row of JSON.parse(text).data || []) {
        scores.set(String(row.cve).toUpperCase(), { epss: Number(row.epss), percentile: Number(row.percentile) });
      }
    } catch (err) {
      failed++;
      console.warn('EPSS batch failed:', err);
    }
  }
  const batches = Math.ceil(cves.length / 100);
  report({ id: 'epss', label: 'FIRST EPSS scores', status: failed === 0 ? 'ok' : 'failed', count: scores.size, detail: failed ? `${failed} of ${batches} batches failed` : undefined });
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

/**
 * Vulnerability data for the Vulnerabilities page: the whole CISA KEV catalog, every CVE NVD published
 * in the last NVD_DAYS days (aggregated; only critical ones kept individually), reviewed GitHub
 * advisories, and the CVEs with the highest EPSS scores. Every source is optional.
 */
const NVD_DAYS = 14;
const ADVISORY_DAYS = 14;
const NVD_MAX_CACHE_AGE_MS = 2 * DAY_MS; // older than this, refetch the whole window

// NVD allows 5 requests per 30 seconds without an API key (50 with one); every NVD call goes through here
const NVD_SPACING_MS = process.env.NVD_API_KEY ? 700 : 6500;
let lastNvdRequest = 0;
async function nvdPages(query: string, maxResults: number): Promise<CveRecord[]> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
  const records: CveRecord[] = [];
  for (let start = 0, total = Infinity; start < total; start += 2000) {
    const wait = lastNvdRequest + NVD_SPACING_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNvdRequest = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?${query}&resultsPerPage=2000&startIndex=${start}`, { headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    total = Math.min(Number(page.totalResults) || 0, maxResults);
    for (const v of page.vulnerabilities || []) {
      const record = normalizeNvdCve(v?.cve);
      if (record) records.push(record);
    }
  }
  return records;
}

/**
 * Every CVE published in the window plus CVSS scores for the KEV catalog. With the previous run's cache
 * (PREVIOUS_NVD_CACHE_URL) only CVEs modified since then are fetched, usually one small request;
 * otherwise the whole window (about 8,000 CVEs) and the whole KEV catalog are downloaded.
 */
async function loadNvdData(kevIds: Set<string>): Promise<{ cache: NvdCache; from: Date; to: Date } | null> {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (NVD_DAYS - 1)));
  const fmt = (d: Date) => d.toISOString().replace('Z', '');
  const scoreOf = (r: CveRecord) => r.score ?? 0; // 0 = looked up, not scored yet (so it isn't looked up every run)

  let previous: NvdCache | null = null;
  if (process.env.PREVIOUS_NVD_CACHE_URL) {
    try {
      const { status, text } = await fetchText(process.env.PREVIOUS_NVD_CACHE_URL, 'application/json');
      if (status === 200) previous = decodeNvdCache(JSON.parse(text));
    } catch {
      // No cache (first run, or the site is down): fall back to a full fetch
    }
  }
  const age = previous ? to.getTime() - Date.parse(previous.fetchedAt) : Infinity;

  try {
    if (previous && age > 0 && age < NVD_MAX_CACHE_AGE_MS) {
      // Overlap by 15 minutes so CVEs modified while the last run was fetching aren't missed
      const since = new Date(Date.parse(previous.fetchedAt) - 15 * 60 * 1000);
      const updates = await nvdPages(`lastModStartDate=${fmt(since)}&lastModEndDate=${fmt(to)}`, 20000);
      const records = applyNvdUpdates(previous.records, updates, from);
      const kevScores = { ...previous.kevScores };
      for (const u of updates) if (kevIds.has(u.id)) kevScores[u.id] = scoreOf(u);
      const missing = [...kevIds].filter(id => kevScores[id] === undefined);
      if (missing.length > 20) {
        for (const r of await nvdPages('hasKev', 10000)) kevScores[r.id] = scoreOf(r);
      } else {
        for (const id of missing) for (const r of await nvdPages(`cveId=${encodeURIComponent(id)}`, 1)) kevScores[r.id] = scoreOf(r);
      }
      report({ id: 'nvd', label: 'NVD (new CVEs, KEV scores)', status: 'ok', count: records.length, detail: `incremental: ${updates.length} changed CVEs, ${missing.length} new KEV scores` });
      return { cache: { fetchedAt: to.toISOString(), records, kevScores }, from, to };
    }
    const records = await nvdPages(`pubStartDate=${fmt(from)}&pubEndDate=${fmt(to)}`, 20000);
    const kevScores: Record<string, number> = {};
    for (const r of await nvdPages('hasKev', 10000)) kevScores[r.id] = scoreOf(r);
    report({ id: 'nvd', label: 'NVD (new CVEs, KEV scores)', status: 'ok', count: records.length, detail: previous ? 'full refresh (cache too old)' : 'full download (no cache)' });
    return { cache: { fetchedAt: to.toISOString(), records, kevScores }, from, to };
  } catch (err) {
    if (previous) {
      report({ id: 'nvd', label: 'NVD (new CVEs, KEV scores)', status: 'cached', count: previous.records.length, detail: `${errorText(err)}; reusing data from ${previous.fetchedAt}` });
      return { cache: { ...previous, records: applyNvdUpdates(previous.records, [], from) }, from, to };
    }
    report({ id: 'nvd', label: 'NVD (new CVEs, KEV scores)', status: 'failed', detail: errorText(err) });
    return null;
  }
}

async function loadAdvisories(): Promise<OssAdvisory[]> {
  const since = new Date(Date.now() - ADVISORY_DAYS * DAY_MS).toISOString().slice(0, 10);
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const advisories: OssAdvisory[] = [];
  let url: string | null = `https://api.github.com/advisories?type=reviewed&per_page=100&sort=published&direction=desc&published=${encodeURIComponent(`>=${since}`)}`;
  try {
    for (let page = 0; url && page < 10; page++) {
      const res: Response = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const raw of await res.json()) {
        const advisory = normalizeAdvisory(raw);
        if (advisory) advisories.push(advisory);
      }
      url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    }
    report({ id: 'ghsa', label: 'GitHub Advisory Database', status: 'ok', count: advisories.length });
  } catch (err) {
    report({ id: 'ghsa', label: 'GitHub Advisory Database', status: 'failed', count: advisories.length, detail: errorText(err) });
  }
  return advisories;
}

async function loadEpssTop(): Promise<VulnData['epssTop']> {
  try {
    const { status, text } = await fetchText('https://api.first.org/data/v1/epss?epss-gt=0.9&limit=2000', 'application/json');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const top = (JSON.parse(text).data || [])
      .map((row: any) => ({ cve: String(row.cve).toUpperCase(), epss: Number(row.epss), percentile: Number(row.percentile) }))
      .sort((a: { epss: number }, b: { epss: number }) => b.epss - a.epss)
      .slice(0, 200);
    report({ id: 'epss-top', label: 'FIRST EPSS top list', status: 'ok', count: top.length });
    return top;
  } catch (err) {
    report({ id: 'epss-top', label: 'FIRST EPSS top list', status: 'failed', detail: errorText(err) });
    return [];
  }
}

const kevEntries = await loadKev();
const [nvd, advisories, epssTop] = await Promise.all([loadNvdData(new Set(kevEntries.map(k => k.cve))), loadAdvisories(), loadEpssTop()]);
const kevScores = nvd?.cache.kevScores ?? {};
const notable = (nvd?.cache.records ?? []).filter(r => (r.score ?? 0) >= 9).sort((a, b) => b.published.localeCompare(a.published));

// EPSS for every CVE the app shows: in articles, the KEV catalog and critical NVD records
const cves = Array.from(new Set([
  ...articles.flatMap(a => a.cves || []),
  ...kevEntries.map(k => k.cve),
  ...notable.map(r => r.id),
]));
const epss = await loadEpss(cves);
const kev = new Map(kevEntries.map(k => [k.cve, k]));
const cveIntel: Record<string, CveIntel> = {};
for (const cve of new Set(articles.flatMap(a => a.cves || []))) {
  const k = kev.get(cve);
  const entry: CveIntel = {
    ...(k ? { kev: true, kevDateAdded: k.dateAdded, kevRansomware: k.ransomware, kevName: k.name } : { kev: false }),
    ...(epss.get(cve) || {}),
  };
  if (entry.kev || entry.epss !== undefined) cveIntel[cve] = entry;
}
const vulns: VulnData = {
  updatedAt: new Date().toISOString(),
  // Descriptions stay out of the file (they were half its size); the CVE panel fetches one from NVD on demand
  kev: kevEntries
    .map(({ description: _description, ...k }) => ({ ...k, ...epss.get(k.cve), cvss: kevScores[k.cve] > 0 ? kevScores[k.cve] : undefined }))
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
  nvd: nvd ? summarizeNvd(nvd.cache.records, nvd.from, nvd.to) : null,
  notable: notable.map(r => ({ ...r, epss: epss.get(r.id)?.epss })),
  advisories,
  epssTop,
};

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
  const tryJson = async (id: string, label: string, url: string) => {
    try {
      const data = await getJson(url);
      report({ id, label, status: 'ok', count: Array.isArray(data) ? data.length : undefined });
      return data;
    } catch (err) {
      report({ id, label, status: 'failed', detail: errorText(err) });
      return null;
    }
  };
  const victimsFrom = (list: unknown): LeakSiteVictim[] =>
    Array.isArray(list) ? list.map(normalizeVictim).filter((v): v is LeakSiteVictim => v !== null) : [];

  const previousUrl = process.env.PREVIOUS_SNAPSHOT_URL;
  const previous = previousUrl ? await tryJson('previous', 'Previous snapshot (history carry-over)', previousUrl) : null;
  const recent = await tryJson('rl-recent', 'Ransomware.live recent victims', 'https://api.ransomware.live/v2/recentvictims');
  const now = new Date();
  const month = await tryJson('rl-month', 'Ransomware.live victims this month', `https://api.ransomware.live/v2/victims/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`);
  // Carried-over victims were normalized by an earlier run; still check their shape since they come over the network
  const carried: LeakSiteVictim[] = (Array.isArray(previous?.incidents?.victims) ? previous.incidents.victims : []).filter((v: any) =>
    v && typeof v.id === 'string' && typeof v.victim === 'string' && typeof v.group === 'string' && !isNaN(Date.parse(v.discoveredAt))
  );
  const victims = mergeVictims([carried, victimsFrom(month), victimsFrom(recent)]);

  const groupNames = new Set(victims.map(v => v.group.toLowerCase()));
  const groups: IncidentData['groups'] = { ...(previous?.incidents?.groups ?? {}) };
  const groupList = await tryJson('rl-groups', 'Ransomware.live group profiles', 'https://api.ransomware.live/v2/groups');
  for (const raw of Array.isArray(groupList) ? groupList : []) {
    const profile = normalizeGroup(raw);
    if (profile && groupNames.has(profile.name.toLowerCase())) groups[profile.name.toLowerCase()] = profile;
  }
  for (const key of Object.keys(groups)) if (!groupNames.has(key)) delete groups[key];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const hibp = await tryJson('hibp', 'Have I Been Pwned breaches', 'https://haveibeenpwned.com/api/v3/breaches');
  const breaches = Array.isArray(hibp)
    ? hibp.map(normalizeBreach).filter((b): b is NonNullable<typeof b> => b !== null && b.addedAt >= ninetyDaysAgo).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    : previous?.incidents?.breaches ?? [];

  return { updatedAt: new Date().toISOString(), victims, groups, breaches };
}

const incidents = await loadIncidents();

mkdirSync(dirname(OUT), { recursive: true });
const generatedAt = new Date().toISOString();
const json = JSON.stringify({ version: 1, generatedAt, feedHealth, sources, cveIntel, incidents, articles });
writeFileSync(OUT, json);
const vulnsJson = JSON.stringify({ version: 1, generatedAt, ...vulns });
writeFileSync(VULNS_OUT, vulnsJson);
if (nvd) writeFileSync(NVD_CACHE_OUT, JSON.stringify(encodeNvdCache(nvd.cache)));

const healthy = results.filter(r => r.health.status === 'healthy').length;
console.log(`Snapshot: ${healthy}/${feeds.length} feeds healthy, ${articles.length} articles, ${Object.keys(cveIntel).length} CVEs with intel (${Object.values(cveIntel).filter(i => i.kev).length} in KEV), ${(json.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`Vulnerabilities: ${vulns.kev.length} KEV entries (${vulns.kev.filter(k => k.cvss).length} with CVSS), ${vulns.nvd?.total ?? 'no'} NVD CVEs (${NVD_DAYS}d, ${notable.length} critical), ${advisories.length} GitHub advisories (${ADVISORY_DAYS}d), ${epssTop.length} top-EPSS CVEs, ${(vulnsJson.length / 1e6).toFixed(2)} MB`);
console.log(`Sources: ${sources.map(x => `${x.id}=${x.status}`).join(' ')}`);
console.log(`Incidents: ${incidents.victims.length} leak-site victims (30d), ${Object.keys(incidents.groups).length} group profiles, ${incidents.breaches.length} HIBP breaches (90d)`);
for (const r of results.filter(r => r.health.status !== 'healthy')) console.log(`  ✗ ${r.health.feedId}: ${r.health.status} ${r.health.errorMessage ?? ''}`);
