import { describe, expect, it } from 'vitest';
import { classifyIncident, isLeakSitePost, mergeVictims, normalizeBreach, normalizeGroup, normalizeVictim } from './incidents';
import { buildBriefing } from './briefing';
import { computeTrending } from './trending';
import { article } from '../../test/fixtures';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600e3).toISOString();

const apiVictim = (overrides: Record<string, unknown> = {}) => ({
  victim: 'Acme AB', group: 'akira', country: 'se', activity: 'Manufacturing',
  discovered: hoursAgo(2), attackdate: hoursAgo(30), domain: 'https://acme.se/',
  description: '  Data   published ', url: 'https://www.ransomware.live/id/QWNtZQ==',
  claim_url: 'http://abcdefghijklmnop.onion/acme', screenshot: 'https://images.example/x.png',
  ...overrides,
});

describe('normalizeVictim', () => {
  it('keeps structured fields and never keeps leak-site links', () => {
    const v = normalizeVictim(apiVictim())!;
    expect(v).toMatchObject({ victim: 'Acme AB', group: 'akira', country: 'SE', sector: 'Manufacturing', domain: 'acme.se', description: 'Data published' });
    expect(v.url).toBe('https://www.ransomware.live/id/QWNtZQ==');
    expect(JSON.stringify(v)).not.toMatch(/onion|screenshot|images\.example/);
  });

  it('drops placeholder values and non-ransomware.live urls', () => {
    const v = normalizeVictim(apiVictim({ activity: 'Not Found', country: '', domain: 'None', url: 'http://leak.onion/x' }))!;
    expect(v.sector).toBeUndefined();
    expect(v.country).toBeUndefined();
    expect(v.domain).toBeUndefined();
    expect(v.url).toBeUndefined();
  });

  it('skips groups advertising their own channels as victims', () => {
    expect(normalizeVictim(apiVictim({ victim: 'https://t.me/somegang' }))).toBeNull();
  });

  it('rejects records without victim, group or date', () => {
    expect(normalizeVictim(apiVictim({ victim: '' }))).toBeNull();
    expect(normalizeVictim(apiVictim({ discovered: 'not a date' }))).toBeNull();
  });
});

describe('mergeVictims', () => {
  it('dedupes by id (later lists win), keeps 30 days, newest first', () => {
    const a = normalizeVictim(apiVictim({ discovered: hoursAgo(5) }))!;
    const updated = { ...a, sector: 'Retail' };
    const old = normalizeVictim(apiVictim({ victim: 'Old Co', url: 'https://www.ransomware.live/id/T2xk', discovered: hoursAgo(24 * 40) }))!;
    const b = normalizeVictim(apiVictim({ victim: 'Beta', url: 'https://www.ransomware.live/id/QmV0YQ==', discovered: hoursAgo(1) }))!;
    const merged = mergeVictims([[a, old], [updated, b]], 30, NOW);
    expect(merged.map(v => v.victim)).toEqual(['Beta', 'Acme AB']);
    expect(merged[1].sector).toBe('Retail');
  });
});

describe('normalizeBreach / normalizeGroup', () => {
  const hibp = { Name: 'AfD', Title: 'AfD', Domain: 'afd.de', BreachDate: '2026-10-01', AddedDate: '2026-10-27T10:00:00Z', PwnCount: 345439,
    DataClasses: ['Email addresses', 'Passwords'], IsVerified: true, Description: '<p>In October 2026, <a href="x">data</a> leaked.</p>' };

  it('maps HIBP breaches and strips HTML from descriptions', () => {
    expect(normalizeBreach(hibp)).toMatchObject({ title: 'AfD', records: 345439, verified: true, dataClasses: ['Email addresses', 'Passwords'], description: 'In October 2026, data leaked.' });
  });

  it('skips spam lists, fabricated and retired breaches', () => {
    expect(normalizeBreach({ ...hibp, IsSpamList: true })).toBeNull();
    expect(normalizeBreach({ ...hibp, IsFabricated: true })).toBeNull();
    expect(normalizeBreach({ ...hibp, IsRetired: true })).toBeNull();
  });

  it('links group profiles to ransomware.live', () => {
    expect(normalizeGroup({ name: 'akira', description: 'Active since 2023.' })).toEqual({ name: 'akira', description: 'Active since 2023.', url: 'https://www.ransomware.live/group/akira' });
  });
});

describe('classifyIncident', () => {
  it('recognises ransomware and breach reporting', () => {
    expect(classifyIncident(article('a', { title: 'Hospital hit by ransomware, surgeries cancelled' }))).toBe('ransomware');
    expect(classifyIncident(article('b', { title: 'Retailer confirms data breach affecting 2M customers' }))).toBe('breach');
    expect(classifyIncident(article('c', { title: 'Best noise-cancelling headphones of 2026' }))).toBeNull();
  });

  it('needs ransomware context for group names ("Play" vs Google Play)', () => {
    expect(classifyIncident(article('d', { title: 'Google Play adds new parental controls' }), ['Play'])).toBeNull();
    expect(classifyIncident(article('e', { title: 'Play gang claims city council, posts files to leak site' }), ['Play'])).toBe('ransomware');
  });
});

describe('briefing and trending with structured incidents', () => {
  const victims = [1, 2, 3].map(i => normalizeVictim(apiVictim({ victim: `V${i}`, url: `https://www.ransomware.live/id/${i}`, discovered: hoursAgo(i) }))!);
  const incidents = {
    updatedAt: hoursAgo(0), victims, groups: {},
    breaches: [normalizeBreach({ Name: 'X', Title: 'X Corp', BreachDate: '2026-10-01', AddedDate: hoursAgo(5), PwnCount: 1000, DataClasses: ['Passwords'] })!],
  };

  it('counts structured victims and lists new breaches', () => {
    const b = buildBriefing([], {}, [], [], 24, NOW, incidents);
    expect(b.ransomware).toEqual({ count: 3, byGroup: [['Akira', 3]] });
    expect(b.breaches.map(x => x.title)).toEqual(['X Corp']);
  });

  it('trends ransomware groups from leak-site victims without double counting RSS posts', () => {
    const rssPost = article('r', { sourceId: 'ransomware-live', title: '🏴‍☠️ Akira has just published a new victim : V1', publishedAt: hoursAgo(1) });
    const trending = computeTrending([rssPost], [], 7, NOW, victims);
    expect(trending.find(t => t.name === 'Akira')).toMatchObject({ kind: 'ransomware', count: 3 });
  });
});

describe('isLeakSitePost', () => {
  it('recognises automated victim posts from Ransomware.live and mirrors', () => {
    expect(isLeakSitePost(article('a', { sourceId: 'ransomware-live', title: 'anything' }))).toBe(true);
    expect(isLeakSitePost(article('b', { title: '[RHYSIDA] – Ransomware Victim: Broadstreet HEOR' }))).toBe(true);
    expect(isLeakSitePost(article('c', { title: 'Rhysida claims attack on hospital, posts data' }))).toBe(false);
  });
});
