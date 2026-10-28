import { describe, expect, it } from 'vitest';
import { parseFeedXml, rescoreArticle } from '../rss/parser';
import { calculateThreatSeverity } from './iocExtractor';
import { feed, rss, rssItem } from '../../test/fixtures';

const bleeping = feed({ id: 'bleeping-computer', tags: ['news', 'ransomware', 'data-breach', 'zero-day'] });
const krebs = feed({ id: 'krebs-on-security', tags: ['investigation', 'cybercrime', 'fraud', 'news'] });

describe('severity scoring', () => {
  it('does not let feed-level tags inflate severity', () => {
    const [a] = parseFeedXml(rss(rssItem('Microsoft Edge gets new tab layout', 'A cosmetic browser update.')), bleeping);
    expect(['critical', 'high']).not.toContain(a.severity);
    expect(a.tags).toContain('Zero-Day'); // still shown as a tag
  });

  it('matches keywords as whole words only', () => {
    const [a] = parseFeedXml(rss(rssItem('Open source resources for small business', 'How to adapt your budget to new flaws.')), krebs);
    expect(a.tags).not.toEqual(expect.arrayContaining(['Remote Code Execution']));
    expect(a.tags).not.toContain('APT');
    expect(a.tags).not.toContain('Cloud Security');
    expect(['info', 'low']).toContain(a.severity);
  });

  it('rates a corroborated zero-day as critical', () => {
    const [a] = parseFeedXml(rss(rssItem('Fortinet zero-day actively exploited in the wild', 'Unauthenticated remote code execution, CVE-2026-12345, CISA KEV.')), krebs);
    expect(a.severity).toBe('critical');
  });

  it('counts publisher item categories as evidence', () => {
    const [a] = parseFeedXml(rss(rssItem('Patch released', 'Vendor ships fix.', ['Zero-Day'])), krebs);
    expect(a.severityScore).toBeGreaterThan(10);
  });

  it('rescoring fixes stored inflated articles and keeps user state', () => {
    const [a] = parseFeedXml(rss(rssItem('Microsoft Edge gets new tab layout', 'A cosmetic browser update.')), bleeping);
    const rescored = rescoreArticle({ ...a, severity: 'critical', severityScore: 80, bookmarked: true }, bleeping);
    expect(rescored.severity).toBe(a.severity);
    expect(rescored.bookmarked).toBe(true);
  });

  it('scores benign text as info', () => {
    expect(calculateThreatSeverity({ title: 'Interview: CISO career advice', description: 'Leadership tips.' }).severity).toBe('info');
  });
});
