import React, { useMemo, useState } from 'react';
import { Article, KevEntry } from '../../types';
import { kevPerMonth, patchPriority } from '../../services/intelligence/vulns';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { BarList, chipClass, countBy, SectionTitle, selectClass } from '../incidents/shared';
import { StackedBars } from './StackedBars';
import { CveButton, EpssValue, StatCards } from './shared';
import { Search, Skull } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 0, label: 'All' },
];

interface KevTabProps {
  kev: KevEntry[]; // newest first
  news: Map<string, Article[]>;
  onOpenCve: (cve: string) => void;
}

export const KevTab: React.FC<KevTabProps> = ({ kev, news, onOpenCve }) => {
  const [days, setDays] = useState(90);
  const [vendor, setVendor] = useState('');
  const [cwe, setCwe] = useState('');
  const [ransomwareOnly, setRansomwareOnly] = useState(false);
  const [query, setQuery] = useState('');

  // Vendor, weakness and text filters apply to the chart too; the time range only to the stats and lists
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return kev.filter((k) =>
      (!vendor || k.vendor === vendor) &&
      (!cwe || k.cwes.includes(cwe)) &&
      (!ransomwareOnly || k.ransomware) &&
      (!q || `${k.cve} ${k.vendor} ${k.product} ${k.name}`.toLowerCase().includes(q))
    );
  }, [kev, vendor, cwe, ransomwareOnly, query]);

  const today = new Date().toISOString().slice(0, 10);
  const since = days ? new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10) : '';
  const before = days ? new Date(Date.now() - 2 * days * DAY_MS).toISOString().slice(0, 10) : '';
  const inRange = useMemo(() => filtered.filter((k) => k.dateAdded >= since), [filtered, since]);
  const previous = days ? filtered.filter((k) => k.dateAdded >= before && k.dateAdded < since).length : 0;
  const change = days && previous > 0 ? Math.round(((inRange.length - previous) / previous) * 100) : null;
  const ransomwareCount = inRange.filter((k) => k.ransomware).length;
  const in14Days = new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10);
  const dueSoon = inRange.filter((k) => k.dueDate && k.dueDate >= today && k.dueDate <= in14Days).length;

  const months = useMemo(() => kevPerMonth(filtered, 24), [filtered]);
  const vendors = countBy(inRange, (k) => k.vendor);
  const products = countBy(inRange, (k) => `${k.vendor} ${k.product}`);
  const weaknesses = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of inRange) for (const c of k.cwes) m.set(c, (m.get(c) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);
  const allVendors = useMemo(() => countBy(kev, (k) => k.vendor), [kev]);

  const patchFirst = useMemo(
    () => [...inRange].map((k) => ({ k, score: patchPriority(k, news.get(k.cve)?.length ?? 0) })).sort((a, b) => b.score - a.score).slice(0, 8),
    [inRange, news]
  );
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(inRange.length, 100);
  const rangeLabel = RANGES.find((r) => r.days === days)?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => <button key={r.days} onClick={() => setDays(r.days)} className={chipClass(days === r.days)}>{r.label}</button>)}
        <span className="mx-1 text-theme-border">|</span>
        <button onClick={() => setRansomwareOnly(!ransomwareOnly)} className={chipClass(ransomwareOnly)}>
          <Skull className="w-3 h-3 inline -mt-0.5" /> Ransomware-linked
        </button>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={selectClass} aria-label="Filter by vendor">
          <option value="">All vendors ({allVendors.length})</option>
          {allVendors.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
        {cwe && <button onClick={() => setCwe('')} className={chipClass(true)}>{cwe} ×</button>}
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CVE, product…" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
        </label>
      </div>

      <StatCards stats={[
        { label: 'Added', value: inRange.length, note: change === null ? (days ? '' : `${kev.length} in the catalog`) : `${change >= 0 ? '+' : ''}${change}% vs previous ${rangeLabel}` },
        { label: 'Ransomware-linked', value: ransomwareCount, note: inRange.length ? `${Math.round((ransomwareCount / inRange.length) * 100)}% of added` : '' },
        { label: 'Vendors', value: vendors.length, note: vendors[0] ? `most: ${vendors[0][0]}` : '' },
        { label: 'Due in 14 days', value: dueSoon, note: 'federal remediation deadline' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>Added to KEV per month (last 24 months)</SectionTitle>
        <StackedBars
          ariaLabel="Known exploited vulnerabilities added per month"
          unit="added"
          buckets={months.map((m) => ({
            label: m.month,
            short: m.month,
            segments: [
              { name: 'ransomware-linked', value: m.ransomware, className: 'fill-rose-600' },
              { name: 'other', value: m.total - m.ransomware, className: 'fill-rose-400/50' },
            ],
          }))}
        />
      </div>

      {patchFirst.length > 0 && (
        <div>
          <SectionTitle>Patch first ({rangeLabel})</SectionTitle>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {patchFirst.map(({ k }, i) => (
              <li key={k.cve} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-theme-text-muted w-4 text-right">{i + 1}.</span>
                <CveButton cve={k.cve} onOpen={onOpenCve} />
                <span className="font-serif text-theme-text truncate" title={k.name}>{k.vendor} {k.product}</span>
                <span className="ml-auto font-mono whitespace-nowrap"><EpssValue epss={k.epss} /></span>
                {k.ransomware && <Skull className="w-3 h-3 text-rose-500 shrink-0" aria-label="Used by ransomware" />}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Vendors</SectionTitle>
            <BarList rows={vendors.slice(0, 10).map(([v, n]) => ({ key: v, label: v, value: n, active: vendor === v, onClick: () => setVendor(vendor === v ? '' : v) }))} />
          </div>
          <div>
            <SectionTitle>Products</SectionTitle>
            <BarList color="bg-amber-500/70" rows={products.slice(0, 8).map(([p, n]) => ({ key: p, label: p, value: n }))} />
          </div>
          <div>
            <SectionTitle>Weaknesses (CWE)</SectionTitle>
            <BarList color="bg-sky-500/70" rows={weaknesses.slice(0, 8).map(([c, n]) => ({ key: c, label: c, value: n, active: cwe === c, onClick: () => setCwe(cwe === c ? '' : c) }))} />
          </div>
        </aside>

        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">Added</th>
                <th className="py-2 pr-3 font-semibold">CVE</th>
                <th className="py-2 pr-3 font-semibold">Vulnerability</th>
                <th className="py-2 pr-3 font-semibold" title="Probability of exploitation in the next 30 days">EPSS</th>
                <th className="py-2 pr-3 font-semibold">Due</th>
                <th className="py-2 pr-3 font-semibold">News</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {inRange.slice(0, visibleCount).map((k) => (
                <tr key={k.cve} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted">{k.dateAdded}</td>
                  <td className="py-2 pr-3"><CveButton cve={k.cve} onOpen={onOpenCve} /></td>
                  <td className="py-2 pr-3 text-theme-text">
                    <span className="font-serif" title={k.description}>{k.name}</span>
                    {k.ransomware && <span className="ml-1.5 px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">ransomware</span>}
                  </td>
                  <td className="py-2 pr-3"><EpssValue epss={k.epss} /></td>
                  <td className={`py-2 pr-3 whitespace-nowrap ${k.dueDate && k.dueDate >= today && k.dueDate <= in14Days ? 'text-orange-500 font-bold' : 'text-theme-text-muted'}`}>{k.dueDate ?? '—'}</td>
                  <td className="py-2 pr-3 text-theme-text-muted">{news.get(k.cve)?.length || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inRange.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No KEV entries match these filters.</p>}
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      </div>
    </div>
  );
};
