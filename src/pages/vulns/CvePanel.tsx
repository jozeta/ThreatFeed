import React, { useEffect, useState } from 'react';
import { Article, VulnData } from '../../types';
import { nvdUrl, severityFromScore } from '../../services/intelligence/vulns';
import { fetchCveDescription } from '../../services/intelligence/cvss';
import { fetchEpssHistory } from '../../services/intelligence/cveWatch';
import { buildHash } from '../../hooks/useHashRoute';
import { Sparkline } from '../../components/Common/Sparkline';
import { VendorButton } from '../../components/VendorLink';
import { formatRelativeTime } from '../../utils/date';
import { SectionTitle } from '../incidents/shared';
import { EpssValue, ExploitBadges, SeverityPill, SsvcBadge, vectorText } from './shared';
import { X, ExternalLink, Skull, Star } from 'lucide-react';

interface CvePanelProps {
  cve: string;
  vulns: VulnData | null;
  news: Article[]; // articles mentioning this CVE, newest first
  watched: boolean;
  onToggleWatch: () => void;
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** Everything the app knows about one CVE: KEV entry, CVSS, EPSS, advisories and news coverage. */
export const CvePanel: React.FC<CvePanelProps> = ({ cve, vulns, news, watched, onToggleWatch, onOpenArticle, onClose }) => {
  const kev = vulns?.kev.find((k) => k.cve === cve);
  const nvd = vulns?.notable.find((r) => r.id === cve);
  const advisories = vulns?.advisories.filter((a) => a.cve === cve) ?? [];
  const epss = kev?.epss ?? nvd?.epss ?? vulns?.epssTop.find((e) => e.cve === cve)?.epss;
  const exploit = vulns?.exploits?.[cve];
  const groups = vulns?.cveGroups?.[cve] ?? [];
  const vector = kev?.vector ?? nvd?.vector;
  const ssvc = kev?.ssvc ?? nvd?.ssvc;
  const products = kev?.products ?? nvd?.products ?? [];
  const cwes = kev?.cwes ?? (nvd?.cwe ? [nvd.cwe] : []);

  // EPSS over the last 30 days, straight from FIRST: a rising line is an early warning
  const [history, setHistory] = useState<{ date: string; epss: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    fetchEpssHistory(cve).then((points) => { if (!cancelled) setHistory(points); });
    return () => { cancelled = true; };
  }, [cve]);

