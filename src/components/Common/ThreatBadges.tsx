import React, { useMemo, useRef, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { stackMatches } from '../../services/intelligence/stack';
import { useFeeds } from '../../context/FeedContext';
import { cachedCvss, CvssInfo, fetchCvss } from '../../services/intelligence/cvss';
import { Article, ThreatSeverity } from '../../types';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, Target, ExternalLink, Server } from 'lucide-react';

interface SeverityBadgeProps {
  severity?: ThreatSeverity;
  score?: number;
  className?: string;
  showScore?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity = 'info',
  score,
  className = '',
  showScore = false,
}) => {
  switch (severity) {
    case 'critical':
      return (
        <span
          title={`Critical Threat (Severity Score: ${score ?? 85}/100)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-500 border border-rose-500/30 ${className}`}
        >
          <ShieldAlert className="w-3 h-3 text-rose-500 animate-pulse" />
          <span>CRITICAL</span>
          {showScore && score !== undefined && <span className="opacity-70">({score})</span>}
        </span>
      );

    case 'high':
      return (
        <span
          title={`High Threat (Severity Score: ${score ?? 65}/100)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30 ${className}`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          <span>HIGH</span>
          {showScore && score !== undefined && <span className="opacity-70">({score})</span>}
        </span>
      );

    case 'medium':
      return (
        <span
          title={`Medium Threat (Severity Score: ${score ?? 40}/100)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 ${className}`}
        >
          <AlertCircle className="w-3 h-3" />
          <span>MEDIUM</span>
          {showScore && score !== undefined && <span className="opacity-70">({score})</span>}
        </span>
      );

    case 'low':
      return (
        <span
          title={`Low Priority Advisory (Severity Score: ${score ?? 20}/100)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-normal uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20 ${className}`}
        >
          <Info className="w-3 h-3" />
          <span>LOW</span>
        </span>
      );

    case 'info':
    default:
      return null;
  }
};

interface WatchlistBadgeProps {
  terms: string[];
  className?: string;
}

export const WatchlistBadge: React.FC<WatchlistBadgeProps> = ({ terms, className = '' }) => {
  if (!terms || terms.length === 0) return null;

  return (
    <span
      title={`Matched Watchlist Keyword: ${terms.join(', ')}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10 ${className}`}
    >
      <Target className="w-3 h-3 text-amber-500 animate-pulse" />
      <span>WATCHLIST: {terms[0]}</span>
      {terms.length > 1 && <span className="opacity-80">+{terms.length - 1}</span>}
    </span>
  );
};

/** "Relevant to you": the article mentions a product from the user's "My Stack" list. */
export const StackBadge: React.FC<{ article: Article; className?: string }> = ({ article, className = '' }) => {
  const { settings } = useSettings();
  const terms = useMemo(() => stackMatches(article, settings.stackKeywords), [article, settings.stackKeywords]);
  if (terms.length === 0) return null;
  return (
    <span
      title={`Mentions products in your stack: ${terms.join(', ')}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/40 ${className}`}
    >
      <Server className="w-3 h-3" />
      <span>YOUR STACK: {terms[0]}</span>
      {terms.length > 1 && <span className="opacity-80">+{terms.length - 1}</span>}
    </span>
  );
};

interface CveChipProps {
  cve: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const CveChip: React.FC<CveChipProps> = ({ cve, onClick }) => {
  const { cveIntel } = useFeeds();
  const intel = cveIntel[cve.toUpperCase()];
  const [cvss, setCvss] = useState<CvssInfo | null | undefined>(() => cachedCvss(cve));
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    } else {
      window.open(`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`, '_blank', 'noopener,noreferrer');
    }
  };

  // CVSS comes from NVD on demand: only after a short hover, so scrolling past chips costs nothing
  const handleMouseEnter = () => {
    if (cvss !== undefined) return;
    hoverTimer.current = setTimeout(() => fetchCvss(cve).then(setCvss), 300);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };

  const details = [
    cve,
    intel?.kev ? `CISA KEV: known exploited${intel.kevDateAdded ? ` (added ${intel.kevDateAdded})` : ''}${intel.kevRansomware ? ', used by ransomware' : ''}` : null,
    intel?.kevName ?? null,
    intel?.epss !== undefined ? `EPSS: ${(intel.epss * 100).toFixed(1)}% chance of exploitation in 30 days (percentile ${Math.round((intel.percentile ?? 0) * 100)})` : null,
    cvss ? `CVSS ${cvss.version}: ${cvss.score} ${cvss.severity}` : cvss === null ? 'CVSS: not scored yet' : 'CVSS: hover to load',
    'Click to open on NIST NVD',
  ].filter(Boolean).join('\n');

  const epssPct = intel?.epss !== undefined && intel.epss >= 0.01 ? Math.round(intel.epss * 100) : null;

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={details}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/25 transition-colors"
    >
      {intel?.kev && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-black">KEV</span>}
      <span>{cve}</span>
      {epssPct !== null && <span className="opacity-80">· EPSS {epssPct}%</span>}
      {cvss && <span className="opacity-80">· {cvss.score}</span>}
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </button>
  );
};

interface ClusterPillProps {
  count: number;
  sources: string[];
  onClick?: (e: React.MouseEvent) => void;
}

export const ClusterPill: React.FC<ClusterPillProps> = ({ count, sources, onClick }) => {
  if (count <= 1) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      title={`Covered by ${count} sources: ${sources.join(', ')}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono text-theme-text-muted hover:text-theme-text bg-theme-surface hover:bg-theme-card border border-theme-border hover:border-theme-accent transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-theme-accent"></span>
      <span className="font-semibold text-theme-text">+{count - 1} sources</span>
      <span className="truncate max-w-[150px] opacity-75">({sources.slice(0, 2).join(', ')})</span>
    </button>
  );
};
