import { useEffect, useRef } from 'react';
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

/** Detection runs at most this often (leading and trailing); the app's refresh can flush data about once a second. */
export const DETECT_THROTTLE_MS = 5000;

interface DetectionOptions {
  page: string;
  /** Identities of the data behind `build`; a change triggers a run */
  data: unknown[];
  /** The app's first sync has completed (FeedContext `initialSyncDone`); before that all data counts as seen */
  synced: boolean;
  build: () => TvTile[];
  kevAdded: () => Map<string, string>;
  /** The wall takes news (it has settled); before that data changes are part of its starting build */
  acceptsNews: () => boolean;
  onBreaking: (tiles: TvTile[]) => void;
}

/**
 * Runs breaking-news detection on data changes, throttled. A change that happens before the app's first sync, before the
 * wall settles, or with a page change counts as seen (not news), even when the run it schedules happens later.
 */
export function useBreakingDetection(news: ReturnType<typeof useBreakingNews>, opts: DetectionOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRun = useRef(-Infinity);
  const page = useRef(opts.page);
  const seenOnly = useRef(false); // a change since the last run happened while gated

  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const o = optsRef.current;
    if (page.current !== o.page || !o.synced || !o.acceptsNews()) seenOnly.current = true;
    page.current = o.page;
    if (timer.current !== undefined) return; // the scheduled run reads the latest data
    const run = () => {
      timer.current = undefined;
      lastRun.current = Date.now();
      const cur = optsRef.current;
      const tiles = cur.build();
      if (seenOnly.current || !cur.synced || !cur.acceptsNews()) {
        seenOnly.current = false;
        news.markSeen(tiles);
        return;
      }
      const found = news.detect(tiles, cur.kevAdded(), Date.now());
      if (found.length) cur.onBreaking(found);
    };
    const wait = lastRun.current + DETECT_THROTTLE_MS - Date.now();
    if (wait <= 0) run();
    else timer.current = setTimeout(run, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.page, opts.synced, ...opts.data]);
}
