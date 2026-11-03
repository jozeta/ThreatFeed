import { describe, expect, it } from 'vitest';
import { escapeXml, plainText, renderRss, RssChannel, RssItem } from './rss';

const ATOM = 'http://www.w3.org/2005/Atom';

describe('escapeXml', () => {
  it('escapes and cleans hostile text', () => {
    expect(escapeXml('A & B <c> "d" \'e\'\u0001')).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;');
    expect(escapeXml('Ivanti製品の脆弱性 🔥')).toBe('Ivanti製品の脆弱性 🔥');
  });
});

describe('plainText', () => {
  it('strips HTML and truncates at a word', () => {
    expect(plainText('<p>Hello <b>world</b></p>', 400)).toBe('Hello world');
    expect(plainText('aaa bbb ccc', 8)).toBe('aaa bbb…');
    expect(plainText(undefined, 10)).toBe('');
  });
});

describe('renderRss', () => {
  const channel: RssChannel = {
    title: 'Security Intelligence Daily: KEV',
    link: 'https://jozeta.github.io/ThreatFeed/',
    selfUrl: 'https://jozeta.github.io/ThreatFeed/data/feeds/kev.xml',
    description: 'Known exploited vulnerabilities',
    lastBuildDate: '2026-11-03T06:00:00.000Z',
  };
  const items: RssItem[] = [
    {
      guid: 'kev-1',
      title: 'Tom & Jerry <script>',
      description: 'Desc & <b>more</b>',
      link: 'https://example.com/a?x=1&y=2',
      pubDate: '2026-11-02T10:00:00.000Z',
      categories: ['kev', 'CVE-2026-1'],
    },
    {
      guid: 'kev-2',
      title: 'Second',
      description: '',
      link: 'https://example.com/b',
      pubDate: '2026-11-01T10:00:00.000Z',
      categories: [],
    },
  ];

  it('produces a parseable feed', () => {
    const xml = renderRss(channel, items);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    expect(doc.getElementsByTagName('rss')[0].getAttribute('version')).toBe('2.0');

    const parsed = doc.querySelectorAll('rss > channel > item');
    expect(parsed.length).toBe(2);

    const first = parsed[0];
    const guid = first.querySelector('guid');
    expect(guid?.getAttribute('isPermaLink')).toBe('false');
    expect(first.querySelector('title')?.textContent).toBe('Tom & Jerry <script>');
    expect(first.querySelector('pubDate')?.textContent).toBe(new Date(items[0].pubDate).toUTCString());
    expect(Array.from(first.querySelectorAll('category')).map((c) => c.textContent)).toEqual(['kev', 'CVE-2026-1']);

    expect(doc.querySelector('channel > ttl')?.textContent).toBe('30');
    expect(doc.querySelector('channel > language')?.textContent).toBe('en');
    expect(doc.querySelector('channel > lastBuildDate')?.textContent).toBe(new Date(channel.lastBuildDate).toUTCString());

    const selfLink = Array.from(doc.getElementsByTagNameNS(ATOM, 'link')).find((l) => l.getAttribute('rel') === 'self');
    expect(selfLink?.getAttribute('href')).toBe(channel.selfUrl);
  });
});
