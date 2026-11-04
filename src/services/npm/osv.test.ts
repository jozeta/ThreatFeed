import { describe, expect, it, vi } from 'vitest';
import { OSV_DETAIL_LIMIT, osvCacheFresh, osvQueryBatch } from './osv';

type Call = { url: string; init?: RequestInit };

/** A fake fetch: querybatch answers come from `batch`, vuln details from `details`; every call is recorded */
function fakeFetch(batch: (queries: any[]) => unknown, details: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === 'https://api.osv.dev/v1/querybatch') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(batch(body.queries)), { status: 200 });
    }
    const id = decodeURIComponent(url.replace('https://api.osv.dev/v1/vulns/', ''));
    if (id in details) return new Response(JSON.stringify(details[id]), { status: 200 });
    return new Response('not found', { status: 404 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const MAL_DETAIL = {
  id: 'MAL-2025-1',
  summary: 'Malicious code in evil (npm)',
  aliases: ['GHSA-mmmm-mmmm-mmmm'],
  affected: [{ package: { ecosystem: 'npm', name: 'Evil' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }] }],
};

const OLD_DETAIL = {
  id: 'GHSA-zzzz-zzzz-zzzz',
  summary: 'Old ReDoS',
  database_specific: { severity: 'MODERATE' },
  affected: [
    { package: { ecosystem: 'npm', name: 'lodash' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.5' }, { introduced: '5.0.0' }, { last_affected: '5.0.2' }] }] },
    { package: { ecosystem: 'PyPI', name: 'lodash' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '9.9.9' }] }] },
  ],
};

