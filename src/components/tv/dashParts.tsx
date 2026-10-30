import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useCountUp } from '../../hooks/useCountUp';
import { useReducedMotion } from '../Common/SidePanel';
import { monotonePath } from '../charts/MentionsArea';
import { Figure } from '../../services/tv/dashboard';

/** Dashboard building blocks: all sizes in vw so the screen scales from 1280 to 3840 wide */

export const HISTORY_NOTE = 'History is building — fills in over the coming weeks';

/** A plain interval tick (every tvIntervalMinutes) that makes the figures recompute */
export function useDashNow(): number {
  const { settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());
  const minutes = Math.max(1, settings.tvIntervalMinutes || 2);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), minutes * 60_000);
    return () => clearInterval(id);
  }, [minutes]);
  return now;
}

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
      if (!row || !row.offsetHeight) return setCount(total);
      setCount(Math.min(total, Math.max(1, Math.floor(el.clientHeight / row.offsetHeight))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);
  return [ref, Math.min(count, total)];
}

export function Panel({ label, span = 2, tall = false, children }: { label: string; span?: 1 | 2 | 4; tall?: boolean; children: ReactNode }) {
  return (
    <section className="tv-panel" style={{ gridColumn: `span ${span}`, gridRow: tall ? 'span 2' : undefined }}>
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

export function StatCard({ label, figure, value, color, versus = 'vs last week', note, text }: {
  label: string; figure?: Figure; value?: number; color?: string; versus?: string; note?: string; text?: string;
}) {
  const reduced = useReducedMotion();
  const n = useCountUp(figure?.value ?? value ?? 0, reduced);
  return (
    <section className="tv-panel">
      <div className="tv-label">{label}</div>
      {text !== undefined
        ? <div className="tv-big tv-big-text" style={{ color }} title={text}>{text}</div>
        : <div className="tv-big" style={{ color }}>{Math.round(n).toLocaleString()}</div>}
      {figure ? <Delta delta={figure.delta} versus={versus} /> : note ? <span className="tv-delta">{note}</span> : null}
    </section>
  );
}

export function ListPanel<T>({ label, items, row, span = 2, tall = false, empty = 'Nothing to show yet' }: {
  label: string; items: T[]; row: (item: T) => ReactNode; span?: 1 | 2 | 4; tall?: boolean; empty?: string;
}) {
  const [ref, count] = useFit(items.length);
  return (
    <Panel label={label} span={span} tall={tall}>
      {items.length === 0 ? <div className="tv-note">{empty}</div> : (
        <div ref={ref} className="tv-fit">
          {items.slice(0, count).map((it, i) => <div key={i} className="tv-row">{row(it)}</div>)}
        </div>
      )}
    </Panel>
  );
}

export function HBarList({ label, data, color, format, span = 2 }: {
  label: string; data: [string, number][]; color: string; format?: (name: string) => ReactNode; span?: 1 | 2 | 4;
}) {
  const [ref, count] = useFit(data.length);
  const max = Math.max(1, ...data.map(d => d[1]));
  return (
    <Panel label={label} span={span}>
      {data.length === 0 ? <div className="tv-note">Nothing to show yet</div> : (
        <div ref={ref} className="tv-fit">
          {data.slice(0, count).map(([name, n]) => (
            <div key={name} className="tv-row tv-hbar">
              <span className="tv-hbar-name">{format ? format(name) : name}</span>
              <span className="tv-hbar-track"><i style={{ width: `${Math.max(2, (n / max) * 100)}%`, background: color }} /></span>
              <span className="tv-hbar-n">{n}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const nonZero = (xs: number[]) => xs.filter(x => x > 0).length;

export function WeeklyBarsLine({ label, weekly, span = 2, tall = false }: {
  label: string; weekly: { week: string; critical: number; kev: number }[]; span?: 1 | 2 | 4; tall?: boolean;
}) {
  const ready = nonZero(weekly.map(w => w.critical)) + nonZero(weekly.map(w => w.kev)) >= 2 && weekly.length >= 2;
  const W = 200, H = 80, n = weekly.length;
  const max = Math.max(1, ...weekly.map(w => Math.max(w.critical, w.kev)));
  const slot = W / n;
  const x = (i: number) => slot * i + slot / 2;
  const y = (v: number) => H - 2 - (v / max) * (H - 6);
  return (
    <Panel label={label} span={span} tall={tall}>
      {!ready ? <div className="tv-note">{HISTORY_NOTE}</div> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tv-chart" role="img" aria-label={label}>
            <g fill="#ef4444" opacity=".85">
              {weekly.map((w, i) => <rect key={w.week} x={slot * i + slot * 0.15} y={y(w.critical)} width={slot * 0.7} height={H - 2 - y(w.critical)} />)}
            </g>
            <path d={monotonePath(weekly.map((w, i) => [x(i), y(w.kev)] as [number, number]))} fill="none" stroke="#fb923c" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="tv-legend"><span style={{ color: '#ef4444' }}>{'■'}</span> critical CVEs <span style={{ color: '#fb923c', marginLeft: '1.2vw' }}>{'━'}</span> added to KEV</div>
        </>
      )}
    </Panel>
  );
}

export function DailyArea({ label, daily, color, span = 2 }: {
  label: string; daily: { day: string; count: number }[]; color: string; span?: 1 | 2 | 4;
}) {
  const ready = nonZero(daily.map(d => d.count)) >= 2;
  const W = 200, H = 60, n = daily.length;
  const max = Math.max(1, ...daily.map(d => d.count));
  const pts = daily.map((d, i) => [n > 1 ? (W * i) / (n - 1) : 0, H - 2 - (d.count / max) * (H - 6)] as [number, number]);
  const line = monotonePath(pts);
  return (
    <Panel label={label} span={span}>
      {!ready ? <div className="tv-note">{HISTORY_NOTE}</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tv-chart" role="img" aria-label={label}>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} fillOpacity=".25" />
          <path d={line} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </Panel>
  );
}
