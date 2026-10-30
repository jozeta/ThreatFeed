import { useCallback, useMemo, useRef } from 'react';
import { useFeeds } from '../context/FeedContext';
import { findProfile } from '../services/intelligence/actors';
import { EntityKind } from '../services/intelligence/trending';
import { groupDisplayName } from '../utils/countries';
import { openPanel } from './useHashRoute';

// A trending chip's entity
type Entity = { kind: EntityKind; name: string };

/**
 * Click handler for trending chips, opening a detail panel over the current page with a history entry (Back
 * closes it): a CVE its panel, a ransomware group its group panel, a threat actor with a profile (name or
 * alias) its actor or malware panel. Products, and actors without a profile, run a search as before.
 * actors.json only loads when an actor chip is clicked, so the newspaper doesn't pay for it. If loading
 * fails, the chip still searches.
 */
export function useOpenTrending(onSearch: (query: string) => void) {
  const { actors, ensureActors, incidents } = useFeeds();
  const pending = useRef(false);

  // Leak-site group names as trending spells them, back to the group panel's keys
  const groupKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of incidents?.victims ?? []) map.set(groupDisplayName(v.group).toLowerCase(), v.group.toLowerCase());
    return map;
  }, [incidents]);

  const open = useCallback(async (t: Entity) => {
    if (t.kind === 'cve') return openPanel('cve', t.name);
    if (t.kind === 'ransomware') return openPanel('group', groupKeys.get(t.name.toLowerCase()) ?? t.name.toLowerCase());
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
      if (hit) openPanel(hit.kind, hit.id);
      else onSearch(t.name);
    } finally {
      pending.current = false;
    }
  }, [actors, ensureActors, groupKeys, onSearch]);

  // What a click does, as far as is known before the click (for the tooltip)
  const clickHint = useCallback((t: Entity) => {
    if (t.kind === 'cve') return 'open the CVE';
    if (t.kind === 'ransomware') return 'open the group';
    return t.kind === 'actor' && findProfile(actors, t.name) !== null ? 'open the actor profile' : 'search';
  }, [actors]);
  return { open, clickHint };
}
