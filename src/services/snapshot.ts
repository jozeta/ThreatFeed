import { ActorsData, Article, CveIntel, DataSourceStatus, FeedHealth, IncidentData, MsrcData, RansomwareIntel, TrendsData, VulnData } from '../types';
import { decodeWatchable } from './intelligence/vulns';
import { decodeMsrc } from './intelligence/patchTuesday';
import { decodeActors } from './intelligence/actors';
import { decodeTrends } from './intelligence/trends';

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
    // Malformed months and CVE entries are dropped, so the tab can't throw on them
    const data = decodeMsrc(await res.json());
    return data && { generatedAt: data.generatedAt, months: data.months };
  } catch {
    return null;
  }
}

/** Loads data/actors.json (threat actor and malware profiles) for the actor and malware panels and trending chips */
export async function loadActors(): Promise<ActorsData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/actors.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    // Malformed entries are dropped, so the page and panels can't throw on them
    const data = decodeActors(await res.json());
    return data && { generatedAt: data.generatedAt, actors: data.actors, malware: data.malware };
  } catch {
    return null;
  }
}

/** Loads data/trends.json (daily mention counts, with older days rolled up into weeks over 730 days) for the detail panels' mention history */
export async function loadTrends(): Promise<TrendsData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/trends.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    // Malformed days and counts are dropped, so the page can't throw on them
    return decodeTrends(await res.json());
  } catch {
    return null;
  }
}
