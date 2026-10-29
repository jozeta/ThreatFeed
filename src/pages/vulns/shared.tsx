import React from 'react';
import { Article } from '../../types';

export const SEVERITY_FILL = {
  critical: 'fill-rose-600',
  high: 'fill-orange-500',
  medium: 'fill-amber-400',
  low: 'fill-sky-500',
  unscored: 'fill-slate-400/60',
  unknown: 'fill-slate-400/60',
} as const;

export const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-rose-600 border-rose-600/40',
  high: 'text-orange-500 border-orange-500/40',
  medium: 'text-amber-500 border-amber-500/40',
  low: 'text-sky-500 border-sky-500/40',
};

export const SeverityPill: React.FC<{ severity?: string; score?: number }> = ({ severity, score }) => {
  if (!severity) return <span className="text-theme-text-muted">—</span>;
  const key = severity.toLowerCase();
  return (
    <span className={`inline-block px-1.5 rounded border text-[10px] font-bold uppercase ${SEVERITY_TEXT[key] ?? 'text-theme-text-muted border-theme-border'}`}>
      {score !== undefined ? score.toFixed(1) : key}
    </span>
  );
};

/** EPSS as a percentage; >= 10% is highlighted since that is already in the top few percent of all CVEs */
export const EpssValue: React.FC<{ epss?: number }> = ({ epss }) =>
  epss === undefined ? <span className="text-theme-text-muted">—</span> : (
    <span className={epss >= 0.5 ? 'text-rose-500 font-bold' : epss >= 0.1 ? 'text-orange-500 font-bold' : 'text-theme-text-muted'}>
      {(epss * 100).toFixed(epss >= 0.1 ? 0 : 1)}%
    </span>
  );

export const StatCards: React.FC<{ stats: { label: string; value: React.ReactNode; note?: string }[] }> = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {stats.map((s) => (
      <div key={s.label} className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <span className="font-mono text-xs text-theme-text-muted uppercase">{s.label}</span>
        <p className="font-serif text-2xl font-bold text-theme-text mt-1 truncate">{s.value}</p>
        {s.note && <p className="text-[11px] font-mono text-theme-text-muted">{s.note}</p>}
      </div>
    ))}
  </div>
);

/** Index of articles by the CVEs they mention, for "N articles" counts and the CVE panel */
export function articlesByCve(articles: Article[]): Map<string, Article[]> {
  const map = new Map<string, Article[]>();
  for (const a of articles) {
    for (const cve of a.cves ?? []) {
      const list = map.get(cve);
      if (list) list.push(a);
      else map.set(cve, [a]);
    }
  }
  for (const list of map.values()) list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return map;
}

export const CveButton: React.FC<{ cve: string; onOpen: (cve: string) => void }> = ({ cve, onOpen }) => (
  <button onClick={() => onOpen(cve)} className="font-mono font-bold text-theme-accent hover:underline whitespace-nowrap">{cve}</button>
);
