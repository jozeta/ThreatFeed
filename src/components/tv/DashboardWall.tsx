import { CSSProperties, ReactNode, useRef } from 'react';
import { useTvSettings } from './useTvSettings';
import { GRIDS, Shape } from '../../services/tv/tileEngine';
import { useReducedMotion } from '../Common/SidePanel';
import TvFooter from './TvFooter';
import { keepLive, useLivingWall } from './useLivingWall';
import { CellDelayContext, cellDelayMs, SPEED_FACTOR, wallOutMs, wallTransition } from './wallMotion';

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
  const tv = useTvSettings();
  const reduced = useReducedMotion();
  // Panels by id: every build's panels, with the kept copy winning for panels the live wall still holds
  const panelsById = useRef(new Map<string, PanelDef>());

  const size = tv.size;
  const { slots, leaving, label } = useLivingWall(
    (_full, live) => {
      const panels = build();
      // Panels the live wall still holds (on screen, leaving, queued) keep their content; `live` can be ahead of the last render
      panelsById.current = keepLive(new Map(panels.map(p => [p.id, p])), panelsById.current, live);
      return panels.map(({ id, weight, shapes }) => ({ id, weight, shapes }));
    },
    size,
    tv.intervalSeconds * 1000,
    { signature, outMs: wallOutMs(reduced, tv.transition, tv.speed) }
  );

  const shown = slots.filter(s => panelsById.current.has(s.itemId));
  if (shown.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 'clamp(1.5rem, 3vw, 4rem)', color: '#7d8a9a' }}>
        Waiting for data
      </div>
    );
  }

  const grid = GRIDS[size];
  const transition = wallTransition(reduced, tv.transition);
  return (
    <>
      <div
        className="tv-wall tv-dash-wall"
        data-size={size}
        data-transition={transition}
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`, ['--k' as string]: SPEED_FACTOR[tv.speed] } as CSSProperties}
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
            <CellDelayContext.Provider value={cellDelayMs(transition, s.order, tv.speed)}>
              {panelsById.current.get(s.itemId)!.render()}
            </CellDelayContext.Provider>
          </div>
        ))}
      </div>
      <TvFooter label={label} />
    </>
  );
}
