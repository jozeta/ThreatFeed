import React, { useEffect } from 'react';
import { Article, VulnData } from '../../types';
import { nvdUrl, severityFromScore } from '../../services/intelligence/vulns';
import { formatRelativeTime } from '../../utils/date';
import { SectionTitle } from '../incidents/shared';
import { EpssValue, SeverityPill } from './shared';
import { X, ExternalLink, Skull } from 'lucide-react';

interface CvePanelProps {
  cve: string;
  vulns: VulnData | null;
  news: Article[]; // articles mentioning this CVE, newest first
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** Everything the app knows about one CVE: KEV entry, CVSS, EPSS, advisories and news coverage. */
export const CvePanel: React.FC<CvePanelProps> = ({ cve, vulns, news, onOpenArticle, onClose }) => {
  const kev = vulns?.kev.find((k) => k.cve === cve);
  const nvd = vulns?.notable.find((r) => r.id === cve);
  const advisories = vulns?.advisories.filter((a) => a.cve === cve) ?? [];
  const epss = kev?.epss ?? nvd?.epss ?? vulns?.epssTop.find((e) => e.cve === cve)?.epss;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const facts: [string, React.ReactNode][] = [
    ['EPSS (30-day exploitation probability)', <EpssValue epss={epss} />],
    ...(nvd || kev?.cvss !== undefined
      ? [['CVSS', <SeverityPill severity={nvd?.severity ?? severityFromScore(kev!.cvss!)} score={nvd?.score ?? kev!.cvss} />] as [string, React.ReactNode]]
      : []),
    ...(kev ? [
      ['Added to KEV', kev.dateAdded] as [string, React.ReactNode],
      ['Federal due date', kev.dueDate ?? '—'] as [string, React.ReactNode],
      ['Weakness', kev.cwes.join(', ') || '—'] as [string, React.ReactNode],
    ] : []),
    ...(nvd?.assigner ? [['Assigned by', nvd.assigner] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={cve}>
      <div className="w-full max-w-xl h-full overflow-y-auto bg-theme-bg border-l border-theme-border p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl font-extrabold text-theme-text">{cve}</h2>
            {kev && <p className="font-serif text-sm font-bold text-theme-text mt-1">{kev.name}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-mono font-bold uppercase">
              {kev && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Known exploited (CISA KEV)</span>}
              {kev?.ransomware && <span className="px-1.5 py-0.5 rounded bg-theme-text text-theme-bg inline-flex items-center gap-1"><Skull className="w-3 h-3" /> Used by ransomware</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-theme-text-muted hover:text-theme-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {(kev?.description || nvd?.description) && <p className="text-sm font-serif text-theme-text leading-relaxed">{kev?.description || nvd?.description}</p>}
        {kev && <p className="text-xs font-mono text-theme-text-muted">{kev.vendor} · {kev.product}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-theme-text-muted">{label}</dt>
              <dd className="text-theme-text">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        <div className="flex flex-wrap gap-4 text-xs font-mono">
          <a href={nvdUrl(cve)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-theme-accent hover:underline">NVD <ExternalLink className="w-3 h-3" /></a>
          <a href={`https://www.cve.org/CVERecord?id=${encodeURIComponent(cve)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-theme-accent hover:underline">CVE.org <ExternalLink className="w-3 h-3" /></a>
          {advisories.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-theme-accent hover:underline">{a.id} <ExternalLink className="w-3 h-3" /></a>
          ))}
        </div>

        <div>
          <SectionTitle>In the news ({news.length})</SectionTitle>
          {news.length ? (
            <ul className="space-y-2">
              {news.slice(0, 15).map((a) => (
                <li key={a.id}>
                  <button onClick={() => onOpenArticle(a)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent">{a.title}</button>
                  <p className="text-[11px] font-mono text-theme-text-muted">{a.sourceName} · {formatRelativeTime(a.publishedAt)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs font-serif italic text-theme-text-muted">No articles in your feeds mention {cve}.</p>}
        </div>
      </div>
    </div>
  );
};
