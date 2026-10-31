import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ActiveNavTab } from '../../types';
import { usePanelLayer } from '../Common/panelStack';
import { exitTv, leaveFullscreen, resetTvExit, TvKind } from './tvRoute';
import { useAutoReload } from './useAutoReload';
import { useTvChrome } from './useTvChrome';
import TvWall from './TvWall';
import VulnDashboard from './VulnDashboard';
import RansomDashboard from './RansomDashboard';

const TV_LEVEL = 30; // above the shortcuts modal: Escape leaves the TV first, global shortcuts wait

/** The full-screen frame for TV mode and Dashboard mode; always dark, whatever the theme */
export default function TvShell({ kind, page }: { kind: TvKind; page: ActiveNavTab }) {
  const { idle } = useTvChrome();
  usePanelLayer(true, exitTv, TV_LEVEL);
  useAutoReload();

  // A new TV session: exitTv may run (once) again, however the mode was entered (a shared link, a reload)
  useEffect(() => resetTvExit(), []);

  // However the mode ends (Back, a hash edit, another page), the browser leaves full screen with it
  useEffect(() => leaveFullscreen, []);

  // The page behind never scrolls (Space, PageDown, scrollbars)
  useEffect(() => {
    const el = document.documentElement;
    const previous = el.style.overflow;
    el.style.overflow = 'hidden';
    return () => { el.style.overflow = previous; };
  }, []);

  // Leaving full screen (Esc, the browser's own control) leaves the mode, but only if we got into it
  const enteredFullscreen = useRef(false);
  useEffect(() => {
    if (document.fullscreenElement) enteredFullscreen.current = true;
    const onChange = () => {
      if (document.fullscreenElement) enteredFullscreen.current = true;
      else if (enteredFullscreen.current) exitTv();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <div
      className="tv-root fixed inset-0 z-[90] overflow-hidden"
      data-kind={kind}
      data-page={page}
      style={{ cursor: idle ? 'none' : undefined }}
    >
      {kind === 'tv' ? (
        <TvWall page={page} />
      ) : (
        page === 'ransomware' ? <RansomDashboard /> : <VulnDashboard />
      )}
      <button
        type="button"
        onClick={exitTv}
        aria-label="Exit TV mode"
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-opacity duration-500 hover:!opacity-100 focus-visible:!opacity-100"
        style={{ color: '#e7ebf0', background: 'rgba(255,255,255,0.08)', opacity: idle ? 0 : 0.35 }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
