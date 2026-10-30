import React, { useMemo, useState } from 'react';
import { Article, VulnData } from '../types';
import { cleanTag, dailyCounts, tagMatches, TagVuln } from '../services/intelligence/tags';
import { formatRelativeTime } from '../utils/date';
import { SectionTitle } from '../pages/incidents/shared';
import { CveButton, SeverityPill, StatCards } from '../pages/vulns/shared';
import { SeverityBadge } from './Common/ThreatBadges';
import { PanelCloseButton, SidePanel } from './Common/SidePanel';
import { DailyBars } from './charts/DailyBars';
import { EntityText } from './EntityText';
import { Bug, ChevronDown, Skull, Tag } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 30;
const PAGE = 15;

/** Shows `PAGE` rows, then a page more per click */
const MoreButton: React.FC<{ remaining: number; onClick: () => void }> = ({ remaining, onClick }) => (
  <button onClick={onClick} className="press mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded border border-theme-border bg-theme-surface text-[11px] font-mono font-bold text-theme-text hover:border-theme-accent hover:text-theme-accent transition-colors">
    <ChevronDown className="w-3.5 h-3.5 text-theme-accent" /> Show {Math.min(PAGE, remaining)} more · {remaining} left
  </button>
);

const ArticleRows: React.FC<{ articles: Article[]; onOpen: (a: Article) => void }> = ({ articles, onOpen }) => {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      <ul className="divide-y divide-theme-border/60">
        {articles.slice(0, shown).map((a) => (
          <li key={a.id} className="lift -mx-2 px-2 py-2.5 rounded space-y-0.5">
            <div className="flex items-start gap-2">
              <SeverityBadge severity={a.severity} score={a.severityScore} className="shrink-0 mt-0.5" />
              <button onClick={() => onOpen(a)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent leading-snug">{a.title}</button>
            </div>
            {/* The title opens the article; names in the summary open their panels */}
            {a.description && <p className="text-xs font-serif text-theme-text-muted line-clamp-2"><EntityText text={a.description} context={a.title} /></p>}
            <p className="text-[11px] font-mono text-theme-text-muted">{a.sourceName} · {formatRelativeTime(a.publishedAt)}</p>
          </li>
        ))}
      </ul>
      {articles.length > shown && <MoreButton remaining={articles.length - shown} onClick={() => setShown((n) => n + PAGE)} />}
    </>
  );
};

const VulnRows: React.FC<{ vulns: TagVuln[]; onOpenCve: (cve: string) => void }> = ({ vulns, onOpenCve }) => {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      <ul className="divide-y divide-theme-border/60 text-xs">
        {vulns.slice(0, shown).map((v) => (
          <li key={v.cve} className="lift -mx-2 px-2 py-2 rounded space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <CveButton cve={v.cve} onOpen={onOpenCve} />
              <SeverityPill severity={v.severity} score={v.score} />
              {v.kev && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">KEV</span>}
              {v.ransomware && <Skull className="w-3 h-3 text-rose-500" aria-label="Used by ransomware" />}
              <span className="ml-auto text-theme-text-muted" title={v.kev ? 'Added to KEV' : 'Published'}>{v.date.slice(0, 10)}</span>
            </div>
            <p className="font-serif text-theme-text line-clamp-2"><EntityText text={v.title} /></p>
          </li>
        ))}
      </ul>
      {vulns.length > shown && <MoreButton remaining={vulns.length - shown} onClick={() => setShown((n) => n + PAGE)} />}
    </>
  );
};

interface TagPanelProps {
  tag: string;
  articles: Article[];
  vulns: VulnData | null;
  onOpenArticle: (a: Article) => void;
  onOpenCve: (cve: string) => void;
  onClose: () => void;
}

/**
 * Everything one tag stands for: the articles carrying it, how many came each day, and the KEV entries and
 * CVEs that mention it. A weakness (a CWE id or name) lists its CVEs first, since that's what it is about.
 */
export const TagPanel: React.FC<TagPanelProps> = ({ tag, articles, vulns, onOpenArticle, onOpenCve, onClose }) => {
  const name = cleanTag(tag);
  const matches = useMemo(() => tagMatches(name, articles, vulns), [name, articles, vulns]);
  // One clock reading per match, so the chart, its dates and the 7-day count agree and re-renders stay cheap
  const { now, daily, lastWeek } = useMemo(() => {
    const at = Date.now();
    return {
      now: at,
      daily: dailyCounts(matches.articles, DAYS, at),
      lastWeek: matches.articles.filter((a) => at - Date.parse(a.publishedAt) < 7 * DAY_MS).length,
    };
  }, [matches.articles]);
  const kevCount = matches.vulns.filter((v) => v.kev).length;
  const cweName = matches.cwe ? vulns?.cweNames?.[matches.cwe] : undefined;
  // A CWE named by its id shows its name below; named by its name, its id
  const subtitle = matches.cwe && (matches.cwe.toLowerCase() === name.toLowerCase() ? cweName : matches.cwe);

  const articleSection = (
    <div>
      <SectionTitle>Articles ({matches.articles.length})</SectionTitle>
      {matches.articles.length
        ? <ArticleRows articles={matches.articles} onOpen={onOpenArticle} />
        : <p className="text-xs font-serif italic text-theme-text-muted">No articles in your feeds carry this tag.</p>}
    </div>
  );
  const vulnSection = (
    <div>
      <SectionTitle>Vulnerabilities ({matches.vulns.length})</SectionTitle>
      {!vulns ? <p className="text-xs font-mono text-theme-text-muted animate-pulse">Loading vulnerability data…</p>
        : matches.vulns.length ? <VulnRows vulns={matches.vulns} onOpenCve={onOpenCve} />
        : <p className="text-xs font-serif italic text-theme-text-muted">No known exploited or recent critical CVEs mention {name}.</p>}
    </div>
  );

  return (
    <SidePanel onClose={onClose} title={`${name} tag`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-theme-text-muted flex items-center gap-1">
            {matches.cwe ? <><Bug className="w-3 h-3" /> Weakness</> : <><Tag className="w-3 h-3" /> Tag</>}
          </p>
          <h2 className="font-serif text-2xl font-extrabold text-theme-text break-words">{matches.cwe ? name : `#${name}`}</h2>
          {subtitle && <p className="text-sm font-serif text-theme-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <PanelCloseButton />
      </div>

      <StatCards columns="sm:grid-cols-4" stats={[
        { label: 'Articles', value: matches.articles.length, note: 'in your feeds' },
        { label: 'Last 7 days', value: lastWeek, note: `${daily.reduce((s, n) => s + n, 0)} in ${DAYS} days` },
        { label: 'Vulns', value: vulns ? matches.vulns.length : '—', note: 'KEV and recent CVEs' },
        { label: 'In KEV', value: vulns ? kevCount : '—', note: 'known exploited' },
      ]} />

      <div>
        <SectionTitle>Articles per day ({DAYS} days)</SectionTitle>
        <DailyBars values={daily} ariaLabel={`Articles tagged ${name} per day`} unit="articles" now={now} />
      </div>

      {matches.cwe ? <>{vulnSection}{articleSection}</> : <>{articleSection}{vulnSection}</>}

      <p className="text-[10px] font-mono text-theme-text-muted">
        Articles carry the tag, or one of the same threat topic; vulnerabilities mention it as a whole word
        {matches.cwe ? ', or have the weakness (and articles are about those CVEs)' : ''}. CVEs come from CISA KEV and NVD's last weeks of CVSS ≥ 7 records.
      </p>
    </SidePanel>
  );
};
