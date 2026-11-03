import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDayKey } from './date';
import { vulnExtras } from '../services/tv/dashboard';
import { VulnData } from '../types';

// Node re-reads process.env.TZ when it is assigned, so each test pins the zone (and the clock) itself.
const setZone = (tz: string) => vi.stubEnv('TZ', tz);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('localDayKey', () => {
  it('uses the local calendar day at 00:30 CET (UTC+1), where UTC is still the day before', () => {
    setZone('Europe/Stockholm');
    const t = Date.parse('2026-01-14T23:30:00Z'); // 00:30 on the 15th in Stockholm
    expect(t).toBe(new Date(2026, 0, 15, 0, 30).getTime());
    expect(localDayKey(t)).toBe('2026-01-15');
    expect(new Date(t).toISOString().slice(0, 10)).toBe('2026-01-14');
  });

  it('uses the local calendar day at 00:30 CEST (UTC+2)', () => {
    setZone('Europe/Stockholm');
    const t = Date.parse('2026-07-14T22:30:00Z'); // 00:30 on the 15th
    expect(localDayKey(t)).toBe('2026-07-15');
  });

  it('accepts a Date and follows the zone in the Americas', () => {
    setZone('America/New_York');
    const d = new Date('2026-01-15T03:30:00Z'); // 22:30 on the 14th in New York
    expect(localDayKey(d)).toBe('2026-01-14');
  });

  it('zero-pads month and day', () => {
    setZone('Europe/Stockholm');
    expect(localDayKey(new Date(2026, 2, 5, 12))).toBe('2026-03-05');
  });
});

describe('vulnExtras kevDue around local midnight', () => {
  const data = (dueDates: string[]) => ({
    kev: dueDates.map((dueDate, i) => ({ cve: `CVE-2026-${i}`, vendor: 'V', product: 'P', dueDate })),
  }) as unknown as VulnData;

  it('treats the local day as today at 00:30 CET: yesterday no longer due, today is', () => {
    setZone('Europe/Stockholm');
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-01-14T23:30:00Z')); // 00:30 on 2026-01-15 local
    const due = vulnExtras(data(['2026-01-14', '2026-01-15', '2026-01-21', '2026-01-22']), null, [], [], Date.now()).kevDue;
    expect(due.map(d => d.dueDate)).toEqual(['2026-01-15', '2026-01-21']);
  });

  it('does the same at 00:30 CEST', () => {
    setZone('Europe/Stockholm');
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-07-14T22:30:00Z')); // 00:30 on 2026-07-15 local
    const due = vulnExtras(data(['2026-07-14', '2026-07-15', '2026-07-21', '2026-07-22']), null, [], [], Date.now()).kevDue;
    expect(due.map(d => d.dueDate)).toEqual(['2026-07-15', '2026-07-21']);
  });
});
