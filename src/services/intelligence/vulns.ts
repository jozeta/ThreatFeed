import { CveDayCount, CveRecord, CvssSeverity, KevEntry, NvdStats, OssAdvisory, SsvcDecision } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

/** One record from the CISA KEV JSON catalog */
export function normalizeKev(raw: any): KevEntry | null {
  const cve = typeof raw?.cveID === 'string' ? raw.cveID.trim().toUpperCase() : '';
  if (!/^CVE-\d{4}-\d{4,}$/.test(cve) || !isDate(raw.dateAdded)) return null;
  return {
    cve,
    vendor: clean(raw.vendorProject, 60) || 'Unknown',
    product: clean(raw.product, 80) || 'Unknown',
    name: clean(raw.vulnerabilityName, 160) || cve,
    dateAdded: raw.dateAdded.slice(0, 10),
    dueDate: isDate(raw.dueDate) ? raw.dueDate.slice(0, 10) : undefined,
    ransomware: raw.knownRansomwareCampaignUse === 'Known',
    cwes: Array.isArray(raw.cwes) ? raw.cwes.filter((c: unknown) => typeof c === 'string' && /^CWE-\d+$/.test(c)) : [],
    description: clean(raw.shortDescription, 300),
  };
}

export function severityFromScore(score: number): CvssSeverity | undefined {
  if (!(score > 0)) return undefined;
  return score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';
}

// CVSS v3.x is what most tooling (and KEV) still reports, so it wins over v4 when both exist
const METRIC_ORDER = ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV40', 'cvssMetricV2'];

/** CNAs are identified by an e-mail address (or a UUID, which says nothing to a reader) */
export function assignerName(sourceIdentifier: unknown): string | undefined {
  if (typeof sourceIdentifier !== 'string') return undefined;
  const domain = sourceIdentifier.split('@')[1];
  return domain ? domain.toLowerCase().replace(/^(www|security|psirt)\./, '') : undefined;
}

/** Attack vector, privileges required and user interaction from a CVSS v3/v4 vector (v2 has no PR/UI) */
export function parseVector(vector: string | undefined): { av?: string; pr?: string; ui?: string } {
  if (!vector) return {};
  const parts = new Map(vector.split('/').map(p => p.split(':') as [string, string]));
  return { av: parts.get('AV'), pr: parts.get('PR'), ui: parts.get('UI') };
}

/** Exploitable over the network with no privileges and no user interaction: the worst kind */
export function isRemoteNoAuth(vector: string | undefined): boolean {
  const { av, pr, ui } = parseVector(vector);
  return av === 'N' && pr === 'N' && ui === 'N';
}

