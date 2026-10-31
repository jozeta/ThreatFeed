import { TvTransition } from '../../types';
import { SWAP_OUT_MS } from './useLivingWall';

/** Reveal's out fade (index.css `.tv-wall[data-transition='reveal'] .tv-cell[data-leaving]`) */
export const REVEAL_OUT_MS = 250;
const REDUCED_OUT_MS = 200;

/** The wall's `data-transition`: the setting, or 'reduced' under reduce motion */
export const wallTransition = (reduced: boolean, transition: TvTransition): TvTransition | 'reduced' =>
  reduced ? 'reduced' : transition;

/** The out phase lasts exactly as long as the leaving cell's CSS out animation, so no cell ever stands empty */
export const wallOutMs = (reduced: boolean, transition: TvTransition): number =>
  reduced ? REDUCED_OUT_MS : transition === 'reveal' ? REVEAL_OUT_MS : SWAP_OUT_MS;
