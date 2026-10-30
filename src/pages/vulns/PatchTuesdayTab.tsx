import React, { useMemo } from 'react';
import { useHashParam } from '../../hooks/useHashRoute';
import { usePagedCount } from '../../hooks/usePagedCount';
import { PatchCve, PatchMonth } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { VendorButton } from '../../components/VendorLink';
import { EntityText } from '../../components/EntityText';
import { chipClass, countBy, SectionTitle, selectClass } from '../incidents/shared';
import { CveButton, SEVERITY_TEXT, StatCards } from './shared';
import { ExternalLink, Search } from 'lucide-react';

const IMPACT_FILL: Record<string, string> = {
  'Remote Code Execution': 'fill-rose-600',
  'Elevation of Privilege': 'fill-orange-500',
  'Information Disclosure': 'fill-amber-400',
  'Security Feature Bypass': 'fill-violet-500',
  'Denial of Service': 'fill-sky-500',
  Spoofing: 'fill-teal-500',
  Tampering: 'fill-slate-500',
};
// Microsoft's own severity scale, in the colours of the CVSS bands it roughly corresponds to
const SEVERITY_COLOR: Record<string, string> = { Critical: SEVERITY_TEXT.critical, Important: SEVERITY_TEXT.high, Moderate: SEVERITY_TEXT.medium, Low: SEVERITY_TEXT.low };
const SEVERITY_RANK: Record<string, number> = { Critical: 4, Important: 3, Moderate: 2, Low: 1 };

const inStack = (c: PatchCve, keywords: string[]) => {
  const text = `${c.title} ${c.products.join(' ')}`;
  return keywords.some((kw) => containsTerm(text, kw));
};

