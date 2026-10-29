import React, { useMemo, useState } from 'react';
import { OssAdvisory } from '../../types';
import { formatRelativeTime } from '../../utils/date';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { BarList, chipClass, countBy, SectionTitle } from '../incidents/shared';
import { StackedBars } from './StackedBars';
import { CveButton, SEVERITY_FILL, SeverityPill, StatCards } from './shared';
import { ExternalLink } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/** Reviewed GitHub Security Advisories: vulnerable open-source packages, by ecosystem */
export const OpenSourceTab: React.FC<{ advisories: OssAdvisory[]; onOpenCve: (cve: string) => void }> = ({ advisories, onOpenCve }) => {
  const [ecosystem, setEcosystem] = useState('');
  const [severity, setSeverity] = useState('');
  const [pkg, setPkg] = useState('');

  const filtered = useMemo(
    () => advisories.filter((a) => (!ecosystem || a.ecosystem === ecosystem) && (!severity || a.severity === severity) && (!pkg || `${a.ecosystem}/${a.package}` === pkg)),
    [advisories, ecosystem, severity, pkg]
  );
  const days = useMemo(() => {
    const today = Math.floor(Date.now() / DAY_MS);
    const buckets = Array.from({ length: 14 }, (_, i) => ({ date: new Date((today - 13 + i) * DAY_MS).toISOString().slice(0, 10), counts: {} as Record<string, number> }));
    const byDate = new Map(buckets.map((b) => [b.date, b]));
    for (const a of filtered) {
      const b = byDate.get(a.publishedAt.slice(0, 10));
      if (b) b.counts[a.severity] = (b.counts[a.severity] || 0) + 1;
    }
    return buckets;
  }, [filtered]);

  const ecosystems = countBy(advisories, (a) => a.ecosystem);
  const packages = countBy(filtered, (a) => a.package && `${a.ecosystem}/${a.package}`);
  const critical = filtered.filter((a) => a.severity === 'critical').length;
  const withCve = filtered.filter((a) => a.cve).length;
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(filtered.length, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setSeverity('')} className={chipClass(!severity)}>All severities</button>
        {SEVERITIES.map((s) => <button key={s} onClick={() => setSeverity(severity === s ? '' : s)} className={chipClass(severity === s)}>{s}</button>)}
        {ecosystem && <button onClick={() => setEcosystem('')} className={chipClass(true)}>{ecosystem} ×</button>}
        {pkg && <button onClick={() => setPkg('')} className={chipClass(true)}>{pkg} ×</button>}
      </div>

      <StatCards stats={[
        { label: 'Advisories (14 days)', value: filtered.length },
        { label: 'Critical', value: critical },
        { label: 'Ecosystems', value: countBy(filtered, (a) => a.ecosystem).length, note: ecosystems[0] ? `most: ${ecosystems[0][0]}` : '' },
        { label: 'With a CVE', value: withCve, note: filtered.length ? `${Math.round((withCve / filtered.length) * 100)}%` : '' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>Advisories per day, by severity</SectionTitle>
        <StackedBars
          ariaLabel="GitHub security advisories published per day"
          unit="advisories"
          buckets={days.map((d) => ({
            label: d.date,
            short: d.date.slice(5),
            segments: [...SEVERITIES, 'unknown' as const].map((s) => ({ name: s, value: d.counts[s] || 0, className: SEVERITY_FILL[s] })),
          }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Ecosystems</SectionTitle>
            <BarList color="bg-emerald-500/70" rows={ecosystems.slice(0, 10).map(([e, n]) => ({ key: e, label: e, value: n, active: ecosystem === e, onClick: () => setEcosystem(ecosystem === e ? '' : e) }))} />
          </div>
          <div>
            <SectionTitle>Packages</SectionTitle>
            <BarList color="bg-amber-500/70" rows={packages.slice(0, 8).map(([p, n]) => ({ key: p, label: p, value: n, active: pkg === p, onClick: () => setPkg(pkg === p ? '' : p) }))} />
          </div>
        </aside>

        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">Published</th>
                <th className="py-2 pr-3 font-semibold">Severity</th>
                <th className="py-2 pr-3 font-semibold">Package</th>
                <th className="py-2 pr-3 font-semibold">Advisory</th>
                <th className="py-2 pr-3 font-semibold">CVE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {filtered.slice(0, visibleCount).map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted">{formatRelativeTime(a.publishedAt)}</td>
                  <td className="py-2 pr-3"><SeverityPill severity={a.severity === 'unknown' ? undefined : a.severity} /></td>
                  <td className="py-2 pr-3 text-theme-text-muted whitespace-nowrap">{a.package ? <>{a.ecosystem}/<span className="text-theme-text">{a.package}</span></> : '—'}</td>
                  <td className="py-2 pr-3">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-serif text-theme-text hover:text-theme-accent">
                      {a.summary} <ExternalLink className="w-3 h-3 inline opacity-60" />
                    </a>
                  </td>
                  <td className="py-2 pr-3">{a.cve ? <CveButton cve={a.cve} onOpen={onOpenCve} /> : <span className="text-theme-text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No advisories match these filters.</p>}
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      </div>
      <p className="text-[11px] font-serif text-theme-text-muted">
        Reviewed advisories from the <a href="https://github.com/advisories" target="_blank" rel="noopener noreferrer" className="underline">GitHub Advisory Database</a>, refreshed with the site snapshot.
      </p>
    </div>
  );
};
