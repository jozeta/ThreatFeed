import { Article, CveRecord, KevEntry, MsrcData, VulnData } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { hasPublicExploit } from './enrichment';
import { CVSS_BANDS, CvssBandId, cvssBand, kevPerMonth } from './vulns';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_CVE_DAYS = 14;

// Legal names (NVD, Wikipedia, press releases) for vendors the KEV catalog spells the short way
const ALIASES: Record<string, string> = { 'microsoft corporation': 'Microsoft', 'apple inc.': 'Apple', 'google llc': 'Google' };

export const canonicalVendor = (name: string) => {
  const trimmed = name.trim();
  return ALIASES[trimmed.toLowerCase()] ?? trimmed;
};

export interface VendorSummary {
  name: string;
  kevVendor?: string; // the catalog's spelling (KEV filter, hidden vendors), when it lists the vendor by name
  kevTotal: number;
  kevLast30: number;
  kevLast90: number;
  ransomwareLinked: number;
  avgCvss?: number;
  maxCvss?: number;
  kevPerMonth: { month: string; total: number; ransomware: number }[]; // last 12 months, oldest first
  cvssBands: { id: CvssBandId; label: string; count: number }[];
  topProducts: { product: string; vendor: string; count: number }[]; // max 8
  recentKev: KevEntry[]; // newest 10
  newCves: CveRecord[]; // CVSS >= 7 published in the last 14 days, newest first
  exploitsPublic: number; // of the KEV entries and new CVEs above
  newsMentions: Article[]; // newest first, advisory feeds left out
  advisoryFeedArticles: Article[]; // from feeds named after the vendor (e.g. Fortinet PSIRT), newest first
  patchTuesday?: { id: string; title: string; released: string; total: number; critical: number; exploited: number; disclosed: number; rce: number };
}

const newestFirst = (a: Article, b: Article) => b.publishedAt.localeCompare(a.publishedAt);

/**
 * Everything the vendor panel shows, from data already loaded: the KEV catalog (vendor name in any case, or
 * NVD's affected products), recent critical/high CVEs, news coverage and, for Microsoft, Patch Tuesday.
 */
export function vendorSummary(rawName: string, vulns: VulnData | null, articles: Article[], msrc?: MsrcData | null, now = new Date()): VendorSummary {
  const name = canonicalVendor(rawName);
  const key = name.toLowerCase();
  // NVD products are "vendor product" pairs: the vendor has to lead, or "Linux" would claim "debian debian linux"
  const productsMatch = (products: string[] | undefined) => (products ?? []).some((p) => containsTerm(p.slice(0, name.length + 1), name));
  const day = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);

  const byVendor = (k: KevEntry) => canonicalVendor(k.vendor).toLowerCase() === key;
  const kev = (vulns?.kev ?? []).filter((k) => byVendor(k) || productsMatch(k.products)).sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));

  // The most common catalog spelling, so filters and the hidden-vendor list use the exact string KEV has
  const spellings = new Map<string, number>();
  for (const k of kev) if (byVendor(k)) spellings.set(k.vendor, (spellings.get(k.vendor) ?? 0) + 1);
  const kevVendor = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const scores = kev.map((k) => k.cvss).filter((s): s is number => typeof s === 'number');
  const bandCounts = new Map<CvssBandId, number>();
  for (const k of kev) bandCounts.set(cvssBand(k.cvss), (bandCounts.get(cvssBand(k.cvss)) ?? 0) + 1);

  const products = new Map<string, { product: string; vendor: string; count: number }>();
  for (const k of kev) {
    const id = `${k.vendor} ${k.product}`;
    const entry = products.get(id) ?? { product: k.product, vendor: k.vendor, count: 0 };
    entry.count++;
    products.set(id, entry);
  }

  const since = new Date(now.getTime() - NEW_CVE_DAYS * DAY_MS).toISOString();
  const kevIds = new Set(kev.map((k) => k.cve));
  const newCves = [...(vulns?.notable ?? []), ...(vulns?.watchable ?? [])]
    .filter((c) => c.published >= since && !kevIds.has(c.id) && productsMatch(c.products))
    .sort((a, b) => b.published.localeCompare(a.published));
  const exploits = vulns?.exploits ?? {};

  const isAdvisoryFeed = (a: Article) => containsTerm(`${a.sourceName} ${a.sourceId}`, name);
  const advisoryFeedArticles = articles.filter(isAdvisoryFeed).sort(newestFirst);
  const newsMentions = articles.filter((a) => !isAdvisoryFeed(a) && containsTerm(`${a.title} ${a.description ?? ''}`, name)).sort(newestFirst);

  const month = key === 'microsoft' ? msrc?.months[0] : undefined;
  const count = (test: (c: NonNullable<typeof month>['cves'][number]) => boolean) => month?.cves.filter(test).length ?? 0;

  return {
    name,
    kevVendor,
    kevTotal: kev.length,
    kevLast30: kev.filter((k) => k.dateAdded >= day(30)).length,
    kevLast90: kev.filter((k) => k.dateAdded >= day(90)).length,
    ransomwareLinked: kev.filter((k) => k.ransomware).length,
    avgCvss: scores.length ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10 : undefined,
    maxCvss: scores.length ? Math.max(...scores) : undefined,
    kevPerMonth: kevPerMonth(kev, 12, now),
    cvssBands: CVSS_BANDS.map((b) => ({ id: b.id, label: b.label, count: bandCounts.get(b.id) ?? 0 })),
    topProducts: [...products.values()].sort((a, b) => b.count - a.count || a.product.localeCompare(b.product)).slice(0, 8),
    recentKev: kev.slice(0, 10),
    newCves,
    exploitsPublic: [...kev.map((k) => k.cve), ...newCves.map((c) => c.id)].filter((id) => hasPublicExploit(exploits[id])).length,
    newsMentions,
    advisoryFeedArticles,
    patchTuesday: month && {
      id: month.id,
      title: month.title.replace(/ Security Updates$/, ''),
      released: month.released.slice(0, 10),
      total: month.cves.length,
      critical: count((c) => c.severity === 'Critical'),
      exploited: count((c) => c.exploited),
      disclosed: count((c) => c.publiclyDisclosed),
      rce: count((c) => c.impact === 'Remote Code Execution'),
    },
  };
}

