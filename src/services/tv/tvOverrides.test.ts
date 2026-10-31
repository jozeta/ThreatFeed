import { describe, expect, it } from 'vitest';
import { effectiveTv, readTvOverrides } from './tvOverrides';
import { DEFAULT_SETTINGS } from '../../context/SettingsContext';

const q = (s: string) => new URLSearchParams(s);

describe('readTvOverrides', () => {
  it('parses all six params', () => {
    expect(readTvOverrides(q('size=small&speed=slow&transition=fade&interval=90&qr=1&mix=1'))).toEqual({
      size: 'small', speed: 'slow', transition: 'fade', intervalSeconds: 90, qr: true, mix: true,
    });
  });
  it('drops invalid values and snaps the interval', () => {
    expect(readTvOverrides(q('size=huge&interval=7&qr=maybe'))).toEqual({ intervalSeconds: 30 });
  });
  it('qr=0 is false', () => {
    expect(readTvOverrides(q('qr=0'))).toEqual({ qr: false });
  });
  it('empty params give {}', () => {
    expect(readTvOverrides(q(''))).toEqual({});
  });
});

describe('effectiveTv', () => {
  it('fills from saved settings, mix off', () => {
    const saved = { ...DEFAULT_SETTINGS, tvTileSize: 'small' as const, tvQrCodes: true, tvIntervalSeconds: 120 };
    expect(effectiveTv(saved, {})).toEqual({
      size: 'small', speed: DEFAULT_SETTINGS.tvAnimationSpeed, transition: DEFAULT_SETTINGS.tvTransition,
      intervalSeconds: 120, qr: true, mix: false,
    });
  });
  it('overrides win', () => {
    expect(effectiveTv(DEFAULT_SETTINGS, { size: 'large', qr: true, mix: true }).size).toBe('large');
  });
});
