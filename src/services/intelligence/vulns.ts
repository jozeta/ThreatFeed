import { CveDayCount, CveRecord, CvssSeverity, KevEntry, NvdStats, OssAdvisory } from '../../types';

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

/** One `cve` object from the NVD 2.0 API */
export function normalizeNvdCve(cve: any): CveRecord | null {
  if (!cve || typeof cve.id !== 'string' || !isDate(cve.published)) return null;
  let score: number | undefined;
  for (const key of METRIC_ORDER) {
    const metrics: any[] = Array.isArray(cve.metrics?.[key]) ? cve.metrics[key] : [];
    const best = metrics.find(m => m.type === 'Primary') || metrics[0];
    if (best && typeof best.cvssData?.baseScore === 'number') {
      score = best.cvssData.baseScore;
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
  };
}

/** Per-day severity counts plus top CWEs and CNAs over every CVE in the window */
export function summarizeNvd(records: CveRecord[], from: Date, to: Date): NvdStats {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const daily: CveDayCount[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    critical: 0, high: 0, medium: 0, low: 0, unscored: 0,
  }));
  const byDate = new Map(daily.map(d => [d.date, d]));
  const cwes = new Map<string, number>();
  const assigners = new Map<string, number>();
  for (const r of records) {
    const day = byDate.get(r.published.slice(0, 10));
    if (day) day[(r.severity?.toLowerCase() ?? 'unscored') as keyof Omit<CveDayCount, 'date'>]++;
    if (r.cwe && r.cwe !== 'CWE-Other') cwes.set(r.cwe, (cwes.get(r.cwe) || 0) + 1);
    if (r.assigner) assigners.set(r.assigner, (assigners.get(r.assigner) || 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  return { from: from.toISOString(), to: to.toISOString(), total: records.length, daily, cwes: top(cwes), assigners: top(assigners) };
}

const OSS_SEVERITIES = ['critical', 'high', 'medium', 'low'];

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
