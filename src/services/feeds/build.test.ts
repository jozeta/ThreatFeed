import { describe, expect, it } from 'vitest';
import type { Article, KevEntry, LeakSiteVictim, VulnData } from '../../types';
import { buildFeeds, FEED_CAPS, type FeedInput } from './build';
import type { FeedLedger } from './ledger';

const now = Date.parse('2026-11-03T12:00:00Z');
const site = 'https://example.test/TF/';
const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const iso = (t: number) => new Date(t).toISOString();

const input = (over: Partial<FeedInput> = {}): FeedInput => ({ articles: [], victims: [], vulns: null, msrc: null, ...over });

const guids = (xml: string): string[] =>
  [...new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('guid')].map((g) => g.textContent ?? '');

const items = (xml: string) =>
  [...new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('item')].map((item) => ({
    guid: item.getElementsByTagName('guid')[0].textContent,
    pubDate: item.getElementsByTagName('pubDate')[0].textContent,
    description: item.getElementsByTagName('description')[0].textContent ?? '',
  }));

const article = (id: string, over: Partial<Article> = {}): Article => ({
  id, title: 'Hackers exploit Fortinet firewall zero-day flaw', url: `https://example.com/${id}`, sourceId: id,
  sourceName: `Outlet ${id}`, publishedAt: iso(now - 2 * day), tags: [], categories: [], read: false, viewed: false,
  bookmarked: false, ...over,
});

const victim = (id: string, discoveredAt: number, name = `Victim ${id}`): LeakSiteVictim => ({
  id, victim: name, group: 'Qilin', country: 'SE', discoveredAt: iso(discoveredAt),
});

const kev = (cve: string): KevEntry => ({
  cve, vendor: 'Fortinet', product: 'FortiOS', name: 'FortiOS RCE', dateAdded: iso(now - day).slice(0, 10),
  dueDate: '2026-11-20', ransomware: false, cwes: [], cvss: 9.8,
});

const vulnData = (over: Partial<VulnData> = {}): VulnData => ({
  updatedAt: iso(now), kev: [], nvd: null, notable: [], advisories: [], epssTop: [], exploits: {}, ...over,
});

