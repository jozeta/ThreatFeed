export interface Feed {
  id: string;
  name: string;
  url: string;
  category: string;
  tags: string[];
  enabled: boolean;
  isCustom?: boolean;
}

export type FeedHealthStatus = 
  | 'healthy' 
  | 'cors_error' 
  | 'proxy_unreachable'
  | 'invalid_xml' 
  | 'network_error' 
  | 'timeout' 
  | 'http_error';

export interface FeedHealth {
  feedId: string;
  status: FeedHealthStatus;
  lastFetchedAt?: string;
  lastSuccessAt?: string;
  articleCount: number;
  errorMessage?: string;
  httpStatus?: number;
  latencyMs?: number;
  gatewayUsed?: string;
  rawSnippet?: string;
  attemptedGateways?: string[];
  consecutiveFailures?: number; // failed refreshes in a row; drives the backoff for dead feeds
}

export interface Article {
  id: string;
  guid?: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  description?: string;
  content?: string;
  image?: string;
  author?: string;
  publishedAt: string;
  fetchedAt?: string;
  tags: string[];
  categories: string[];
  customTags?: string[];
  read: boolean;
  viewed: boolean;
  bookmarked: boolean;
  viewedAt?: string;
  readAt?: string;
  bookmarkedAt?: string;
  bookmarkFolder?: string;
  bookmarkNotes?: string;
  cves?: string[];
  severity?: ThreatSeverity;
  severityScore?: number;
}

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Exploitation intelligence for one CVE (from the snapshot: CISA KEV + FIRST EPSS) */
/** A victim posted on a ransomware leak site (via the Ransomware.live API, built into the snapshot) */
export interface LeakSiteVictim {
  id: string;
  victim: string;
  group: string;
  country?: string; // ISO 3166-1 alpha-2
  sector?: string;
  discoveredAt: string;
  attackedAt?: string;
  domain?: string;
  description?: string;
  url?: string; // the ransomware.live page; never the leak site itself
}

export interface RansomwareGroupProfile {
  name: string;
  description?: string;
  url: string;
}

/** A verified breach from Have I Been Pwned */
export interface BreachRecord {
  name: string;
  title: string;
  domain?: string;
  breachDate: string;
  addedAt: string;
  records: number;
  dataClasses: string[];
  verified: boolean;
  description?: string;
}

export interface IncidentData {
  updatedAt: string;
  victims: LeakSiteVictim[];
  groups: Record<string, RansomwareGroupProfile>;
  breaches: BreachRecord[];
}

export interface CveIntel {
  kev: boolean;
  kevDateAdded?: string;
  kevRansomware?: boolean;
  kevName?: string;
  epss?: number; // probability of exploitation in the next 30 days, 0-1
  percentile?: number;
}

/** One entry of the CISA Known Exploited Vulnerabilities catalog */
export interface KevEntry {
  cve: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string; // YYYY-MM-DD
  dueDate?: string; // federal remediation deadline, YYYY-MM-DD
  ransomware: boolean; // known use in ransomware campaigns
  cwes: string[];
  description?: string;
  epss?: number;
  percentile?: number;
  cvss?: number; // CVSS base score from NVD (v3.x preferred)
  published?: string; // when the CVE was published (NVD), for time-to-KEV
  vector?: string; // CVSS vector, e.g. CVSS:3.1/AV:N/AC:L/PR:N/UI:N/…
  ssvc?: SsvcDecision;
  products?: string[]; // affected "vendor product" pairs from NVD (CPE / CNA data)
}

/** CISA's SSVC decision points (from CISA Vulnrichment, carried in NVD records) */
export interface SsvcDecision {
  exploitation?: 'none' | 'poc' | 'active';
  automatable?: 'yes' | 'no';
  impact?: 'partial' | 'total';
}

/** Public exploit code and detection templates known for a CVE */
export interface ExploitInfo {
  msf?: string[]; // Metasploit module paths, e.g. exploit/linux/http/foo_rce
  nuclei?: string; // Nuclei template path
  pocs?: number; // GitHub proof-of-concept repositories (PoC-in-GitHub)
  pocUrls?: string[]; // up to three of them
}

export type CvssSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** A newly published CVE from NVD (only the notable ones are stored individually) */
export interface CveRecord {
  id: string;
  published: string;
  score?: number;
  severity?: CvssSeverity;
  cwe?: string;
  assigner?: string;
  description?: string;
  epss?: number;
  vector?: string;
  ssvc?: SsvcDecision;
  products?: string[];
}