describe('osvQueryBatch', () => {
  it('queries npm packages with their versions and maps the results per entry', async () => {
    const { impl, calls } = fakeFetch(
      () => ({ results: [{ vulns: [{ id: 'GHSA-zzzz-zzzz-zzzz', modified: 'x' }, { id: 'GHSA-aaaa-aaaa-aaaa' }] }, {}, { vulns: [{ id: 'MAL-2025-1' }] }] }),
      { 'MAL-2025-1': MAL_DETAIL, 'GHSA-zzzz-zzzz-zzzz': OLD_DETAIL },
    );
    const result = await osvQueryBatch([{ name: 'lodash', version: '4.17.4' }, { name: 'left-pad' }, { name: 'evil' }], new Set(['GHSA-aaaa-aaaa-aaaa']), impl);

    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ queries: [
      { package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.4' },
      { package: { name: 'left-pad', ecosystem: 'npm' } },
      { package: { name: 'evil', ecosystem: 'npm' } },
    ] });
    // Details only for the ids we don't already have
    expect(calls.slice(1).map(c => c.url).sort()).toEqual(['https://api.osv.dev/v1/vulns/GHSA-zzzz-zzzz-zzzz', 'https://api.osv.dev/v1/vulns/MAL-2025-1']);

    expect(result).not.toBeNull();
    expect(result!.get('left-pad')).toEqual({ vulns: [], complete: true });
    const lodash = result!.get('lodash@4.17.4')!;
    expect(lodash.complete).toBe(true);
    expect(lodash.vulns).toEqual([
      { id: 'GHSA-zzzz-zzzz-zzzz', summary: 'Old ReDoS', severity: 'medium', malware: false, aliases: [], ranges: [{ vulnerable: '>= 0, < 4.17.5', patched: '4.17.5' }, { vulnerable: '>= 5.0.0, <= 5.0.2' }] },
      { id: 'GHSA-aaaa-aaaa-aaaa', severity: 'unknown', malware: false, aliases: [], ranges: [] },
    ]);
    expect(result!.get('evil')!.vulns[0]).toEqual({ id: 'MAL-2025-1', summary: 'Malicious code in evil (npm)', severity: 'critical', malware: true, aliases: ['GHSA-mmmm-mmmm-mmmm'], ranges: [{ vulnerable: '>= 0' }] });
  });

  it('sends nothing for an empty list', async () => {
    const { impl, calls } = fakeFetch(() => ({ results: [] }));
    expect(await osvQueryBatch([], new Set(), impl)).toEqual(new Map());
    expect(calls).toHaveLength(0);
  });

  it('queries in chunks of 500', async () => {
    const { impl, calls } = fakeFetch(queries => ({ results: queries.map(() => ({})) }));
    const entries = Array.from({ length: 1001 }, (_, i) => ({ name: `pkg-${i}`, version: '1.0.0' }));
    const result = await osvQueryBatch(entries, new Set(), impl);
    expect(calls.map(c => JSON.parse(String(c.init?.body)).queries.length)).toEqual([500, 500, 1]);
    expect(result!.size).toBe(1001);
  });

  it('fetches at most 50 details and keeps the other ids without details', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `OSV-${i}`);
    const details = Object.fromEntries(ids.map(id => [id, { id, summary: id }]));
    const { impl, calls } = fakeFetch(() => ({ results: [{ vulns: ids.map(id => ({ id })) }] }), details);
    const result = await osvQueryBatch([{ name: 'x', version: '1.0.0' }], new Set(), impl);
    expect(OSV_DETAIL_LIMIT).toBe(50);
    expect(calls).toHaveLength(1 + 50);
    const vulns = result!.get('x@1.0.0')!.vulns;
    expect(vulns).toHaveLength(60);
    expect(vulns.filter(v => v.summary).length).toBe(50);
  });

  it('keeps an id whose detail request fails', async () => {
    const { impl } = fakeFetch(() => ({ results: [{ vulns: [{ id: 'OSV-GONE' }] }] }));
    const result = await osvQueryBatch([{ name: 'x', version: '1.0.0' }], new Set(), impl);
    expect(result!.get('x@1.0.0')!.vulns).toEqual([{ id: 'OSV-GONE', severity: 'unknown', malware: false, aliases: [], ranges: [] }]);
  });

  it('marks a paginated answer as incomplete', async () => {
    const { impl } = fakeFetch(() => ({ results: [{ vulns: [{ id: 'GHSA-aaaa-aaaa-aaaa' }], next_page_token: 'abc' }] }));
    expect((await osvQueryBatch([{ name: 'x', version: '1.0.0' }], new Set(['GHSA-aaaa-aaaa-aaaa']), impl))!.get('x@1.0.0')!.complete).toBe(false);
  });

  it('returns null on a network failure, an HTTP error or a malformed answer', async () => {
    const entries = [{ name: 'x', version: '1.0.0' }];
    const reject = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await osvQueryBatch(entries, new Set(), reject)).toBeNull();
    const http500 = vi.fn(async () => new Response('oops', { status: 500 })) as unknown as typeof fetch;
    expect(await osvQueryBatch(entries, new Set(), http500)).toBeNull();
    for (const body of [{}, { results: [] }, { results: [{}, {}] }, { results: [{ vulns: [{ id: 42 }] }] }, { results: [{ vulns: [{ id: '../../evil' }] }] }]) {
      const { impl } = fakeFetch(() => body);
      expect(await osvQueryBatch(entries, new Set(), impl), JSON.stringify(body)).toBeNull();
    }
    const notJson = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect(await osvQueryBatch(entries, new Set(), notJson)).toBeNull();
  });
});

describe('osvCacheFresh', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  it('is fresh for the same list within a day', () => {
    expect(osvCacheFresh('2026-11-04T00:00:01Z', 'a,b', 'a,b', now)).toBe(true);
  });
  it('is due when a day has passed, the list changed, or there is no usable timestamp', () => {
    expect(osvCacheFresh('2026-11-03T12:00:00Z', 'a,b', 'a,b', now)).toBe(false);
    expect(osvCacheFresh('2026-11-04T11:00:00Z', 'a,b,c', 'a,b', now)).toBe(false);
    expect(osvCacheFresh(undefined, 'a', 'a', now)).toBe(false);
    expect(osvCacheFresh('garbage', 'a', 'a', now)).toBe(false);
    expect(osvCacheFresh('2026-11-05T12:00:00Z', 'a', 'a', now)).toBe(false); // from the future
  });
});
