import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { READER_LEVEL, useSidePanelLayer } from './panelStack';

// Close: the backdrop fades out (140 ms), then the panel slides out (220 ms); keep in step with index.css
const EXIT_MS = 360;
const WIDTHS = { md: '36rem', lg: '42rem' };

/** The app's reduced-motion setting or the system's */
export function useReducedMotion(): boolean {
  const { settings } = useSettings();
  return Boolean(settings.reducedMotion) || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

const CloseContext = createContext<() => void>(() => {});

/**
 * Where the panels inside sit among the open panels: App gives each host the place of its hash parameter
 * (panelLevels), so the one opened last is on top. Without it, panels stack in the order they open.
 */
export const PanelLevel = createContext(0);

/** How long a panel's entrance holds back motion inside it (its stat tiles count up once they've faded in) */
export const PanelEntranceDelay = createContext(0);
const ENTRANCE_MS = 240;

/** The panel's ✕, closing with the exit animation like Escape and the backdrop do */
export const PanelCloseButton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <button onClick={useContext(CloseContext)} className={`p-1 text-theme-text-muted hover:text-theme-text shrink-0 ${className}`} aria-label="Close">
    <X className="w-5 h-5" />
  </button>
);

interface SidePanelProps {
  open?: boolean;
  onClose: () => void;
  title?: string; // accessible name, when no labelledBy
  labelledBy?: string;
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}

/**
 * A detail view on the right in the reference glass. It slides in, then the dark backdrop fades in over the
 * page to its left, and its sections fade up one after another (.stagger); Escape (through the panel stack), the backdrop and PanelCloseButton reverse that before
 * calling onClose. Side panels sit at z-60 and up in stack order, under the reader (z-70) unless opened from it.
 */
export const SidePanel: React.FC<SidePanelProps> = ({ open = true, onClose, title, labelledBy, width = 'md', children }) => {
  const level = useContext(PanelLevel);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  // Plays the exit, then hides; `notify` for closes the panel starts itself (the parent then unmounts it)
  const exit = useCallback((notify: boolean) => {
    const done = () => { setShown(false); setClosing(false); if (notify) onCloseRef.current(); };
    if (reduced) return done();
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(done, EXIT_MS);
  }, [reduced]);
  const requestClose = useCallback(() => exit(true), [exit]);

  useEffect(() => {
    if (open) { clearTimeout(timer.current); setClosing(false); setShown(true); } else exit(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kept through the exit, when the panel has already left the stack
  const [position, dims] = useSidePanelLayer(shown && !closing, requestClose, level);
  const lastPosition = useRef(0);
  const lastDims = useRef(true);
  if (position >= 0) { lastPosition.current = position; lastDims.current = dims; }
  // Panels opened from the reader go over it (z-70), still under the shortcuts modal (z-80)
  const z = (level > READER_LEVEL ? 71 : 60) + Math.min(lastPosition.current, 8);

  // Focus moves into the panel, and back to whatever opened it once it goes
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [shown]);

  if (!shown) return null;
  const state = closing ? 'closed' : 'open';
  return (
    <CloseContext.Provider value={requestClose}>
      <div className="fixed inset-0" style={{ zIndex: z, '--panel-w': WIDTHS[width] } as React.CSSProperties}>
        {/* Only the lowest panel dims the page, and the lowest over the reader dims the reader; one stacked on
            another keeps a clear backdrop that still closes it */}
        <div className="panel-backdrop" data-state={state} data-clear={!lastDims.current || undefined} onClick={requestClose} aria-hidden="true" />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : title}
          aria-labelledby={labelledBy}
          data-state={state}
          className="side-panel glass-panel stagger p-6 space-y-6 outline-none"
        >
          <PanelEntranceDelay.Provider value={reduced ? 0 : ENTRANCE_MS}>{children}</PanelEntranceDelay.Provider>
        </div>
      </div>
    </CloseContext.Provider>
  );
};