export interface CveDayCount {
  date: string; // YYYY-MM-DD
  critical: number;
  high: number;
  medium: number;
  low: number;
  unscored: number;
}

/** Aggregates over every CVE NVD published in the window, computed server-side */
export interface NvdStats {
  from: string;
  to: string;
  total: number;
  daily: CveDayCount[];
  cwes: [string, number][];
  assigners: [string, number][];
  attackVectors?: [string, number][]; // NETWORK / ADJACENT / LOCAL / PHYSICAL / unknown
  remoteNoAuth?: number; // network, no privileges, no user interaction
  ssvcExploitation?: [string, number][]; // active / poc / none, where CISA has assessed
}

/** A reviewed GitHub Security Advisory (open-source packages) */
export interface OssAdvisory {
  id: string; // GHSA-xxxx
  cve?: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  publishedAt: string;
  ecosystem?: string;
  package?: string;
  url: string;
}

export interface EpssScore {
  cve: string;
  epss: number;
  percentile: number;
}

/** How one external data source fared in the last snapshot run (shown in Feed Health) */
export interface DataSourceStatus {
  id: string;
  label: string;
  status: 'ok' | 'cached' | 'failed'; // cached: the fetch failed or was skipped, previous data was reused
  detail?: string;
  count?: number;
}

export interface VulnData {
  updatedAt: string;
  generatedAt?: string; // the snapshot run that produced it (data/vulns.json is published alongside the snapshot)
  kev: KevEntry[]; // the whole catalog
  nvd: NvdStats | null;
  notable: CveRecord[]; // critical (CVSS >= 9) CVEs from the NVD window
  watchable?: CveRecord[]; // CVSS 7–8.9 CVEs from the NVD window, no descriptions (alert rules)
  advisories: OssAdvisory[];
  epssTop: EpssScore[]; // highest exploitation probability across all CVEs
  exploits?: Record<string, ExploitInfo>; // for the CVEs above
  cweNames?: Record<string, string>; // names for the CWEs above
  cveGroups?: Record<string, string[]>; // ransomware groups known to exploit a CVE
}

/** One publicly reported attack (press, breach notification) from Ransomware.live */
export interface PublicAttack {
  id: string;
  victim: string;
  domain?: string;
  country?: string;
  date?: string; // when it happened, if known
  added: string; // when Ransomware.live recorded it
  summary?: string;
  sourceUrl?: string; // the article or notice
  group?: string; // claiming ransomware group, if any
  link?: string; // the Ransomware.live page
}

export interface GroupTactic {
  id: string;
  name: string;
  techniques: { id: string; name: string; details?: string }[];
}

/** Everything known about a ransomware group beyond its victims (data/ransomware.json) */
export interface GroupIntel {
  name: string;
  firstSeen?: string;
  altNames?: string[];
  description?: string;
  ttps?: GroupTactic[];
  tools?: Record<string, string[]>; // by category, e.g. CredentialTheft: [Mimikatz]
  detailFetchedAt?: string;
  attack?: { id: string; name: string; url: string; aliases: string[]; techniques: { id: string; name: string }[]; software: string[] };
  cves?: { cve: string; source: 'ransomware.live' | 'cisa' | 'news'; articles?: number }[];
  payments?: { totalUsd: number; transactions: number; byYear: Record<string, number> };
  leakSites?: { total: number; online: number; types: Record<string, number> }; // counts only, never addresses
  attribution?: string[]; // e.g. Microsoft's "Storm-1567" (Malpedia)
  references?: string[]; // research write-ups (Malpedia)
  malpediaUrl?: string;
  advisories?: { title: string; url: string; date: string }[]; // CISA #StopRansomware
}

export interface PaymentFamily {
  family: string;
  totalUsd: number;
  transactions: number;
  byYear: Record<string, number>;
}

export interface RansomwareIntel {
  updatedAt: string;
  generatedAt?: string;
  groups: Record<string, GroupIntel>; // keyed by lowercase group name
  attacks: PublicAttack[]; // publicly reported attacks, last 90 days
  payments: { updatedAt: string; families: PaymentFamily[] } | null; // Ransomwhere
  sourceUpdates?: Record<string, string>; // when slow-changing sources were last refreshed
}

