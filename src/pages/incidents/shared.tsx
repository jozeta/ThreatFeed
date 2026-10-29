import React from 'react';

export const chipClass = (on: boolean) =>
  `px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${on ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-surface border-theme-border text-theme-text-muted hover:text-theme-text'}`;

export const selectClass =
  'bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent';

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="pb-2 mb-3 border-b-2 border-theme-accent font-mono text-xs font-black uppercase tracking-widest text-theme-text">{children}</h2>
);

/** Horizontal bar list for "top N" breakdowns; rows are optional buttons */
export const BarList: React.FC<{
  rows: { key: string; label: React.ReactNode; value: number; active?: boolean; onClick?: () => void }[];
  color?: string;
  format?: (n: number) => string; // e.g. currency; defaults to the plain number
}> = ({ rows, color = 'bg-rose-500/70', format = String }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1 text-xs font-mono">
      {rows.map((r) => {
        const content = (
          <>
            <span className="w-28 truncate text-left">{r.label}</span>
            <span className={`h-1.5 rounded ${color}`} style={{ width: `${Math.max(3, (r.value / max) * 90)}px` }} />
            <span className="text-theme-text-muted">{format(r.value)}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button onClick={r.onClick} className={`w-full flex items-center gap-2 hover:text-theme-accent ${r.active ? 'text-theme-accent font-bold' : 'text-theme-text'}`}>
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-theme-text">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export const formatCount = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

export function countBy<T>(items: T[], key: (item: T) => string | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