export const ATTACK_VECTORS: Record<string, string> = { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' };

/** CISA's SSVC options, e.g. [{exploitation: "active"}, {automatable: "no"}, {technicalImpact: "total"}] */
function readSsvc(metrics: any): SsvcDecision | undefined {
  const options: any[] = (Array.isArray(metrics?.ssvcV203) ? metrics.ssvcV203 : []).flatMap((m: any) => (Array.isArray(m?.ssvcData?.options) ? m.ssvcData.options : []));
  const pick = (key: string) => {
    const value = options.find(o => o && typeof o[key] === 'string')?.[key];
    return typeof value === 'string' ? value.toLowerCase() : undefined;
  };
  const exploitation = pick('exploitation');
  const automatable = pick('automatable');
  const impact = pick('technicalImpact');
  const ssvc: SsvcDecision = {
    exploitation: exploitation === 'none' || exploitation === 'poc' || exploitation === 'active' ? exploitation : undefined,
    automatable: automatable === 'yes' || automatable === 'no' ? automatable : undefined,
    impact: impact === 'partial' || impact === 'total' ? impact : undefined,
  };
  return ssvc.exploitation || ssvc.automatable || ssvc.impact ? ssvc : undefined;
}

/** Affected "vendor product" pairs: the CNA's own names first, then NVD's CPE matches */
function readProducts(cve: any): string[] | undefined {
  const names: string[] = [];
  for (const a of Array.isArray(cve.affected) ? cve.affected : []) {
    for (const d of Array.isArray(a?.affectedData) ? a.affectedData : []) {
      const vendor = clean(d?.vendor, 40);
      const product = clean(d?.product, 60);
      if (product && !/^n\/?a$/i.test(product)) names.push(vendor && !/^n\/?a$/i.test(vendor) ? `${vendor} ${product}` : product);
    }
  }
  for (const c of Array.isArray(cve.configurations) ? cve.configurations : []) {
    for (const node of Array.isArray(c?.nodes) ? c.nodes : []) {
      for (const m of Array.isArray(node?.cpeMatch) ? node.cpeMatch : []) {
        const [, , , vendor, product] = typeof m?.criteria === 'string' && m.vulnerable ? m.criteria.split(':') : [];
        if (vendor && product && vendor !== '*' && product !== '*') names.push(`${vendor} ${product}`.replace(/_/g, ' '));
      }
    }
  }
  const seen = new Set<string>();
  const unique = names.filter(n => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length ? unique.slice(0, 6) : undefined;
}

/** One `cve` object from the NVD 2.0 API */
export function normalizeNvdCve(cve: any): CveRecord | null {
  if (!cve || typeof cve.id !== 'string' || !isDate(cve.published)) return null;
  let score: number | undefined;
  let vector: string | undefined;
  for (const key of METRIC_ORDER) {
    const metrics: any[] = Array.isArray(cve.metrics?.[key]) ? cve.metrics[key] : [];
    const best = metrics.find(m => m.type === 'Primary') || metrics[0];
    if (best && typeof best.cvssData?.baseScore === 'number') {
      score = best.cvssData.baseScore;
      vector = typeof best.cvssData.vectorString === 'string' ? best.cvssData.vectorString : undefined;
      break;
    }
  }
  const cwe = (Array.isArray(cve.weaknesses) ? cve.weaknesses : [])
    .flatMap((w: any) => (Array.isArray(w.description) ? w.description : []))
    .map((d: any) => d?.value)
    .find((v: unknown) => typeof v === 'string' && /^CWE-\d+$/.test(v));
  const description = (Array.isArray(cve.descriptions) ? cve.descriptions : []).find((d: any) => d?.lang === 'en')?.value;
  return {
    id: cve.id.toUpperCase(),
    published: new Date(`${cve.published}${/Z|[+-]\d\d:?\d\d$/.test(cve.published) ? '' : 'Z'}`).toISOString(),
    score,
    severity: score === undefined ? undefined : severityFromScore(score),
    cwe,
    assigner: assignerName(cve.sourceIdentifier),
    description: clean(description, 300),
    vector,
    ssvc: readSsvc(cve.metrics),
    products: readProducts(cve),
  };
}

const top = (m: Map<string, number>, n = 15) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m: Map<string, number>, key: string | undefined) => key && m.set(key, (m.get(key) || 0) + 1);

/** Per-day severity counts plus top CWEs and CNAs, attack vectors and CISA's exploitation ratings */
export function summarizeNvd(records: CveRecord[], from: Date, to: Date): NvdStats {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const daily: CveDayCount[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    critical: 0, high: 0, medium: 0, low: 0, unscored: 0,
  }));
  const byDate = new Map(daily.map(d => [d.date, d]));
  const cwes = new Map<string, number>();
  const assigners = new Map<string, number>();
  const vectors = new Map<string, number>();
  const exploitation = new Map<string, number>();
  let remoteNoAuth = 0;
  for (const r of records) {
    const day = byDate.get(r.published.slice(0, 10));
    if (day) day[(r.severity?.toLowerCase() ?? 'unscored') as keyof Omit<CveDayCount, 'date'>]++;
    if (r.cwe && r.cwe !== 'CWE-Other') bump(cwes, r.cwe);
    bump(assigners, r.assigner);
    bump(vectors, ATTACK_VECTORS[parseVector(r.vector).av ?? ''] ?? 'Unknown');
    bump(exploitation, r.ssvc?.exploitation);
    if (isRemoteNoAuth(r.vector)) remoteNoAuth++;
  }
  return {
    from: from.toISOString(), to: to.toISOString(), total: records.length, daily, cwes: top(cwes), assigners: top(assigners),
    attackVectors: top(vectors), remoteNoAuth, ssvcExploitation: top(exploitation),
  };
}

/**
 * The snapshot keeps every CVE from the NVD window in data/nvd-cache.json (not loaded by the app), so the
 * next run only asks NVD for what changed since. Records are compact tuples. Critical CVEs (the only ones
 * shown individually) keep their description, full vector and products; the rest keep just enough for the
 * statistics. A CVE rescored to critical is re-fetched anyway, since rescoring changes its last-modified date.
 * `kev` holds the NVD data for KEV CVEs (an entry without a score means NVD has none yet).
 */
export interface NvdCache {
  fetchedAt: string; // end of the window the last successful NVD query covered
  records: CveRecord[];
  kev: Record<string, CveRecord>;
}

