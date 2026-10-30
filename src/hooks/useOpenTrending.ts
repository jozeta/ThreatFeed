import { useCallback, useRef } from 'react';
import { useFeeds } from '../context/FeedContext';
import { findProfile } from '../services/intelligence/actors';
import { TrendKind } from '../services/intelligence/trends';
import { useHashRoute } from './useHashRoute';

// A trending chip's or Trends row's entity
type Entity = { kind: TrendKind; name: string };

/**
 * Click handler for trending chips: a threat actor with a profile (name or alias) opens it on the Actors
 * page; everything else runs a search as before. actors.json only loads when an actor chip is clicked,
 * so the newspaper doesn't pay for it. If loading fails, the chip still searches.
 */
export function useOpenTrending(onSearch: (query: string) => void) {
  const { actors, ensureActors } = useFeeds();
  const [, navigate] = useHashRoute();
  const pending = useRef(false);
  const open = useCallback(async (t: Entity) => {
    if (t.kind !== 'actor') return onSearch(t.name);
    if (pending.current) return; // a repeat click while actors.json loads
    pending.current = true;
    const hashAtClick = window.location.hash;
    try {
      let data = actors;
      try {
        data ??= await ensureActors();
      } catch {
        data = null;
      }
      // The user moved on while it loaded: don't yank them back
      if (window.location.hash !== hashAtClick) return;
      const hit = findProfile(data, t.name);
      if (hit) navigate('actors', hit.kind === 'malware' ? 'malware' : '', new URLSearchParams({ [hit.kind]: hit.id }));
      else onSearch(t.name);
    } finally {
      pending.current = false;
    }
  }, [actors, ensureActors, navigate, onSearch]);
  // Whether a click opens a profile, as far as is known before the click (for the tooltip)
  const hasProfile = useCallback((t: Entity) => t.kind === 'actor' && findProfile(actors, t.name) !== null, [actors]);
  return { open, hasProfile };
}
