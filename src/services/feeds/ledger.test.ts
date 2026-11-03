import { describe, expect, it } from 'vitest';
import { decodeLedger, emptyLedger, pickPubDate, pruneLedger } from './ledger';

const now = Date.parse('2026-11-03T12:00:00Z');
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const iso = (t: number) => new Date(t).toISOString();

describe('feed ledger', () => {
  it('decodeLedger rejects malformed and keeps valid entries', () => {
    expect(decodeLedger(null)).toBeNull();
    expect(decodeLedger({ version: 2 })).toBeNull();
    expect(decodeLedger('x')).toBeNull();
    const valid = { firstSeen: iso(now), lastSeen: iso(now), published: true, keys: ['c:CVE-2026-1'] };
    const decoded = decodeLedger({
      version: 1,
      feeds: { news: {}, vulns: { 'kev:CVE-2026-1': valid, 'kev:CVE-2026-2': { lastSeen: iso(now), published: true, keys: [] } }, ransomware: {} },
    });
    expect(decoded).not.toBeNull();
    expect(decoded!.feeds.vulns).toEqual({ 'kev:CVE-2026-1': valid });
    expect(decoded!.feeds.news).toEqual({});
  });

  it('pruneLedger drops entries unseen for 90 days', () => {
    const ledger = emptyLedger();
    const entry = (d: number) => ({ firstSeen: iso(now - 100 * day), lastSeen: iso(now - d * day), published: true, keys: [] });
    ledger.feeds.ransomware = { 'victim:old': entry(91), 'victim:recent': entry(89) };
    const pruned = pruneLedger(ledger, now);
    expect(Object.keys(pruned.feeds.ransomware)).toEqual(['victim:recent']);
  });

  it('pickPubDate', () => {
    const firstSeen = iso(now);
    expect(pickPubDate(iso(now - 2 * hour), firstSeen)).toBe(iso(now - 2 * hour));
    expect(pickPubDate(iso(now - 3 * day), firstSeen)).toBe(firstSeen);
    expect(pickPubDate(iso(now + hour), firstSeen)).toBe(firstSeen);
    expect(pickPubDate('not a date', firstSeen)).toBe(firstSeen);
    expect(pickPubDate(undefined, firstSeen)).toBe(firstSeen);
  });
});