type CacheTuple = [string, string, number | null, string | null, string | null, string | null, string | null, string | null, string[] | null];

const SSVC_CODES = { exploitation: ['none', 'poc', 'active'], automatable: ['no', 'yes'], impact: ['partial', 'total'] } as const;
const encodeSsvc = (s: SsvcDecision | undefined) =>
  s ? [s.exploitation ?? '-', s.automatable ?? '-', s.impact ?? '-'].join('/') : null;
function decodeSsvc(code: unknown): SsvcDecision | undefined {
  if (typeof code !== 'string') return undefined;
  const [e, a, i] = code.split('/');
  const ok = <T extends readonly string[]>(list: T, v: string) => (list.includes(v) ? (v as T[number]) : undefined);
  return { exploitation: ok(SSVC_CODES.exploitation, e), automatable: ok(SSVC_CODES.automatable, a), impact: ok(SSVC_CODES.impact, i) };
}

// Non-critical records only need attack vector, privileges and user interaction for the statistics
export const statsVector = (vector: string | undefined) => {
  const { av, pr, ui } = parseVector(vector);
  return av ? [`AV:${av}`, pr && `PR:${pr}`, ui && `UI:${ui}`].filter(Boolean).join('/') : null;
};

function toTuple(r: CveRecord, full: boolean, withDescription: boolean): CacheTuple {
  return [
    r.id, r.published, r.score ?? null, r.cwe ?? null, r.assigner ?? null,
    withDescription ? r.description ?? null : null,
    full ? r.vector ?? null : statsVector(r.vector),
    encodeSsvc(r.ssvc),
    full ? r.products ?? null : null,
  ];
}

function fromTuple(t: unknown): CveRecord | null {
  if (!Array.isArray(t) || typeof t[0] !== 'string' || isNaN(Date.parse(t[1]))) return null;
  const score = typeof t[2] === 'number' ? t[2] : undefined;
  return {
    id: t[0], published: t[1], score, severity: score === undefined ? undefined : severityFromScore(score),
    cwe: t[3] ?? undefined, assigner: t[4] ?? undefined, description: t[5] ?? undefined,
    vector: typeof t[6] === 'string' ? t[6] : undefined,
    ssvc: decodeSsvc(t[7]),
    products: Array.isArray(t[8]) ? t[8].filter((p: unknown) => typeof p === 'string') : undefined,
  };
}

export function encodeNvdCache(cache: NvdCache): unknown {
  return {
    version: 3,
    fetchedAt: cache.fetchedAt,
    records: cache.records.map(r => {
      const t = toTuple(r, (r.score ?? 0) >= 9, (r.score ?? 0) >= 9);
      // CVSS 7-8.9 records feed the alert-rule list, which matches on products: keep a few
      if ((r.score ?? 0) >= 7 && (r.score ?? 0) < 9) t[8] = r.products?.slice(0, 3) ?? null;
      return t;
    }),
    kev: Object.values(cache.kev).map(r => toTuple(r, true, false)),
  };
}

/** Compact tuples for CVSS 7-8.9 CVEs (alert rules): short vector and products kept, no description */
export function encodeWatchable(records: CveRecord[]): unknown[] {
  return records.map(r => {
    const t = toTuple(r, false, false);
    t[8] = r.products?.slice(0, 3) ?? null; // three products are plenty (as in the KEV list)
    return t;
  });
}

export function decodeWatchable(raw: unknown): CveRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(fromTuple).filter((r): r is CveRecord => r !== null);
}

/** Parses a cache fetched over the network; anything malformed (or an older format) means a full fetch */
export function decodeNvdCache(raw: any): NvdCache | null {
  if (!raw || raw.version !== 3 || isNaN(Date.parse(raw.fetchedAt)) || !Array.isArray(raw.records) || !Array.isArray(raw.kev)) return null;
  const records = raw.records.map(fromTuple).filter((r: CveRecord | null): r is CveRecord => r !== null);
  const kev: Record<string, CveRecord> = {};
  for (const t of raw.kev) {
    const r = fromTuple(t);
    if (r) kev[r.id] = r;
  }
  return { fetchedAt: raw.fetchedAt, records, kev };
}

/** Applies changed CVEs to the cached window: updates replace, new ones are added, ones older than `from` drop out */
export function applyNvdUpdates(records: CveRecord[], updates: CveRecord[], from: Date): CveRecord[] {
  const byId = new Map(records.map(r => [r.id, r]));
  for (const u of updates) byId.set(u.id, u);
  const cutoff = from.toISOString();
  return [...byId.values()].filter(r => r.published >= cutoff);
}

