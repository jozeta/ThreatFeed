// GitHub's npm advisories as the snapshot job publishes them. public/data/npm-advisories.json holds the
// reviewed advisories published or updated in the last 90 days in detail and a compact matching index of
// every reviewed npm advisory; public/data/npm-malware.json holds 30 days of malware advisories. Advisory
// text is untrusted: it is kept as plain text here and must be rendered as text, never as HTML.

export interface NpmRange { package: string; vulnerable: string; patched?: string }

export interface NpmAdvisory {
  id: string;
  cves: string[];
  summary: string;
  description: string; // at most MAX_DESCRIPTION chars, GitHub's markdown as plain text
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  cvss: { version: '3' | '4'; score: number; vector: string }[];
  cwes: { id: string; name: string }[];
  epss?: { score: number; percentile: number };
  kev?: boolean;
  ranges: NpmRange[];
  published: string;
  updated: string;
  withdrawn?: string;
  references: string[];
  credits: string[];
  url: string; // the advisory page on github.com
}

/** A range in the matching index: package, vulnerable range, first patched version */
export type NpmIndexRange = [pkg: string, vulnerable: string, patched?: string];

/** One reviewed advisory in the matching index; withdrawn ones stay in it, flagged, and are not matched */
export type NpmIndexEntry = [id: string, severity: NpmAdvisory['severity'], ranges: NpmIndexRange[], withdrawn?: 1];

export interface NpmAdvisoryData {
  version: 1;
  generatedAt: string;
  updatedAt: string; // when this run started fetching: the next run asks only for advisories updated since
  epssAt?: string; // the last EPSS refresh of the detailed list's CVEs (at most daily)
  recent: NpmAdvisory[];
  index: NpmIndexEntry[];
}

/** One package of a malware advisory: GHSA id, package, vulnerable range (often ">= 0"), published */
export type NpmMalwareTuple = [id: string, pkg: string, vulnerable: string, published: string];

export interface NpmMalwareData {
  version: 1;
  generatedAt: string;
  updatedAt: string; // as in NpmAdvisoryData
  entries: NpmMalwareTuple[];
}

export type EpssScore = { score: number; percentile: number };

export const NPM_RECENT_DAYS = 90;
export const NPM_MALWARE_DAYS = 30;
const MAX_DESCRIPTION = 800;
const MAX_SUMMARY = 300;
const MAX_REFERENCES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITIES: NpmAdvisory['severity'][] = ['critical', 'high', 'medium', 'low', 'unknown'];
const GHSA_RE = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
const isObject = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const cap = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A one-line string: whitespace collapsed, capped */
const line = (value: unknown, max: number): string => (typeof value === 'string' ? cap(value.replace(/\s+/g, ' ').trim(), max) : '');

/** Multi-line text: control characters other than newlines and tabs removed, capped */
const text = (value: unknown, max: number): string =>
  // eslint-disable-next-line no-control-regex
  typeof value === 'string' ? cap(value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim(), max) : '';

/** The npm entries of a GHSA `vulnerabilities` list. A missing range is kept as '' so matching reads it as unknown */
function npmRanges(raw: unknown): NpmRange[] {
  if (!Array.isArray(raw)) return [];
  const ranges: NpmRange[] = [];
  for (const v of raw) {
    if (v?.package?.ecosystem !== 'npm') continue;
    const name = line(v.package.name, 214);
    if (!name) continue;
    const range: NpmRange = { package: name, vulnerable: line(v.vulnerable_version_range, 200) };
    const patched = line(v.first_patched_version, 100);
    if (patched) range.patched = patched;
    ranges.push(range);
  }
  return ranges;
}

function advisoryUrl(raw: Record<string, any>): string {
  return typeof raw.html_url === 'string' && raw.html_url.startsWith('https://github.com/') ? raw.html_url : `https://github.com/advisories/${raw.ghsa_id}`;
}

/**
 * One reviewed advisory from GET /advisories?ecosystem=npm, with its npm ranges only. Withdrawn advisories
 * are kept, with `withdrawn` set. `cweNames` (CWE id to name) takes precedence over GitHub's names.
 */
