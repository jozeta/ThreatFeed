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
  tags: string[];
  categories: string[];
  customTags?: string[];
  read: boolean;
  viewed: boolean;
  bookmarked: boolean;
  viewedAt?: string;
  readAt?: string;
  bookmarkedAt?: string;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type LayoutMode = 'newspaper' | 'list' | 'list-thumbnails';
export type ArticleSpacing = 'compact' | 'comfortable' | 'spacious';
export type BorderStyle = 'none' | 'subtle' | 'strong';
export type ImageBehavior = 'large' | 'normal' | 'compact' | 'hidden';
export type ContentDensity = 'compact' | 'normal' | 'spacious';
export type AutoRefreshInterval = 0 | 15 | 30 | 60 | 180; // in minutes (0 = manual only)
export type ProxyMode = 'allorigins' | 'direct' | 'custom';

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
}

export interface FilterState {
  searchQuery: string;
  selectedCategory: string | null;
  selectedSourceId: string | null;
  selectedTag: string | null;
  readStatus: 'all' | 'unread' | 'read';
  viewedStatus: 'all' | 'viewed' | 'unviewed';
  bookmarkedOnly: boolean;
  dateRange: 'all' | 'today' | 'week' | 'month';
  sortBy: 'newest' | 'oldest' | 'recently_read' | 'recently_viewed';
}

export type ActiveNavTab = 'newspaper' | 'latest' | 'unread' | 'bookmarks' | 'sources' | 'health' | 'settings';
