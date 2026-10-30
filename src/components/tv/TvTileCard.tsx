import { TvTile, TvTone } from '../../services/tv/tiles';

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
  tile: TvTile & { col: 1 | 2 | 3; row: 1 | 2 };
  index: number;
  now: number;
}

export default function TvTileCard({ tile, index, now }: Props) {
  const big = tile.col * tile.row > 1;
  const age = shortAge(tile.time, now);
  return (
    <article
      className="tv-tile"
      data-big={big ? '1' : '0'}
      style={{ gridColumn: `span ${tile.col}`, gridRow: `span ${tile.row}`, ['--i' as string]: index }}
    >
      <span className="tv-tile-bar" style={{ background: TONE_COLOR[tile.tone] }} />
      <div className="tv-tile-meta">
        {tile.source}
        {age && ` · ${age}`}
      </div>
      <h2 className="tv-tile-headline">{tile.headline}</h2>
      {tile.summary && <p className="tv-tile-summary">{tile.summary}</p>}
    </article>
  );
}
