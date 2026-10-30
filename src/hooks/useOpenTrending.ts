import { useCallback } from 'react';
import { useFeeds } from '../context/FeedContext';
import { findProfile } from '../services/intelligence/actors';
import { TrendingEntity } from '../services/intelligence/trending';
import { useHashRoute } from './useHashRoute';

/**
 * Click handler for trending chips: a threat actor with a profile (name or alias) opens it on the Actors
 * page; everything else runs a search as before. actors.json only loads when an actor chip is clicked,
 * so the newspaper doesn't pay for it.
 */
export function useOpenTrending(onSearch: (query: string) => void) {
  const { actors, ensureActors } = useFeeds();
  const [, navigate] = useHashRoute();
  const open = useCallback(async (t: TrendingEntity) => {
    if (t.kind === 'actor') {
      const hit = findProfile(actors ?? (await ensureActors()), t.name);
      if (hit) {
        navigate('actors', hit.kind === 'malware' ? 'malware' : '', new URLSearchParams({ [hit.kind]: hit.id }));
        return;
      }
    }
    onSearch(t.name);
  }, [actors, ensureActors, navigate, onSearch]);
  // Whether a click opens a profile, as far as is known before the click (for the tooltip)
  const hasProfile = useCallback((t: TrendingEntity) => t.kind === 'actor' && findProfile(actors, t.name) !== null, [actors]);
  return { open, hasProfile };
}
