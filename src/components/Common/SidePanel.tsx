import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { usePanelLayer } from './panelStack';

// Close: the backdrop fades out (140 ms), then the panel slides out (220 ms); keep in step with index.css
const EXIT_MS = 360;
const WIDTHS = { md: '36rem', lg: '42rem' };

/** The app's reduced-motion setting or the system's */
export function useReducedMotion(): boolean {
  const { settings } = useSettings();
  return Boolean(settings.reducedMotion) || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

const CloseContext = createContext<() => void>(() => {});

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
  level?: number; // stacking among panels open together (vendor 1, CVE 2), then open order
  children: React.ReactNode;
}

/**
 * A detail view on the right in the reference glass. It slides in, then the dark backdrop fades in over the
 * page to its left; Escape (through the panel stack), the backdrop and PanelCloseButton reverse that before
 * calling onClose. Side panels sit at z-60 and up in stack order, under the reader (z-70).
 */
export const SidePanel: React.FC<SidePanelProps> = ({ open = true, onClose, title, labelledBy, width = 'md', level = 0, children }) => {
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
  const position = usePanelLayer(shown && !closing, requestClose, level);
  const lastPosition = useRef(0);
  if (position >= 0) lastPosition.current = position;
  const z = 60 + Math.min(lastPosition.current, 9);

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
        {/* Only the lowest panel dims the page; one stacked on it keeps a clear backdrop that still closes it */}
        <div className="panel-backdrop" data-state={state} data-clear={lastPosition.current > 0 || undefined} onClick={requestClose} aria-hidden="true" />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : title}
          aria-labelledby={labelledBy}
          data-state={state}
          className="side-panel glass-panel p-6 space-y-6 outline-none"
        >
          {children}
        </div>
      </div>
    </CloseContext.Provider>
  );
};
