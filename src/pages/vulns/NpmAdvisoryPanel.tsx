import React, { useMemo } from 'react';
import { Article } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useNpmAdvisories } from '../../hooks/useNpmAdvisories';
import { useNpmMatches } from '../../hooks/useNpmMatches';
import { closePanel, openPanel } from '../../hooks/useHashRoute';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData, NpmRange } from '../../services/npm/advisories';
import type { PackageResult } from '../../services/npm/match';
import type { AffectedEntry } from '../../services/npm/npmFilters';
import { formatPackageEntry } from '../../services/npm/semver';
import { safeHttpUrl } from '../../services/rss/sanitizer';
import { severityFromScore } from '../../services/intelligence/vulns';
import { formatRelativeTime } from '../../utils/date';
import { SectionTitle } from '../incidents/shared';
import { AdvisoryText } from './AdvisoryText';
import { CveButton, CweChip, EpssValue, SeverityPill, vectorText } from './shared';
import { PanelCloseButton, SidePanel } from '../../components/Common/SidePanel';
import { ExternalLink } from 'lucide-react';

const githubUrl = (id: string) => `https://github.com/advisories/${encodeURIComponent(id)}`;
const osvUrl = (id: string) => `https://osv.dev/vulnerability/${encodeURIComponent(id)}`;
const day = (iso: string) => iso.slice(0, 10);
const openCve = (cve: string) => openPanel('cve', cve);
const NO_CVES: string[] = [];

/** What the published npm data knows about one id: the detailed advisory, its index entry (older than 90 days) or a malware report */
type Found =
  | { kind: 'detail'; advisory: NpmAdvisory }
  | { kind: 'index'; severity: NpmAdvisory['severity']; ranges: NpmRange[]; withdrawn: boolean }
  | { kind: 'malware'; ranges: NpmRange[]; published: string };

function findAdvisory(id: string, data: NpmAdvisoryData | null, malware: NpmMalwareData | null): Found | null {
  const advisory = data?.recent.find((a) => a.id === id);
  if (advisory) return { kind: 'detail', advisory };
  const entry = data?.index.find((e) => e[0] === id);
  if (entry) return { kind: 'index', severity: entry[1], ranges: entry[2].map(([pkg, vulnerable, patched]) => ({ package: pkg, vulnerable, patched })), withdrawn: entry[3] === 1 };
  const reports = malware?.entries.filter((m) => m[0] === id) ?? [];
  if (reports.length) return { kind: 'malware', ranges: reports.map(([, pkg, vulnerable]) => ({ package: pkg, vulnerable })), published: reports[0][3] };
  return null;
}