describe('buildFeeds', () => {
  it('first run records exploits as baseline', () => {
    const cve = 'CVE-2026-1';
    const data = vulnData({ kev: [kev(cve)], exploits: { [cve]: { pocs: 2 } } });
    const run1 = buildFeeds(input({ vulns: data }), null, now, site);
    expect(guids(run1.files.vulns)).toEqual([`kev:${cve}`]);
    expect(run1.ledger.feeds.vulns[`exploit:${cve}:poc`].published).toBe(false);

    const run2 = buildFeeds(input({ vulns: data }), run1.ledger, now + hour, site);
    expect(guids(run2.files.vulns)).toEqual([`kev:${cve}`]);

    const withMsf = vulnData({ kev: [kev(cve)], exploits: { [cve]: { pocs: 2, msf: ['exploit/x'] } } });
    const run3 = buildFeeds(input({ vulns: withMsf }), run2.ledger, now + 2 * hour, site);
    const exploits = guids(run3.files.vulns).filter((g) => g.startsWith('exploit:'));
    expect(exploits).toEqual([`exploit:${cve}:metasploit`]);
  });

  it('baselines exploits on the first run that has exploit data', () => {
    const cve = 'CVE-2026-1';
    const other = { victims: [victim('o', now - hour)] };
    const run1 = buildFeeds(input({ ...other, vulns: null }), null, now, site);
    expect(Object.keys(run1.ledger.feeds.vulns)).toEqual([]);

    const data = vulnData({ kev: [kev(cve)], exploits: { [cve]: { pocs: 2 } } });
    const run2 = buildFeeds(input({ ...other, vulns: data }), run1.ledger, now + hour, site);
    expect(guids(run2.files.vulns).filter((g) => g.startsWith('exploit:'))).toEqual([]);
    expect(run2.ledger.feeds.vulns[`exploit:${cve}:poc`].published).toBe(false);

    const withMsf = vulnData({ kev: [kev(cve)], exploits: { [cve]: { pocs: 2, msf: ['exploit/x'] } } });
    const run3 = buildFeeds(input({ ...other, vulns: withMsf }), run2.ledger, now + 2 * hour, site);
    expect(guids(run3.files.vulns).filter((g) => g.startsWith('exploit:'))).toEqual([`exploit:${cve}:metasploit`]);
    expect(run3.ledger.feeds.vulns[`exploit:${cve}:metasploit`].published).toBe(true);
  });

  it('baselines exploits when the previous ledger has vulns entries but no exploits', () => {
    const cve = 'CVE-2026-1';
    const previous: FeedLedger = {
      version: 1,
      feeds: {
        news: {}, ransomware: {},
        vulns: { [`kev:${cve}`]: { firstSeen: iso(now - day), lastSeen: iso(now - day), published: true, keys: [`c:${cve}`] } },
      },
    };
    const data = vulnData({ kev: [kev(cve)], exploits: { [cve]: { pocs: 2, msf: ['exploit/x'] } } });
    const run = buildFeeds(input({ vulns: data }), previous, now, site);
    expect(guids(run.files.vulns)).toEqual([`kev:${cve}`]);
    expect(run.ledger.feeds.vulns[`exploit:${cve}:poc`].published).toBe(false);
    expect(run.ledger.feeds.vulns[`exploit:${cve}:metasploit`].published).toBe(false);
  });

  it("keeps a news story's guid when its lead article changes", () => {
    // A's source time is 2 h before first seen, so it is the pubDate; C's later time must not move it
    const a = article('A', { severity: 'critical', severityScore: 80, publishedAt: iso(now - 2 * hour) });
    const b = article('B', { title: 'Hackers exploit Fortinet firewall zero-day flaw attacks', severity: 'high', severityScore: 60 });
    const run1 = buildFeeds(input({ articles: [a, b] }), null, now, site);
    const first = items(run1.files.news);
    expect(first.map((i) => i.guid)).toEqual(['news:A']);
    expect(first[0].pubDate).toBe(new Date(now - 2 * hour).toUTCString());
    expect(run1.ledger.feeds.news['news:A'].pubDate).toBe(iso(now - 2 * hour));

    const c = article('C', {
      title: 'Hackers exploit Fortinet firewall zero-day flaw warns', severity: 'critical', severityScore: 95,
      publishedAt: iso(now + 30 * minute),
    });
    const run2 = buildFeeds(input({ articles: [a, b, c] }), run1.ledger, now + hour, site);
    const second = items(run2.files.news);
    expect(second).toHaveLength(1);
    expect(second[0].guid).toBe('news:A');
    expect(second[0].pubDate).toBe(first[0].pubDate);
    expect(run2.ledger.feeds.news['news:A'].pubDate).toBe(iso(now - 2 * hour));
    expect(second[0].description).toContain('2 other outlets');
    expect(second[0].description).toContain('https://example.com/C');
  });

  it('falls back to pickPubDate for entries without a stored pubDate, then stores it', () => {
    const v = victim('W', now - 2 * hour);
    const previous: FeedLedger = {
      version: 1,
      feeds: { news: {}, vulns: {}, ransomware: { 'victim:W': { firstSeen: iso(now - hour), lastSeen: iso(now - hour), published: true, keys: [] } } },
    };
    const run = buildFeeds(input({ victims: [v] }), previous, now, site);
    expect(items(run.files.ransomware)[0].pubDate).toBe(new Date(now - 2 * hour).toUTCString());
    expect(run.ledger.feeds.ransomware['victim:W'].pubDate).toBe(iso(now - 2 * hour));
  });

  it('one item per CVE across kev and critical-cve', () => {
    const cve = 'CVE-2026-5';
    const notable = [{ id: cve, published: iso(now - day), score: 9.8, assigner: 'Acme' }];
    const run1 = buildFeeds(input({ vulns: vulnData({ kev: [kev(cve)], notable }) }), null, now, site);
    expect(guids(run1.files.vulns)).toEqual([`kev:${cve}`]);

    const run2 = buildFeeds(input({ vulns: vulnData({ notable }) }), run1.ledger, now + hour, site);
    expect(guids(run2.files.vulns).filter((g) => g.startsWith('cve:'))).toEqual([]);
  });

  it('never re-announces after the item leaves the window', () => {
    const v = victim('V', now - day);
    const run1 = buildFeeds(input({ victims: [v] }), null, now, site);
    expect(guids(run1.files.ransomware)).toEqual(['victim:V']);
    const run1Entry = run1.ledger.feeds.ransomware['victim:V'];

    // V is now older than the window, so it is no candidate and does not touch the ledger
    const run2 = buildFeeds(input({ victims: [v] }), run1.ledger, now + 10 * day, site);
    expect(guids(run2.files.ransomware)).not.toContain('victim:V');
    expect(run2.ledger.feeds.ransomware['victim:V']).toEqual(run1Entry);
    expect(run2.ledger.feeds.ransomware['victim:V'].lastSeen).toBe(iso(now));

    const run3 = buildFeeds(input({ victims: [v] }), run2.ledger, now + 11 * day, site);
    expect(guids(run3.files.ransomware)).not.toContain('victim:V');
    expect(run3.ledger.feeds.ransomware['victim:V']).toEqual(run1Entry);
  });

  it('applies the caps and the 7-day window, newest first', () => {
    const victims = Array.from({ length: 450 }, (_, i) => victim(`v${i}`, now - i * minute));
    // An entry first seen 8 days ago that is still in this run's data stays out of the feed
    const previous: FeedLedger = {
      version: 1,
      feeds: {
        news: {}, vulns: {},
        ransomware: { 'victim:late': { firstSeen: iso(now - 8 * day), lastSeen: iso(now - day), published: true, keys: [] } },
      },
    };
    const run = buildFeeds(input({ victims: [...victims, victim('late', now - day)] }), previous, now, site);
    const out = guids(run.files.ransomware);
    expect(out).toHaveLength(400);
    expect(run.counts.ransomware).toBe(400);
    expect(out[0]).toBe('victim:v0');
    expect(out[1]).toBe('victim:v1');
    expect(out).not.toContain('victim:late');
    expect(run.ledger.feeds.ransomware['victim:late'].lastSeen).toBe(iso(now));
  });

  it('lists KEV before critical CVEs with the same pubDate, within the cap', () => {
    // pubDate falls back to firstSeen (now) for all of them: the sources are over 24 h old
    const notable = Array.from({ length: 150 }, (_, i) => ({ id: `CVE-2026-${1000 + i}`, published: iso(now - 2 * day), score: 9.8 }));
    const kevs = ['CVE-2026-1', 'CVE-2026-2', 'CVE-2026-3'].map((cve) => ({ ...kev(cve), dateAdded: iso(now - 2 * day).slice(0, 10) }));
    const run = buildFeeds(input({ vulns: vulnData({ kev: kevs, notable }) }), null, now, site);
    const out = guids(run.files.vulns);
    expect(out).toHaveLength(153);
    expect(out.slice(0, 3)).toEqual(['kev:CVE-2026-1', 'kev:CVE-2026-2', 'kev:CVE-2026-3']);
    expect(out.slice(3).every((g) => g.startsWith('cve:'))).toBe(true);
  });

  it('caps the vulns feed at 300', () => {
    const notable = Array.from({ length: 320 }, (_, i) => ({ id: `CVE-2026-${1000 + i}`, published: iso(now - 2 * day), score: 9.8 }));
    const run = buildFeeds(input({ vulns: vulnData({ notable }) }), null, now, site);
    expect(FEED_CAPS.vulns).toBe(300);
    expect(guids(run.files.vulns)).toHaveLength(300);
    expect(run.counts.vulns).toBe(300);
  });

  it('files are valid XML', () => {
    const run = buildFeeds(input({ victims: [victim('x', now - hour)], vulns: vulnData({ kev: [kev('CVE-2026-9')] }) }), null, now, site);
    const titles = { news: 'ThreatFeed — News', vulns: 'ThreatFeed — Vulnerabilities', ransomware: 'ThreatFeed — Ransomware' };
    for (const feed of ['news', 'vulns', 'ransomware'] as const) {
      const doc = new DOMParser().parseFromString(run.files[feed], 'application/xml');
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      const self = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link')[0];
      expect(self.getAttribute('href')).toBe(`${site}data/feeds/${feed}.xml`);
      expect(doc.getElementsByTagName('title')[0].textContent).toBe(titles[feed]);
      expect(doc.getElementsByTagName('link')[0].textContent).toBe(site);
    }
  });
});
