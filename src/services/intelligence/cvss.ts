export interface CvssInfo {
  score: number;
  severity: string;
  version: string;
}

// NVD allows ~5 unauthenticated requests per 30s, so lookups happen on demand (hover) and are cached.
const STORAGE_KEY = 'threatfeed-cvss-cache';
const MAX_ENTRIES = 500;
const memory = new Map<string, CvssInfo | null>();
const inFlight = new Map<string, Promise<CvssInfo | null>>();

function loadCache(): Record<string, CvssInfo | null> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persist(cve: string, info: CvssInfo | null) {
  try {
    const cache = loadCache();
    cache[cve] = info;
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete cache[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage may be unavailable (private mode); the in-memory cache still works
  }
}

export function cachedCvss(cve: string): CvssInfo | null | undefined {
  if (memory.has(cve)) return memory.get(cve);
  const stored = loadCache()[cve];
  if (stored !== undefined) memory.set(cve, stored);
  return stored;
}

/** Fetches the CVSS base score for a CVE from NVD (newest metric version available). null = not scored yet. */
export function fetchCvss(cve: string): Promise<CvssInfo | null> {
  const cached = cachedCvss(cve);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inFlight.get(cve);
  if (pending) return pending;

  const request = fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cve)}`)
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(data => {
      const metrics = data?.vulnerabilities?.[0]?.cve?.metrics || {};
      const entry = metrics.cvssMetricV40?.[0] || metrics.cvssMetricV31?.[0] || metrics.cvssMetricV30?.[0] || metrics.cvssMetricV2?.[0];
      const info: CvssInfo | null = entry
        ? { score: entry.cvssData.baseScore, severity: entry.cvssData.baseSeverity || entry.baseSeverity || '', version: entry.cvssData.version }
        : null;
      memory.set(cve, info);
      persist(cve, info);
      return info;
    })
    .catch(() => null) // rate-limited or offline: don't cache, try again on the next hover
    .finally(() => inFlight.delete(cve));
  inFlight.set(cve, request);
  return request;
}
