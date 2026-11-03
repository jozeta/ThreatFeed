import { describe, it, expect } from 'vitest';
import { readPreviousLedger } from './previous';

const reject = (message: string) => async () => { throw new Error(message); };

describe('readPreviousLedger', () => {
  it('reads the previous ledger and tells a 404 from an outage', async () => {
    expect(await readPreviousLedger(reject('HTTP 404'), 'https://x/seen.json')).toEqual({ ok: true, ledger: null });

    const outage = await readPreviousLedger(reject('HTTP 503'), 'https://x/seen.json');
    expect(outage.ok).toBe(false);

    const good = await readPreviousLedger(
      async () => ({ version: 1, feeds: { news: {}, vulns: {}, ransomware: {} } }),
      'https://x/seen.json',
    );
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.ledger?.version).toBe(1);

    const garbage = await readPreviousLedger(async () => 'garbage', 'https://x/seen.json');
    expect(garbage.ok).toBe(false);

    expect(await readPreviousLedger(async () => { throw new Error('unused'); }, undefined)).toEqual({ ok: true, ledger: null });
  });
});
