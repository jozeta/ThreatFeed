import { createContext } from 'react';
import { TvTransition } from '../../types';
import { REDUCED_OUT_MS, SWAP_OUT_MS } from './useLivingWall';

/** Reveal's out fade (index.css `.tv-wall[data-transition='reveal'] .tv-cell[data-leaving]`) */
export const REVEAL_OUT_MS = 250;
/** Reveal staggers an arrival batch by its order (index.css `.tv-wall[data-transition='reveal'] .tv-cell`) */
export const REVEAL_STAGGER_MS = 120;

/** The wall's `data-transition`: the setting, or 'reduced' under reduce motion */
export const wallTransition = (reduced: boolean, transition: TvTransition): TvTransition | 'reduced' =>
  reduced ? 'reduced' : transition;

/** The out phase lasts exactly as long as the leaving cell's CSS out animation, so no cell ever stands empty */
export const wallOutMs = (reduced: boolean, transition: TvTransition): number =>
  reduced ? REDUCED_OUT_MS : transition === 'reveal' ? REVEAL_OUT_MS : SWAP_OUT_MS;

/** How long until a cell's own in-animation starts (reveal: order × stagger), so JS arrival animations can wait for it */
export const cellDelayMs = (transition: TvTransition | 'reduced', order: number): number =>
  transition === 'reveal' ? order * REVEAL_STAGGER_MS : 0;

/** The delay of the wall cell a panel sits in */
export const CellDelayContext = createContext(0);
