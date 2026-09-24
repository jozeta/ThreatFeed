import { Feed } from '../../types';

export function exportFeedsToOPML(feeds: Feed[]): string {
  const dateStr = new Date().toUTCString();
  const outlines = feeds.map(feed => {
    const esc = (str: string) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `      <outline text="${esc(feed.name)}" title="${esc(feed.name)}" type="rss" xmlUrl="${esc(feed.url)}" category="${esc(feed.category)}" />`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>ThreatFeed Subscriptions</title>
    <dateCreated>${dateStr}</dateCreated>
  </head>
  <body>
    <outline text="Cybersecurity Feeds" title="Cybersecurity Feeds">
${outlines}
    </outline>
  </body>
</opml>`;
}

export function parseOPML(xmlString: string): Partial<Feed>[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, 'text/xml');
  const outlines = Array.from(xml.getElementsByTagName('outline'));
  const feeds: Partial<Feed>[] = [];

  for (const outline of outlines) {
    const xmlUrl = outline.getAttribute('xmlUrl') || outline.getAttribute('url');
    if (xmlUrl) {
      const name = outline.getAttribute('title') || outline.getAttribute('text') || 'Imported Feed';
      const category = outline.getAttribute('category') || 'Imported';
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `feed-${Date.now()}`;
      
      feeds.push({
        id,
        name,
        url: xmlUrl,
        category,
        tags: [category.toLowerCase()],
        enabled: true,
        isCustom: true
      });
    }
  }

  return feeds;
}
