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

export type IOCType = 'cve' | 'ipv4' | 'hash_md5' | 'hash_sha1' | 'hash_sha256' | 'mitre';

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
  newspaperSections: NewspaperSectionConfig[];
  bookmarkFolders: string[];
  clusteringEnabled: boolean;
  sectionsEnabled: boolean;
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
  sortBy: 'newest' | 'oldest' | 'recently_read' | 'recently_viewed' | 'severity';
}

export type ActiveNavTab = 'newspaper' | 'latest' | 'unread' | 'bookmarks' | 'sources' | 'health' | 'settings';
