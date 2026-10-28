import { Article, Feed } from '../types';

export const feed = (overrides: Partial<Feed> = {}): Feed => ({
  id: 'test-feed',
  name: 'Test Feed',
  url: 'https://example.com/feed',
  category: 'Security News',
  tags: [],
  enabled: true,
  ...overrides,
});

export const article = (id: string, overrides: Partial<Article> = {}): Article => ({
  id,
  title: `Article ${id}`,
  url: `https://example.com/${id}`,
  sourceId: 'test-feed',
  sourceName: 'Test Feed',
  publishedAt: new Date().toISOString(),
  tags: [],
  categories: [],
  read: false,
  viewed: false,
  bookmarked: false,
  ...overrides,
});

export const rssItem = (title: string, description: string, categories: string[] = [], pubDate = new Date()) =>
  `<item><title>${title}</title><link>https://example.com/${encodeURIComponent(title)}</link><guid>${title}</guid>` +
  `<pubDate>${pubDate.toUTCString()}</pubDate><description>${description}</description>` +
  categories.map(c => `<category>${c}</category>`).join('') + '</item>';

export const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
