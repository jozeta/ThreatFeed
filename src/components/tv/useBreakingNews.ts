import { useRef } from 'react';
import { findBreaking } from '../../services/tv/breaking';
import { TvTile } from '../../services/tv/tiles';
import { Slot } from '../../services/tv/tileEngine';

/**
 * Breaking-news bookkeeping for a TV wall, kept apart from how the wall builds its tiles:
 * - `markSeen(tiles)`: tiles of a build that starts the wall (initial build, rebuild) are not news;
 * - `detect(tiles, kevAdded, now)`: the breaking tiles among fresh data, remembered so each breaks once;
 * - `isNew(slot)`: whether a tile shows the NEW badge. A breaking item's round is the wall cycle of the slot it first
 *   arrives in; the badge shows while the slot's cycle is that one, so a later cycle shows it as an ordinary story.
 */
export function useBreakingNews() {
  const seen = useRef(new Set<string>());
  const rounds = useRef(new Map<string, number | null>()); // id → cycle of its first arrival (null until it arrives)
  return useRef({
    markSeen(tiles: TvTile[]) {
      for (const t of tiles) seen.current.add(t.id);
    },
    detect(tiles: TvTile[], kevAdded: Map<string, string>, now: number): TvTile[] {
      const found = findBreaking(tiles, seen.current, kevAdded, now);
      for (const t of found) {
        seen.current.add(t.id);
        rounds.current.set(t.id, null);
      }
      return found;
    },
    isNew(slot: Pick<Slot, 'itemId' | 'cycle'>): boolean {
      const round = rounds.current.get(slot.itemId);
      if (round === undefined) return false;
      if (round === null) {
        rounds.current.set(slot.itemId, slot.cycle);
        return true;
      }
      return round === slot.cycle;
    },
  }).current;
}
