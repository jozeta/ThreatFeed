import { Article, CveIntel, Feed } from '../../types';
import { normalizeAndEnrichTags } from './tagNormalizer';
import { sanitizeHtml, stripHtmlToText } from './sanitizer';
import { extractCVEs, calculateThreatSeverity } from '../intelligence/iocExtractor';

// Fast stable hash function for fallback IDs
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    // Strip common tracking parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(param => {
      url.searchParams.delete(param);
    });
    // Article links end up in hrefs and window.open, so only http(s) is allowed through
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Remove trailing slash for normalization consistency
    return url.origin + url.pathname.replace(/\/$/, '') + (url.search || '') + (url.hash || '');
  } catch {
    return rawUrl.trim();
  }
}

export function generateArticleId(sourceId: string, guid?: string, url?: string, title?: string): string {
  if (guid && guid.trim().length > 3) {
    return `${sourceId}-${simpleHash(guid.trim())}`;
  }
  const target = normalizeUrl(url || '') || (title || '');
  return `${sourceId}-${simpleHash(target)}`;
}

/**
 * Extracts the best image URL from RSS media tags or HTML content.
 */
function extractImageUrl(element: Element, rawHtml: string): string | undefined {
  // 1. media:content or media:thumbnail
  const mediaContent = element.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0] ||
                       element.getElementsByTagName('media:content')[0];
  if (mediaContent && mediaContent.getAttribute('url')) {
    const url = mediaContent.getAttribute('url');
    if (url && (url.includes('http') || url.startsWith('//'))) return url;
  }

  const mediaThumb = element.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0] ||
                     element.getElementsByTagName('media:thumbnail')[0];
  if (mediaThumb && mediaThumb.getAttribute('url')) {
    const url = mediaThumb.getAttribute('url');
    if (url && (url.includes('http') || url.startsWith('//'))) return url;
  }

  // 2. enclosure with image type
  const enclosure = element.getElementsByTagName('enclosure')[0];
  if (enclosure) {
    const type = enclosure.getAttribute('type') || '';
    const url = enclosure.getAttribute('url');
    if (type.startsWith('image/') && url) return url;
  }

  // 3. <img> tag in HTML description or content
  if (rawHtml) {
    const snippet = rawHtml.length > 50000 ? rawHtml.slice(0, 50000) : rawHtml;
    const imgMatch = snippet.match(/<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/i);
    if (imgMatch && imgMatch[1]) {
      // Filter out tracking 1x1 pixels or feedburner beacons
      const url = imgMatch[1];
      if (!url.includes('1x1') && !url.includes('feedburner.com/~r/')) {
        return url;
      }
    }
  }

  return undefined;
}

interface RawFeedItem {
  title: string;
  url: string;
  guid: string;
  author: string;
  publishedAt: string;
  itemCategories: string[];
  summaryHtml: string;
  contentHtml: string;
  image?: string;
}

function feedLevelTags(feed: Feed): string[] {
  return [feed.category, ...(feed.tags || [])].filter(Boolean);
}

/**
 * Tags and severity for an article. Severity only sees the publisher's own item categories;
 * feed-level tags are display-only (see calculateThreatSeverity).
 */
function enrich(
  feed: Feed | undefined,
  sourceId: string,
  title: string,
  summary: string,
  itemCategories: string[],
  cves: string[],
  cveIntel?: Record<string, CveIntel>
) {
  const tags = normalizeAndEnrichTags(itemCategories, title, summary, feed ? feedLevelTags(feed) : []);
  const { severity, score: severityScore } = calculateThreatSeverity({
    title,
    description: summary,
    tags: itemCategories,
    categories: feed?.category ? [feed.category] : [],
    sourceId
  }, cves, cveIntel);
  return { tags, severity, severityScore };
}

/**
 * Shared normalization for RSS, Atom, and rss2json items.
 */
function buildArticle(feed: Feed, raw: RawFeedItem): Article {
  const allCategories = new Set<string>();
  if (feed.category) allCategories.add(feed.category);
  raw.itemCategories.forEach(c => allCategories.add(c));
  (feed.tags || []).forEach(t => allCategories.add(t));

  const cleanTitle = stripHtmlToText(raw.title);
  // The summary is cut to 450 chars below; converting a whole 400 KB description (CISA advisories)
  // to text first costs ~1s per item. 5 KB of HTML is plenty for 450 chars of text.
  const cleanSummary = stripHtmlToText(raw.summaryHtml.slice(0, 5000));
  const sanitizedContent = sanitizeHtml(raw.contentHtml);
  const cves = extractCVEs(`${cleanTitle} ${cleanSummary} ${sanitizedContent}`);
  const { tags, severity, severityScore } = enrich(feed, feed.id, cleanTitle, cleanSummary, raw.itemCategories, cves);

  return {
    id: generateArticleId(feed.id, raw.guid, raw.url, raw.title),
    guid: raw.guid,
    title: cleanTitle,
    url: normalizeUrl(raw.url),
    sourceId: feed.id,
    sourceName: feed.name,
    description: cleanSummary.slice(0, 450),
    content: sanitizedContent,
    image: raw.image,
    author: stripHtmlToText(raw.author),
    publishedAt: raw.publishedAt,
    fetchedAt: new Date().toISOString(),
    tags,
    categories: Array.from(allCategories),
    cves,
    severity,
    severityScore,
    read: false,
    viewed: false,
    bookmarked: false,
  };
}