const OSS_SEVERITIES =['critical', 'high', 'medium', 'low'];

/** One reviewed advisory from the GitHub Advisory Database REST API */
export function normalizeAdvisory(raw: any): OssAdvisory | null {
  if (!raw || typeof raw.ghsa_id !== 'string' || !isDate(raw.published_at) || raw.withdrawn_at) return null;
  const summary = clean(raw.summary, 200);
  if (!summary) return null;
  const pkg = (Array.isArray(raw.vulnerabilities) ? raw.vulnerabilities : []).find((v: any) => v?.package?.name)?.package;
  return {
    id: raw.ghsa_id,
    cve: typeof raw.cve_id === 'string' ? raw.cve_id.toUpperCase() : undefined,
    summary,
    severity: OSS_SEVERITIES.includes(raw.severity) ? raw.severity : 'unknown',
    publishedAt: raw.published_at,
    ecosystem: clean(pkg?.ecosystem, 30),
    package: clean(pkg?.name, 100),
    url: typeof raw.html_url === 'string' && raw.html_url.startsWith('https://github.com/') ? raw.html_url : `https://github.com/advisories/${raw.ghsa_id}`,
  };
}

/** CVSS score bands for the "CVSS score" breakdowns; `min` is inclusive, `max` exclusive */
export const CVSS_BANDS = [
  { id: 'critical', label: 'Critical (9.0–10)', min: 9, max: 11 },
  { id: 'high', label: 'High (7.0–8.9)', min: 7, max: 9 },
  { id: 'medium', label: 'Medium (4.0–6.9)', min: 4, max: 7 },
  { id: 'low', label: 'Low (0.1–3.9)', min: 0.1, max: 4 },
  { id: 'unscored', label: 'Not scored', min: NaN, max: NaN },
] as const;

export type CvssBandId = (typeof CVSS_BANDS)[number]['id'];

export function cvssBand(score: number | undefined): CvssBandId {
  if (score === undefined || !(score > 0)) return 'unscored';
  return CVSS_BANDS.find(b => score >= b.min && score < b.max)?.id ?? 'unscored';
}

/** Days from a CVE's publication to its KEV listing (0 or less: already exploited when disclosed) */
export function daysToKev(k: KevEntry): number | undefined {
  if (!k.published) return undefined;
  return Math.round((Date.parse(k.dateAdded) - Date.parse(k.published.slice(0, 10))) / DAY_MS);
}

export const TIME_TO_KEV_BUCKETS = [
  { id: 'zero', label: 'Same day or before', max: 0 },
  { id: 'week', label: '1–7 days', max: 7 },
  { id: 'month', label: '8–30 days', max: 30 },
  { id: 'year', label: '31–365 days', max: 365 },
  { id: 'older', label: 'Over a year', max: Infinity },
] as const;

export function timeToKevBucket(days: number) {
  return TIME_TO_KEV_BUCKETS.find(b => days <= b.max)!.id;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** KEV additions per calendar month, oldest first, ending with the current month */
export function kevPerMonth(kev: KevEntry[], months: number, now = new Date()): { month: string; total: number; ransomware: number }[] {
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return { month: d.toISOString().slice(0, 7), total: 0, ransomware: 0 };
  });
  const byMonth = new Map(buckets.map(b => [b.month, b]));
  for (const k of kev) {
    const b = byMonth.get(k.dateAdded.slice(0, 7));
    if (b) {
      b.total++;
      if (k.ransomware) b.ransomware++;
    }
  }
  return buckets;
}

/**
 * Ranks KEV entries for the "Patch first" list: higher means patch sooner. Every entry is already
 * known to be exploited, so this decides among exploited bugs. Signals available:
 *   - entry.epss (0-1, may be missing): chance of exploitation activity in the next 30 days
 *   - entry.ransomware: CISA knows of ransomware campaigns using it
 *   - entry.dateAdded / entry.dueDate (YYYY-MM-DD): how fresh it is, how close the deadline is
 *   - newsMentions: how many articles in the user's feeds mention the CVE (attention right now)
 *
 * TODO(you): shape this ranking. The default below only looks at EPSS.
 */
export function patchPriority(entry: KevEntry, newsMentions: number): number {
  void newsMentions;
  return entry.epss ?? 0;
}

export const nvdUrl =(cve: string) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`;
