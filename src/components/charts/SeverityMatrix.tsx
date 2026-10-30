import React from 'react';
import { SeverityImpactMatrix } from '../../services/intelligence/patchTuesday';
import { useReducedMotion } from '../Common/SidePanel';
import { inkOn } from './shared';

// Microsoft's scale in the colours of the CVSS bands it roughly corresponds to
const ROW_FILL: Record<string, string> = { Critical: 'bg-rose-600', Important: 'bg-orange-500', Moderate: 'bg-amber-400', Low: 'bg-emerald-500' };
// The same colours in hex, and the themes' card backgrounds, to pick the count's text colour per cell
const ROW_HEX: Record<string, string> = { Critical: '#e11d48', Important: '#f97316', Moderate: '#fbbf24', Low: '#10b981' };
const LIGHT_BG = '#ffffff';
const DARK_BG = '#151a21';
/** The count's colour on its shaded cell, in each theme: black on the light fills, white on the deep ones */
export const cellInk = (severity: string, opacity: number) =>
  `${inkOn(ROW_HEX[severity], opacity, LIGHT_BG) === 'white' ? 'text-white' : 'text-black'} ${inkOn(ROW_HEX[severity], opacity, DARK_BG) === 'white' ? 'dark:text-white' : 'dark:text-black'}`;
const ROW_TEXT: Record<string, string> = {
  Critical: 'text-rose-600 dark:text-rose-400', Important: 'text-orange-600 dark:text-orange-400', Moderate: 'text-amber-600 dark:text-amber-300', Low: 'text-emerald-600 dark:text-emerald-400',
};
// Column heads short enough for six on a phone; the full name is the tooltip
const SHORT: Record<string, string> = {
  'Remote Code Execution': 'Code execution', 'Elevation of Privilege': 'Privilege escalation', 'Information Disclosure': 'Info disclosure',
  'Security Feature Bypass': 'Feature bypass', 'Denial of Service': 'Denial of service',
};
// …and for a phone's width
const TINY: Record<string, string> = {
  'Remote Code Execution': 'RCE', 'Elevation of Privilege': 'EoP', 'Information Disclosure': 'Info', 'Security Feature Bypass': 'SFB',
  'Denial of Service': 'DoS', Spoofing: 'Spoof', Tampering: 'Tamper',
};

/**
 * A release's CVEs as a severity × impact heatmap: each cell is shaded in its row's colour by its share of the
 * busiest cell. A cell filters the list to that severity and impact, a row or column head to just one of them;
 * picking the active filter again clears it.
 */
export const SeverityMatrix: React.FC<{
  matrix: SeverityImpactMatrix;
  severity: string;
  impact: string;
  onSelect: (severity: string, impact: string) => void;
}> = ({ matrix: m, severity, impact, onSelect }) => {
  const reduced = useReducedMotion();
  if (!m.impacts.length) return null;
  const filtering = Boolean(severity || impact);
  const toggle = (s: string, i: string) => onSelect(severity === s && impact === i ? '' : s, severity === s && impact === i ? '' : i);

  return (
    <div className="w-full overflow-x-auto">
      <div className="grid gap-1 min-w-[18rem]" style={{ gridTemplateColumns: `minmax(4.5rem, auto) repeat(${m.impacts.length}, minmax(0, 1fr))` }} role="group" aria-label="CVEs by severity and impact">
        <span />
        {m.impacts.map((i) => (
          <button
            key={i}
            onClick={() => toggle('', i)}
            title={`Show only ${i}`}
            className={`px-0.5 pb-1 text-[10px] leading-tight font-mono text-center hover:text-theme-text ${impact === i && !severity ? 'text-theme-accent font-bold' : 'text-theme-text-muted'}`}
          >
            <span className="sm:hidden">{TINY[i] ?? i.split(' ')[0]}</span>
            <span className="hidden sm:inline">{SHORT[i] ?? i}</span>
          </button>
        ))}
        {m.severities.map((s, row) => (
          <React.Fragment key={s}>
            <button
              onClick={() => toggle(s, '')}
              title={`Show only ${s}`}
              className={`pr-2 text-right text-[11px] font-mono font-bold uppercase tracking-wide hover:underline ${ROW_TEXT[s]} ${severity === s && !impact ? 'underline underline-offset-4' : ''}`}
            >
              {s}
            </button>
            {m.impacts.map((i, col) => {
              const n = m.counts[row][col];
              const share = m.max ? Math.sqrt(n / m.max) : 0;
              const fill = 0.12 + share * 0.78;
              const on = severity === s && impact === i;
              const dim = filtering && !on && !(severity === s && !impact) && !(impact === i && !severity);
              // The entrance fades a wrapper, so its fill-mode doesn't override the dimming of the cell inside
              return (
                <span key={i} className={reduced ? 'contents' : 'chart-fade'} style={reduced ? undefined : { animationDelay: `calc(var(--chart-delay, 0ms) + ${(row + col) * 30}ms)` }}>
                  <button
                    onClick={() => toggle(s, i)}
                    disabled={!n}
                    title={`${s} · ${i}: ${n} CVE${n === 1 ? '' : 's'}`}
                    aria-pressed={on}
                    className={`relative h-9 rounded overflow-hidden border text-xs font-mono font-bold transition-transform duration-150 enabled:hover:scale-[1.04] enabled:active:scale-[0.98] disabled:cursor-default ${on ? 'border-theme-text ring-1 ring-theme-text' : 'border-black/10 dark:border-white/10'} w-full ${dim ? 'opacity-40' : ''}`}
                  >
                    {n > 0 && <span aria-hidden="true" className={`absolute inset-0 ${ROW_FILL[s]}`} style={{ opacity: fill }} />}
                    <span className={`relative ${n === 0 ? 'text-theme-text-muted opacity-50 font-normal' : `${cellInk(s, fill)} [text-shadow:none]`}`}>{n || '·'}</span>
                  </button>
                </span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
