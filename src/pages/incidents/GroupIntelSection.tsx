import React from 'react';
import { GroupIntel } from '../../types';
import { buildHash } from '../../hooks/useHashRoute';
import { formatCount, SectionTitle } from './shared';
import { ExternalLink } from 'lucide-react';

const CVE_SOURCES: Record<string, string> = {
  'ransomware.live': 'documented TTP',
  cisa: 'CISA #StopRansomware advisory',
  news: 'news coverage',
};

/**
 * The enrichment for one group: techniques and tools (Ransomware.live), MITRE ATT&CK, CVEs it is known to
 * exploit, and ransom payments traced on-chain (Ransomwhere). Each part only shows when there is data.
 */
export const GroupIntelSection: React.FC<{ intel?: GroupIntel }> = ({ intel }) => {
  if (!intel) return null;
  const years = Object.entries(intel.payments?.byYear ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  const maxYear = Math.max(1, ...years.map(([, v]) => v));

  return (
    <>
      {intel.cves && intel.cves.length > 0 && (
        <div>
          <SectionTitle>CVEs this group exploits ({intel.cves.length})</SectionTitle>
          <ul className="space-y-1 text-xs font-mono">
            {intel.cves.map((c) => (
              <li key={c.cve} className="flex flex-wrap items-baseline gap-2">
                <a href={buildHash('vulnerabilities', 'kev', new URLSearchParams({ cve: c.cve }))} className="font-bold text-theme-accent hover:underline">{c.cve}</a>
                <span className="text-theme-text-muted">{CVE_SOURCES[c.source]}{c.articles && c.articles > 1 ? ` · ${c.articles} articles` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {intel.ttps && intel.ttps.length > 0 && (
        <div>
          <SectionTitle>Tactics & techniques</SectionTitle>
          <div className="space-y-1">
            {intel.ttps.map((t) => (
              <details key={`${t.id}-${t.name}`} className="group rounded border border-theme-border/60">
                <summary className="cursor-pointer px-2 py-1.5 text-xs font-mono text-theme-text flex items-center justify-between">
                  <span>{t.name} {t.id && <span className="text-theme-text-muted">{t.id}</span>}</span>
                  <span className="text-theme-text-muted">{t.techniques.length}</span>
                </summary>
                <ul className="px-2 pb-2 space-y-1.5">
                  {t.techniques.map((x) => (
                    <li key={x.id + x.name} className="text-xs">
                      <a href={`https://attack.mitre.org/techniques/${x.id.replace('.', '/')}/`} target="_blank" rel="noopener noreferrer" className="font-mono text-theme-accent hover:underline">{x.id}</a>{' '}
                      <span className="font-mono text-theme-text">{x.name}</span>
                      {x.details && <p className="font-serif text-theme-text-muted leading-snug">{x.details}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}

      {intel.tools && Object.keys(intel.tools).length > 0 && (
        <div>
          <SectionTitle>Tools</SectionTitle>
          <dl className="space-y-1.5 text-xs">
            {Object.entries(intel.tools).map(([category, names]) => (
              <div key={category} className="flex flex-wrap items-baseline gap-1.5">
                <dt className="font-mono text-theme-text-muted w-full sm:w-36 shrink-0">{category.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
                {names.map((n) => <dd key={n} className="px-1.5 py-0.5 rounded bg-theme-surface border border-theme-border font-mono text-theme-text">{n}</dd>)}
              </div>
            ))}
          </dl>
        </div>
      )}

      {intel.attack && (
        <div>
          <SectionTitle>MITRE ATT&CK</SectionTitle>
          <p className="text-xs font-mono">
            <a href={intel.attack.url} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline inline-flex items-center gap-1">
              {intel.attack.id} {intel.attack.name} <ExternalLink className="w-3 h-3" />
            </a>
            {intel.attack.aliases.length > 0 && <span className="text-theme-text-muted"> · also known as {intel.attack.aliases.join(', ')}</span>}
          </p>
          {intel.attack.software.length > 0 && <p className="text-xs font-mono text-theme-text-muted mt-1">Software: {intel.attack.software.join(', ')}</p>}
          {intel.attack.techniques.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-mono text-theme-text">{intel.attack.techniques.length} techniques in ATT&CK</summary>
              <ul className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono">
                {intel.attack.techniques.map((t) => (
                  <li key={t.id}><span className="text-theme-accent">{t.id}</span> <span className="text-theme-text">{t.name}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {intel.payments && (
        <div>
          <SectionTitle>Known ransom payments</SectionTitle>
          <p className="text-xs font-mono text-theme-text">
            <strong className="text-rose-500">${formatCount(intel.payments.totalUsd)}</strong> in {intel.payments.transactions} traced payments
          </p>
          <ul className="mt-2 space-y-1 text-xs font-mono">
            {years.map(([year, usd]) => (
              <li key={year} className="flex items-center gap-2">
                <span className="w-10 text-theme-text-muted">{year}</span>
                <span className="h-1.5 rounded bg-rose-500/70" style={{ width: `${Math.max(3, (usd / maxYear) * 140)}px` }} />
                <span className="text-theme-text-muted">${formatCount(usd)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] font-serif text-theme-text-muted">From Ransomwhere's crowd-sourced wallet list: a floor, not a total.</p>
        </div>
      )}
    </>
  );
};
