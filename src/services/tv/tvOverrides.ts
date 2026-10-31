import type { TvAnimationSpeed, TvTileSize, TvTransition, UserSettings } from '../../types';
import { migrateTvInterval } from './tvSettings';

/** What one screen actually uses: the saved settings with any link parameters on top */
export interface TvEffective {
  size: TvTileSize;
  speed: TvAnimationSpeed;
  transition: TvTransition;
  intervalSeconds: number;
  qr: boolean;
  mix: boolean;
}

const SIZES: TvTileSize[] = ['large', 'medium', 'small', 'xsmall'];
const SPEEDS: TvAnimationSpeed[] = ['slow', 'medium', 'fast'];
const TRANSITIONS: TvTransition[] = ['fade', 'slide', 'reveal'];

const oneOf = <T extends string>(allowed: readonly T[], v: string | null): T | undefined =>
  allowed.find((a) => a === v);

/** Per-screen settings from the link (?size=&speed=&transition=&interval=&qr=&mix=); invalid values are dropped */
export function readTvOverrides(params: URLSearchParams): Partial<TvEffective> {
  const out: Partial<TvEffective> = {};
  const size = oneOf(SIZES, params.get('size'));
  if (size) out.size = size;
  const speed = oneOf(SPEEDS, params.get('speed'));
  if (speed) out.speed = speed;
  const transition = oneOf(TRANSITIONS, params.get('transition'));
  if (transition) out.transition = transition;
  const rawInterval = params.get('interval');
  if (rawInterval && rawInterval.trim() !== '' && Number.isFinite(Number(rawInterval))) {
    out.intervalSeconds = migrateTvInterval({ tvIntervalSeconds: Number(rawInterval) });
  }
  const qr = params.get('qr');
  if (qr === '1') out.qr = true;
  else if (qr === '0') out.qr = false;
  if (params.get('mix') === '1') out.mix = true;
  return out;
}

export function effectiveTv(saved: UserSettings, overrides: Partial<TvEffective>): TvEffective {
  return {
    size: saved.tvTileSize,
    speed: saved.tvAnimationSpeed,
    transition: saved.tvTransition,
    intervalSeconds: saved.tvIntervalSeconds,
    qr: saved.tvQrCodes,
    mix: false,
    ...overrides,
  };
}