/** One Patch Tuesday release from Microsoft's CVRF API (data/msrc.json) */
export interface PatchCve {
  cve: string;
  title: string;
  severity?: 'Critical' | 'Important' | 'Moderate' | 'Low'; // highest across the affected products
  impact?: string; // e.g. 'Remote Code Execution'
  cvss?: number; // highest base score across the affected products
  exploited: boolean; // "Exploited:Yes" in Microsoft's exploitability assessment
  publiclyDisclosed: boolean;
  products: string[]; // every affected product name (the UI lists five), architecture/install variants merged
  kb?: string[]; // e.g. KB5126836
}

export interface PatchMonth {
  id: string; // e.g. 2026-Oct
  title: string; // e.g. October 2026 Security Updates
  released: string;
  cves: PatchCve[];
}

export interface MsrcData {
  generatedAt?: string;
  months: PatchMonth[]; // newest first
  updates?: Record<string, string>; // when each month's document was last fetched, for the snapshot's carry-over
  attempts?: Record<string, string>; // when a refetch of a month last failed, so the snapshot spaces its retries
}

/** A threat actor from MITRE ATT&CK (data/actors.json) */
export interface ActorProfile {
  id: string; // ATT&CK group ID, e.g. G0007
  name: string;
  aliases: string[];
  description: string; // first paragraph, links and citations stripped
  country?: string; // ISO 3166-1 alpha-2, only when the description clearly attributes the group
  firstSeen?: string; // e.g. "2004", from "active since at least 2004"
  techniques: { id: string; name: string }[]; // max 40, by ID
  software: { id: string; name: string }[]; // ATT&CK software IDs (MalwareProfile.attackId)
  url: string; // attack.mitre.org
}

/** A malware family or tool: ATT&CK software merged with Malpedia (data/actors.json) */
export interface MalwareProfile {
  id: string; // URL slug, e.g. cobalt-strike
  name: string;
  aliases: string[];
  description: string;
  kind: 'malware' | 'tool';
  attackId?: string; // e.g. S0154
  actors: string[]; // names of groups using it (ATT&CK) or it is attributed to (Malpedia)
  malpediaUrl?: string;
  url?: string; // attack.mitre.org
}

export interface ActorsData {
  generatedAt?: string;
  actors: ActorProfile[];
  malware: MalwareProfile[];
  updates?: Record<string, string>; // when actors and malware were last built, for the snapshot's carry-over
}

/** The names text is linked by (data/entities.json): each opens its detail panel */
export interface EntitiesData {
  generatedAt?: string;
  vendors: string[]; // KEV vendors, canonical names
  groups: { key: string; name: string; aliases: string[] }[]; // ransomware groups, keyed like leak-site victims (lowercase)
  actors: { id: string; name: string; aliases: string[] }[];
  malware: { id: string; name: string; aliases: string[] }[];
}

/** Per UTC day (YYYY-MM-DD): articles mentioning each entity, keyed `${kind}:${name}` (data/trends.json) */
export type TrendDays = Record<string, Record<string, number>>;

export interface TrendsData {
  generatedAt?: string;
  days: TrendDays; // the last 60 days
  weeks?: TrendDays; // older days summed per Monday-to-Sunday week (keyed by the Monday), two years back
}

export type IOCType ='cve' | 'ipv4' | 'hash_md5' | 'hash_sha1' | 'hash_sha256' | 'mitre';

export interface ExtractedIOC {
  type: IOCType;
  value: string;
}

export interface NewspaperSectionConfig {
  id: string;
  title: string;
  category?: string;
  minSeverity?: ThreatSeverity;
  enabled: boolean;
  order: number;
}