// ---------- Wikipedia ----------

// KEV vendors whose plain name is a different article (the fruit, the prophet, the building material…)
const WIKI_TITLES: Record<string, string> = {
  apple: 'Apple Inc.', oracle: 'Oracle Corporation', apache: 'The Apache Software Foundation', adobe: 'Adobe Inc.',
  progress: 'Progress Software', arm: 'Arm Holdings', f5: 'F5, Inc.', juniper: 'Juniper Networks', jenkins: 'Jenkins (software)',
  plex: 'Plex Inc.', zoho: 'Zoho Corporation', mitel: 'Mitel', 'check point': 'Check Point', 'red hat': 'Red Hat',
};

export const wikiTitle = (vendor: string) => {
  const name = canonicalVendor(vendor);
  return (WIKI_TITLES[name.toLowerCase()] ?? name).replace(/ /g, '_');
};

// A plain-name lookup can still land on an unrelated article; anything that doesn't read like a company,
// product or project is left out rather than shown on a vendor page
const TECH_WORDS = /compan|corporat|conglomerat|software|technolog|manufactur|vendor|developer|organi[sz]ation|foundation|project|brand|firm|enterprise|business|subsidiar|operating system|network|computer|electronic|internet|browser|security|semiconductor|telecom|cloud|hardware|platform|open[- ]source/i;

export interface WikiSummary {
  title: string;
  description?: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

const WIKIMEDIA_IMAGE = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;

/** The REST summary, reduced to plain text and URLs that point at Wikipedia/Wikimedia */
export function parseWikiSummary(raw: any): WikiSummary | null {
  if (!raw || raw.type !== 'standard' || typeof raw.title !== 'string' || typeof raw.extract !== 'string' || !raw.extract.trim()) return null;
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  if (!TECH_WORDS.test(`${description ?? ''} ${raw.extract.slice(0, 300)}`)) return null;
  const thumb = raw.thumbnail?.source;
  const page = raw.content_urls?.desktop?.page;
  return {
    title: raw.title,
    description,
    extract: raw.extract.trim(),
    thumbnail: typeof thumb === 'string' && WIKIMEDIA_IMAGE.test(thumb) ? thumb : undefined,
    url: typeof page === 'string' && page.startsWith('https://en.wikipedia.org/wiki/') ? page : `https://en.wikipedia.org/wiki/${encodeURIComponent(raw.title.replace(/ /g, '_'))}`,
  };
}

const wikiCache = new Map<string, Promise<WikiSummary | null>>();

/** Fetched once per vendor per session; a 404, an unrelated page or a network error all mean "no summary" */
export function fetchWikiSummary(vendor: string): Promise<WikiSummary | null> {
  const title = wikiTitle(vendor);
  let pending = wikiCache.get(title);
  if (!pending) {
    pending = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(parseWikiSummary)
      .catch(() => {
        wikiCache.delete(title); // offline: try again next time the panel opens
        return null;
      });
    wikiCache.set(title, pending);
  }
  return pending;
}