/**
 * Recomputes tags and severity for an already-stored article (cached or seeded),
 * so scoring changes apply without waiting for every item to be re-fetched.
 */
export function rescoreArticle(article: Article, feed: Feed | undefined, cveIntel?: Record<string, CveIntel>): Article {
  const feedLevel = new Set((feed ? feedLevelTags(feed) : []).map(t => t.toLowerCase()));
  const itemCategories = (article.categories || []).filter(c => !feedLevel.has(c.toLowerCase()));
  const { tags, severity, severityScore } = enrich(
    feed,
    article.sourceId,
    article.title,
    article.description || '',
    itemCategories,
    article.cves || [],
    cveIntel
  );
  return { ...article, tags, severity, severityScore };
}

/**
 * Picks the `maxItems` newest entries by their date element, so huge feeds (e.g. the MSRC
 * update guide, ~5k items) only pay the expensive per-item sanitize/enrich cost for items
 * that survive the per-feed limit anyway. Undated entries sort last.
 */
function newestEntries(entries: Element[], maxItems: number | undefined, dateTags: string[]): Element[] {
  if (!maxItems || entries.length <= maxItems) return entries;
  const dated = entries.map((el, index) => {
    let t = NaN;
    for (const tag of dateTags) {
      const text = el.getElementsByTagName(tag)[0]?.textContent;
      if (text) {
        t = new Date(text.trim()).getTime();
        if (!isNaN(t)) break;
      }
    }
    return { el, index, t: isNaN(t) ? -Infinity : t };
  });
  dated.sort((a, b) => b.t - a.t || a.index - b.index);
  return dated.slice(0, maxItems).map(d => d.el);
}

/**
 * Parses XML text into normalized Article array.
 * Gracefully handles RSS 2.0 and Atom feeds.
 */
