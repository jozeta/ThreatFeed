import React, { useMemo } from 'react';
import { useHashParam } from '../../hooks/useHashRoute';
import { Article, CveRecord, NvdStats } from '../../types';
import { formatRelativeTime } from '../../utils/date';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { BarList, chipClass, SectionTitle } from '../incidents/shared';
import { StackedBars } from './StackedBars';
import { CveButton, EpssValue, SEVERITY_FILL, SeverityPill, StatCards } from './shared';
import { Search } from 'lucide-react';

interface NewCvesTabProps {
  stats: NvdStats;
  notable: CveRecord[]; // critical CVEs, newest first
  kevIds: Set<string>;
  news: Map<string, Article[]>;
  onOpenCve: (cve: string) => void;
}

export const NewCvesTab: React.FC<NewCvesTabProps> = ({ stats, notable, kevIds, news, onOpenCve }) => {
  const [query, setQuery] = useHashParam('q');
  const [cwe, setCwe] = useHashParam('cwe');
  const [assigner, setAssigner] = useHashParam('cna');
  const totals = useMemo(() => stats.daily.reduce(
    (t, d) => ({ critical: t.critical + d.critical, high: t.high + d.high, unscored: t.unscored + d.unscored }),
    { critical: 0, high: 0, unscored: 0 }
  ), [stats]);
  const days = stats.daily.length;

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return notable.filter((r) =>
      (!cwe || r.cwe === cwe) &&
      (!assigner || r.assigner === assigner) &&
      (!q || `${r.id} ${r.description ?? ''} ${r.assigner ?? ''} ${r.cwe ?? ''}`.toLowerCase().includes(q)));
  }, [notable, query, cwe, assigner]);
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(rows.length, 50);

  return (
    <div className="space-y-6">
      <StatCards stats={[
        { label: `Published (${days} days)`, value: stats.total, note: `≈ ${Math.round(stats.total / days)} per day` },
        { label: 'Critical (≥ 9.0)', value: totals.critical, note: stats.total ? `${((totals.critical / stats.total) * 100).toFixed(1)}%` : '' },
        { label: 'High (7.0–8.9)', value: totals.high, note: stats.total ? `${((totals.high / stats.total) * 100).toFixed(1)}%` : '' },
        { label: 'Not yet scored', value: totals.unscored, note: stats.total ? `${Math.round((totals.unscored / stats.total) * 100)}% waiting for a CVSS score` : '' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>CVEs published per day, by CVSS severity</SectionTitle>
        <StackedBars
          ariaLabel={`CVEs published per day over the last ${days} days`}
          unit="CVEs"
          buckets={stats.daily.map((d) => ({
            label: d.date,
            short: d.date.slice(5),
            segments: [
              { name: 'critical', value: d.critical, className: SEVERITY_FILL.critical },
              { name: 'high', value: d.high, className: SEVERITY_FILL.high },
              { name: 'medium', value: d.medium, className: SEVERITY_FILL.medium },
              { name: 'low', value: d.low, className: SEVERITY_FILL.low },
              { name: 'unscored', value: d.unscored, className: SEVERITY_FILL.unscored },
            ],
          }))}
        />
        <p className="mt-2 text-[10px] font-mono text-theme-text-muted">Today is partial. Recent CVEs often have no score yet while NVD and the CNA work through them.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Weaknesses (CWE)</SectionTitle>
            <BarList color="bg-sky-500/70" rows={stats.cwes.slice(0, 10).map(([c, n]) => ({ key: c, label: c, value: n, active: cwe === c, onClick: () => setCwe(cwe === c ? '' : c) }))} />
          </div>
          <div>
            <SectionTitle>Assigned by (CNA)</SectionTitle>
            <BarList color="bg-amber-500/70" rows={stats.assigners.slice(0, 10).map(([a, n]) => ({ key: a, label: a, value: n, active: assigner === a, onClick: () => setAssigner(assigner === a ? '' : a) }))} />
          </div>
          <p className="text-[10px] font-mono text-theme-text-muted">Counts cover every new CVE; click one to filter the critical list.</p>
        </aside>

        <div className="lg:col-span-3 overflow-x-auto space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SectionTitle>Critical CVEs ({rows.length})</SectionTitle>
              {cwe && <button onClick={() => setCwe('')} className={chipClass(true)}>{cwe} ×</button>}
              {assigner && <button onClick={() => setAssigner('')} className={chipClass(true)}>{assigner} ×</button>}
            </div>
            <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
              <Search className="w-3.5 h-3.5 text-theme-text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CVE, product, CWE…" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
            </label>
          </div>
          <ul className="md:hidden divide-y divide-theme-border/60 text-xs">
            {rows.slice(0, visibleCount).map((r) => (
              <li key={r.id} className="py-2.5 space-y-1">
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <CveButton cve={r.id} onOpen={onOpenCve} />
                  <SeverityPill severity={r.severity} score={r.score} />
                  {r.epss !== undefined && <span className="text-theme-text-muted">EPSS <EpssValue epss={r.epss} /></span>}
                  {kevIds.has(r.id) && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">KEV</span>}
                </div>
                <p className="font-serif text-theme-text">{r.description}</p>
                <p className="font-mono text-[11px] text-theme-text-muted">
                  {formatRelativeTime(r.published)}{r.assigner && ` · ${r.assigner}`}{r.cwe && ` · ${r.cwe}`}{news.get(r.id)?.length ? ` · ${news.get(r.id)!.length} articles` : ''}
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden md:table w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">Published</th>
                <th className="py-2 pr-3 font-semibold">CVE</th>
                <th className="py-2 pr-3 font-semibold">CVSS</th>
                <th className="py-2 pr-3 font-semibold">Description</th>
                <th className="py-2 pr-3 font-semibold">EPSS</th>
                <th className="py-2 pr-3 font-semibold">News</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {rows.slice(0, visibleCount).map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted">{formatRelativeTime(r.published)}</td>
                  <td className="py-2 pr-3">
                    <CveButton cve={r.id} onOpen={onOpenCve} />
                    {kevIds.has(r.id) && <span className="block text-[9px] font-bold text-rose-500 uppercase">in KEV</span>}
                  </td>
                  <td className="py-2 pr-3"><SeverityPill severity={r.severity} score={r.score} /></td>
                  <td className="py-2 pr-3 font-serif text-theme-text">
                    {r.description}
                    {(r.assigner || r.cwe) && <span className="block font-mono text-[10px] text-theme-text-muted">{[r.assigner, r.cwe].filter(Boolean).join(' · ')}</span>}
                  </td>
                  <td className="py-2 pr-3"><EpssValue epss={r.epss} /></td>
                  <td className="py-2 pr-3 text-theme-text-muted">{news.get(r.id)?.length || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No critical CVEs match.</p>}
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      </div>
    </div>
  );
};
