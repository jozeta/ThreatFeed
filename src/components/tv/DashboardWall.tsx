import { CSSProperties, ReactNode, useRef } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { GRIDS, Shape, Slot } from '../../services/tv/tileEngine';
import { useReducedMotion } from '../Common/SidePanel';
import PageCounter from './PageCounter';
import { useLivingWall } from './useLivingWall';
import { wallOutMs, wallTransition } from './wallMotion';

/** One dashboard panel in the wall's pool; `render` mounts it afresh on every arrival (so its data is computed then) */
export interface PanelDef { id: string; weight: number; shapes: Shape[]; render: () => ReactNode }

/** Number panels take one cell; charts and lists are never smaller than a wide cell */
export const NUMBER_SHAPES: Shape[] = ['1x1'];
export const WIDE_SHAPES: Shape[] = ['2x1', '2x2'];

/**
 * A dashboard as a living wall: the same grid, timers, per-cell transitions and page counter as the TV wall. `build`
 * returns the panels that have data (asked again at every cycle); `signature` changes when data arrives late.
 */
export default function DashboardWall({ build, signature }: { build: () => PanelDef[]; signature?: string | number }) {
  const { settings } = useSettings();
  const reduced = useReducedMotion();
  // Panels by id: every build's panels, plus whatever is still on screen from earlier builds
  const panelsById = useRef(new Map<string, PanelDef>());
  const onScreen = useRef<Slot[]>([]);

  const size = settings.tvTileSize;
  const { slots, leaving, label } = useLivingWall(
    () => {
      const panels = build();
      const next = new Map(panels.map(p => [p.id, p]));
      for (const s of onScreen.current) {
        const p = panelsById.current.get(s.itemId);
        if (p && !next.has(p.id)) next.set(p.id, p);
      }
      panelsById.current = next;
      return panels.map(({ id, weight, shapes }) => ({ id, weight, shapes }));
    },
    size,
    settings.tvIntervalSeconds * 1000,
    { signature, outMs: wallOutMs(reduced, settings.tvTransition) }
  );
  onScreen.current = slots;

  const shown = slots.filter(s => panelsById.current.has(s.itemId));
  if (shown.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 4rem)', color: '#7d8a9a' }}>
        Waiting for data
      </div>
    );
  }

  const grid = GRIDS[size];
  return (
    <>
      <div
        className="tv-wall tv-dash-wall"
        data-size={size}
        data-transition={wallTransition(reduced, settings.tvTransition)}
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}
      >
        {shown.map(s => (
          <div
            key={s.key}
            className="tv-cell tv-slot"
            data-size={size}
            data-panel={s.itemId}
            data-leaving={leaving.has(s.key) ? '1' : undefined}
            style={{ gridColumn: `${s.col + 1} / span ${s.w}`, gridRow: `${s.row + 1} / span ${s.h}`, ['--i' as string]: s.order } as CSSProperties}
          >
            {panelsById.current.get(s.itemId)!.render()}
          </div>
        ))}
      </div>
      <PageCounter label={label} />
    </>
  );
}
