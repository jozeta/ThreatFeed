import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * One Escape stack for every panel and modal: each registers while open, and Escape closes only the top entry.
 * Entries sort by level, then open order: side panels take their hash parameter's place (PanelLevel), so the
 * one opened last is on top even when an earlier one's data loads later; the reader and shortcuts sit above.
 */

export interface PanelEntry {
  close: () => void;
  level: number;
  seq: number;
}

/** Levels above the side panels: the reader, then the shortcuts modal */
export const READER_LEVEL = 10;
export const SHORTCUTS_LEVEL = 20;

export function createPanelStack() {
  let entries: PanelEntry[] = [];
  let seq = 0;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());

  const remove = (entry: PanelEntry) => {
    if (!entries.includes(entry)) return;
    entries = entries.filter((e) => e !== entry);
    changed();
  };

  return {
    push(close: () => void, level = 0): PanelEntry {
      const entry = { close, level, seq: seq++ };
      entries = [...entries, entry].sort((a, b) => a.level - b.level || a.seq - b.seq);
      changed();
      return entry;
    },
    remove,
    /** Index from the bottom, or -1 once removed */
    position: (entry: PanelEntry) => entries.indexOf(entry),
    size: () => entries.length,
    /**
     * Whether a side panel dims what is under it: the lowest one dims the page, and the lowest one over the reader
     * dims the reader; one stacked on another keeps a clear backdrop. False once removed
     */
    dims: (entry: PanelEntry) => {
      const i = entries.indexOf(entry);
      return i === 0 || (i > 0 && entry.level > READER_LEVEL && entries[i - 1].level <= READER_LEVEL);
    },
    /** Takes the top entry off and closes it; false when nothing is open */
    escape(): boolean {
      const top = entries[entries.length - 1];
      if (!top) return false;
      remove(top);
      top.close();
      return true;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type PanelStack = ReturnType<typeof createPanelStack>;

export const panelStack = createPanelStack();

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

/** Escape in a field only leaves the field (useKeyboardNavigation blurs it); otherwise the top entry closes alone */
export function handleEscapeKey(e: KeyboardEvent, stack: PanelStack = panelStack) {
  if (e.key !== 'Escape' || isTyping(e.target) || !stack.escape()) return;
  e.preventDefault();
  e.stopPropagation();
}

/** The app's single-key shortcuts (r, f, /, ?) wait while a modal (isModalOpen) or any panel is open */
export const shortcutsBlocked = (isModalOpen: boolean, stack: PanelStack = panelStack) => isModalOpen || stack.size() > 0;

// Capture phase on window: runs before any other keydown listener, so nothing underneath sees the key.
// Removed again when Vite hot-swaps this module, so edits don't stack up listeners
const onKeyDown = (e: KeyboardEvent) => handleEscapeKey(e);
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown, true);
  import.meta.hot?.dispose(() => window.removeEventListener('keydown', onKeyDown, true));
}

function usePanelEntry(active: boolean, close: () => void, level: number): PanelEntry | null {
  const closeRef = useRef(close);
  closeRef.current = close;
  const [entry, setEntry] = useState<PanelEntry | null>(null);
  useEffect(() => {
    if (!active) return;
    const e = panelStack.push(() => closeRef.current(), level);
    setEntry(e);
    return () => { panelStack.remove(e); setEntry(null); };
  }, [active, level]);
  return entry;
}

/**
 * Registers a panel while `active`, closing through the latest `close`. Returns its position in the stack
 * (-1 when not registered), which side panels turn into their z-index.
 */
export function usePanelLayer(active: boolean, close: () => void, level = 0): number {
  const entry = usePanelEntry(active, close, level);
  return useSyncExternalStore(panelStack.subscribe, () => (entry ? panelStack.position(entry) : -1));
}

/** usePanelLayer for a side panel: its position, and whether its backdrop dims what is under it (dims) */
export function useSidePanelLayer(active: boolean, close: () => void, level = 0): [number, boolean] {
  const entry = usePanelEntry(active, close, level);
  const position = useSyncExternalStore(panelStack.subscribe, () => (entry ? panelStack.position(entry) : -1));
  const dims = useSyncExternalStore(panelStack.subscribe, () => (entry ? panelStack.dims(entry) : false));
  return [position, dims];
}
