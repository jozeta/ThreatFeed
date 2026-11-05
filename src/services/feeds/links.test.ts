import { describe, expect, it } from 'vitest';
import { cveLink, npmAdvisoryLink, patchLink, storyLink, victimLink } from './links';

const site = 'https://jozeta.github.io/ThreatFeed/';

describe('feed links', () => {
  it('builds deep links', () => {
    expect(storyLink(site, { id: 'a1', url: 'https://x.com/p?a=1&b=2' }))
      .toBe(`${site}#/latest?article=a1&src=https%3A%2F%2Fx.com%2Fp%3Fa%3D1%26b%3D2`);
    expect(storyLink(site, { id: 'a#b&c', url: '' })).toBe(`${site}#/latest?article=a%23b%26c`);
    expect(cveLink(site, 'CVE-2026-1234')).toBe(`${site}#/vulns?cve=CVE-2026-1234`);
    expect(patchLink(site, '2026-Oct')).toBe(`${site}#/vulns/patch?month=2026-Oct`);
    expect(npmAdvisoryLink(site, 'GHSA-aaaa-bbbb-cccc')).toBe(`${site}#/vulns/npm?advisory=GHSA-aaaa-bbbb-cccc`);
    expect(victimLink(site, { id: 'v#1&x', group: 'Qilin' })).toBe(`${site}#/ransomware?victim=v%231%26x&group=qilin`);
  });
});
