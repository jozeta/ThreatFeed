// Opt-in lookup of watched npm packages in OSV.dev (Google). Only called when the user turns on
// "Also check full history with OSV.dev": it sends the package names and versions. OSV answers are
// untrusted input: ids are checked before they go into a URL, text is kept as plain, capped text.

import type { NpmAdvisory } from './advisories';
import { formatPackageEntry, type OsvEvent, type PackageEntry } from './semver';

export const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
export const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns/';
export const OSV_BATCH_SIZE = 500;
export const OSV_DETAIL_LIMIT = 50;
const DETAIL_CONCURRENCY = 5;
const TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

/** One vulnerable range in GHSA syntax (">= 1.0.0, < 1.2.3"), so matching reads OSV and GHSA alike */
export interface OsvRange { vulnerable: string; patched?: string }

export interface OsvVuln {
  id: string;
  summary?: string;
  severity: NpmAdvisory['severity'];
  malware: boolean; // OSV's malicious-packages ids (MAL-…)
  aliases: string[];
  ranges: OsvRange[]; // empty when the details weren't fetched (known id, over the limit, or failed)
}

/** OSV's answer for one watched entry. With a version these are the vulnerabilities affecting it */
export interface OsvResult {
  vulns: OsvVuln[];
  complete: boolean; // false when OSV paginated the answer and only the first page was read
}

type FetchImpl = typeof fetch;

async function getJson(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const line = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const SEVERITY: Record<string, NpmAdvisory['severity']> = { CRITICAL: 'critical', HIGH: 'high', MODERATE: 'medium', MEDIUM: 'medium', LOW: 'low' };

/** The ids of one querybatch result, or null when it is malformed */
function resultIds(r: unknown): { ids: string[]; complete: boolean } | null {
  if (!isObject(r)) return null;
  const vulns = r.vulns ?? [];
  if (!Array.isArray(vulns)) return null;
  const ids: string[] = [];
  for (const v of vulns) {
    if (!isObject(v) || typeof v.id !== 'string' || !ID_RE.test(v.id)) return null;
    if (!ids.includes(v.id)) ids.push(v.id);
  }
  return { ids, complete: !r.next_page_token };
}

/** OSV SEMVER events as GHSA-style ranges: each introduced opens one, fixed or last_affected closes it */
function eventRanges(events: unknown): OsvRange[] {
  if (!Array.isArray(events)) return [];
  const ranges: OsvRange[] = [];
  let open: string | null = null;
  const text = (v: unknown) => line(v, 100);
  for (const e of events as OsvEvent[]) {
    if (!isObject(e)) continue;
    const introduced = text(e.introduced);
    const fixed = text(e.fixed);
    const last = text(e.last_affected);
    if (introduced) {
      if (open !== null) ranges.push({ vulnerable: open });
      open = `>= ${introduced}`;
    } else if (fixed) {
      ranges.push({ vulnerable: open === null ? `< ${fixed}` : `${open}, < ${fixed}`, patched: fixed });
      open = null;
    } else if (last) {
      ranges.push({ vulnerable: open === null ? `<= ${last}` : `${open}, <= ${last}` });
      open = null;
    }
  }
  if (open !== null) ranges.push({ vulnerable: open });
  return ranges;
}

interface Detail { summary?: string; severity?: NpmAdvisory['severity']; aliases: string[]; affected: unknown[] }

function decodeDetail(raw: unknown, id: string): Detail | null {
  if (!isObject(raw) || raw.id !== id) return null;
  const severity = SEVERITY[String(raw.database_specific?.severity ?? '').toUpperCase()];
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a: unknown): a is string => typeof a === 'string' && ID_RE.test(a)).slice(0, 20) : [];
  return { summary: line(raw.summary, 300), severity, aliases, affected: Array.isArray(raw.affected) ? raw.affected : [] };
}