export interface StoryCluster {
  id: string;
  primaryArticle: Article;
  relatedArticles: Article[];
  sharedCVEs: string[];
  clusterSize: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type LayoutMode = 'newspaper' | 'list' | 'list-thumbnails';
export type ArticleSpacing = 'compact' | 'comfortable' | 'spacious';
export type BorderStyle = 'none' | 'subtle' | 'strong';
export type ImageBehavior = 'large' | 'normal' | 'compact' | 'hidden';
export type ContentDensity = 'compact' | 'normal' | 'spacious';
export type AutoRefreshInterval = 0 | 15 | 30 | 60 | 180; // in minutes (0 = manual only)
export type ProxyMode = 'corsfix' | 'rss2json' | 'allorigins' | 'direct' | 'custom';

export type FontFamily = 'serif' | 'sans' | 'mono' | 'system';
export type ContainerWidth = 'compact' | 'standard' | 'wide' | 'full';

export interface UserSettings {
  theme: ThemeMode;
  layout: LayoutMode;
  fontFamily: FontFamily;
  containerWidth: ContainerWidth;
  spacing: ArticleSpacing;
  borderStyle: BorderStyle;
  imageBehavior: ImageBehavior;
  contentDensity: ContentDensity;
  accentColor: string; // hex color
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  headlineScale: 'normal' | 'prominent' | 'dramatic';
  autoRefreshMinutes: AutoRefreshInterval;
  proxyMode: ProxyMode;
  customProxyUrl?: string;
  hideReadArticles: boolean;
  reducedMotion: boolean;
  maxArticlesPerFeed: number; // default: 25 (0 = unlimited)
  maxArticleAgeDays: number; // default: 30 (0 = unlimited)
  autoRefreshFeedCooldownHours: number; // default: 4 (hours: 0, 2, 4, 6, 12, 24)
  watchlistKeywords: string[];
  watchlistDefaultsVersion?: number; // which default keyword set the user has received
  dataSource: 'snapshot' | 'live'; // snapshot: load the server-built snapshot, live-fetch only feeds it doesn't cover
  /** @deprecated read once by migrateAlertRules */
  watchlistNotifications: boolean; // desktop notification when new articles match the watchlist
  stackKeywords: string[]; // products/vendors the user runs; matching articles get a "Relevant to you" boost
  mutedKeywords: string[]; // articles mentioning these are hidden everywhere (except bookmarks)
  frontPageHiddenCategories: string[]; // categories left off the newspaper front page
  savedSearches: string[];
  hiddenVulnVendors: string[]; // KEV vendors left off the Vulnerabilities page
  watchedCves: string[]; // CVEs the user follows: alerts on KEV listing, EPSS jumps and new coverage
  newspaperSections: NewspaperSectionConfig[];
  bookmarkFolders: string[];
  clusteringEnabled: boolean;
  sectionsEnabled: boolean;
  alertRules: AlertRule[];
  alertGapHours: number; // minimum hours between desktop notifications
}

export interface FilterState {
  searchQuery: string;
  selectedCategory: string | null;
  selectedSourceId: string | null;
  selectedTag: string | null;
  readStatus: 'all' | 'unread' | 'read';
  viewedStatus: 'all' | 'viewed' | 'unviewed';
  bookmarkedOnly: boolean;
  watchlistOnly?: boolean;
  severityFilter?: ThreatSeverity | 'all';
  dateRange: 'all' | 'today' | 'week' | 'month';
  sortBy: 'newest' | 'oldest' | 'recently_read' | 'recently_viewed' | 'severity' | 'relevance';
}

export type ActiveNavTab = 'newspaper' | 'latest' | 'unread' | 'briefing' | 'feed' | 'ransomware' | 'vulnerabilities' | 'bookmarks' | 'sources' | 'health' | 'settings';

export type AlertRuleKind = 'news' | 'vulns';
export type BuiltInRule = 'watchlist' | 'stack-news' | 'stack-vulns' | 'watched-cves';
export type NewsCondition =
  | { field: 'keyword'; values: string[] } // checkWatchlistMatch semantics
  | { field: 'vendor'; values: string[] } // containsTerm on title + description
  | { field: 'severity'; min: ThreatSeverity }
  | { field: 'category' | 'source' | 'tag'; values: string[] } // category = the feed's category; source = feed id
  | { field: 'hasCve' }
  | { field: 'cveMatchesVulnRule' };
export type VulnCondition =
  | { field: 'vendor'; values: string[] } // containsTerm on vendor, product, name, products
  | { field: 'cvss' | 'epss'; min: number } // epss as 0–1
  | { field: 'kev' | 'activelyExploited' | 'publicExploit' | 'ransomware' | 'remoteNoAuth' | 'newCve' }
  | { field: 'kevAddedWithinDays'; days: number }
  | { field: 'cwe' | 'cve'; values: string[] }
  | { field: 'watched' }; // the live watchedCves list; event-driven
export interface ConditionGroup<C> { op: 'all' | 'any'; items: (C | ConditionGroup<C>)[] }
export interface AlertRule {
  id: string; name: string; kind: AlertRuleKind; enabled: boolean; notify: boolean;
  root: ConditionGroup<NewsCondition> | ConditionGroup<VulnCondition>;
  builtIn?: BuiltInRule; createdAt: string; updatedAt: string;
}
