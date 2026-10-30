import React, { useEffect, useMemo } from 'react';
import { ActorsData, Article } from '../../types';
import { Mentions } from '../../services/intelligence/actors';
import { Sparkline } from '../../components/Common/Sparkline';
import { formatRelativeTime } from '../../utils/date';
import { SectionTitle } from '../incidents/shared';
import { X, ExternalLink } from 'lucide-react';

export const chipLink = 'px-2 py-1 rounded border text-xs font-mono hover:underline inline-flex items-center gap-1';

/** The actor profile a name (or alias) belongs to, ignoring case */
export function actorByName(data: ActorsData | null, name: string) {
  const key = name.toLowerCase();
  return data?.actors.find((a) => a.name.toLowerCase() === key || a.aliases.some((x) => x.toLowerCase() === key));
}

/** Side panel shell shared by the actor and malware panels, styled like the ransomware group panel */
export const ProfilePanel: React.FC<{ title: string; label: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, label, subtitle, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full max-w-xl h-full overflow-y-auto modal-glass [--glass-base:var(--color-bg)] !border-y-0 !border-r-0 p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-extrabold text-theme-text break-words">{title}</h2>
            {subtitle}
          </div>
          <button onClick={onClose} className="p-1 text-theme-text-muted hover:text-theme-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Aliases: React.FC<{ aliases: string[] }> = ({ aliases }) =>
  aliases.length ? <p className="text-xs font-mono text-theme-text-muted mt-0.5">also known as {aliases.join(', ')}</p> : null;

/** Mention count with its 30-day trend, as in the page's rows */
export const MentionTrend: React.FC<{ mentions?: Mentions; width?: number; height?: number }> = ({ mentions, width = 60, height = 16 }) => (
  <span className="inline-flex items-center gap-1.5" title={mentions ? `${mentions.count} articles in your feeds, last 30 days` : 'Not in your feeds in the last 30 days'}>
    <span className={mentions ? 'font-bold text-theme-text' : 'text-theme-text-muted'}>{mentions?.count ?? 0}</span>
    {mentions && <Sparkline values={mentions.daily} width={width} height={height} className="text-theme-accent" />}
  </span>
);

/** CVEs the articles mentioning a profile also name, most often first */
export const CvesAlongside: React.FC<{ articles: Article[]; onOpenCve: (cve: string) => void }> = ({ articles, onOpenCve }) => {
  const cves = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) for (const c of new Set(a.cves ?? [])) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0])).slice(0, 20);
  }, [articles]);
  if (!cves.length) return null;
  return (
    <div>
      <SectionTitle>CVEs mentioned alongside ({cves.length})</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {cves.map(([cve, n]) => (
          <button key={cve} onClick={() => onOpenCve(cve)} className={`${chipLink} border-theme-border text-theme-accent font-bold`} title={`${n} article${n === 1 ? '' : 's'}`}>
            {cve}{n > 1 && <span className="text-theme-text-muted font-normal">×{n}</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

/** The latest articles in the feeds that name the profile */
export const Coverage: React.FC<{ articles: Article[]; onOpenArticle: (article: Article) => void }> = ({ articles, onOpenArticle }) => (
  <div>
    <SectionTitle>In your feeds, last 30 days ({articles.length})</SectionTitle>
    {articles.length ? (
      <ul className="space-y-2">
        {articles.slice(0, 12).map((a) => (
          <li key={a.id}>
            <button onClick={() => onOpenArticle(a)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent">{a.title}</button>
            <p className="text-[11px] font-mono text-theme-text-muted">{a.sourceName} · {formatRelativeTime(a.publishedAt)}</p>
          </li>
        ))}
      </ul>
    ) : <p className="text-xs font-serif italic text-theme-text-muted">No coverage in your feeds right now.</p>}
  </div>
);

export const ExternalLinks: React.FC<{ links: { label: string; url?: string }[] }> = ({ links }) => (
  <div className="flex flex-wrap gap-4">
    {links.filter((l) => l.url).map((l) => (
      <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-theme-accent hover:underline">
        {l.label} <ExternalLink className="w-3 h-3" />
      </a>
    ))}
  </div>
);
