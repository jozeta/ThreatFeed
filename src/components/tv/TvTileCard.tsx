import { CSSProperties, useLayoutEffect, useRef } from 'react';
import { TvTileSize } from '../../types';
import { TvTile, TvTone } from '../../services/tv/tiles';
import TvQr from './TvQr';
import { useTvSettings } from './useTvSettings';

export const TONE_COLOR: Record<TvTone, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  info: '#3b82f6',
  ransomware: '#a855f7',
};

/** "35m", "2h", "3d" */
export function shortAge(iso: string | undefined, now: number): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

interface Props {
  tile: TvTile;
  size: TvTileSize;
  /** Cells covered (w × h); sets the type scale: 1 a single cell, 2 a wide or tall tile, 4 the hero */
  area: number;
  leaving: boolean;
  /** Breaking news in its first round: a red NEW badge by the source line */
  isNew?: boolean;
  now: number;
  style?: CSSProperties;
}

const areaClass = (area: number) => (area >= 4 ? 4 : area >= 2 ? 2 : 1);

export default function TvTileCard({ tile, size, area, leaving, isNew, now, style }: Props) {
  const tileRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const { qr } = useTvSettings();
  const showQr = qr && area >= 2 && !!tile.url;
  // Show only whole lines: the headline as many as the tile has room for (up to its CSS cap), the summary as many as
  // the height left allows, or none when fewer than two fit
  useLayoutEffect(() => {
    const art = tileRef.current;
    const h = headlineRef.current;
    if (!art || !h) return;
    const fit = () => {
      const hcs = getComputedStyle(h);
      const hLine = parseFloat(hcs.lineHeight);
      if (hLine > 0) {
        const acs = getComputedStyle(art);
        const meta = art.querySelector<HTMLElement>('.tv-tile-meta');
        const room = art.clientHeight - parseFloat(acs.paddingTop) - parseFloat(acs.paddingBottom)
          - (meta ? meta.offsetHeight + parseFloat(acs.rowGap || '0') : 0);
        const cap = parseInt(hcs.getPropertyValue('--tv-headline-lines'), 10) || 4;
        // The corner code keeps its height clear of the headline too
        const qrEl = qrRef.current;
        const reserve = qrEl ? qrEl.offsetHeight + parseFloat(acs.rowGap || '0') : 0;
        let lines = Math.max(1, Math.min(cap, Math.floor((room + 0.5) / hLine)));
        if (reserve && lines * hLine > room - reserve) lines = Math.max(1, Math.floor((room - reserve + 0.5) / hLine));
        h.style.webkitLineClamp = String(lines);
        h.style.maxHeight = `${lines * hLine}px`;
      }
      const el = summaryRef.current;
      const box = boxRef.current;
      if (!el || !box) return;
      // The summary runs beside the code, never under it: pad it by the code's width (which follows the tile's height)
      const qrBox = qrRef.current;
      box.style.paddingRight = qrBox ? `${qrBox.offsetWidth + (parseFloat(getComputedStyle(qrBox).right) || 0)}px` : '';
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const lines = lineHeight > 0 ? Math.floor((box.clientHeight + 0.5) / lineHeight) : 0;
      el.style.webkitLineClamp = String(Math.max(lines, 1));
      el.style.maxHeight = `${Math.max(lines, 1) * lineHeight}px`;
      el.style.visibility = lines >= 2 ? 'visible' : 'hidden';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(art);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [size, area, showQr]);
  const age = shortAge(tile.time, now);
  return (
    <article
      ref={tileRef}
      className="tv-cell tv-tile"
      data-size={size}
      data-area={areaClass(area)}
      data-leaving={leaving ? '1' : undefined}
      style={style}
    >
      <span className="tv-tile-bar" style={{ background: TONE_COLOR[tile.tone] }} />
      <div className="tv-tile-meta">
        {isNew && <span className="tv-new-badge">NEW</span>}
        {tile.source}
        {age && ` · ${age}`}
      </div>
      <h2 ref={headlineRef} className="tv-tile-headline">{tile.headline}</h2>
      {tile.summary && (
        <div ref={boxRef} className="tv-tile-summary-box" data-qr={showQr ? '1' : undefined}>
          <p ref={summaryRef} className="tv-tile-summary">{tile.summary}</p>
        </div>
      )}
      {showQr && (
        <div ref={qrRef} className="tv-qr-corner"><TvQr url={tile.url!} /></div>
      )}
    </article>
  );
}
