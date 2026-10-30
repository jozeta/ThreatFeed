import { describe, expect, it } from 'vitest';
import { formatAlertNotification } from './notifications';
import type { AlertMatch } from './intelligence/alertEngine';

const match = (i: number, kind: 'news' | 'vulns'): AlertMatch => ({
  ruleId: `r${i}`, ruleName: `Rule ${i}`, kind, itemId: `i${i}`, ref: `ref${i}`,
  title: `Title ${i}`, firstMatchedAt: '2026-01-01T00:00:00Z', notifiable: true,
});

describe('formatAlertNotification', () => {
  it('summarises many matches and opens the vulns tab when any is a vuln', () => {
    const matches = [1, 2, 3, 4, 5].map(i => match(i, 'news')).concat(match(6, 'vulns'));
    const { title, body, hash } = formatAlertNotification(matches);
    expect(title).toBe('ThreatFeed: 6 new matches');
    const lines = body.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.slice(0, 4).every(l => l.startsWith('•') && /\[Rule \d\]$/.test(l))).toBe(true);
    expect(lines[4]).toBe('…and 2 more');
    expect(hash).toBe('#/feed/vulns');
  });

  it('uses the singular and the news tab for a single news match', () => {
    const { title, body, hash } = formatAlertNotification([match(1, 'news')]);
    expect(title).toBe('ThreatFeed: 1 new match');
    expect(body).toBe('• Title 1 [Rule 1]');
    expect(hash).toBe('#/feed/news');
  });
});
