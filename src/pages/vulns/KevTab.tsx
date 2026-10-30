import React, { useMemo } from 'react';
import { useHashParam } from '../../hooks/useHashRoute';
import { Article, ExploitInfo, KevEntry } from '../../types';
import {
  ATTACK_VECTORS, CVSS_BANDS, CvssBandId, cvssBand, daysToKev, isRemoteNoAuth, kevPerMonth, median, parseVector, patchPriority, severityFromScore,
  TIME_TO_KEV_BUCKETS, timeToKevBucket,
} from '../../services/intelligence/vulns';
import { hasPublicExploit } from '../../services/intelligence/enrichment';
import { containsTerm } from '../../utils/textMatch';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { BarList, chipClass, countBy, SectionTitle, selectClass } from '../incidents/shared';
import { StackedBars } from './StackedBars';
import { CveButton, CweChip, cweLabel, EpssValue, ExploitBadges, SeverityPill, SsvcBadge, StatCards } from './shared';
import { VendorButton } from '../../components/VendorLink';
import { EntityLink } from '../../components/EntityText';
import { Building2, Search, Skull } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 0, label: 'All' },
];

const productKey = (k: KevEntry) => `${k.vendor} ${k.product}`;

/** Stack keywords matched against the catalog's vendor/product and NVD's affected-product list */
const inStack = (k: KevEntry, keywords: string[]) => {
  const text = `${k.vendor} ${k.product} ${k.name} ${(k.products ?? []).join(' ')}`;
  return keywords.some((kw) => containsTerm(text, kw));
};

interface KevTabProps {
  kev: KevEntry[]; // newest first, hidden vendors already removed
  hiddenVendorCount: number;
  news: Map<string, Article[]>;
  exploits: Record<string, ExploitInfo>;
  cweNames: Record<string, string>;
  stackKeywords: string[];
  onOpenCve: (cve: string) => void;
}

