import { Article, Feed } from '../../types';
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

/**
 * Parses XML text into normalized Article array.
 * Gracefully handles RSS 2.0 and Atom feeds.
 */
export function parseFeedXml(xmlText: string, feed: Feed): Article[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check for XML parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML Parse Error: ${parseError.textContent?.slice(0, 100) || 'Malformed XML structure'}`);
  }

  const articles: Article[] = [];

  // Check if Atom feed
  const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;

  if (isAtom) {
    const entries = Array.from(xmlDoc.getElementsByTagName('entry'));
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
    const items = Array.from(xmlDoc.getElementsByTagName('item'));
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

  // Categories
  const categoryNodes = Array.from(item.getElementsByTagName('category'));
  const rawCategories = categoryNodes.map(c => c.textContent?.trim() || '').filter(Boolean);
  if (feed.tags) {
    rawCategories.push(...feed.tags);
  }

  // Guarantee feed.category is always present in categories
  const allCategories = new Set<string>();
  if (feed.category) {
    allCategories.add(feed.category);
  }
  rawCategories.forEach(c => allCategories.add(c));

  const rawHtmlForImage = contentEncoded || descriptionRaw;
  const image = extractImageUrl(item, rawHtmlForImage);
  const rawSummarySource = descriptionRaw || (contentEncoded ? contentEncoded.slice(0, 5000) : '');
  const cleanSummary = stripHtmlToText(rawSummarySource);
  const sanitizedContent = sanitizeHtml(contentEncoded || descriptionRaw);
  const normalizedTags = normalizeAndEnrichTags(Array.from(allCategories), title, cleanSummary);

  const id = generateArticleId(feed.id, guid, url, title);
  const cleanTitle = stripHtmlToText(title);
  const detectedCves = extractCVEs(`${cleanTitle} ${cleanSummary} ${sanitizedContent}`);
  const { severity, score: severityScore } = calculateThreatSeverity({
    title: cleanTitle,
    description: cleanSummary,
    tags: normalizedTags,
    categories: Array.from(allCategories),
    sourceId: feed.id
  }, detectedCves);

  return {
    id,
    guid,
    title: cleanTitle,
    url: normalizeUrl(url),
    sourceId: feed.id,
    sourceName: feed.name,
    description: cleanSummary.slice(0, 450),
    content: sanitizedContent,
    image,
    author: stripHtmlToText(author),
    publishedAt,
    fetchedAt: new Date().toISOString(),
    tags: normalizedTags,
    categories: Array.from(allCategories),
    cves: detectedCves,
    severity,
    severityScore,
    read: false,
    viewed: false,
    bookmarked: false,
  };
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

  // Categories
  const categoryNodes = Array.from(entry.getElementsByTagName('category'));
  const rawCategories = categoryNodes.map(c => c.getAttribute('term') || c.getAttribute('label') || c.textContent?.trim() || '').filter(Boolean);
  if (feed.tags) {
    rawCategories.push(...feed.tags);
  }

  // Guarantee feed.category is always present in categories
  const allCategories = new Set<string>();
  if (feed.category) {
    allCategories.add(feed.category);
  }
  rawCategories.forEach(c => allCategories.add(c));

  const rawHtmlForImage = contentRaw || summaryRaw;
  const image = extractImageUrl(entry, rawHtmlForImage);
  const rawSummarySource = summaryRaw || (contentRaw ? contentRaw.slice(0, 5000) : '');
  const cleanSummary = stripHtmlToText(rawSummarySource);
  const sanitizedContent = sanitizeHtml(contentRaw || summaryRaw);
  const normalizedTags = normalizeAndEnrichTags(Array.from(allCategories), title, cleanSummary);

  const id = generateArticleId(feed.id, guid, url, title);
  const cleanTitle = stripHtmlToText(title);
  const detectedCves = extractCVEs(`${cleanTitle} ${cleanSummary} ${sanitizedContent}`);
  const { severity, score: severityScore } = calculateThreatSeverity({
    title: cleanTitle,
    description: cleanSummary,
    tags: normalizedTags,
    categories: Array.from(allCategories),
    sourceId: feed.id
  }, detectedCves);

  return {
    id,
    guid,
    title: cleanTitle,
    url: normalizeUrl(url),
    sourceId: feed.id,
    sourceName: feed.name,
    description: cleanSummary.slice(0, 450),
    content: sanitizedContent,
    image,
    author: stripHtmlToText(author),
    publishedAt,
    fetchedAt: new Date().toISOString(),
    tags: normalizedTags,
    categories: Array.from(allCategories),
    cves: detectedCves,
    severity,
    severityScore,
    read: false,
    viewed: false,
    bookmarked: false,
  };
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

      const cleanSummary = stripHtmlToText(item.description || item.content || '');
      const sanitizedContent = sanitizeHtml(item.content || item.description || '');

      let image = item.thumbnail || item.enclosure?.link;
      if (!image && (item.content || item.description)) {
        const imgMatch = (item.content || item.description).match(/<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/i);
        if (imgMatch && imgMatch[1] && !imgMatch[1].includes('1x1') && !imgMatch[1].includes('feedburner')) {
          image = imgMatch[1];
        }
      }

      const allCategories = new Set<string>();
      if (feed.category) allCategories.add(feed.category);
      if (Array.isArray(item.categories)) {
        item.categories.forEach((c: any) => {
          if (c && typeof c === 'string') allCategories.add(c.trim());
        });
      }
      if (feed.tags) {
        feed.tags.forEach(t => allCategories.add(t));
      }

      const normalizedTags = normalizeAndEnrichTags(Array.from(allCategories), title, cleanSummary);
      const id = generateArticleId(feed.id, guid, url, title);
      const cleanTitle = stripHtmlToText(title);
      const detectedCves = extractCVEs(`${cleanTitle} ${cleanSummary} ${sanitizedContent}`);
      const { severity, score: severityScore } = calculateThreatSeverity({
        title: cleanTitle,
        description: cleanSummary,
        tags: normalizedTags,
        categories: Array.from(allCategories),
        sourceId: feed.id
      }, detectedCves);

      articles.push({
        id,
        guid,
        title: cleanTitle,
        url: normalizeUrl(url),
        sourceId: feed.id,
        sourceName: feed.name,
        description: cleanSummary.slice(0, 450),
        content: sanitizedContent,
        image,
        author: stripHtmlToText(author),
        publishedAt,
        fetchedAt: new Date().toISOString(),
        tags: normalizedTags,
        categories: Array.from(allCategories),
        cves: detectedCves,
        severity,
        severityScore,
        read: false,
        viewed: false,
        bookmarked: false,
      });
    } catch {
      // Continue parsing next item if one is malformed
    }
  }

  return articles;
}
