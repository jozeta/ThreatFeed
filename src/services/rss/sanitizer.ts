import DOMPurify from 'dompurify';
import { Article } from '../../types';

// Hook to ensure all links open in a new tab with noopener noreferrer
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitizes untrusted HTML from RSS items, allowing safe formatting elements
 * while strictly disallowing scripts, frames, embeds, objects, and inline execution.
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let content = rawHtml;
  // Strip out huge inline base64 images (>10KB) that bloat IndexedDB and freeze DOM rendering
  if (content.length > 100000 && content.includes('data:image')) {
    content = content.replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{10000,}/g, '');
  }
  // Cap oversized payloads to prevent browser thread locking
  if (content.length > 300000) {
    content = content.slice(0, 300000) + '... <p><em>[Article content truncated for length]</em></p>';
  }
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
      'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'span', 'figure', 'figcaption', 'img'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'class'],
    FORBID_TAGS: ['script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

/**
 * Strips all HTML tags to produce a clean plain-text snippet for cards & headlines.
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
  const text = tmp.textContent || tmp.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Validates that an RSS URL uses http or https protocols.
 */
export function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns the URL if it is http(s), otherwise ''. Guards hrefs and window.open against
 * javascript:/data: URLs coming from imported backups or other non-parser sources.
 */
export function safeHttpUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * Validates and re-sanitizes an article that did not come straight from the feed parser
 * (backup import, seed data). Returns null if required fields are missing.
 */
export function sanitizeStoredArticle(raw: any): Article | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.sourceId !== 'string') return null;

  return {
    ...raw,
    title: stripHtmlToText(raw.title),
    url: safeHttpUrl(raw.url),
    image: safeHttpUrl(raw.image) || undefined,
    sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : raw.sourceId,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    content: sanitizeHtml(typeof raw.content === 'string' ? raw.content : ''),
    author: typeof raw.author === 'string' ? raw.author : undefined,
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : new Date().toISOString(),
    tags: stringArray(raw.tags),
    categories: stringArray(raw.categories),
    cves: stringArray(raw.cves),
    customTags: stringArray(raw.customTags),
    read: Boolean(raw.read),
    viewed: Boolean(raw.viewed),
    bookmarked: Boolean(raw.bookmarked),
  };
}