export function normalizeGhsaNpm(raw: unknown, cweNames: Record<string, string> = {}): NpmAdvisory | null {
  if (!isObject(raw) || typeof raw.ghsa_id !== 'string' || !GHSA_RE.test(raw.ghsa_id) || !isDate(raw.published_at)) return null;
  const ranges = npmRanges(raw.vulnerabilities);
  if (!ranges.length) return null;
  const url = advisoryUrl(raw);

  const cves = new Set<string>();
  for (const id of [raw.cve_id, ...(Array.isArray(raw.identifiers) ? raw.identifiers.filter((i: any) => i?.type === 'CVE').map((i: any) => i.value) : [])]) {
    const cve = typeof id === 'string' ? id.trim().toUpperCase() : '';
    if (CVE_RE.test(cve)) cves.add(cve);
  }

  const cvss: NpmAdvisory['cvss'] = [];
  for (const [key, version] of [['cvss_v3', '3'], ['cvss_v4', '4']] as const) {
    const c = raw.cvss_severities?.[key];
    const score = Number(c?.score);
    if (typeof c?.vector_string === 'string' && c.vector_string.startsWith('CVSS:') && score > 0 && score <= 10) {
      cvss.push({ version, score, vector: line(c.vector_string, 200) });
    }
  }

  const cwes: NpmAdvisory['cwes'] = [];
  for (const c of Array.isArray(raw.cwes) ? raw.cwes : []) {
    const id = typeof c?.cwe_id === 'string' ? c.cwe_id.trim().toUpperCase() : '';
    if (/^CWE-\d+$/.test(id) && !cwes.some(x => x.id === id)) cwes.push({ id, name: cweNames[id] || line(c.name, 200) || id });
  }

  // Web links only, without the advisory's own page (the url field)
  const references = [...new Set((Array.isArray(raw.references) ? raw.references : [])
    .filter((r: unknown): r is string => typeof r === 'string' && /^https?:\/\//.test(r) && r.length <= 500 && r !== url))]
    .slice(0, MAX_REFERENCES);

  const credits = [...new Set((Array.isArray(raw.credits) ? raw.credits : [])
    .map((c: any) => line(c?.user?.login, 100))
    .filter(Boolean))] as string[];

  const advisory: NpmAdvisory = {
    id: raw.ghsa_id,
    cves: [...cves],
    summary: line(raw.summary, MAX_SUMMARY) || raw.ghsa_id,
    description: text(raw.description, MAX_DESCRIPTION),
    severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'unknown',
    cvss,
    cwes,
    ranges,
    published: raw.published_at,
    updated: isDate(raw.updated_at) ? raw.updated_at : raw.published_at,
    references,
    credits,
    url,
  };
  if (isDate(raw.withdrawn_at)) advisory.withdrawn = raw.withdrawn_at;
  return advisory;
}

export function toIndexEntry(a: NpmAdvisory): NpmIndexEntry {
  const ranges = a.ranges.map((r): NpmIndexRange => (r.patched ? [r.package, r.vulnerable, r.patched] : [r.package, r.vulnerable]));
  return a.withdrawn ? [a.id, a.severity, ranges, 1] : [a.id, a.severity, ranges];
}

/** A malware advisory (type=malware), one tuple per npm package. Withdrawn ones (false positives) give none */
export function normalizeGhsaMalware(raw: unknown): NpmMalwareTuple[] {
  if (!isObject(raw) || typeof raw.ghsa_id !== 'string' || !GHSA_RE.test(raw.ghsa_id) || !isDate(raw.published_at) || raw.withdrawn_at) return [];
  return npmRanges(raw.vulnerabilities).map((r): NpmMalwareTuple => [raw.ghsa_id, r.package, r.vulnerable, raw.published_at]);
}

const lastChange = (a: NpmAdvisory) => (a.updated > a.published ? a.updated : a.published);

/**
 * This run's npm-advisories.json: the previous one with the advisories fetched this run on top (by id), the
 * detailed list pruned to NPM_RECENT_DAYS by the later of published and updated, and KEV and EPSS applied
 * again. An advisory without a score in `epss` keeps the one it had.
 */
export function mergeNpmData(
  previous: NpmAdvisoryData | null,
  updated: NpmAdvisory[],
  kevCves: Set<string>,
  epss: Map<string, EpssScore>,
  now: number,
): NpmAdvisoryData {
  const cutoff = new Date(now - NPM_RECENT_DAYS * DAY_MS).toISOString();
  const previousRecent = new Map((previous?.recent ?? []).map(a => [a.id, a]));
  const updatedIds = new Set(updated.map(a => a.id));

  // Index: this run's advisories first (GitHub lists them most recently updated first), then the rest
  const index = [...updated.map(toIndexEntry), ...(previous?.index ?? []).filter(e => !updatedIds.has(e[0]))];

  const recent = [...updated, ...(previous?.recent ?? []).filter(a => !updatedIds.has(a.id))]
    .filter(a => lastChange(a) >= cutoff)
    .map(a => {
      const out: NpmAdvisory = { ...a };
      delete out.kev;
      delete out.epss;
      if (a.cves.some(c => kevCves.has(c))) out.kev = true;
      const scores = a.cves.map(c => epss.get(c)).filter((s): s is EpssScore => Boolean(s));
      const kept = a.epss ?? previousRecent.get(a.id)?.epss;
      const best = scores.length ? scores.reduce((x, y) => (y.score > x.score ? y : x)) : kept;
      if (best) out.epss = { score: best.score, percentile: best.percentile };
      return out;
    })
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id));

  const iso = new Date(now).toISOString();
  const data: NpmAdvisoryData = { version: 1, generatedAt: iso, updatedAt: iso, recent, index };
  if (previous?.epssAt) data.epssAt = previous.epssAt;
  return data;
}

/**
 * This run's npm-malware.json: the previous entries with the advisories fetched this run on top (an advisory
 * fetched again replaces all its entries; `withdrawn` ids are removed), pruned to NPM_MALWARE_DAYS by
 * published, newest first.
 */
export function mergeNpmMalware(previous: NpmMalwareData | null, fetched: NpmMalwareTuple[], withdrawn: Iterable<string>, now: number): NpmMalwareData {
  const cutoff = new Date(now - NPM_MALWARE_DAYS * DAY_MS).toISOString();
  const replaced = new Set([...fetched.map(m => m[0]), ...withdrawn]);
  const entries = [...fetched, ...(previous?.entries ?? []).filter(m => !replaced.has(m[0]))]
    .filter(m => m[3] >= cutoff)
    .sort((a, b) => b[3].localeCompare(a[3]) || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const iso = new Date(now).toISOString();
  return { version: 1, generatedAt: iso, updatedAt: iso, entries };
}

// ---------- Reading a published file back ----------

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function validRange(r: unknown): r is NpmRange {
  return isObject(r) && isString(r.package) && isString(r.vulnerable) && (r.patched === undefined || isString(r.patched));
}

function validIndexRange(r: unknown): r is NpmIndexRange {
  return Array.isArray(r) && isString(r[0]) && isString(r[1]) && (r.length === 2 || (r.length === 3 && isString(r[2])));
}

function validIndexEntry(e: unknown): e is NpmIndexEntry {
  return Array.isArray(e) && isString(e[0]) && SEVERITIES.includes(e[1]) && Array.isArray(e[2]) && e[2].every(validIndexRange)
    && (e.length === 3 || (e.length === 4 && e[3] === 1));
}

function validAdvisory(a: unknown): a is NpmAdvisory {
  return isObject(a) && isString(a.id) && isStringArray(a.cves) && isString(a.summary) && isString(a.description)
    && SEVERITIES.includes(a.severity) && Array.isArray(a.cvss) && a.cvss.every((c: any) => (c?.version === '3' || c?.version === '4') && typeof c.score === 'number' && isString(c.vector))
    && Array.isArray(a.cwes) && a.cwes.every((c: any) => isString(c?.id) && isString(c?.name))
    && (a.epss === undefined || (typeof a.epss?.score === 'number' && typeof a.epss?.percentile === 'number'))
    && (a.kev === undefined || a.kev === true)
    && Array.isArray(a.ranges) && a.ranges.length > 0 && a.ranges.every(validRange)
    && isDate(a.published) && isDate(a.updated) && (a.withdrawn === undefined || isDate(a.withdrawn))
    && isStringArray(a.references) && isStringArray(a.credits) && isString(a.url) && a.url.startsWith('https://github.com/');
}

function validMalware(m: unknown): m is NpmMalwareTuple {
  return Array.isArray(m) && m.length === 4 && isString(m[0]) && isString(m[1]) && isString(m[2]) && isDate(m[3]);
}

/**
 * A published npm-advisories.json, or null when it isn't one. The index backs "not affected", so one
 * malformed index entry rejects the whole file; malformed detail entries are dropped.
 */
export function decodeNpmData(raw: unknown): NpmAdvisoryData | null {
  if (!isObject(raw) || raw.version !== 1 || !isDate(raw.generatedAt) || !isDate(raw.updatedAt)) return null;
  if (!Array.isArray(raw.index) || !Array.isArray(raw.recent)) return null;
  if (!raw.index.every(validIndexEntry)) return null;
  const data: NpmAdvisoryData = {
    version: 1,
    generatedAt: raw.generatedAt,
    updatedAt: raw.updatedAt,
    recent: raw.recent.filter(validAdvisory),
    index: raw.index,
  };
  if (isDate(raw.epssAt)) data.epssAt = raw.epssAt;
  return data;
}

/** A published npm-malware.json, or null when it isn't one. Malformed entries are dropped */
export function decodeNpmMalware(raw: unknown): NpmMalwareData | null {
  if (!isObject(raw) || raw.version !== 1 || !isDate(raw.generatedAt) || !isDate(raw.updatedAt) || !Array.isArray(raw.entries)) return null;
  return { version: 1, generatedAt: raw.generatedAt, updatedAt: raw.updatedAt, entries: raw.entries.filter(validMalware) };
}