/** Articles naming one of the advisory's CVEs, or the GHSA id itself, newest first */
function relatedNews(articles: Article[], id: string, cves: string[]): Article[] {
  const ghsa = id.toLowerCase();
  return articles
    .filter((a) => a.cves?.some((c) => cves.includes(c)) || `${a.title} ${a.description ?? ''} ${a.content ?? ''}`.toLowerCase().includes(ghsa))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const RangesTable: React.FC<{ ranges: NpmRange[] }> = ({ ranges }) => (
  <table className="w-full text-xs font-mono">
    <thead>
      <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
        <th className="py-1.5 pr-3 font-semibold">Package</th>
        <th className="py-1.5 pr-3 font-semibold">Vulnerable</th>
        <th className="py-1.5 font-semibold">Patched</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-theme-border/60">
      {ranges.map((r, i) => (
        <tr key={`${r.package} ${r.vulnerable} ${i}`} className="align-top">
          <td className="py-1.5 pr-3 text-theme-text break-all">{r.package}</td>
          <td className="py-1.5 pr-3 text-theme-text-muted">{r.vulnerable || 'not stated'}</td>
          <td className="py-1.5">{r.patched ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">{r.patched}</span> : <span className="text-theme-text-muted">no fix yet</span>}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * The watched entries this advisory lists. A versioned entry is affected: the upgrade that clears it, and the one
 * that clears everything known. An entry without a version is only listed for its package: where it's fixed.
 */
const YourPackages: React.FC<{ hits: AffectedEntry[]; results: PackageResult[]; versioned: boolean }> = ({ hits, results, versioned }) => (
  <div className={`p-3 rounded-lg border ${versioned ? 'border-rose-500/40 bg-rose-500/10' : 'border-theme-border bg-theme-surface'}`}>
    <SectionTitle>{versioned ? 'Your packages affected' : 'Listed for your package (version not given)'}</SectionTitle>
    <ul className="space-y-1.5 text-xs font-mono">
      {hits.map((h) => {
        const minSafe = results.find((r) => formatPackageEntry(r.entry) === h.entry)?.minSafeVersion;
        return (
          <li key={`${h.entry} ${h.vulnerable}`}>
            <span className="font-bold text-theme-text">{h.entry}</span>
            <span className="text-theme-text-muted"> · {h.unparsed ? 'range unreadable, may be affected' : `${versioned ? 'in' : 'vulnerable'} ${h.vulnerable}`}</span>
            <span className="block text-theme-text">
              {versioned
                ? (h.patched ? <>Upgrade to <strong className="text-emerald-600 dark:text-emerald-400">{h.patched}</strong> or later</> : 'No fixed version for this advisory yet')
                : (h.patched ? <>Fixed in <strong className="text-emerald-600 dark:text-emerald-400">{h.patched}</strong> · add your version in Settings to check</> : 'No fixed version for this advisory yet')}
              {versioned && minSafe && minSafe !== h.patched && <span className="text-theme-text-muted"> · {minSafe} clears every known advisory</span>}
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);

interface NpmAdvisoryPanelProps {
  id: string;
  found: Found | null;
  loading: boolean;
  failed?: boolean; // the npm data couldn't be loaded and nothing is stored
  hits: AffectedEntry[];
  results: PackageResult[];
  news: Article[];
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** One npm advisory: what it says, what it affects, whether your packages are in it, and the news about it */
const isGhsa = (id: string) => /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(id);

export const NpmAdvisoryPanel: React.FC<NpmAdvisoryPanelProps> = ({ id, found, loading, failed, hits, results, news, onOpenArticle, onClose }) => {
  const a = found?.kind === 'detail' ? found.advisory : null;
  const severity = a?.severity ?? (found?.kind === 'index' ? found.severity : found?.kind === 'malware' ? 'critical' : undefined);
  const withdrawn = a?.withdrawn ?? (found?.kind === 'index' && found.withdrawn ? 'yes' : undefined);
  const references = (a?.references ?? []).map(safeHttpUrl).filter(Boolean);
  const yours = hits.filter((h) => h.versioned);
  const listedOnly = hits.filter((h) => !h.versioned);

  const facts: [string, React.ReactNode][] = a ? [
    ...a.cvss.map((c) => [`CVSS v${c.version}`, (
      <span className="inline-flex flex-col items-start gap-0.5">
        <SeverityPill severity={severityFromScore(c.score)} score={c.score} />
        <span className="text-[10px] text-theme-text-muted break-all" title={c.vector}>{c.vector}</span>
        {vectorText(c.vector) && <span className="text-[10px] text-theme-text-muted">{vectorText(c.vector)}</span>}
      </span>
    )] as [string, React.ReactNode]),
    ...(a.cwes.length ? [['Weakness', <span>{a.cwes.map((c) => (
      <span key={c.id} className="block"><CweChip cwe={c.id} name={c.name} />{c.name && <span className="text-theme-text-muted"> {c.name}</span>}</span>
    ))}</span>] as [string, React.ReactNode]] : []),
    ['EPSS (30-day exploitation probability)', a.epss
      ? <span><EpssValue epss={a.epss.score} /><span className="text-theme-text-muted"> · {Math.round(a.epss.percentile * 100)}th percentile</span></span>
      : <span className="text-theme-text-muted">{a.cves.length ? 'not scored' : 'no CVE'}</span>],
    ['Known exploited (CISA KEV)', a.kev ? <span className="text-rose-600 font-bold">Yes</span> : <span className="text-theme-text-muted">No</span>],
    ...(a.cves.length ? [['CVE', <span className="flex flex-wrap gap-2">{a.cves.map((c) => <CveButton key={c} cve={c} onOpen={openCve} />)}</span>] as [string, React.ReactNode]] : []),
    ['Published', day(a.published)],
    ['Updated', day(a.updated)],
    ...(a.withdrawn ? [['Withdrawn', day(a.withdrawn)] as [string, React.ReactNode]] : []),
    ...(a.credits.length ? [['Credits', a.credits.join(', ')] as [string, React.ReactNode]] : []),
  ] : found?.kind === 'malware' ? [['Published', day(found.published)]] : [];

  return (
    <SidePanel onClose={onClose} title={id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-mono text-2xl font-extrabold text-theme-text break-all">{id}</h2>
          {a && <p className={`font-serif text-sm font-bold text-theme-text mt-1 ${a.withdrawn ? 'line-through' : ''}`}>{a.summary}</p>}
          {found?.kind === 'malware' && <p className="font-serif text-sm font-bold text-theme-text mt-1">Malicious code in {[...new Set(found.ranges.map((r) => r.package))].join(', ')}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-mono font-bold uppercase">
            {severity && severity !== 'unknown' && <SeverityPill severity={severity} />}
            {found?.kind === 'malware' && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Malware</span>}
            {a?.kev && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Known exploited (CISA KEV)</span>}
            {withdrawn && <span className="px-1.5 py-0.5 rounded bg-theme-text text-theme-bg">Withdrawn</span>}
            {yours.length > 0 && <span className="px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-300">Affects your packages</span>}
          </div>
        </div>
        <PanelCloseButton />
      </div>

      {failed && !found && (
        <p className="text-sm font-serif text-theme-text-muted">
          Couldn't load npm advisory data.{isGhsa(id) && <> <a href={`https://github.com/advisories/${id}`} target="_blank" rel="noopener noreferrer" className="text-theme-accent underline">Open {id} on GitHub</a>.</>}
        </p>
      )}
      {loading && !failed && !found && <p className="text-xs font-mono text-theme-text-muted animate-pulse">Loading npm advisories…</p>}
      {!loading && !found && (
        <p className="text-sm font-serif text-theme-text-muted">{id} isn't in the published npm data: it may be for another ecosystem, not yet reviewed, or not yet in this snapshot.</p>
      )}
      {found?.kind === 'index' && (
        <p className="text-sm font-serif text-theme-text-muted">Older than 90 days: only the data your packages are matched against is kept here. GitHub has the full advisory.</p>
      )}
      {found?.kind === 'malware' && (
        <p className="text-sm font-serif text-theme-text">
          GitHub found these releases publishing malicious code, such as install scripts that steal credentials or download a payload. Treat any machine that installed one as compromised: remove the package and rotate the secrets it could reach.
        </p>
      )}
      {withdrawn && <p className="text-xs font-serif italic text-theme-text-muted">GitHub withdrew this advisory: it is no longer matched against your packages.</p>}

      {yours.length > 0 && <YourPackages hits={yours} results={results} versioned />}
      {listedOnly.length > 0 && <YourPackages hits={listedOnly} results={results} versioned={false} />}

      {a?.description && <AdvisoryText text={a.description} className="text-sm font-serif text-theme-text leading-relaxed" />}

      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-theme-text-muted">{label}</dt>
              <dd className="text-theme-text min-w-0">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {found && (
        <div>
          <SectionTitle>Affected packages</SectionTitle>
          <RangesTable ranges={a?.ranges ?? (found.kind === 'detail' ? [] : found.ranges)} />
        </div>
      )}

      {references.length > 0 && (
        <div>
          <SectionTitle>References</SectionTitle>
          <ul className="space-y-1 text-xs font-mono">
            {references.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline break-all">{u.replace(/^https?:\/\//, '')}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs font-mono">
        <a href={safeHttpUrl(a?.url) || githubUrl(id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-theme-accent hover:underline">GitHub advisory <ExternalLink className="w-3 h-3" /></a>
        <a href={osvUrl(id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-theme-accent hover:underline">OSV.dev <ExternalLink className="w-3 h-3" /></a>
      </div>

      <div>
        <SectionTitle>In the news ({news.length})</SectionTitle>
        {news.length ? (
          <ul>
            {news.slice(0, 15).map((n) => (
              <li key={n.id} className="lift -mx-2 px-2 py-1 rounded">
                <button onClick={() => onOpenArticle(n)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent">{n.title}</button>
                <p className="text-[11px] font-mono text-theme-text-muted">{n.sourceName} · {formatRelativeTime(n.publishedAt)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs font-serif italic text-theme-text-muted">No articles in your feeds mention {id}{a?.cves.length ? ` or ${a.cves.join(', ')}` : ''}.</p>}
      </div>
    </SidePanel>
  );
};

/** The npm advisory panel (?advisory=GHSA-…), mounted once by the app over any page; the npm data only loads once one is opened */
export const NpmAdvisoryPanelHost: React.FC<{ id: string; onOpenArticle: (a: Article) => void }> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const { advisories, malware, failed } = useNpmAdvisories();
  const { results, affecting } = useNpmMatches(advisories, malware);
  const found = useMemo(() => findAdvisory(id, advisories, malware), [id, advisories, malware]);
  const cves = found?.kind === 'detail' ? found.advisory.cves : NO_CVES;
  const news = useMemo(() => relatedNews(articles, id, cves), [articles, id, cves]);
  return (
    <NpmAdvisoryPanel
      id={id}
      found={found}
      loading={!advisories}
      failed={failed}
      hits={affecting.get(id) ?? []}
      results={results}
      news={news}
      onOpenArticle={onOpenArticle}
      onClose={() => closePanel('advisory')}
    />
  );
};
