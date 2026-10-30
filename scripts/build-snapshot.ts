/**
 * Builds public/data/snapshot.json: every enabled default feed fetched server-side (no CORS, no
 * proxy), parsed with the app's own parser, plus CVE intelligence (CISA KEV, FIRST EPSS, NVD, GitHub
 * advisories, Microsoft Patch Tuesday), incident data (Ransomware.live, Have I Been Pwned), threat actor and
 * malware profiles (MITRE ATT&CK, Malpedia) and a two-year history of what the news mentions (trends).
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
const { normalizeKev, normalizeNvdCve, summarizeNvd, normalizeAdvisory, encodeNvdCache, decodeNvdCache, encodeWatchable, applyNvdUpdates, statsVector } = await import('../src/services/intelligence/vulns');
const {
  parseMetasploit, parseNuclei, parsePocIndex, exploitInfo, normalizeGroupDetail, cvesInTtps, normalizePublicAttack,
  cvesFromArticles, attackProfiles, aggregatePayments, paymentFamilyFor, malpediaProfiles, stopRansomwareAdvisories,
} = await import('../src/services/intelligence/enrichment');
const { refreshPatchMonths, decodeMsrc } = await import('../src/services/intelligence/patchTuesday');
const { refreshActors, decodeActors, encodeActors } = await import('../src/services/intelligence/actors');
const { buildEntities } = await import('../src/services/intelligence/entities');
const { countStatsByDay, mergeStats, decodeStats } = await import('../src/services/intelligence/stats');
const { countEntitiesByDay, mergeTrends, pickPreviousTrends, trendsVocab, decodeTrends, TREND_RECOUNT_DAYS } = await import('../src/services/intelligence/trends');
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
type RansomwareIntel = import('../src/types').RansomwareIntel;
type GroupIntel = import('../src/types').GroupIntel;
type PublicAttack = import('../src/types').PublicAttack;
type ExploitInfo = import('../src/types').ExploitInfo;
type MsrcData = import('../src/types').MsrcData;
type ActorsData = import('../src/types').ActorsData;
type TrendsData = import('../src/types').TrendsData;
type StatsData = import('../src/types').StatsData;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/data/snapshot.json');
const VULNS_OUT = resolve(root, 'public/data/vulns.json'); // loaded by the app only when a vulnerability view needs it
const NVD_CACHE_OUT = resolve(root, 'public/data/nvd-cache.json'); // read back by the next run, never by the app
const RANSOMWARE_OUT = resolve(root, 'public/data/ransomware.json'); // group intel, public reports, payments: Ransomware page only
const MSRC_OUT = resolve(root, 'public/data/msrc.json'); // Patch Tuesday releases: the Vulnerabilities page's Patch Tuesday tab only
const ACTORS_OUT = resolve(root, 'public/data/actors.json'); // threat actor and malware profiles: the actor and malware panels and trending chips
const ENTITIES_OUT = resolve(root, 'public/data/entities.json'); // the names text links to their panels, loaded after first paint
const STATS_OUT = resolve(root, 'public/data/stats.json'); // daily counts of CVEs, KEV additions, exploits and victims, 400 days: the dashboards
const TRENDS_OUT = resolve(root, 'public/data/trends.json'); // mention counts per entity (daily, then weekly), two years: the detail panels' mention history
const CWE_NAMES: Record<string, string> = JSON.parse(readFileSync(resolve(root, 'scripts/data/cwe-names.json'), 'utf8')).names;
// The published site's copies of this run's outputs, read back to carry history over (set in the workflow)
const PREVIOUS_BASE = process.env.PREVIOUS_SNAPSHOT_URL?.replace(/snapshot\.json$/, '');
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
  const nvdLabel = 'NVD (new CVEs, KEV details)';
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (NVD_DAYS - 1)));
  const fmt = (d: Date) => d.toISOString().replace('Z', '');

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
      // KEV CVEs: changed ones come with the updates; ones newly added to the catalog are looked up
      const kev = { ...previous.kev };
      for (const u of updates) if (kevIds.has(u.id)) kev[u.id] = u;
      const missing = [...kevIds].filter(id => !kev[id]);
      if (missing.length > 20) {
        for (const r of await nvdPages('hasKev', 10000)) kev[r.id] = r;
      } else {
        for (const id of missing) for (const r of await nvdPages(`cveId=${encodeURIComponent(id)}`, 1)) kev[r.id] = r;
      }
      report({ id: 'nvd', label: nvdLabel, status: 'ok', count: records.length, detail: `incremental: ${updates.length} changed CVEs, ${missing.length} new KEV entries looked up` });
      return { cache: { fetchedAt: to.toISOString(), records, kev }, from, to };
    }
    const records = await nvdPages(`pubStartDate=${fmt(from)}&pubEndDate=${fmt(to)}`, 20000);
    const kev: Record<string, CveRecord> = {};
    for (const r of await nvdPages('hasKev', 10000)) kev[r.id] = r;
    report({ id: 'nvd', label: nvdLabel, status: 'ok', count: records.length, detail: previous ? 'full refresh (cache too old)' : 'full download (no usable cache)' });
    return { cache: { fetchedAt: to.toISOString(), records, kev }, from, to };
  } catch (err) {
    if (previous) {
      report({ id: 'nvd', label: nvdLabel, status: 'cached', count: previous.records.length, detail: `${errorText(err)}; reusing data from ${previous.fetchedAt}` });
      return { cache: { ...previous, records: applyNvdUpdates(previous.records, [], from) }, from, to };
    }
    report({ id: 'nvd', label: nvdLabel, status: 'failed', detail: errorText(err) });
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


// ---------- Generic helpers for optional JSON sources ----------

async function getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('got HTML instead of JSON');
    const data = JSON.parse(text);
    if (data && !Array.isArray(data) && typeof data.message === 'string' && Object.keys(data).length === 1) throw new Error(data.message); // rate limited
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches and reports; null on failure (every enrichment source is optional) */
async function tryJson(id: string, label: string, url: string, timeoutMs?: number): Promise<any> {
  try {
    const data = await getJson(url, timeoutMs);
    report({ id, label, status: 'ok', count: Array.isArray(data) ? data.length : undefined });
    return data;
  } catch (err) {
    report({ id, label, status: 'failed', detail: errorText(err) });
    return null;
  }
}

