import React from 'react';
import { Article, ExploitInfo, SsvcDecision } from '../../types';
import { ATTACK_VECTORS, parseVector } from '../../services/intelligence/vulns';

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

export const StatCards: React.FC<{ stats: { label: string; value: React.ReactNode; note?: string }[]; columns?: string }> = ({ stats, columns = 'md:grid-cols-4' }) => (
  <div className={`grid grid-cols-2 ${columns} gap-4`}>
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

/** Compact markers for public exploit code: Metasploit module, Nuclei template, GitHub PoCs */
export const ExploitBadges: React.FC<{ info?: ExploitInfo }> = ({ info }) => {
  if (!info) return null;
  const badge = 'inline-block px-1 rounded text-[9px] font-bold uppercase whitespace-nowrap';
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {info.msf?.length ? <span className={`${badge} bg-rose-600 text-white`} title={`Metasploit: ${info.msf.join(', ')}`}>MSF</span> : null}
      {info.nuclei ? <span className={`${badge} bg-violet-600 text-white`} title={`Nuclei template: ${info.nuclei}`}>Nuclei</span> : null}
      {info.pocs ? <span className={`${badge} bg-theme-text text-theme-bg`} title={`${info.pocs} proof-of-concept repositories on GitHub`}>PoC {info.pocs > 1 ? `×${info.pocs}` : ''}</span> : null}
    </span>
  );
};

/**
 * CISA's SSVC call: exploitation status and whether exploitation can be automated. The exploitation rating
 * is made when the CVE is published, so for KEV entries (`inKev`), where KEV itself confirms exploitation,
 * an older "none" or "poc" would only contradict it and is left out.
 */
export const SsvcBadge: React.FC<{ ssvc?: SsvcDecision; inKev?: boolean }> = ({ ssvc: raw, inKev = false }) => {
  const ssvc = raw && inKev ? { ...raw, exploitation: undefined } : raw;
  if (!ssvc?.exploitation && ssvc?.automatable !== 'yes') return null;
  const exploitation = ssvc.exploitation === 'active' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40'
    : ssvc.exploitation === 'poc' ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40'
    : 'text-theme-text-muted border-theme-border';
  return (
    <span className="inline-flex gap-1 align-middle" title="CISA SSVC assessment (Vulnrichment)">
      {ssvc.exploitation && <span className={`px-1 rounded border text-[9px] font-bold uppercase ${exploitation}`}>{ssvc.exploitation === 'none' ? 'no known exploit' : ssvc.exploitation}</span>}
      {ssvc.automatable === 'yes' && <span className="px-1 rounded border text-[9px] font-bold uppercase border-amber-500/40 text-amber-600 dark:text-amber-400">automatable</span>}
    </span>
  );
};

/** "CWE-79 Improper Neutralization of Input…" with the full name on hover */
export const cweLabel = (cwe: string, names?: Record<string, string>) => {
  const name = names?.[cwe];
  return <span title={name ? `${cwe}: ${name}` : cwe}>{cwe}{name && <span className="text-theme-text-muted"> {name}</span>}</span>;
};

const PRIVILEGES: Record<string, string> = { N: 'no privileges', L: 'low privileges', H: 'high privileges' };
const INTERACTION: Record<string, string> = { N: 'no user interaction', R: 'user interaction', P: 'passive user interaction', A: 'active user interaction' };

/** CVSS vector in words, e.g. "Network · no privileges · no user interaction" */
export function vectorText(vector: string | undefined): string | undefined {
  const { av, pr, ui } = parseVector(vector);
  if (!av) return undefined;
  return [ATTACK_VECTORS[av] ?? av, pr && PRIVILEGES[pr], ui && INTERACTION[ui]].filter(Boolean).join(' · ');
}
