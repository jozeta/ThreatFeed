import { useSyncExternalStore } from 'react';

const PHONE = '(max-width: 639px)';

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

/** The sheet's phone container, or null on screens from `sm` up (so the controls aren't rendered twice there) */
export function useMobileSlot(): HTMLElement | null {
  const phone = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(PHONE).matches,
  );
  const el = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => slot,
  );
  return phone ? el : null;
}
