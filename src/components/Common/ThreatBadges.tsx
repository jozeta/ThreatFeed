import React from 'react';
import { ThreatSeverity } from '../../types';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, Target, ExternalLink } from 'lucide-react';

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

interface CveChipProps {
  cve: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const CveChip: React.FC<CveChipProps> = ({ cve, onClick }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    } else {
      window.open(`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <button
      onClick={handleClick}
      title={`Inspect ${cve} on NIST NVD`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/25 transition-colors"
    >
      <span>{cve}</span>
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
