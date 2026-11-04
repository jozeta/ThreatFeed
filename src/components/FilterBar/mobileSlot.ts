import { useSyncExternalStore } from 'react';

/**
 * Where the Filter sheet shows the phone-only controls that belong to the page (the newspaper's
 * Sections / Clustering / Customize buttons). The sheet registers its container while it is open;
 * the page portals the same buttons, with the same handlers, into it.
 */
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setMobileSlot(el: HTMLElement | null) {
  if (slot === el) return;
  slot = el;
  listeners.forEach((l) => l());
}

export function useMobileSlot(): HTMLElement | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => slot,
  );
}
