import DOMPurify from 'dompurify';

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