  // KEV entries carry no description (it would double the data file); NVD supplies one on demand
  const [description, setDescription] = useState<string | null | undefined>(nvd?.description);
  useEffect(() => {
    if (nvd?.description) return;
    let cancelled = false;
    setDescription(undefined);
    fetchCveDescription(cve).then((text) => { if (!cancelled) setDescription(text); });
    return () => { cancelled = true; };
  }, [cve, nvd?.description]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trend = history.length >= 2 ? history[history.length - 1].epss - history[0].epss : 0;
  const facts: [string, React.ReactNode][] = [
    ['EPSS (30-day exploitation probability)', (
      <span className="inline-flex items-center gap-2">
        <EpssValue epss={epss ?? history[history.length - 1]?.epss} />
        {history.length >= 2 && (
          <span className="inline-flex items-center gap-1" title={`EPSS ${history[0].date} → ${history[history.length - 1].date}`}>
            <Sparkline values={history.map((p) => p.epss)} width={70} className={trend > 0.02 ? 'text-rose-500' : 'text-theme-accent'} />
            {Math.abs(trend) >= 0.005 && <span className={trend > 0 ? 'text-rose-500' : 'text-emerald-500'}>{trend > 0 ? '+' : ''}{(trend * 100).toFixed(1)} pts</span>}
          </span>
        )}
      </span>
    )],
    ...(nvd || kev?.cvss !== undefined
      ? [['CVSS', <SeverityPill severity={nvd?.severity ?? severityFromScore(kev!.cvss!)} score={nvd?.score ?? kev!.cvss} />] as [string, React.ReactNode]]
      : []),
    ...(kev ? [
      ['Added to KEV', kev.dateAdded] as [string, React.ReactNode],
      ['Federal due date', kev.dueDate ?? '—'] as [string, React.ReactNode],
    ] : []),
    ...(cwes.length ? [['Weakness', <span>{cwes.map((c) => (
      <span key={c} className="block">{c}{vulns?.cweNames?.[c] && <span className="text-theme-text-muted"> {vulns.cweNames[c]}</span>}</span>
    ))}</span>] as [string, React.ReactNode]] : []),
    ...(vectorText(vector) ? [['Attack', <span title={vector}>{vectorText(vector)}</span>] as [string, React.ReactNode]] : []),
    ...(ssvc ? [['CISA SSVC', <span className="inline-flex flex-wrap items-center gap-1"><SsvcBadge ssvc={ssvc} inKev={Boolean(kev)} />{ssvc.impact && <span className="text-theme-text-muted">impact: {ssvc.impact}</span>}</span>] as [string, React.ReactNode]] : []),
    ...(products.length ? [['Affected products', <span>{products.join(', ')}</span>] as [string, React.ReactNode]] : []),
    ...(nvd?.assigner ? [['Assigned by', nvd.assigner] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={cve}>
      <div className="w-full max-w-xl h-full overflow-y-auto modal-glass [--glass-base:var(--color-bg)] !border-y-0 !border-r-0 p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl font-extrabold text-theme-text">{cve}</h2>
            {kev && <p className="font-serif text-sm font-bold text-theme-text mt-1">{kev.name}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-mono font-bold uppercase">
              {kev && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Known exploited (CISA KEV)</span>}
              {kev?.ransomware && <span className="px-1.5 py-0.5 rounded bg-theme-text text-theme-bg inline-flex items-center gap-1"><Skull className="w-3 h-3" /> Used by ransomware</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleWatch}
              aria-pressed={watched}
              title={watched ? 'Stop watching this CVE' : 'Watch: get alerts when it lands in KEV, its EPSS jumps or new articles mention it'}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-mono font-bold transition-colors ${watched ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300' : 'border-theme-border text-theme-text-muted hover:text-theme-text'}`}
            >
              <Star className={`w-3.5 h-3.5 ${watched ? 'fill-current' : ''}`} /> {watched ? 'Watching' : 'Watch'}
            </button>
            <button onClick={onClose} className="p-1 text-theme-text-muted hover:text-theme-text" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {description === undefined
          ? <p className="text-xs font-mono text-theme-text-muted animate-pulse">Loading description from NVD…</p>
          : description && <p className="text-sm font-serif text-theme-text leading-relaxed">{description}</p>}
        {kev && <p className="text-xs font-mono text-theme-text-muted"><VendorButton name={kev.vendor} className="font-bold text-theme-text" /> · {kev.product}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-theme-text-muted">{label}</dt>
              <dd className="text-theme-text">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {exploit && (
          <div>
            <SectionTitle>Public exploit code</SectionTitle>
            <div className="mb-2"><ExploitBadges info={exploit} /></div>
            <ul className="space-y-1 text-xs font-mono">
              {exploit.msf?.map((m) => (
                <li key={m}>
                  <a href={`https://github.com/rapid7/metasploit-framework/blob/master/modules/${m}.rb`} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline inline-flex items-center gap-1">
                    Metasploit: {m} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
              {exploit.nuclei && (
                <li>
                  <a href={`https://github.com/projectdiscovery/nuclei-templates/blob/main/${exploit.nuclei}`} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline inline-flex items-center gap-1">
                    Nuclei detection template <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              )}
              {exploit.pocUrls?.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-theme-accent hover:underline inline-flex items-center gap-1">
                    PoC: {u.replace('https://github.com/', '')} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
              {(exploit.pocs ?? 0) > (exploit.pocUrls?.length ?? 0) && <li className="text-theme-text-muted">…and {exploit.pocs! - exploit.pocUrls!.length} more proof-of-concept repositories</li>}
            </ul>
            <p className="mt-2 text-[10px] font-serif text-theme-text-muted">Third-party code from GitHub: review before running anything, and only against systems you're authorized to test.</p>
          </div>
        )}

        {groups.length > 0 && (
          <div>
            <SectionTitle>Exploited by ransomware groups</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <a key={g} href={buildHash('ransomware', '', new URLSearchParams({ group: g.toLowerCase() }))} className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs font-mono font-bold hover:underline inline-flex items-center gap-1">
                  <Skull className="w-3 h-3" /> {g}
                </a>
              ))}
            </div>
          </div>
        )}

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
