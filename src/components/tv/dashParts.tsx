import { CSSProperties, ReactNode, useContext, useLayoutEffect, useRef, useState } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { useTvSettings } from './useTvSettings';
import { useReducedMotion } from '../Common/SidePanel';
import { monotonePath } from '../charts/MentionsArea';
import { Figure } from '../../services/tv/dashboard';
import type { Slice } from '../charts/chartData';
import type { BarBucket } from '../charts/StackedBars';
import { DONUT_COLORS, slicesSummary } from '../charts/DonutChart';
import { CellDelayContext, SPEED_FACTOR } from './wallMotion';

/** Dashboard building blocks: all sizes in vw so the screen scales from 1280 to 3840 wide */

export const HISTORY_NOTE = 'History is building — fills in over the coming weeks';

/** Arrival animations: how long a number counts up; `--j` staggers bars and rows (see index.css .tv-grow-x etc.) */
export const COUNT_UP_DASH_MS = 1000;
const nth = (j: number) => ({ ['--j' as string]: j }) as CSSProperties;

export const flagOf = (code: string) =>
  /^[A-Za-z]{2}$/.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

/** How many whole equal-height rows fit in the box; the first row is measured */
function useFit(total: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(total);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const row = el.firstElementChild as HTMLElement | null;
      const rowH = row?.getBoundingClientRect().height ?? 0;
      if (!rowH) return setCount(total);
      setCount(Math.min(total, Math.max(1, Math.floor((el.getBoundingClientRect().height + 0.5) / rowH))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);
  return [ref, Math.min(count, total)];
}

/** A dashboard panel; it fills the wall cell it is given */
export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tv-panel">
      <div className="tv-label">{label}</div>
      {children}
    </section>
  );
}

export function Delta({ delta, versus }: { delta?: number; versus: string }) {
  if (delta === undefined) return null;
  if (delta === 0) return <span className="tv-delta">no change {versus}</span>;
  return (
    <span className="tv-delta">
      <b style={{ color: delta > 0 ? '#f87171' : '#34d399' }}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</b> {versus}
    </span>
  );
}

/** A text value longer than this steps down a size and may wrap to two lines, so whole words show */
const LONG_TEXT = 14;

export function StatCard({ label, figure, value, color, versus = 'vs last week', note, text, spark }: {
  label: string; figure?: Figure; value?: number; color?: string; versus?: string; note?: string; text?: string;
  /** Daily values, oldest first, drawn as a line under the number */
  spark?: number[];
}) {
  const reduced = useReducedMotion();
  const tv = useTvSettings();
  // Starts when the cell itself appears (reveal staggers cells), so the visible count begins at 0
  const n = useCountUp(figure?.value ?? value ?? 0, reduced, useContext(CellDelayContext), COUNT_UP_DASH_MS * SPEED_FACTOR[tv.speed]);
  return (
    <section className="tv-panel">
      <div className="tv-label">{label}</div>
      <div className="tv-stat">
        {text !== undefined
          ? <div className={`tv-big tv-big-text${text.length > LONG_TEXT ? ' tv-big-text-long' : ''}`} style={{ color }} title={text}>{text}</div>
          : <div className="tv-big" style={{ color }}>{Math.round(n).toLocaleString()}</div>}
        {figure ? <Delta delta={figure.delta} versus={versus} /> : note ? <span className="tv-delta">{note}</span> : null}
        {spark && <Sparkline label={`${label}: ${spark.join(', ')}`} values={spark} color={color ?? '#e7ebf0'} />}
      </div>
    </section>
  );
}

/** Rows come in one after another; as many whole rows as the panel has room for (a 2×2 panel shows more) */
export function ListPanel<T>({ label, items, row, empty = 'Nothing to show yet', head }: {
  label: string; items: T[]; row: (item: T) => ReactNode; empty?: string; head?: ReactNode;
}) {
  const [ref, count] = useFit(items.length);
  return (
    <Panel label={label}>
      {head}
      {items.length === 0 ? <div className="tv-note">{empty}</div> : (
        <div ref={ref} className="tv-fit">
          {items.slice(0, count).map((it, i) => <div key={i} className="tv-row tv-row-in" style={nth(i)}>{row(it)}</div>)}
        </div>
      )}
    </Panel>
  );
}