const hoursSince = (iso: string | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : Infinity);

// ---------- Exploit datasets (fetched every run; a few MB each from GitHub) ----------

async function loadExploitSources() {
  const text = async (id: string, label: string, url: string) => {
    try {
      const { status, text } = await fetchText(url, '*/*');
      if (status !== 200) throw new Error(`HTTP ${status}`);
      return text;
    } catch (err) {
      report({ id, label, status: 'failed', detail: errorText(err) });
      return null;
    }
  };
  const [msfText, nucleiText, pocText] = await Promise.all([
    text('msf', 'Metasploit modules', 'https://raw.githubusercontent.com/rapid7/metasploit-framework/master/db/modules_metadata_base.json'),
    text('nuclei', 'Nuclei templates', 'https://raw.githubusercontent.com/projectdiscovery/nuclei-templates/main/cves.json'),
    text('poc', 'PoC-in-GitHub', 'https://raw.githubusercontent.com/nomi-sec/PoC-in-GitHub/master/README.md'),
  ]);
  const parse = <T>(id: string, label: string, raw: string | null, fn: (raw: string) => Map<string, T>) => {
    if (raw === null) return new Map<string, T>();
    try {
      const map = fn(raw);
      report({ id, label, status: 'ok', count: map.size, detail: 'CVEs covered' });
      return map;
    } catch (err) {
      report({ id, label, status: 'failed', detail: errorText(err) });
      return new Map<string, T>();
    }
  };
  return {
    msf: parse('msf', 'Metasploit modules', msfText, t => parseMetasploit(JSON.parse(t))),
    nuclei: parse('nuclei', 'Nuclei templates', nucleiText, parseNuclei),
    pocs: parse('poc', 'PoC-in-GitHub', pocText, parsePocIndex),
  };
}

// ---------- Ransomware.live (1 request per minute) ----------

