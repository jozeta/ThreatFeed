import { CSSProperties, useEffect, useState } from 'react';
import { flagOf, Panel } from './dashParts';

interface MapFile { viewBox: string; paths: Record<string, string> }

let mapPromise: Promise<MapFile> | null = null;
/** The map is one static file, fetched once per page life; a failed fetch is retried next time */
function loadMap(): Promise<MapFile> {
  if (!mapPromise) {
    mapPromise = fetch(`${import.meta.env.BASE_URL}data/world-map.json`)
      .then(r => { if (!r.ok) throw new Error(`world-map ${r.status}`); return r.json() as Promise<MapFile>; })
      .catch(e => { mapPromise = null; throw e; });
  }
  return mapPromise;
}

const EMPTY = '#1c222b';
const LOW = [0x2a, 0x1f, 0x3d];
const HIGH = [0xa8, 0x55, 0xf7];
/** Fill for a country: neutral for none, else a purple from dark (few) to bright (the most hit). The scale starts a
 *  quarter of the way up and follows a square root, so a country with one or two victims still reads on the TV */
export function shade(count: number, max: number): string {
  if (count <= 0 || max <= 0) return EMPTY;
  const t = 0.25 + 0.75 * Math.sqrt(Math.min(1, count / max));
  return '#' + LOW.map((c, i) => Math.round(c + (HIGH[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

export function WorldMap({ label, counts }: { label: string; counts: Record<string, number> }) {
  const [map, setMap] = useState<MapFile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadMap().then(m => live && setMap(m), () => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const ranked = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = ranked[0]?.[1] ?? 0;
  const rank = new Map(ranked.map(([c], i) => [c, i]));

  return (
    <Panel label={label}>
      {failed ? <div className="tv-note">Map unavailable</div> : !map ? <div className="tv-note">Loading map…</div> : (
        <div className="tv-map">
          <svg viewBox={map.viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
            {Object.entries(map.paths).map(([code, d]) => {
              const n = counts[code] ?? 0;
              return n > 0
                ? <path key={code} d={d} fill={shade(n, max)} className="tv-map-in" style={{ ['--j' as string]: rank.get(code) ?? 0 } as CSSProperties} />
                : <path key={code} d={d} fill={EMPTY} />;
            })}
          </svg>
          <div className="tv-map-top">
            {ranked.slice(0, 3).map(([code, n]) => (
              <span key={code} className="tv-map-top-item">{flagOf(code)} {code.toUpperCase()} <b>{n}</b></span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
