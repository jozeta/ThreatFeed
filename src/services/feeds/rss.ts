import { stripHtmlToText } from '../rss/sanitizer';

// Characters that are not allowed in XML 1.0 documents, plus lone UTF-16 surrogates
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export interface RssItem {
  guid: string;
  title: string;
  description: string;
  link: string;
  pubDate: string; // ISO 8601
  categories: string[];
}

export interface RssChannel {
  title: string;
  link: string;
  selfUrl: string;
  description: string;
  lastBuildDate: string; // ISO 8601
}

/** Escapes text for XML element content and attribute values, dropping characters XML 1.0 forbids. */
export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escapes plain text as HTML. RSS readers render <description> as HTML, and plainText has already decoded
 * entities, so a source's "&lt;script&gt;" would otherwise reach them as a live tag.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts feed HTML to a single line of plain text. Longer than `max` characters, it is cut
 * at the last space that fits and gets an ellipsis.
 */
export function plainText(text: string | undefined, max: number): string {
  const flat = stripHtmlToText(text ?? '');
  if (flat.length <= max) return flat;
  const cut = flat.lastIndexOf(' ', max - 1);
  return `${flat.slice(0, cut > 0 ? cut : max - 1)}…`;
}

const rfc822 = (iso: string): string => new Date(iso).toUTCString();

/**
 * Renders an RSS 2.0 document. Every text value goes through escapeXml. Item descriptions are HTML in
 * RSS, so their plain text is HTML-escaped first; titles are plain text by convention and readers show
 * them as such, so escaping them twice would show "&lt;" literally.
 */
export function renderRss(channel: RssChannel, items: RssItem[]): string {
  const itemXml = items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${rfc822(item.pubDate)}</pubDate>
      <description>${escapeXml(escapeHtml(item.description))}</description>
${item.categories.map((c) => `      <category>${escapeXml(c)}</category>`).join('\n')}
    </item>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(channel.description)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(channel.lastBuildDate)}</lastBuildDate>
    <ttl>30</ttl>
${itemXml.join('\n')}
  </channel>
</rss>
`;
}
