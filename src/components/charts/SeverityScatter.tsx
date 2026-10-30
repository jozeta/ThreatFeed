import React, { useMemo, useRef, useState } from 'react';
import { VendorPoint } from '../../services/intelligence/vendor';
import { useReducedMotion } from '../Common/SidePanel';
import { ChartTooltip, LegendMark, Severity, SEVERITY_DOT, SEVERITY_LABEL, SEVERITY_STROKE, severityOf, useWidth } from './shared';
import { Skull } from 'lucide-react';

const HEIGHT = 230;
const M = { left: 34, right: 10, top: 12, bottom: 24 };
const HIT_RADIUS = 16; // how close the pointer has to be to pick a dot
const STAGGER_MS = 300; // left to right, plus each dot's own 260 ms: about 400 ms in all

// Faint severity bands behind the dots, low to critical
const BANDS: { id: Severity; from: number; to: number }[] = [
  { id: 'low', from: 0, to: 4 },
  { id: 'medium', from: 4, to: 7 },
  { id: 'high', from: 7, to: 9 },
  { id: 'critical', from: 9, to: 10 },
];

const monthLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });

// A pixel or two sideways per CVE, stable between renders, so entries added the same day don't hide each other
const jitter = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 0.5;
};

interface Placed extends VendorPoint {
  x: number;
  y: number;
  r: number;
  severity: Severity;
}

/**
 * A vendor's CVEs over the last two years: time across, CVSS up, over faint severity bands. Dots are coloured
 * by severity and sized by EPSS; KEV entries get a ring and ransomware-linked ones a diamond; unscored CVEs sit
 * on a dashed lane at 0. Hovering (or the arrow keys) shows a crosshair and details, a click opens the CVE.
 */