/** The ranges a detail record gives for one npm package */
function packageRanges(detail: Detail, name: string): OsvRange[] {
  const ranges: OsvRange[] = [];
  for (const a of detail.affected) {
    if (!isObject(a) || a.package?.ecosystem !== 'npm' || a.package?.name !== name || !Array.isArray(a.ranges)) continue;
    for (const r of a.ranges) {
      if (isObject(r) && r.type === 'SEMVER') ranges.push(...eventRanges(r.events));
    }
  }
  return ranges;
}

function toVuln(id: string, name: string, detail: Detail | undefined): OsvVuln {
  const malware = id.startsWith('MAL-');
  const vuln: OsvVuln = {
    id,
    severity: detail?.severity ?? (malware ? 'critical' : 'unknown'),
    malware,
    aliases: detail?.aliases ?? [],
    ranges: detail ? packageRanges(detail, name) : [],
  };
  if (detail?.summary) vuln.summary = detail.summary;
  return vuln;
}

/**
 * Looks the entries up in OSV: POST /v1/querybatch in chunks of OSV_BATCH_SIZE, then GET /v1/vulns/<id>
 * for at most OSV_DETAIL_LIMIT ids that aren't in `known` (the ids already in our own data). Results are
 * keyed by formatPackageEntry. Null when OSV can't be reached or answers something unreadable; a single
 * failed detail request only leaves that id without details.
 */
export async function osvQueryBatch(entries: PackageEntry[], known: ReadonlySet<string>, fetchImpl: FetchImpl = fetch): Promise<Map<string, OsvResult> | null> {
  const unique = [...new Map(entries.map(e => [formatPackageEntry(e), e])).values()];
  const found = new Map<string, { entry: PackageEntry; ids: string[]; complete: boolean }>();
  try {
    for (let i = 0; i < unique.length; i += OSV_BATCH_SIZE) {
      const chunk = unique.slice(i, i + OSV_BATCH_SIZE);
      const queries = chunk.map(e => (e.version ? { package: { name: e.name, ecosystem: 'npm' }, version: e.version } : { package: { name: e.name, ecosystem: 'npm' } }));
      const body = await getJson(fetchImpl, OSV_BATCH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }) });
      if (!isObject(body) || !Array.isArray(body.results) || body.results.length !== chunk.length) return null;
      for (let j = 0; j < chunk.length; j++) {
        const r = resultIds(body.results[j]);
        if (!r) return null;
        found.set(formatPackageEntry(chunk[j]), { entry: chunk[j], ...r });
      }
    }
  } catch {
    return null;
  }

  const wanted = [...new Set([...found.values()].flatMap(f => f.ids))].filter(id => !known.has(id)).slice(0, OSV_DETAIL_LIMIT);
  const details = new Map<string, Detail>();
  for (let i = 0; i < wanted.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(wanted.slice(i, i + DETAIL_CONCURRENCY).map(async id => {
      try {
        const detail = decodeDetail(await getJson(fetchImpl, OSV_VULN_URL + encodeURIComponent(id)), id);
        if (detail) details.set(id, detail);
      } catch {
        // Kept without details: the id alone still marks the entry affected
      }
    }));
  }

  const results = new Map<string, OsvResult>();
  for (const [key, f] of found) {
    results.set(key, { vulns: f.ids.map(id => toVuln(id, f.entry.name, details.get(id))), complete: f.complete });
  }
  return results;
}

/**
 * Whether cached OSV results can still be used: taken less than a day ago for the same list
 * (`listKey` is the current list, `cachedKey` the list the cache was taken for).
 */
export function osvCacheFresh(cachedAt: string | undefined, listKey: string, cachedKey: string, now: number): boolean {
  if (!cachedAt || listKey !== cachedKey) return false;
  const at = Date.parse(cachedAt);
  if (Number.isNaN(at)) return false;
  const age = now - at;
  return age >= 0 && age < DAY_MS;
}