export function parseFeedXml(xmlText: string, feed: Feed, maxItems?: number): Article[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check for XML parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML Parse Error: ${parseError.textContent?.slice(0, 100) || 'Malformed XML structure'}`);
  }

  // Well-formed XML that isn't a feed (e.g. a proxy's error document) must not count as an empty feed
  const rootName = xmlDoc.documentElement?.localName?.toLowerCase() || '';
  if (!['rss', 'feed', 'rdf'].includes(rootName)) {
    throw new Error(`Unexpected XML root <${rootName || 'none'}>: not an RSS/Atom feed`);
  }

  const articles: Article[] = [];

  // Check if Atom feed
  const isAtom = rootName === 'feed';

  if (isAtom) {
    const entries = newestEntries(Array.from(xmlDoc.getElementsByTagName('entry')), maxItems, ['published', 'updated']);
    for (const entry of entries) {
      try {
        const article = parseAtomEntry(entry, feed);
        if (article) articles.push(article);
      } catch (err) {
        console.warn(`Error parsing Atom entry for feed ${feed.name}:`, err);
      }
    }
  } else {
    // RSS 2.0 / 0.9x / RDF
    const items = newestEntries(Array.from(xmlDoc.getElementsByTagName('item')), maxItems, ['pubDate', 'dc:date']);
    for (const item of items) {
      try {
        const article = parseRssItem(item, feed);
        if (article) articles.push(article);
      } catch (err) {
        console.warn(`Error parsing RSS item for feed ${feed.name}:`, err);
      }
    }
  }

  return articles;
}

function parseRssItem(item: Element, feed: Feed): Article | null {
  const getTagText = (tagName: string): string => {
    const el = item.getElementsByTagName(tagName)[0];
    return el?.textContent?.trim() || '';
  };

  const getNamespacedText = (ns: string, localName: string): string => {
    const el = item.getElementsByTagNameNS(ns, localName)[0] || item.getElementsByTagName(`${ns}:${localName}`)[0];
    return el?.textContent?.trim() || '';
  };

  const title = getTagText('title') || 'Untitled Security Report';
  let url = getTagText('link');

  // Sometimes link is nested or inside an enclosure
  if (!url) {
    const guidEl = item.getElementsByTagName('guid')[0];
    if (guidEl && guidEl.getAttribute('isPermaLink') !== 'false') {
      url = guidEl.textContent?.trim() || '';
    }
  }

  const guid = getTagText('guid') || url;
  const descriptionRaw = getTagText('description');
  const contentEncoded = getNamespacedText('http://purl.org/rss/1.0/modules/content/', 'encoded') ||
                         getTagText('content:encoded');
  const dcCreator = getNamespacedText('http://purl.org/dc/elements/1.1/', 'creator');
  const author = dcCreator || getTagText('author') || feed.name;

  // Publication date
  const pubDateStr = getTagText('pubDate') ||
                     getNamespacedText('http://purl.org/dc/elements/1.1/', 'date') ||
                     new Date().toISOString();
  let publishedAt: string;
  try {
    const parsedDate = new Date(pubDateStr);
    publishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  } catch {
    publishedAt = new Date().toISOString();
  }

  const itemCategories = Array.from(item.getElementsByTagName('category'))
    .map(c => c.textContent?.trim() || '')
    .filter(Boolean);

  const rawHtmlForImage = contentEncoded || descriptionRaw;
  return buildArticle(feed, {
    title,
    url,
    guid,
    author,
    publishedAt,
    itemCategories,
    summaryHtml: descriptionRaw || (contentEncoded ? contentEncoded.slice(0, 5000) : ''),
    contentHtml: contentEncoded || descriptionRaw,
    image: extractImageUrl(item, rawHtmlForImage),
  });
}

function parseAtomEntry(entry: Element, feed: Feed): Article | null {
  const getTagText = (tagName: string): string => {
    const el = entry.getElementsByTagName(tagName)[0];
    return el?.textContent?.trim() || '';
  };

  const title = getTagText('title') || 'Untitled Security Report';

  // Link in Atom: <link rel="alternate" href="..." /> or <link href="..." />
  let url = '';
  const links = Array.from(entry.getElementsByTagName('link'));
  const altLink = links.find(l => l.getAttribute('rel') === 'alternate') || links[0];
  if (altLink) {
    url = altLink.getAttribute('href') || '';
  }

  const guid = getTagText('id') || url;
  const summaryRaw = getTagText('summary');
  const contentRaw = getTagText('content');

  // Author
  const authorNode = entry.getElementsByTagName('author')[0];
  let author = feed.name;
  if (authorNode) {
    const nameNode = authorNode.getElementsByTagName('name')[0];
    if (nameNode?.textContent) author = nameNode.textContent.trim();
  }

  // Publication date
  const pubDateStr = getTagText('published') || getTagText('updated') || new Date().toISOString();
  let publishedAt: string;
  try {
    const parsedDate = new Date(pubDateStr);
    publishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  } catch {
    publishedAt = new Date().toISOString();
  }

  const itemCategories = Array.from(entry.getElementsByTagName('category'))
    .map(c => c.getAttribute('term') || c.getAttribute('label') || c.textContent?.trim() || '')
    .filter(Boolean);

  const rawHtmlForImage = contentRaw || summaryRaw;
  return buildArticle(feed, {
    title,
    url,
    guid,
    author,
    publishedAt,
    itemCategories,
    summaryHtml: summaryRaw || (contentRaw ? contentRaw.slice(0, 5000) : ''),
    contentHtml: contentRaw || summaryRaw,
    image: extractImageUrl(entry, rawHtmlForImage),
  });
}

/**
 * Parses json response from rss2json.com into normalized Article array.
 */
export function parseRss2Json(jsonData: any, feed: Feed): Article[] {
  if (!jsonData || !Array.isArray(jsonData.items)) return [];
  const articles: Article[] = [];

  for (const item of jsonData.items) {
    try {
      const title = item.title || 'Untitled Security Report';
      const url = item.link || '';
      const guid = item.guid || url;
      const author = item.author || feed.name;
      const rawDate = item.pubDate || new Date().toISOString();
      let publishedAt = new Date().toISOString();
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      } catch {}

      let image = item.thumbnail || item.enclosure?.link;
      if (!image && (item.content || item.description)) {
        const imgMatch = (item.content || item.description).match(/<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/i);
        if (imgMatch && imgMatch[1] && !imgMatch[1].includes('1x1') && !imgMatch[1].includes('feedburner')) {
          image = imgMatch[1];
        }
      }

      const itemCategories: string[] = Array.isArray(item.categories)
        ? item.categories.filter((c: any) => c && typeof c === 'string').map((c: string) => c.trim())
        : [];

      articles.push(buildArticle(feed, {
        title,
        url,
        guid,
        author,
        publishedAt,
        itemCategories,
        summaryHtml: item.description || item.content || '',
        contentHtml: item.content || item.description || '',
        image,
      }));
    } catch {
      // Continue parsing next item if one is malformed
    }
  }

  return articles;
}