export const SeverityScatter: React.FC<{ points: VendorPoint[]; months?: number; onOpenCve: (cve: string) => void; now?: number }> = ({
  points, months = 24, onOpenCve, now = Date.now(),
}) => {
  const [ref, width] = useWidth<HTMLDivElement>(520);
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const tapped = useRef(false);

  const fromDate = new Date(now);
  fromDate.setUTCMonth(fromDate.getUTCMonth() - months);
  const from = fromDate.getTime();
  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const tx = (t: number) => M.left + ((t - from) / (now - from)) * plotW;
  const ty = (v: number) => M.top + (1 - v / 10) * plotH;

  const placed: Placed[] = useMemo(() => points.map((p) => ({
    ...p,
    x: Math.min(M.left + plotW, Math.max(M.left, tx(Date.parse(`${p.date}T12:00:00Z`)) + jitter(p.cve))),
    y: ty(p.cvss ?? 0),
    r: 3 + Math.min(1, p.epss ?? 0) * 3.5,
    severity: severityOf(p.cvss),
  })), [points, width, now, months]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drawn low to high, so the critical ones end up on top
  const order = useMemo(() => placed.map((_, i) => i).sort((a, b) => (placed[a].cvss ?? -1) - (placed[b].cvss ?? -1)), [placed]);

  // Month ticks: every quarter, every half year when the panel is narrow
  const ticks = useMemo(() => {
    const step = width < 440 ? 6 : 3;
    const out: number[] = [];
    const d = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 1));
    while (d.getUTCMonth() % step) d.setUTCMonth(d.getUTCMonth() + 1);
    for (; d.getTime() <= now; d.setUTCMonth(d.getUTCMonth() + step)) out.push(d.getTime());
    return out;
  }, [width, from, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    let best: number | null = null;
    let bestDistance = HIT_RADIUS;
    placed.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y) - p.r;
      if (d < bestDistance) { best = i; bestDistance = d; }
    });
    return best;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!placed.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => (i === null ? (step > 0 ? 0 : placed.length - 1) : Math.min(placed.length - 1, Math.max(0, i + step))));
    } else if (e.key === 'Enter' && active !== null) {
      onOpenCve(placed[active].cve);
    }
  };

  if (!points.length) return <p className="text-xs font-serif italic text-theme-text-muted">No KEV entries or critical and high CVEs for this vendor in the last two years.</p>;

  const a = active !== null ? placed[active] : null;
  const kevCount = points.filter((p) => p.kev).length;
  const present = new Set(placed.map((p) => p.severity));

  return (
    <figure className="w-full">
      <div ref={ref} className="relative w-full rounded-lg border border-black/10 dark:border-white/10 bg-theme-surface">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block select-none cursor-crosshair rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent/50"
          role="img"
          tabIndex={0}
          aria-label={`Severity over time: ${points.length} CVEs in ${months} months, ${kevCount} in KEV. Arrow keys step through them, Enter opens one.`}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') setActive(nearest(e)); }}
          onPointerDown={(e) => {
            // On touch the first tap shows a dot's details and a second one opens it
            if (e.pointerType === 'mouse') return;
            const i = nearest(e);
            tapped.current = i !== active;
            setActive(i);
          }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
          onClick={(e) => {
            if (tapped.current) { tapped.current = false; return; }
            // From the click's own position: the hover state may not have rendered yet
            const i = nearest(e);
            if (i !== null) onOpenCve(placed[i].cve);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {BANDS.map((b) => (
            <g key={b.id}>
              <title>{`${SEVERITY_LABEL[b.id]}: CVSS ${b.from === 0 ? '0.1' : b.from.toFixed(1)}–${b.to === 10 ? '10' : (b.to - 0.1).toFixed(1)}`}</title>
              <rect x={M.left} y={ty(b.to)} width={plotW} height={ty(b.from) - ty(b.to)} className={SEVERITY_DOT[b.id]} fillOpacity={0.08} />
              {/* The severity ruler along the axis */}
              <rect x={M.left - 4} y={ty(b.to) + 0.5} width={3} height={ty(b.from) - ty(b.to) - 1} rx={1.5} className={SEVERITY_DOT[b.id]} />
            </g>
          ))}

          {ticks.map((t) => (
            <g key={t}>
              <line x1={tx(t)} x2={tx(t)} y1={M.top} y2={M.top + plotH} className="stroke-theme-border" strokeOpacity={0.6} strokeWidth={1} />
              <text x={tx(t)} y={HEIGHT - 8} textAnchor="middle" className="fill-theme-text-muted font-mono" fontSize={10}>{monthLabel(t)}</text>
            </g>
          ))}

          {[4, 7, 9].map((v) => (
            <line key={v} x1={M.left} x2={M.left + plotW} y1={ty(v)} y2={ty(v)} className="stroke-theme-text-muted" strokeOpacity={0.35} strokeDasharray="3 3" strokeWidth={1} />
          ))}
          {[4, 7, 9, 10].map((v) => (
            <text key={v} x={M.left - 9} y={ty(v)} textAnchor="end" dominantBaseline="central" className="fill-theme-text-muted font-mono" fontSize={10}>{v}</text>
          ))}
          {/* The unscored lane doubles as the baseline */}
          <line x1={M.left} x2={M.left + plotW} y1={ty(0)} y2={ty(0)} className="stroke-slate-400" strokeDasharray="2 3" strokeWidth={1.25} />
          <text x={M.left - 9} y={ty(0)} textAnchor="end" dominantBaseline="central" className="fill-theme-text-muted font-mono" fontSize={9}>n/a</text>

          {a && (
            <g className="pointer-events-none" aria-hidden="true">
              <line x1={M.left} x2={a.x} y1={a.y} y2={a.y} className="stroke-theme-text" strokeOpacity={0.45} strokeDasharray="2 2" strokeWidth={1} />
              <line x1={a.x} x2={a.x} y1={a.y} y2={M.top + plotH} className="stroke-theme-text" strokeOpacity={0.45} strokeDasharray="2 2" strokeWidth={1} />
            </g>
          )}

          {order.map((i) => {
            const p = placed[i];
            const on = i === active;
            const delay = reduced ? undefined : `${Math.round(((p.x - M.left) / plotW) * STAGGER_MS)}ms`;
            return (
              <g key={p.cve} className={reduced ? undefined : 'chart-pop'} style={delay ? { animationDelay: delay } : undefined} opacity={a && !on ? 0.55 : 1}>
                {p.kev && <circle cx={p.x} cy={p.y} r={p.r + 2.4} fill="none" className={SEVERITY_STROKE[p.severity]} strokeWidth={1.2} strokeOpacity={0.9} />}
                <circle cx={p.x} cy={p.y} r={on ? p.r + 1.5 : p.r} className={`${SEVERITY_DOT[p.severity]} stroke-theme-card`} strokeWidth={0.8} fillOpacity={p.severity === 'unscored' ? 0.7 : 0.92} />
                {p.ransomware && (
                  <rect x={p.x + p.r * 0.7 - 2.25} y={p.y - p.r * 0.7 - 2.25 - 2} width={4.5} height={4.5} transform={`rotate(45 ${p.x + p.r * 0.7} ${p.y - p.r * 0.7 - 2})`} className="fill-theme-text stroke-theme-card" strokeWidth={0.8} />
                )}
              </g>
            );
          })}
        </svg>

        {a && (
          <ChartTooltip x={a.x} y={a.y} width={width}>
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <span className="font-bold text-theme-accent">{a.cve}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase">
                <svg width="8" height="8" aria-hidden="true"><circle cx={4} cy={4} r={4} className={SEVERITY_DOT[a.severity]} /></svg>
                {a.cvss !== undefined ? `${a.cvss.toFixed(1)} ${SEVERITY_LABEL[a.severity]}` : 'Not scored'}
              </span>
            </div>
            {a.product && <p className="mt-0.5 font-serif text-xs text-theme-text truncate">{a.product}</p>}
            <p className="mt-1 text-theme-text-muted">{a.kev ? 'Added to KEV' : 'Published'} {a.date}</p>
            <p className="text-theme-text-muted">
              {a.kev ? <span className="text-theme-text">Known exploited</span> : 'Not in KEV'}
              {a.epss !== undefined && <> · EPSS {(a.epss * 100).toFixed(a.epss < 0.1 ? 1 : 0)}%</>}
            </p>
            {a.ransomware && <p className="mt-0.5 flex items-center gap-1 text-rose-500"><Skull className="w-3 h-3" /> Used by ransomware</p>}
          </ChartTooltip>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-theme-text-muted">
        {(['critical', 'high', 'medium', 'low', 'unscored'] as Severity[]).filter((s) => present.has(s)).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            {s === 'unscored' ? <LegendMark kind="dash" /> : <LegendMark kind="dot" className={SEVERITY_DOT[s]} />}
            {SEVERITY_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><LegendMark kind="ring" /> KEV</span>
        {points.some((p) => p.ransomware) && <span className="inline-flex items-center gap-1"><LegendMark kind="diamond" /> Ransomware</span>}
        <span>· size = EPSS</span>
      </figcaption>
    </figure>
  );
};