const RL_SPACING_MS = 61_000;
const RL_MAX_CALLS = Number(process.env.RL_MAX_CALLS) || 4; // at most ~3 minutes of waiting, overlapping the feed downloads
let rlCalls = 0;
let lastRlCall = 0;
async function rlJson(id: string, label: string, path: string) {
  const wait = lastRlCall + RL_SPACING_MS - Date.now();
  if (lastRlCall && wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRlCall = Date.now();
  rlCalls++;
  return tryJson(id, label, `https://api.ransomware.live/v2/${path}`);
}

/**
 * The two "recent" lists every run, then the group list (daily; it carries every group's full profile:
 * techniques, tools, aliases, leak-site status) and this month's victims (6-hourly backfill).
 */
async function loadRansomwareLive(previousIntel: RansomwareIntel | null) {
  const updates = { ...(previousIntel?.sourceUpdates ?? {}) };
  const recent = await rlJson('rl-recent', 'Ransomware.live recent victims', 'recentvictims');
  const attacks = await rlJson('rl-attacks', 'Ransomware.live publicly reported attacks', 'recentcyberattacks');
  if (attacks) updates.rlAttacks = new Date().toISOString();

  let groupList: any = null;
  if (hoursSince(updates.rlGroupProfiles) > 24) {
    groupList = await rlJson('rl-groups', 'Ransomware.live groups and profiles', 'groups');
    if (groupList) updates.rlGroupProfiles = new Date().toISOString();
  } else {
    report({ id: 'rl-groups', label: 'Ransomware.live groups and profiles', status: 'cached', detail: `refreshed daily, last ${updates.rlGroupProfiles?.slice(0, 16)}` });
  }
  let month: any = null;
  if (rlCalls < RL_MAX_CALLS && hoursSince(updates.rlMonth) > 6) {
    const now = new Date();
    month = await rlJson('rl-month', 'Ransomware.live victims this month', `victims/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`);
    if (month) updates.rlMonth = new Date().toISOString();
  }
  return { recent, attacks, groupList, month, updates };
}

// ---------- Slow-changing sources: refreshed once a day, carried over in between ----------

/** `force` refetches ATT&CK and Malpedia regardless, when there is no actors.json to carry over yet */
async function loadDailySources(previousIntel: RansomwareIntel | null, updates: Record<string, string>, force = false) {
  let attackBundle: any = null;
  if (force || hoursSince(updates.attack) > 24) {
    attackBundle = await tryJson('attack', 'MITRE ATT&CK (enterprise)', 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', 120000);
    if (attackBundle) updates.attack = new Date().toISOString();
  } else {
    report({ id: 'attack', label: 'MITRE ATT&CK (enterprise)', status: 'cached', detail: `refreshed daily, last ${updates.attack?.slice(0, 16)}` });
  }
  let payments = previousIntel?.payments ?? null;
  if (hoursSince(updates.payments) > 24) {
    const raw = await tryJson('payments', 'Ransomwhere payments', 'https://api.ransomwhe.re/export', 120000);
    if (raw) {
      payments = { updatedAt: new Date().toISOString(), families: aggregatePayments(raw) };
      updates.payments = payments.updatedAt;
    }
  } else {
    report({ id: 'payments', label: 'Ransomwhere payments', status: 'cached', detail: `refreshed daily, last ${updates.payments?.slice(0, 16)}` });
  }
  let malpedia: any = null;
  if (force || hoursSince(updates.malpedia) > 24) {
    malpedia = await tryJson('malpedia', 'Malpedia families', 'https://malpedia.caad.fkie.fraunhofer.de/api/get/families', 120000);
    if (malpedia) updates.malpedia = new Date().toISOString();
  } else {
    report({ id: 'malpedia', label: 'Malpedia families', status: 'cached', detail: `refreshed daily, last ${updates.malpedia?.slice(0, 16)}` });
  }
  return { attackBundle, payments, malpedia };
}

// ---------- Microsoft Patch Tuesday (MSRC CVRF; each month's document is ~30 MB) ----------

/**
 * The latest three monthly releases. Older months, and the newest one between its refreshes (see
 * refreshPatchMonths), are carried over from the published msrc.json (PREVIOUS_MSRC_URL), so most runs make
 * one small request.
 */
async function loadMsrc(): Promise<MsrcData> {
  const label = 'Microsoft Patch Tuesday (MSRC)';
  let previous: MsrcData | null = null;
  if (process.env.PREVIOUS_MSRC_URL) {
    try {
      previous = decodeMsrc(await getJson(process.env.PREVIOUS_MSRC_URL, 60000));
    } catch {
      // No previous file (first run, or the site is down): every month is fetched
    }
  }
  const r = await refreshPatchMonths(previous, url => getJson(url, 120000));
  const count = r.data.months.reduce((n, m) => n + m.cves.length, 0);
  if (r.listError) {
    report({ id: 'msrc', label, status: previous?.months.length ? 'cached' : 'failed', count, detail: `update list: ${r.listError.slice(0, 150)}` });
  } else {
    const detail = [
      r.fetched.length && `fetched ${r.fetched.join(', ')}`,
      r.carried.length && `carried over ${r.carried.join(', ')}`,
      ...r.failed.map(f => `${f.id} failed: ${f.error.slice(0, 80)}`),
    ].filter(Boolean).join('; ');
    report({ id: 'msrc', label, status: r.failed.length ? (r.data.months.length ? 'cached' : 'failed') : r.fetched.length ? 'ok' : 'cached', count, detail });
  }
  return r.data;
}

// ---------- Threat actors and malware (ATT&CK and Malpedia, refreshed with the ransomware intel) ----------

/** The published actors.json (PREVIOUS_ACTORS_URL), carried over on the runs that don't refresh the bundles */
async function loadPreviousActors(): Promise<ActorsData | null> {
  if (!process.env.PREVIOUS_ACTORS_URL) return null;
  try {
    return decodeActors(await getJson(process.env.PREVIOUS_ACTORS_URL, 60000));
  } catch {
    return null; // first run, or the site is down: the bundles are fetched this run
  }
}

// ---------- Trends (daily mention counts, accumulated across runs) ----------

/**
 * The published trends.json (PREVIOUS_TRENDS_URL). A failed read is retried; a 404 means there is none yet.
 * `error` is set when it couldn't be read, so the run doesn't overwrite a history it couldn't see.
 */
async function loadPreviousTrends(): Promise<{ data: TrendsData | null; error?: string }> {
  if (!process.env.PREVIOUS_TRENDS_URL) return { data: null };
  let error = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = decodeTrends(await getJson(process.env.PREVIOUS_TRENDS_URL, 60000));
      if (data) return { data };
      error = 'malformed file';
    } catch (err) {
      error = errorText(err);
      if (error === 'HTTP 404') return { data: null }; // first run
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return { data: null, error };
}

/** The workflow's cached copy of the last run's trends.json (PREVIOUS_TRENDS_FILE), a second copy of the history */
function loadCachedTrends(): TrendsData | null {
  if (!process.env.PREVIOUS_TRENDS_FILE) return null;
  try {
    return decodeTrends(JSON.parse(readFileSync(process.env.PREVIOUS_TRENDS_FILE, 'utf8')));
  } catch {
    return null; // no cache yet, or a broken one
  }
}

/** The published stats.json (PREVIOUS_STATS_URL), read like the trends history */
async function loadPreviousStats(): Promise<{ data: StatsData | null; error?: string }> {
  if (!process.env.PREVIOUS_STATS_URL) return { data: null };
  let error = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = decodeStats(await getJson(process.env.PREVIOUS_STATS_URL, 60000));
      if (data) return { data };
      error = 'malformed file';
    } catch (err) {
      error = errorText(err);
      if (error === 'HTTP 404') return { data: null }; // first run
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return { data: null, error };
}

/** The workflow's cached copy of the last run's stats.json (PREVIOUS_STATS_FILE) */
function loadCachedStats(): StatsData | null {
  if (!process.env.PREVIOUS_STATS_FILE) return null;
  try {
    return decodeStats(JSON.parse(readFileSync(process.env.PREVIOUS_STATS_FILE, 'utf8')));
  } catch {
    return null; // no cache yet, or a broken one
  }
}

// ---------- Feeds ----------

async function fetchFeeds() {
  const feeds: Feed[] = JSON.parse(readFileSync(resolve(root, 'public/data/feeds.json'), 'utf8')).feeds.filter((f: Feed) => f.enabled);
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
  return { feeds, results };
}

// ---------- Main ----------

const t0 = Date.now();
const [previousSnapshot, previousIntelRaw] = await Promise.all([
  PREVIOUS_BASE ? tryJson('previous', 'Previous snapshot (history carry-over)', `${PREVIOUS_BASE}snapshot.json`) : null,
  PREVIOUS_BASE ? tryJson('previous-rw', 'Previous ransomware intel (carry-over)', `${PREVIOUS_BASE}ransomware.json`) : null,
]);
const previousIntel: RansomwareIntel | null = previousIntelRaw && typeof previousIntelRaw.groups === 'object' ? previousIntelRaw : null;

// Everything slow starts now and runs while the feeds download
const rlPromise = loadRansomwareLive(previousIntel);
const exploitsPromise = loadExploitSources();
const msrcPromise = loadMsrc();
const previousActorsPromise = loadPreviousActors();
const previousTrendsPromise = loadPreviousTrends();
const previousStatsPromise = loadPreviousStats();
const dailyPromise = Promise.all([rlPromise, previousActorsPromise])
  .then(([rl, previousActors]) => loadDailySources(previousIntel, rl.updates, !previousActors?.actors.length));
const kevEntries = await loadKev();
const vulnSourcesPromise = Promise.all([loadNvdData(new Set(kevEntries.map(k => k.cve))), loadAdvisories(), loadEpssTop()]);
const { feeds, results } = await fetchFeeds();
const articles = results.flatMap(r => r.articles);
const feedHealth = Object.fromEntries(results.map(r => [r.health.feedId, r.health]));

// ---------- Vulnerabilities ----------

const [nvd, advisories, epssTop] = await vulnSourcesPromise;
const nvdKev = nvd?.cache.kev ?? {};
const notable = (nvd?.cache.records ?? []).filter(r => (r.score ?? 0) >= 9).sort((a, b) => b.published.localeCompare(a.published));

const watchable = (nvd?.cache.records ?? []).filter(r => (r.score ?? 0) >= 7 && (r.score ?? 0) < 9).sort((a, b) => b.published.localeCompare(a.published));

// EPSS for every CVE the app shows: in articles, the KEV catalog and critical NVD records
const cves = Array.from(new Set([
  ...articles.flatMap(a => a.cves || []),
  ...kevEntries.map(k => k.cve),
  ...notable.map(r => r.id),
]));
const epss = await loadEpss(cves);
const kevById = new Map(kevEntries.map(k => [k.cve, k]));
const cveIntel: Record<string, CveIntel> = {};
for (const cve of new Set(articles.flatMap(a => a.cves || []))) {
  const k = kevById.get(cve);
  const entry: CveIntel = {
    ...(k ? { kev: true, kevDateAdded: k.dateAdded, kevRansomware: k.ransomware, kevName: k.name } : { kev: false }),
    ...(epss.get(cve) || {}),
  };
  if (entry.kev || entry.epss !== undefined) cveIntel[cve] = entry;
}

const { msf, nuclei, pocs } = await exploitsPromise;
const exploits: Record<string, ExploitInfo> = {};
// CVSS 7-8.9 (watchable) too, so the alert rules' "public exploit" condition can match them
for (const cve of new Set([...kevEntries.map(k => k.cve), ...notable.map(r => r.id), ...watchable.map(r => r.id), ...epssTop.map(e => e.cve)])) {
  const info = exploitInfo(cve, msf, nuclei, pocs);
  if (info) exploits[cve] = info;
}

const vulns: VulnData = {
  updatedAt: new Date().toISOString(),
  // Descriptions stay out of the file (they were half its size); the CVE panel fetches one from NVD on demand
  kev: kevEntries
    .map(({ description: _description, ...k }) => {
      const n = nvdKev[k.cve];
      // The app only reads attack vector, privileges and interaction from the vector; three products are plenty
      return { ...k, ...epss.get(k.cve), cvss: n?.score, published: n?.published, vector: statsVector(n?.vector) ?? undefined, ssvc: n?.ssvc, products: n?.products?.slice(0, 3) };
    })
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
  nvd: nvd ? summarizeNvd(nvd.cache.records, nvd.from, nvd.to) : null,
  notable: notable.map(r => ({ ...r, epss: epss.get(r.id)?.epss })),
  // The file holds compact tuples; loadVulnData decodes them back to CveRecord[]
  watchable: encodeWatchable(watchable) as VulnData['watchable'],
  advisories,
  epssTop,
  exploits,
};
const usedCwes = new Set([...vulns.kev.flatMap(k => k.cwes), ...notable.map(r => r.cwe), ...(vulns.nvd?.cwes ?? []).map(([c]) => c)]);
vulns.cweNames = Object.fromEntries([...usedCwes].filter((c): c is string => Boolean(c && CWE_NAMES[c])).map(c => [c, CWE_NAMES[c]]));

// ---------- Ransomware ----------

const rl = await rlPromise;
const VICTIM_DAYS = 90;
const victimsFrom = (list: unknown): LeakSiteVictim[] =>
  Array.isArray(list) ? list.map(normalizeVictim).filter((v): v is LeakSiteVictim => v !== null) : [];
// Carried-over victims were normalized by an earlier run; still check their shape since they come over the network
const carried: LeakSiteVictim[] = (Array.isArray(previousSnapshot?.incidents?.victims) ? previousSnapshot.incidents.victims : []).filter((v: any) =>
  v && typeof v.id === 'string' && typeof v.victim === 'string' && typeof v.group === 'string' && !isNaN(Date.parse(v.discoveredAt))
);
const victims = mergeVictims([carried, victimsFrom(rl.month), victimsFrom(rl.recent)], VICTIM_DAYS);
const groupKeys = new Set(victims.map(v => v.group.toLowerCase()));

const groups: IncidentData['groups'] = { ...(previousSnapshot?.incidents?.groups ?? {}) };
for (const raw of Array.isArray(rl.groupList) ? rl.groupList : []) {
  const profile = normalizeGroup(raw);
  if (profile && groupKeys.has(profile.name.toLowerCase())) groups[profile.name.toLowerCase()] = profile;
}
for (const key of Object.keys(groups)) if (!groupKeys.has(key)) delete groups[key];

const ninetyDaysAgo = new Date(Date.now() - 90 * DAY_MS).toISOString();
const hibp = await tryJson('hibp', 'Have I Been Pwned breaches', 'https://haveibeenpwned.com/api/v3/breaches');
const breaches = Array.isArray(hibp)
  ? hibp.map(normalizeBreach).filter((b): b is NonNullable<typeof b> => b !== null && b.addedAt >= ninetyDaysAgo).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  : previousSnapshot?.incidents?.breaches ?? [];
const incidents: IncidentData = { updatedAt: new Date().toISOString(), victims, groups, breaches };

// Publicly reported attacks accumulate like the victims (the endpoint only returns the latest 100)
const attackMap = new Map<string, PublicAttack>();
for (const a of [...(previousIntel?.attacks ?? []), ...(Array.isArray(rl.attacks) ? rl.attacks.map(normalizePublicAttack) : [])]) {
  if (a && typeof a.id === 'string' && a.added >= ninetyDaysAgo.slice(0, 10)) attackMap.set(a.id, a);
}

const { attackBundle, payments, malpedia } = await dailyPromise;
const groupNames = [...groupKeys];
const attackFor = attackBundle ? attackProfiles(attackBundle, groupNames) : null;
const malpediaFor = malpedia ? malpediaProfiles(malpedia, groupNames) : null;
const advisoriesFor = stopRansomwareAdvisories(articles, groupNames);
// Full profiles for every group come with the (daily) group list; in between, last run's are carried over
const profilesFor = new Map<string, Partial<GroupIntel>>();
for (const raw of Array.isArray(rl.groupList) ? rl.groupList : []) {
  const key = typeof raw?.name === 'string' ? raw.name.toLowerCase() : '';
  const detail = groupKeys.has(key) ? normalizeGroupDetail(raw) : null;
  if (detail) profilesFor.set(key, detail);
}
const ransomwareKev = new Set(kevEntries.filter(k => k.ransomware).map(k => k.cve));
const articleCves = cvesFromArticles(articles, groupNames, ransomwareKev);

const intelGroups: Record<string, GroupIntel> = {};
for (const key of groupNames) {
  const prev = previousIntel?.groups?.[key];
  const detail = profilesFor.get(key);
  const merged: GroupIntel = { ...prev, ...detail, name: prev?.name ?? victims.find(v => v.group.toLowerCase() === key)?.group ?? key };
  merged.attack = attackFor ? attackFor.get(key) : prev?.attack;
  if (malpediaFor) {
    const m = malpediaFor.get(key);
    merged.attribution = m?.attribution;
    merged.references = m?.references;
    merged.malpediaUrl = m?.malpediaUrl;
    // Aliases from both sources, without duplicates
    const aliases = [...new Set([...(detail?.altNames ?? prev?.altNames ?? []), ...(m?.altNames ?? [])])];
    merged.altNames = aliases.length ? aliases.slice(0, 10) : undefined;
  }
  // CISA advisories accumulate (the feed only holds the last month of them)
  const advisories = new Map((prev?.advisories ?? []).map(a => [a.url, a]));
  for (const a of advisoriesFor.get(key) ?? []) advisories.set(a.url, a);
  merged.advisories = advisories.size ? [...advisories.values()].sort((a, b) => b.date.localeCompare(a.date)) : undefined;
  const family = payments ? paymentFamilyFor(key, payments.families) : undefined;
  merged.payments = family ? { totalUsd: family.totalUsd, transactions: family.transactions, byYear: family.byYear } : undefined;
  // CVEs: the group's documented techniques, CISA advisories and news, accumulated across runs
  const linked = new Map((prev?.cves ?? []).map(c => [c.cve, { ...c }]));
  for (const cve of cvesInTtps(merged.ttps)) linked.set(cve, { cve, source: 'ransomware.live' });
  for (const c of articleCves.get(key) ?? []) {
    const existing = linked.get(c.cve);
    if (!existing || existing.source === 'news') linked.set(c.cve, { ...c, articles: Math.max(c.articles, existing?.articles ?? 0) });
  }
  merged.cves = linked.size ? [...linked.values()].sort((a, b) => a.cve.localeCompare(b.cve)) : undefined;
  intelGroups[key] = merged;
}
const ransomwareIntel: RansomwareIntel = {
  updatedAt: new Date().toISOString(),
  groups: intelGroups,
  attacks: [...attackMap.values()].sort((a, b) => b.added.localeCompare(a.added)),
  payments,
  sourceUpdates: rl.updates,
};

// Threat actor and malware profiles: rebuilt when ATT&CK (and Malpedia) came in this run, carried over otherwise
const previousActors = await previousActorsPromise;
const actorsRefresh = refreshActors(previousActors, attackBundle, malpedia, articles);
const actors = actorsRefresh.data;
report({
  id: 'actors',
  label: 'Threat actor and malware profiles',
  status: actorsRefresh.built.length ? 'ok' : actors.actors.length ? 'cached' : 'failed',
  count: actors.actors.length + actors.malware.length,
  detail: [actorsRefresh.built.length && `built ${actorsRefresh.built.join(', ')}`, actorsRefresh.carried.length && `carried over ${actorsRefresh.carried.join(', ')}`].filter(Boolean).join('; ') || 'no ATT&CK data',
});

// Trends: the last few days recounted from this run's articles, merged into the carried-over history.
// When the history exists but neither copy could be read, nothing is written (the workflow then restores it)
const publishedTrends = await previousTrendsPromise;
const trendsBase = pickPreviousTrends(loadCachedTrends(), publishedTrends);
const trendsNow = Date.now();
const trends = mergeTrends(
  trendsBase.base,
  countEntitiesByDay(articles, trendsVocab(victims.map(v => v.group), kevEntries.map(k => k.vendor)), TREND_RECOUNT_DAYS, trendsNow),
  trendsNow,
);
const trendDayKeys = Object.keys(trends.days);
const trendsSince = Object.keys(trends.weeks)[0] ?? trendDayKeys[0];
report({
  id: 'trends',
  label: 'Trends history',
  status: trendsBase.write ? 'ok' : 'failed',
  count: trendDayKeys.length + Object.keys(trends.weeks).length,
  detail: !trendsBase.write ? `previous history unreadable (${publishedTrends.error}), kept previous`
    : trendsBase.base ? `since ${trendsSince}, from the ${trendsBase.source === 'cache' ? 'Action cache' : 'published file'}${publishedTrends.error ? ` (published file: ${publishedTrends.error})` : ''}`
    : 'no previous history, started',
});

// Stats: daily counts from this run's CVEs (critical, and CVSS 7-8.9 as high), KEV, exploits and victims,
// merged into the carried-over history. Same rule as trends: nothing is written if the history couldn't be read
const publishedStats = await previousStatsPromise;
const statsBase = pickPreviousTrends(loadCachedStats(), publishedStats);
const statsNow = Date.now();
const statsDays = mergeStats(
  statsBase.base,
  countStatsByDay({ notable: [...notable, ...watchable], kev: kevEntries, exploits, victims }, statsNow),
  statsNow,
);
const statsDayKeys = Object.keys(statsDays);
report({
  id: 'stats',
  label: 'Daily-count history',
  status: statsBase.write ? 'ok' : 'failed',
  count: statsDayKeys.length,
  detail: !statsBase.write ? `previous history unreadable (${publishedStats.error}), kept previous`
    : statsBase.base ? `since ${statsDayKeys[0]}, from the ${statsBase.source === 'cache' ? 'Action cache' : 'published file'}${publishedStats.error ? ` (published file: ${publishedStats.error})` : ''}`
    : 'no previous history, started',
});

// Which groups exploit which CVE, for the Vulnerabilities page
const cveGroups: Record<string, string[]> = {};
for (const g of Object.values(intelGroups)) for (const c of g.cves ?? []) (cveGroups[c.cve] ??= []).push(g.name);
vulns.cveGroups = cveGroups;

// ---------- Output ----------

mkdirSync(dirname(OUT), { recursive: true });
const generatedAt = new Date().toISOString();
const json = JSON.stringify({ version: 1, generatedAt, feedHealth, sources, cveIntel, incidents, articles });
writeFileSync(OUT, json);
const vulnsJson = JSON.stringify({ version: 1, generatedAt, ...vulns });
writeFileSync(VULNS_OUT, vulnsJson);
const ransomwareJson = JSON.stringify({ version: 1, generatedAt, ...ransomwareIntel });
writeFileSync(RANSOMWARE_OUT, ransomwareJson);
const msrc = await msrcPromise;
const msrcJson = JSON.stringify({ version: 1, generatedAt, ...msrc });
writeFileSync(MSRC_OUT, msrcJson);
const actorsJson = JSON.stringify({ version: 1, ...encodeActors({ ...actors, generatedAt }) });
writeFileSync(ACTORS_OUT, actorsJson);
const entities = buildEntities({
  kevVendors: kevEntries.map(k => k.vendor),
  groups: Object.entries(intelGroups).map(([key, g]) => ({ key, name: g.name, aliases: g.altNames ?? [] })),
  victimGroups: victims.map(v => v.group),
  actors,
});
const entitiesJson = JSON.stringify({ version: 1, generatedAt, ...entities });
writeFileSync(ENTITIES_OUT, entitiesJson);
const trendsJson = trendsBase.write ? JSON.stringify({ version: 1, generatedAt, ...trends }) : '';
if (trendsBase.write) writeFileSync(TRENDS_OUT, trendsJson);
const statsJson = statsBase.write ? JSON.stringify({ version: 1, generatedAt, days: statsDays }) : '';
if (statsBase.write) writeFileSync(STATS_OUT, statsJson);
if (nvd) writeFileSync(NVD_CACHE_OUT, JSON.stringify(encodeNvdCache(nvd.cache)));

const healthy = results.filter(r => r.health.status === 'healthy').length;
const mb = (s: string) => `${(s.length / 1e6).toFixed(2)} MB`;
console.log(`Snapshot: ${healthy}/${feeds.length} feeds healthy, ${articles.length} articles, ${Object.keys(cveIntel).length} CVEs with intel (${Object.values(cveIntel).filter(i => i.kev).length} in KEV), ${mb(json)}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`Vulnerabilities: ${vulns.kev.length} KEV entries (${vulns.kev.filter(k => k.cvss).length} with CVSS, ${vulns.kev.filter(k => k.ssvc).length} with SSVC), ${vulns.nvd?.total ?? 'no'} NVD CVEs (${NVD_DAYS}d, ${notable.length} critical), ${watchable.length} CVSS 7–8.9 (${mb(JSON.stringify(vulns.watchable))}), ${advisories.length} GitHub advisories (${ADVISORY_DAYS}d), ${epssTop.length} top-EPSS CVEs, ${Object.keys(exploits).length} with public exploits, ${mb(vulnsJson)}`);
console.log(`Ransomware: ${victims.length} leak-site victims (${VICTIM_DAYS}d), ${Object.keys(groups).length} group profiles, ${Object.values(intelGroups).filter(g => g.ttps).length} with TTPs, ${Object.values(intelGroups).filter(g => g.leakSites).length} with leak-site status, ${Object.values(intelGroups).filter(g => g.attack).length} in ATT&CK, ${Object.values(intelGroups).filter(g => g.references).length} in Malpedia, ${Object.values(intelGroups).filter(g => g.cves).length} with CVEs, ${ransomwareIntel.attacks.length} public reports, ${payments?.families.length ?? 0} payment families, ${breaches.length} HIBP breaches, ${mb(ransomwareJson)}`);
console.log(`Patch Tuesday: ${msrc.months.map(m => `${m.id} ${m.cves.length} CVEs (${m.cves.filter(c => c.exploited).length} exploited)`).join(', ') || 'no data'}, ${mb(msrcJson)}`);
console.log(`Actors: ${actors.actors.length} threat actors (${actors.actors.filter(a => a.country).length} with a country), ${actors.malware.length} malware and tools (${actors.malware.filter(m => m.malpediaUrl).length} in Malpedia, ${actors.malware.filter(m => !m.attackId).length} Malpedia-only from the news), ${(actorsJson.length / 1024).toFixed(0)} KB${actorsJson.length > 400 * 1024 ? ' (over the 400 KB budget)' : ''}`);
console.log(`Entities: ${entities.vendors.length} vendors, ${entities.groups.length} groups, ${entities.actors.length} actors, ${entities.malware.length} malware and tools, ${(entitiesJson.length / 1024).toFixed(0)} KB${entitiesJson.length > 80 * 1024 ? ' (over the 80 KB budget)' : ''}`);
console.log(trendsBase.write
  ? `Trends: ${trendDayKeys.length} days and ${Object.keys(trends.weeks).length} weeks since ${trendsSince}, ${(trendsJson.length / 1024).toFixed(0)} KB${trendsJson.length > 1.5e6 ? ' (over the 1.5 MB budget)' : ''}`
  : `Trends: not written, the previous history couldn't be read (${publishedTrends.error})`);
console.log(statsBase.write
  ? `Stats: ${statsDayKeys.length} days since ${statsDayKeys[0]}, ${(statsJson.length / 1024).toFixed(0)} KB`
  : `Stats: not written, the previous history couldn't be read (${publishedStats.error})`);
console.log(`Sources: ${sources.map(x => `${x.id}=${x.status}`).join(' ')}`);
for (const r of results.filter(r => r.health.status !== 'healthy')) console.log(`  ✗ ${r.health.feedId}: ${r.health.status} ${r.health.errorMessage ?? ''}`);