const ThreatBadges: React.FC<{ c: PatchCve }> = ({ c }) => (
  <>
    {c.exploited && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase whitespace-nowrap" title="Microsoft: exploitation detected">exploited</span>}
    {c.publiclyDisclosed && <span className="px-1 rounded border border-orange-500/40 text-orange-500 text-[9px] font-bold uppercase whitespace-nowrap" title="Publicly disclosed before the patch">disclosed</span>}
  </>
);

const MsSeverity: React.FC<{ severity?: string }> = ({ severity }) =>
  severity ? <span className={`inline-block px-1.5 rounded border text-[10px] font-bold uppercase ${SEVERITY_COLOR[severity]}`}>{severity}</span> : <span className="text-theme-text-muted">—</span>;

const SHOWN_PRODUCTS = 5; // every product is kept for search and stack matching; this many are listed

const productList = (products: string[]) =>
  products.slice(0, SHOWN_PRODUCTS).join(', ') + (products.length > SHOWN_PRODUCTS ? ` +${products.length - SHOWN_PRODUCTS} more` : '');

const StackBadge = () => (
  <span className="px-1 rounded bg-theme-accent text-white text-[9px] font-bold uppercase whitespace-nowrap" title="Matches your stack keywords (Settings)">your stack</span>
);

/** Horizontal bars of CVEs per impact type; a bar filters the list */
const ImpactChart: React.FC<{ rows: [string, number][]; active: string; onSelect: (impact: string) => void }> = ({ rows, active, onSelect }) => {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  const width = 420;
  const rowHeight = 20;
  const labelWidth = 150;
  const barSpace = width - labelWidth - 40;
  return (
    <svg viewBox={`0 0 ${width} ${rows.length * rowHeight}`} className="w-full max-w-lg" role="img" aria-label="CVEs by impact type">
      {rows.map(([impact, n], i) => {
        const y = i * rowHeight;
        const w = Math.max(2, (n / max) * barSpace);
        return (
          <g key={impact} onClick={() => onSelect(impact)} className="cursor-pointer" opacity={active && active !== impact ? 0.4 : 1}>
            <title>{`${impact}: ${n} CVEs`}</title>
            <rect x={0} y={y} width={width} height={rowHeight} fill="transparent" />
            <text x={labelWidth - 6} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="central" className="fill-theme-text font-mono" fontSize={11}>{impact}</text>
            <rect x={labelWidth} y={y + 4} width={w} height={rowHeight - 8} rx={2} className={IMPACT_FILL[impact] ?? 'fill-slate-400/60'} />
            <text x={labelWidth + w + 4} y={y + rowHeight / 2} dominantBaseline="central" className="fill-theme-text-muted font-mono" fontSize={11}>{n}</text>
          </g>
        );
      })}
    </svg>
  );
};

export const PatchTuesdayTab: React.FC<{ months: PatchMonth[]; stackKeywords: string[]; onOpenCve: (cve: string) => void }> = ({ months, stackKeywords, onOpenCve }) => {
  // Month, filters and search live in the URL (#/vulns/patch?month=2026-Oct&impact=…) like the other tabs
  const [monthParam, setMonth] = useHashParam('month');
  const month = months.find((m) => m.id === monthParam) ?? months[0];
  const [query, setQuery] = useHashParam('q');
  const [impact, setImpact] = useHashParam('impact');
  const [flagsParam, setFlagsParam] = useHashParam('only');
  const flags = new Set(flagsParam.split(',').filter(Boolean));
  const toggleFlag = (flag: string) => {
    const next = new Set(flags);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    setFlagsParam([...next].join(','));
  };

  const cves = month.cves;
  const stackHits = useMemo(() => new Set(stackKeywords.length ? cves.filter((c) => inStack(c, stackKeywords)).map((c) => c.cve) : []), [cves, stackKeywords]);
  const impacts = useMemo(() => countBy(cves, (c) => c.impact), [cves]);
  // Zero-days and publicly disclosed CVEs, the ones to patch first
  const flagged = useMemo(() => cves.filter((c) => c.exploited || c.publiclyDisclosed).sort((a, b) => Number(b.exploited) - Number(a.exploited)), [cves]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return cves
      .filter((c) =>
        (!impact || c.impact === impact) &&
        (!flags.has('exploited') || c.exploited || c.publiclyDisclosed) &&
        (!flags.has('critical') || c.severity === 'Critical') &&
        (!flags.has('stack') || stackHits.has(c.cve)) &&
        (!q || `${c.cve} ${c.title} ${c.products.join(' ')} ${(c.kb ?? []).join(' ')}`.toLowerCase().includes(q))
      )
      // Exploited first, then by severity and CVSS
      .sort((a, b) =>
        Number(b.exploited) - Number(a.exploited) || Number(b.publiclyDisclosed) - Number(a.publiclyDisclosed) ||
        (SEVERITY_RANK[b.severity ?? ''] ?? 0) - (SEVERITY_RANK[a.severity ?? ''] ?? 0) || (b.cvss ?? 0) - (a.cvss ?? 0) || a.cve.localeCompare(b.cve)
      );
  }, [cves, impact, flagsParam, stackHits, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(filtered.length, 100);
  const critical = cves.filter((c) => c.severity === 'Critical').length;
  const exploited = cves.filter((c) => c.exploited).length;
  const disclosed = cves.filter((c) => c.publiclyDisclosed).length;
  const rce = cves.filter((c) => c.impact === 'Remote Code Execution').length;
  const pct = (n: number) => (cves.length ? `${Math.round((n / cves.length) * 100)}% of the release` : '');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <VendorButton name="Microsoft" className="font-serif text-lg font-extrabold text-theme-text" />
        <select value={month.id} onChange={(e) => setMonth(e.target.value === months[0].id ? '' : e.target.value)} className={selectClass} aria-label="Patch Tuesday release">
          {months.map((m) => <option key={m.id} value={m.id}>{m.title.replace(/ Security Updates$/, '')} ({m.cves.length})</option>)}
        </select>
        <span className="text-xs font-mono text-theme-text-muted">released {month.released.slice(0, 10)}</span>
        <a
          href={`https://msrc.microsoft.com/update-guide/releaseNote/${encodeURIComponent(month.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-mono text-theme-accent hover:underline"
        >
          MSRC release notes <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <StatCards columns="md:grid-cols-5" stats={[
        { label: 'CVEs', value: cves.length, note: 'Microsoft CVEs in the release' },
        { label: 'Critical', value: critical, note: pct(critical) },
        { label: 'Zero-days', value: exploited, note: 'exploited when patched' },
        { label: 'Publicly disclosed', value: disclosed, note: 'known before the patch' },
        { label: 'Remote code execution', value: rce, note: pct(rce) },
      ]} />

      {flagged.length > 0 && (
        <div>
          <SectionTitle>Exploited or disclosed ({flagged.length})</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {flagged.map((c) => (
              <li key={c.cve}>
                <button
                  onClick={() => onOpenCve(c.cve)}
                  title={c.title}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono hover:border-theme-accent ${c.exploited ? 'border-rose-500/50 bg-rose-500/10' : 'border-orange-500/40 bg-orange-500/5'}`}
                >
                  <span className="font-bold text-theme-accent">{c.cve}</span>
                  <span className="max-w-[16rem] truncate font-serif text-theme-text">{c.title.replace(/ Vulnerability$/, '')}</span>
                  <ThreatBadges c={c} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {impacts.length > 0 && (
        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
          <SectionTitle>CVEs by impact</SectionTitle>
          <ImpactChart rows={impacts} active={impact} onSelect={(i) => setImpact(impact === i ? '' : i)} />
          <p className="mt-2 text-[10px] font-mono text-theme-text-muted">Click a bar to filter the list; click it again to clear.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CVE, title, product, KB…" className="bg-transparent font-mono text-theme-text focus:outline-none w-44" />
        </label>
        <button onClick={() => toggleFlag('exploited')} className={chipClass(flags.has('exploited'))}>Exploited or disclosed</button>
        <button onClick={() => toggleFlag('critical')} className={chipClass(flags.has('critical'))}>Critical</button>
        {stackKeywords.length > 0 && (
          <button onClick={() => toggleFlag('stack')} className={chipClass(flags.has('stack'))} title="Title or affected products match your stack keywords">Your stack ({stackHits.size})</button>
        )}
        {impact && <button onClick={() => setImpact('')} className={chipClass(true)}>{impact} ×</button>}
        <span className="text-xs font-mono text-theme-text-muted">{filtered.length} CVEs</span>
      </div>

      <div className="overflow-x-auto">
        {/* Phones get cards; the table needs more width than a phone has */}
        <ul className="md:hidden divide-y divide-theme-border/60 text-xs">
          {filtered.slice(0, visibleCount).map((c) => (
            <li key={c.cve} className="py-2.5 space-y-1 cursor-pointer" onClick={() => onOpenCve(c.cve)}>
              <div className="flex flex-wrap items-center gap-2 font-mono">
                <span onClick={(e) => e.stopPropagation()}><CveButton cve={c.cve} onOpen={onOpenCve} /></span>
                <MsSeverity severity={c.severity} />
                {c.cvss !== undefined && <span className="text-theme-text-muted">CVSS {c.cvss.toFixed(1)}</span>}
                <ThreatBadges c={c} />
                {stackHits.has(c.cve) && <StackBadge />}
              </div>
              <p className="font-serif text-theme-text"><EntityText text={c.title} /></p>
              <p className="font-mono text-[11px] text-theme-text-muted">{[c.impact, productList(c.products)].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
        <table className="hidden md:table w-full text-xs font-mono">
          <thead>
            <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
              <th className="py-2 pr-3 font-semibold">CVE</th>
              <th className="py-2 pr-3 font-semibold">Title</th>
              <th className="py-2 pr-3 font-semibold" title="Microsoft's severity rating">Severity</th>
              <th className="py-2 pr-3 font-semibold">Impact</th>
              <th className="py-2 pr-3 font-semibold" title="Highest CVSS base score across the affected products">CVSS</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Products</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border/60">
            {filtered.slice(0, visibleCount).map((c) => (
              <tr key={c.cve} className="align-top cursor-pointer hover:bg-theme-surface" onClick={() => onOpenCve(c.cve)}>
                <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}><CveButton cve={c.cve} onOpen={onOpenCve} /></td>
                <td className="py-2 pr-3 font-serif text-theme-text"><EntityText text={c.title} /></td>
                <td className="py-2 pr-3"><MsSeverity severity={c.severity} /></td>
                <td className="py-2 pr-3 text-theme-text-muted">{c.impact ?? '—'}</td>
                <td className="py-2 pr-3 text-theme-text">{c.cvss?.toFixed(1) ?? '—'}</td>
                <td className="py-2 pr-3"><div className="flex flex-col gap-1 items-start"><ThreatBadges c={c} />{stackHits.has(c.cve) && <StackBadge />}</div></td>
                <td className="py-2 pr-3 text-theme-text-muted" title={c.products.join('\n')}>
                  {productList(c.products)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No CVEs match these filters.</p>}
        {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
      </div>
    </div>
  );
};