export const KevTab: React.FC<KevTabProps> = ({ kev, hiddenVendorCount, news, exploits, cweNames, stackKeywords, onOpenCve }) => {
  // Filters live in the URL (#/vulns/kev?kevVendor=…&min=7) so a filtered view can be bookmarked or shared;
  // ?vendor= is the vendor panel, which can open over any page
  const [daysParam, setDaysParam] = useHashParam('days', '90');
  const days = RANGES.some((r) => String(r.days) === daysParam) ? Number(daysParam) : 90;
  const setDays = (d: number) => setDaysParam(String(d));
  const [vendor, setVendor] = useHashParam('kevVendor');
  const [product, setProduct] = useHashParam('product');
  const [cwe, setCwe] = useHashParam('cwe');
  const [bandParam, setBand] = useHashParam('cvss');
  const band = (CVSS_BANDS.some((b) => b.id === bandParam) ? bandParam : '') as CvssBandId | '';
  const [minParam, setMinParam] = useHashParam('min', '0');
  const minCvss = Math.min(10, Math.max(0, Number(minParam) || 0));
  const setMinCvss = (n: number) => setMinParam(String(n));
  const [ransomwareParam, setRansomwareParam] = useHashParam('ransomware');
  const ransomwareOnly = ransomwareParam === '1';
  const setRansomwareOnly = (on: boolean) => setRansomwareParam(on ? '1' : '');
  const [query, setQuery] = useHashParam('q');
  const [av, setAv] = useHashParam('av');
  // On/off filters: public exploit code, remote with no login or click, CISA "automatable", My Stack
  const [flagsParam, setFlagsParam] = useHashParam('only');
  const flags = new Set(flagsParam.split(',').filter(Boolean));
  const toggleFlag = (flag: string) => {
    const next = new Set(flags);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    setFlagsParam([...next].join(','));
  };

  // Every filter except the time range applies to the chart too; the range only to the stats and lists
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return kev.filter((k) =>
      (!vendor || k.vendor === vendor) &&
      (!product || productKey(k) === product) &&
      (!cwe || k.cwes.includes(cwe)) &&
      (!band || cvssBand(k.cvss) === band) &&
      (minCvss === 0 || (k.cvss ?? 0) >= minCvss) &&
      (!ransomwareOnly || k.ransomware) &&
      (!av || parseVector(k.vector).av === av) &&
      (!flags.has('exploit') || hasPublicExploit(exploits[k.cve])) &&
      (!flags.has('remote') || isRemoteNoAuth(k.vector)) &&
      (!flags.has('auto') || k.ssvc?.automatable === 'yes') &&
      (!flags.has('stack') || inStack(k, stackKeywords)) &&
      (!q || `${k.cve} ${k.vendor} ${k.product} ${k.name} ${(k.products ?? []).join(' ')}`.toLowerCase().includes(q))
    );
  }, [kev, vendor, product, cwe, band, minCvss, ransomwareOnly, query, av, flagsParam, exploits, stackKeywords]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const products = countBy(inRange, productKey);
  const weaknesses = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of inRange) for (const c of k.cwes) m.set(c, (m.get(c) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);
  const bands = useMemo(() => {
    const counts = countBy(inRange, (k) => cvssBand(k.cvss));
    return CVSS_BANDS.map((b) => ({ ...b, count: counts.find(([id]) => id === b.id)?.[1] ?? 0 }));
  }, [inRange]);
  const allVendors = useMemo(() => countBy(kev, (k) => k.vendor), [kev]);
  const vectors = countBy(inRange, (k) => parseVector(k.vector).av);

  // Time from disclosure to KEV listing, and how much of it has exploit code in the open
  const timing = useMemo(() => {
    const days = inRange.map(daysToKev).filter((d): d is number => d !== undefined);
    const counts = countBy(days, (d) => timeToKevBucket(d));
    return {
      median: median(days.filter((d) => d >= 0)),
      zeroDay: days.filter((d) => d <= 0).length,
      buckets: TIME_TO_KEV_BUCKETS.map((b) => ({ ...b, count: counts.find(([id]) => id === b.id)?.[1] ?? 0 })),
    };
  }, [inRange]);
  const exploitStats = useMemo(() => ({
    any: inRange.filter((k) => hasPublicExploit(exploits[k.cve])).length,
    msf: inRange.filter((k) => exploits[k.cve]?.msf?.length).length,
    nuclei: inRange.filter((k) => exploits[k.cve]?.nuclei).length,
    remote: inRange.filter((k) => isRemoteNoAuth(k.vector)).length,
    automatable: inRange.filter((k) => k.ssvc?.automatable === 'yes').length,
  }), [inRange, exploits]);
  const pct = (n: number) => (inRange.length ? `${Math.round((n / inRange.length) * 100)}%` : '');

  const patchFirst = useMemo(
    () => [...inRange].map((k) => ({ k, score: patchPriority(k, news.get(k.cve)?.length ?? 0) })).sort((a, b) => b.score - a.score).slice(0, 8),
    [inRange, news]
  );
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(inRange.length, 100);
  const rangeLabel = RANGES.find((r) => r.days === days)?.label;
  const toggle = (current: string, value: string, set: (v: string) => void) => set(current === value ? '' : value);

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
        <label className="flex items-center gap-2 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs font-mono text-theme-text-muted" title="Hide vulnerabilities with a CVSS score below this value">
          CVSS ≥
          <input type="range" min={0} max={10} step={0.5} value={minCvss} onChange={(e) => setMinCvss(Number(e.target.value))} className="w-24 accent-theme-accent" aria-label="Minimum CVSS score" />
          <span className="w-7 text-theme-text font-bold">{minCvss === 0 ? 'any' : minCvss.toFixed(1)}</span>
        </label>
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CVE, product…" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <button onClick={() => toggleFlag('exploit')} className={chipClass(flags.has('exploit'))} title="Metasploit module, Nuclei template or proof-of-concept code on GitHub">Public exploit</button>
        <button onClick={() => toggleFlag('remote')} className={chipClass(flags.has('remote'))} title="CVSS: network attack vector, no privileges, no user interaction">Remote · no login · no click</button>
        <button onClick={() => toggleFlag('auto')} className={chipClass(flags.has('auto'))} title="CISA SSVC: exploitation can be automated">Automatable</button>
        {stackKeywords.length > 0 && (
          <button onClick={() => toggleFlag('stack')} className={chipClass(flags.has('stack'))} title="Matches your My Stack products (vendor, product or NVD's affected products)">My stack</button>
        )}
      </div>

      {(product || cwe || band || av) && (
        <div className="flex flex-wrap items-center gap-2 -mt-3 text-xs font-mono">
          <span className="text-theme-text-muted">Filtered by:</span>
          {av && <button onClick={() => setAv('')} className={chipClass(true)}>{ATTACK_VECTORS[av] ?? av} ×</button>}
          {product && <button onClick={() => setProduct('')} className={chipClass(true)}>{product} ×</button>}
          {cwe && <button onClick={() => setCwe('')} className={chipClass(true)}>{cwe} ×</button>}
          {band && <button onClick={() => setBand('')} className={chipClass(true)}>CVSS {CVSS_BANDS.find((b) => b.id === band)?.label} ×</button>}
        </div>
      )}

      <StatCards stats={[
        { label: 'Added', value: inRange.length, note: change === null ? (days ? '' : `${kev.length} in the catalog`) : `${change >= 0 ? '+' : ''}${change}% vs previous ${rangeLabel}` },
        { label: 'Ransomware-linked', value: ransomwareCount, note: inRange.length ? `${Math.round((ransomwareCount / inRange.length) * 100)}% of added` : '' },
        { label: 'Vendors', value: vendors.length, note: hiddenVendorCount ? `${hiddenVendorCount} hidden in Settings` : vendors[0] ? `most: ${vendors[0][0]}` : '' },
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
          <SectionTitle>Time from disclosure to KEV</SectionTitle>
          <BarList color="bg-rose-500/70" rows={timing.buckets.map((b) => ({ key: b.id, label: b.label, value: b.count }))} />
          <p className="mt-3 text-[11px] font-mono text-theme-text-muted">
            {timing.median !== undefined ? <>Median <strong className="text-theme-text">{timing.median} days</strong> from publication to listing</> : 'No publication dates yet'}
            {timing.zeroDay > 0 && <> · <strong className="text-rose-500">{timing.zeroDay}</strong> already exploited when disclosed</>}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
          <SectionTitle>How easy to exploit</SectionTitle>
          <BarList color="bg-violet-500/70" rows={[
            { key: 'any', label: 'Public exploit code', value: exploitStats.any },
            { key: 'msf', label: 'Metasploit module', value: exploitStats.msf },
            { key: 'nuclei', label: 'Nuclei template', value: exploitStats.nuclei },
            { key: 'remote', label: 'Remote, no login/click', value: exploitStats.remote },
            { key: 'auto', label: 'Automatable (SSVC)', value: exploitStats.automatable },
          ]} />
          <p className="mt-3 text-[11px] font-mono text-theme-text-muted">
            {pct(exploitStats.any)} of these have exploit code in the open (Metasploit, Nuclei, GitHub PoCs)
          </p>
        </div>
      </div>

      {patchFirst.length > 0 && (
        <div>
          <SectionTitle>Patch first ({rangeLabel})</SectionTitle>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {patchFirst.map(({ k }, i) => (
              <li key={k.cve} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-theme-text-muted w-4 text-right">{i + 1}.</span>
                <CveButton cve={k.cve} onOpen={onOpenCve} />
                <span className="font-serif text-theme-text truncate" title={k.name}><EntityLink entity={{ kind: 'vendor', id: k.vendor }}>{k.vendor}</EntityLink> {k.product}</span>
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
            <BarList rows={vendors.slice(0, 10).map(([v, n]) => ({
              key: v, label: v, value: n, active: vendor === v, onClick: () => toggle(vendor, v, setVendor),
              action: <VendorButton name={v} label={`${v} vendor page`} className="p-0.5 text-theme-text-muted shrink-0"><Building2 className="w-3 h-3" aria-hidden="true" /></VendorButton>,
            }))} />
          </div>
          <div>
            <SectionTitle>Products</SectionTitle>
            <BarList color="bg-amber-500/70" rows={products.slice(0, 8).map(([p, n]) => ({ key: p, label: p, value: n, active: product === p, onClick: () => toggle(product, p, setProduct) }))} />
          </div>
          <div>
            <SectionTitle>Weaknesses (CWE)</SectionTitle>
            <BarList color="bg-sky-500/70" rows={weaknesses.slice(0, 8).map(([c, n]) => ({ key: c, label: cweLabel(c, cweNames), value: n, active: cwe === c, onClick: () => toggle(cwe, c, setCwe) }))} />
          </div>
          <div>
            <SectionTitle>Attack vector</SectionTitle>
            <BarList color="bg-violet-500/70" rows={vectors.map(([v, n]) => ({ key: v, label: ATTACK_VECTORS[v] ?? v, value: n, active: av === v, onClick: () => toggle(av, v, setAv) }))} />
          </div>
          <div>
            <SectionTitle>CVSS score</SectionTitle>
            <BarList color="bg-orange-500/70" rows={bands.filter((b) => b.count > 0 || band === b.id).map((b) => ({ key: b.id, label: b.label, value: b.count, active: band === b.id, onClick: () => setBand(band === b.id ? '' : b.id) }))} />
          </div>
          <p className="text-[10px] font-mono text-theme-text-muted">Click a bar to filter the list; click it again to clear. <Building2 className="w-3 h-3 inline -mt-0.5" /> opens the vendor page.</p>
        </aside>

        <div className="lg:col-span-3 overflow-x-auto">
          {/* Phones get cards; the table needs more width than a phone has */}
          <ul className="md:hidden divide-y divide-theme-border/60 text-xs">
            {inRange.slice(0, visibleCount).map((k) => (
              <li key={k.cve} className="py-2.5 space-y-1">
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <CveButton cve={k.cve} onOpen={onOpenCve} />
                  <SeverityPill severity={k.cvss === undefined ? undefined : severityFromScore(k.cvss)} score={k.cvss} />
                  <span className="text-theme-text-muted">EPSS <EpssValue epss={k.epss} /></span>
                  {k.ransomware && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">ransomware</span>}
                  <ExploitBadges info={exploits[k.cve]} />
                  <SsvcBadge ssvc={k.ssvc} inKev />
                </div>
                <p className="font-serif text-theme-text">{k.name}</p>
                <p className="font-mono text-[11px] text-theme-text-muted">
                  <EntityLink entity={{ kind: 'vendor', id: k.vendor }}>{k.vendor}</EntityLink> · added {k.dateAdded}
                  {k.cwes.map((c) => <React.Fragment key={c}> <CweChip cwe={c} name={cweNames[c]} /></React.Fragment>)}
                  {k.dueDate && <> · <span className={k.dueDate >= today && k.dueDate <= in14Days ? 'text-orange-500 font-bold' : ''}>due {k.dueDate}</span></>}
                  {news.get(k.cve)?.length ? ` · ${news.get(k.cve)!.length} articles` : ''}
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden md:table w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">Added</th>
                <th className="py-2 pr-3 font-semibold">CVE</th>
                <th className="py-2 pr-3 font-semibold">Vulnerability</th>
                <th className="py-2 pr-3 font-semibold" title="CVSS base score from NVD">CVSS</th>
                <th className="py-2 pr-3 font-semibold" title="Probability of exploitation in the next 30 days">EPSS</th>
                <th className="py-2 pr-3 font-semibold" title="Public exploit code and CISA's SSVC assessment">Exploit</th>
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
                    <span className="font-serif">{k.name}</span>
                    {k.ransomware && <span className="ml-1.5 px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">ransomware</span>}
                    <span className="block text-[10px] text-theme-text-muted">
                      <EntityLink entity={{ kind: 'vendor', id: k.vendor }}>{k.vendor}</EntityLink> · {k.product}
                      {k.cwes.map((c) => <React.Fragment key={c}> <CweChip cwe={c} name={cweNames[c]} /></React.Fragment>)}
                    </span>
                  </td>
                  <td className="py-2 pr-3"><SeverityPill severity={k.cvss === undefined ? undefined : severityFromScore(k.cvss)} score={k.cvss} /></td>
                  <td className="py-2 pr-3"><EpssValue epss={k.epss} /></td>
                  <td className="py-2 pr-3"><div className="flex flex-col gap-1 items-start"><ExploitBadges info={exploits[k.cve]} /><SsvcBadge ssvc={k.ssvc} inKev /></div></td>
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
