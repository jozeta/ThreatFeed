import { Article, CveIntel, DataSourceStatus, FeedHealth, IncidentData, MsrcData, RansomwareIntel, VulnData } from '../types';
import { decodeWatchable } from './intelligence/vulns';

export interface FeedSnapshot {
  generatedAt: string;
  feedHealth: Record<string, FeedHealth>;
  cveIntel: Record<string, CveIntel>;
  incidents: IncidentData | null; // absent in snapshots built before incident data existed
  sources: DataSourceStatus[]; // how each external data source fared in that run
  articles: Article[];
}

/**
 * Loads the server-side snapshot published with the site (see scripts/build-snapshot.ts).
 * Returns null when there is none (local dev without `npm run snapshot`) or it's malformed,
 * in which case the caller falls back to fetching feeds live.
 */
export async function loadSnapshot(): Promise<FeedSnapshot | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.articles) || typeof data.feedHealth !== 'object') return null;
    return {
      generatedAt: String(data.generatedAt),
      feedHealth: data.feedHealth,
      cveIntel: data.cveIntel && typeof data.cveIntel === 'object' ? data.cveIntel : {},
      incidents: data.incidents && Array.isArray(data.incidents.victims) && Array.isArray(data.incidents.breaches) ? data.incidents : null,
      sources: Array.isArray(data.sources) ? data.sources.filter((x: any) => x && typeof x.id === 'string' && typeof x.label === 'string') : [],
      articles: data.articles,
    };
  } catch {
    return null;
  }
}

/**
 * Loads data/vulns.json (KEV catalog, recent NVD CVEs, GitHub advisories, top EPSS), published next to
 * the snapshot but fetched separately: only the views that use it ask for it.
 */
export async function loadVulnData(): Promise<VulnData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/vulns.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.kev) || !Array.isArray(data.notable) || !Array.isArray(data.advisories) || !Array.isArray(data.epssTop)) return null;
    return { ...data, watchable: decodeWatchable(data.watchable) } as VulnData;
  } catch {
    return null;
  }
}

/** Loads data/ransomware.json (group profiles, ATT&CK, linked CVEs, public reports, payments) for the Ransomware page */
export async function loadRansomwareIntel(): Promise<RansomwareIntel | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/ransomware.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.groups !== 'object' || !Array.isArray(data.attacks)) return null;
    return data as RansomwareIntel;
  } catch {
    return null;
  }
}

/** Loads data/msrc.json (the latest Patch Tuesday releases) for the Vulnerabilities page's Patch Tuesday tab */
export async function loadMsrc(): Promise<MsrcData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/msrc.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.months)) return null;
    return { generatedAt: data.generatedAt, months: data.months.filter((m: any) => m && typeof m.id === 'string' && Array.isArray(m.cves)) };
  } catch {
    return null;
  }
}