/** Horizontal bars that grow from the left, one after another; `color` may differ per row */
export function HBarList({ label, data, color, format, note }: {
  label: string; data: [string, number][]; color: string | ((name: string) => string); format?: (name: string) => ReactNode; note?: ReactNode;
}) {
  const [ref, count] = useFit(data.length);
  const max = Math.max(1, ...data.map(d => d[1]));
  return (
    <Panel label={label}>
      {data.length === 0 ? <div className="tv-note">Nothing to show yet</div> : (
        <div ref={ref} className="tv-fit">
          {data.slice(0, count).map(([name, n], i) => (
            <div key={name} className="tv-row tv-hbar">
              <span className="tv-hbar-name">{format ? format(name) : name}</span>
              <span className="tv-hbar-track">
                <i className="tv-grow-x" style={{ ...nth(i), width: `${Math.max(2, (n / max) * 100)}%`, background: typeof color === 'string' ? color : color(name) }} />
              </span>
              <span className="tv-hbar-n">{n}</span>
            </div>
          ))}
        </div>
      )}
      {note}
    </Panel>
  );
}

/** Vertical bars that grow from the bottom, one after another; value above, label under. A null value has no bar and no value (no history yet). */
export function VBars({ label, data, color, showValue }: {
  label: string; data: { label: string; n: number | null }[]; color: string | ((i: number) => string);
  /** Which bars show their value (all by default); the others keep the space so bars stay aligned */
  showValue?: (i: number) => boolean;
}) {
  const max = Math.max(1, ...data.map(d => d.n ?? 0));
  return (
    <Panel label={label}>
      <div className="tv-vbars" role="img" aria-label={label}>
        {data.map((d, i) => (
          <div key={d.label + i} className="tv-vbar">
            <span className="tv-vbar-n">{d.n !== null && (!showValue || showValue(i)) ? d.n : '\u00a0'}</span>
            <span className="tv-vbar-track">
              {d.n !== null && <i className="tv-grow-y" style={{ ...nth(i), height: `${d.n ? Math.max(2, (d.n / max) * 100) : 0}%`, background: typeof color === 'string' ? color : color(i) }} />}
            </span>
            <span className="tv-vbar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * An SVG drawn in the box's own pixels (measured), so strokes keep their width without `vector-effect` and a
 * `pathLength="1"` line draws evenly with stroke-dashoffset
 */
function ChartBox({ label, children, className = 'tv-chart' }: { label?: string; children: (w: number, h: number) => ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Layout size, not getBoundingClientRect: a cell arriving with a scale transition would be measured mid-animation
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setBox(b => (b && w === b[0] && h === b[1] ? b : [w, h]));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {box && box[0] > 0 && box[1] > 0 && (
        <svg width={box[0]} height={box[1]} viewBox={`0 0 ${box[0]} ${box[1]}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
          {children(box[0], box[1])}
        </svg>
      )}
    </div>
  );
}
const strokeFor = (w: number) => Math.max(2, Math.round(w / 300));

/** A chart needs at least 2 points (weeks or days) where any series is above zero */
export const chartReady = (points: number[][]) => points.filter(p => p.some(v => v > 0)).length >= 2;

/** Bars grow, then the line draws from left to right */
export function WeeklyBarsLine({ label, weekly }: {
  label: string; weekly: { week: string; critical: number | null; kev: number }[];
}) {
  const ready = chartReady(weekly.map(w => [w.critical ?? 0, w.kev]));
  const n = weekly.length;
  const max = Math.max(1, ...weekly.map(w => Math.max(w.critical ?? 0, w.kev)));
  return (
    <Panel label={label}>
      {!ready ? <div className="tv-note">{HISTORY_NOTE}</div> : (
        <>
          <ChartBox label={label}>
            {(W, H) => {
              const sw = strokeFor(W);
              const slot = n ? W / n : W;
              const x = (i: number) => slot * i + slot / 2;
              const y = (v: number) => H - sw - (v / max) * (H - 2 * sw);
              return (
                <>
                  <g fill="#ef4444" opacity=".85">
                    {weekly.map((w, i) => w.critical === null ? null : <rect key={w.week} className="tv-grow-y" style={nth(i)} x={slot * i + slot * 0.15} y={y(w.critical)} width={slot * 0.7} height={H - sw - y(w.critical)} />)}
                  </g>
                  <path className="tv-draw" pathLength={1} d={monotonePath(weekly.map((w, i) => [x(i), y(w.kev)] as [number, number]))} fill="none" stroke="#fb923c" strokeWidth={sw} strokeLinecap="round" />
                </>
              );
            }}
          </ChartBox>
          <div className="tv-legend"><span style={{ color: '#ef4444' }}>{'■'}</span> critical CVEs <span style={{ color: '#fb923c', marginLeft: '1.2vw' }}>{'━'}</span> added to KEV</div>
        </>
      )}
    </Panel>
  );
}

/** The line draws from left to right, then the fill fades in under it */
export function DailyArea({ label, daily, color }: {
  label: string; daily: { day: string; count: number }[]; color: string;
}) {
  const ready = chartReady(daily.map(d => [d.count]));
  const n = daily.length;
  const max = Math.max(1, ...daily.map(d => d.count));
  return (
    <Panel label={label}>
      {!ready ? <div className="tv-note">{HISTORY_NOTE}</div> : (
        <ChartBox label={label}>
          {(W, H) => {
            const sw = strokeFor(W);
            const pts = daily.map((d, i) => [n > 1 ? (W * i) / (n - 1) : 0, H - sw - (d.count / max) * (H - 2 * sw)] as [number, number]);
            const line = monotonePath(pts);
            return (
              <>
                <path className="tv-area-in" d={`${line} L${W},${H} L0,${H} Z`} fill={color} fillOpacity=".25" />
                <path className="tv-draw" pathLength={1} d={line} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
              </>
            );
          }}
        </ChartBox>
      )}
    </Panel>
  );
}

/** A small line of daily values under a number: it draws from left to right, then the fill fades in */
function Sparkline({ label, values, color }: { label: string; values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  return (
    <ChartBox label={label} className="tv-spark">
      {(W, H) => {
        const sw = strokeFor(W);
        const pts = values.map((v, i) => [n > 1 ? (W * i) / (n - 1) : 0, H - sw - (v / max) * (H - 2 * sw)] as [number, number]);
        const line = monotonePath(pts);
        return (
          <>
            <path className="tv-area-in" d={`${line} L${W},${H} L0,${H} Z`} fill={color} fillOpacity=".2" />
            <path className="tv-draw" pathLength={1} d={line} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          </>
        );
      }}
    </ChartBox>
  );
}

/**
 * Severity colours on the TV, for donuts and stacked bars alike. Hex, never theme classes: the wall is always dark,
 * and a `dark:` variant would follow the app's theme instead.
 */
export const TV_SEVERITY: Record<string, string> = { Critical: '#e11d48', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' };
export const NEUTRAL_COLOR = '#94a3b8';
/** Labels that aren't a category; they are grey and take no rank colour */
const NEUTRAL_LABELS = new Set(['Other', 'Unknown', 'No CWE']);

/**
 * One colour per series (donut slice or stacked segment), in order: neutral labels grey; by label from `colors` when
 * given (grey when missing); else the donut palette in rank order, counting coloured series only, so the first real
 * category always gets the first colour.
 */
export function seriesColors(series: { label: string; other?: boolean }[], colors?: Record<string, string>): string[] {
  let rank = 0;
  return series.map(s => {
    if (s.other || NEUTRAL_LABELS.has(s.label)) return NEUTRAL_COLOR;
    if (colors) return colors[s.label] ?? NEUTRAL_COLOR;
    return DONUT_COLORS[rank++ % DONUT_COLORS.length];
  });
}

/**
 * A donut of `foldSlices` output with the total in the centre and a legend of every slice with its count and share.
 * Labels are untrusted and render as text only. The slices fade in one after another.
 */
export function DonutPanel({ label, data, colors }: { label: string; data: Slice[]; colors?: Record<string, string> }) {
  const total = data.reduce((n, s) => n + s.value, 0);
  const color = seriesColors(data, colors);
  return (
    <Panel label={label}>
      {data.length === 0 ? <div className="tv-note">Nothing to show yet</div> : (
        <div className="tv-donut" role="img" aria-label={`${label}: ${slicesSummary(data)}`}>
          <div className="tv-donut-in">
            <ChartBox className="tv-donut-ring">
              {(W, H) => {
                const size = Math.min(W, H);
                const stroke = size * 0.2;
                const r = (size - stroke) / 2;
                const cx = W / 2, cy = H / 2;
                let offset = 0;
                return (
                  <>
                    {data.map((s, i) => {
                      const len = data.length === 1 ? 100 : (s.value / total) * 100;
                      const gap = data.length === 1 ? 0 : 0.6;
                      const el = (
                        <circle
                          key={`${s.label}-${i}`} className="tv-fade" style={nth(i)} cx={cx} cy={cy} r={r} fill="none" stroke={color[i]} strokeWidth={stroke}
                          pathLength={100} strokeDasharray={`${Math.max(0, len - gap)} ${100 - Math.max(0, len - gap)}`} strokeDashoffset={-offset}
                          transform={`rotate(-90 ${cx} ${cy})`}
                        />
                      );
                      offset += len;
                      return el;
                    })}
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#e7ebf0" fontWeight={800} fontSize={size * 0.2}>
                      {total.toLocaleString()}
                    </text>
                  </>
                );
              }}
            </ChartBox>
            <ul className="tv-donut-legend">
              {data.map((s, i) => (
                <li key={`${s.label}-${i}`} className="tv-row-in" style={nth(i)}>
                  <i style={{ background: color[i] }} />
                  <span className="tv-donut-name" title={s.label}>{s.label}</span>
                  <span className="tv-donut-n">{s.value.toLocaleString()} {'·'} {s.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Stacked bars, one per day, growing up one after another; a legend of the segments that occur and the day range with
 * the peak under them. Segment colours follow `seriesColors` (as the donuts do), not the builders' theme classes.
 */
export function StackedPanel({ label, buckets, axis = b => b.short, colors }: {
  label: string; buckets: BarBucket[]; axis?: (b: BarBucket) => string; colors?: Record<string, string>;
}) {
  const totals = buckets.map(b => b.segments.reduce((n, s) => n + s.value, 0));
  const max = Math.max(1, ...totals);
  const names = buckets[0]?.segments.map(s => s.name) ?? [];
  const colorOf = new Map(seriesColors(names.map(label => ({ label })), colors).map((c, i) => [names[i], c]));
  const legend = buckets[0]?.segments.filter(s => buckets.some(b => b.segments.find(x => x.name === s.name)?.value)) ?? [];
  const summary = `${label}: ${legend.map(s => `${s.name} ${buckets.reduce((n, b) => n + (b.segments.find(x => x.name === s.name)?.value ?? 0), 0)}`).join(', ')}; peak ${max} a day`;
  return (
    <Panel label={label}>
      {!chartReady(totals.map(t => [t])) ? <div className="tv-note">{HISTORY_NOTE}</div> : (
        <>
          <ChartBox label={summary}>
            {(W, H) => {
              const slot = W / buckets.length;
              return buckets.map((b, i) => {
                let y = H;
                return (
                  <g key={b.label} className="tv-grow-y" style={nth(i)}>
                    {b.segments.map(s => {
                      const h = (s.value / max) * (H - 2);
                      y -= h;
                      return s.value > 0 ? <rect key={s.name} fill={colorOf.get(s.name)} x={slot * i + slot * 0.12} y={y} width={slot * 0.76} height={Math.max(h, 1)} /> : null;
                    })}
                  </g>
                );
              });
            }}
          </ChartBox>
          {legend.length > 1 && (
            <div className="tv-legend tv-stack-legend">
              {legend.map(s => (
                <span key={s.name}><i style={{ background: colorOf.get(s.name) }} />{s.name}</span>
              ))}
            </div>
          )}
          <div className="tv-legend tv-axis">
            <span>{axis(buckets[0])}</span>
            <span>peak {max}</span>
            <span>{axis(buckets[buckets.length - 1])}</span>
          </div>
        </>
      )}
    </Panel>
  );
}
