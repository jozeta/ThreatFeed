import React, { useMemo, useState } from 'react';
import { buildHash, openPanel, useHashParam } from '../../hooks/useHashRoute';
import type { NpmMatches } from '../../hooks/useNpmMatches';
import type { NpmAdvisoryData, NpmMalwareData } from '../../services/npm/advisories';
import { type MatchedAdvisory, type PackageResult, type PackageStatus } from '../../services/npm/match';
import {
  DEFAULT_NPM_FILTERS, filterNpmRows, NPM_DAY_RANGES, npmRows, npmStats, type AffectedEntry, type NpmDays, type NpmFilters, type NpmRow,
} from '../../services/npm/npmFilters';
import { formatPackageEntry } from '../../services/npm/semver';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { BarList, chipClass, SectionTitle } from '../incidents/shared';
import { StackedBars } from './StackedBars';
import { CveButton, EpssValue, SEVERITY_FILL, SeverityPill, StatCards } from './shared';
import { Package, Search, Skull } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const TYPES = [
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'malware', label: 'Malware' },
  { id: 'all', label: 'All' },
] as const;
const FLAGS = [
  { id: 'fix', label: 'Has a fix', title: 'A patched version exists' },
  { id: 'kev', label: 'In KEV', title: 'A CVE of the advisory is in CISA\'s Known Exploited Vulnerabilities catalog' },
  { id: 'cve', label: 'Has a CVE', title: 'The advisory has a CVE id' },
] as const;
const MALWARE_SHOWN = 12;

const STATUS: Record<PackageStatus, { label: string; className: string; title: string }> = {
  affected: { label: 'Affected', className: 'bg-rose-600 text-white border-rose-600', title: 'This version is inside a vulnerable range' },
  unknown: { label: 'Check manually', className: 'text-amber-600 dark:text-amber-400 border-amber-500/50', title: 'A range could not be read, or the version could not: never shown as safe' },
  'no-version': { label: 'No version', className: 'text-orange-500 border-orange-500/50', title: 'No version given, so every advisory on the package is listed' },
  'not-affected': { label: 'Not affected', className: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50', title: 'Checked against every reviewed npm advisory and the malware reports' },
};

const osvLabel = (r: PackageResult, checking: boolean) =>
  r.osv === 'off' ? 'OSV off' : checking && r.osv === 'unavailable' ? 'OSV checking…' : r.osv === 'checked' ? 'OSV checked' : 'OSV unavailable';

const openAdvisory = (id: string) => openPanel('advisory', id);
const isGhsa = (id: string) => /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(id);

/** A GHSA id opens the advisory panel; an OSV-only id (MAL-…, PYSEC-…) links to OSV.dev */
const AdvisoryId: React.FC<{ id: string }> = ({ id }) => (isGhsa(id)
  ? <button onClick={() => openAdvisory(id)} className="font-mono font-bold text-theme-accent hover:underline whitespace-nowrap">{id}</button>
  : <a href={`https://osv.dev/vulnerability/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer" className="font-mono font-bold text-theme-accent hover:underline whitespace-nowrap">{id}</a>);

const SeverityCounts: React.FC<{ advisories: MatchedAdvisory[] }> = ({ advisories }) => {
  const counts = SEVERITIES.map((s) => [s, advisories.filter((a) => !a.malware && a.severity === s).length] as const).filter(([, n]) => n > 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {counts.map(([s, n]) => <span key={s} className="inline-flex items-center gap-0.5"><SeverityPill severity={s} /><span className="text-theme-text-muted">×{n}</span></span>)}
    </span>
  );
};

/** One watched package: its status, what it is affected by, and the upgrade that clears it */
const PackageCard: React.FC<{ result: PackageResult; osvChecking: boolean }> = ({ result: r, osvChecking }) => {
  const status = STATUS[r.status];
  const listed = r.advisories.length;
  const hasAdvisories = r.status !== 'not-affected' && listed > 0;
  return (
    <li className={`p-3 rounded-lg border ${r.malware ? 'border-rose-600 bg-rose-600/10' : r.status === 'affected' ? 'border-rose-500/40 bg-rose-500/5' : 'border-theme-border bg-theme-surface'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="font-bold text-theme-text break-all">{formatPackageEntry(r.entry)}</span>
        <span className={`px-1.5 rounded border text-[10px] font-bold uppercase ${status.className}`} title={status.title}>{status.label}</span>
        {r.malware && <span className="px-1.5 rounded bg-rose-600 text-white text-[10px] font-bold uppercase inline-flex items-center gap-1"><Skull className="w-3 h-3" /> Malware</span>}
        {r.highestSeverity && !r.malware && <span className="text-theme-text-muted inline-flex items-center gap-1">highest <SeverityPill severity={r.highestSeverity === 'unknown' ? undefined : r.highestSeverity} /></span>}
      </div>
      <p className="mt-1 text-[11px] font-mono text-theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
        {hasAdvisories && <span>{listed} {listed === 1 ? 'advisory' : 'advisories'}</span>}
        {hasAdvisories && <SeverityCounts advisories={r.advisories} />}
        {hasAdvisories && r.status === 'no-version' && (r.minSafeVersion
          ? <span>versions ≥ <strong className="text-emerald-600 dark:text-emerald-400">{r.minSafeVersion}</strong> clear every known advisory · add your version to check</span>
          : <span>no version clears every known advisory yet · add your version to check</span>)}
        {hasAdvisories && r.status !== 'no-version' && (r.minSafeVersion
          ? <span>upgrade to <strong className="text-emerald-600 dark:text-emerald-400">{r.minSafeVersion}</strong></span>
          : <span className="text-orange-500">no version clear of all yet</span>)}
        <span>{r.malwareCheckedDays === null ? 'malware list not loaded' : `malware checked: last ${r.malwareCheckedDays} days`}</span>
        <span>{osvLabel(r, osvChecking)}</span>
      </p>
      {r.malware && (
        <p className="mt-1 text-[11px] font-serif text-rose-600 dark:text-rose-300">
          A release of this package was reported as malicious in the last {r.malwareCheckedDays ?? 30} days. Treat machines that installed it as compromised.
        </p>
      )}
      {hasAdvisories && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-mono text-theme-text-muted hover:text-theme-text">Show {listed === 1 ? 'the advisory' : `the ${listed} advisories`}</summary>
          <ul className="mt-2 space-y-1.5">
            {r.advisories.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono">
                {a.malware ? <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">malware</span> : <SeverityPill severity={a.severity === 'unknown' ? undefined : a.severity} />}
                <AdvisoryId id={a.id} />
                {a.source === 'osv' && <span className="px-1 rounded border border-theme-border text-[9px] font-bold uppercase text-theme-text-muted" title="Found by the OSV.dev lookup">OSV</span>}
                <span className="text-theme-text-muted">
                  {a.unparsed ? 'range unreadable' : a.vulnerable}
                  {a.patched ? <> → <span className="text-emerald-600 dark:text-emerald-400">{a.patched}</span></> : ' · no fix'}
                </span>
                {a.summary && <span className="basis-full font-serif text-theme-text">{a.summary}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
};

/** "lodash: < 4.17.21 → 4.17.21", at most three, for a row */
const Ranges: React.FC<{ row: NpmRow }> = ({ row }) => (
  <span className="block space-y-0.5">
    {row.ranges.slice(0, 3).map((r, i) => (
      <span key={i} className="block">
        {row.packages.length > 1 && <span className="text-theme-text">{r.package}: </span>}
        <span className="text-theme-text-muted">{r.vulnerable || '?'}</span>
        {r.patched ? <> → <span className="text-emerald-600 dark:text-emerald-400">{r.patched}</span></> : row.kind === 'vulnerability' && <span className="text-theme-text-muted"> · no fix</span>}
      </span>
    ))}
    {row.ranges.length > 3 && <span className="block text-theme-text-muted">+{row.ranges.length - 3} more</span>}
  </span>
);

/** "Your lodash@4.17.15" under a row that affects a watched package */
const YourHits: React.FC<{ hits?: AffectedEntry[] }> = ({ hits }) => (hits?.length ? (
  <span className="block mt-0.5 text-[10px] font-mono font-bold text-rose-600 dark:text-rose-300">
    Yours: {hits.map((h) => `${h.entry}${h.versioned ? '' : ' (version not given)'}${h.unparsed ? ' (range unreadable)' : ''}`).join(', ')}
  </span>
) : null);

const Badges: React.FC<{ row: NpmRow }> = ({ row }) => (
  <>
    {row.kind === 'malware' && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">malware</span>}
    {row.kev && <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase" title="In CISA's Known Exploited Vulnerabilities catalog">KEV</span>}
    {row.withdrawn && <span className="px-1 rounded bg-theme-text text-theme-bg text-[9px] font-bold uppercase no-underline">withdrawn</span>}
  </>
);

interface NpmTabProps {
  advisories: NpmAdvisoryData;
  malware: NpmMalwareData | null;
  matches: NpmMatches;
  onOpenCve: (cve: string) => void;
}

/** npm advisories from GitHub: your packages' status, the last 90 days of advisories and the malicious releases */
export const NpmTab: React.FC<NpmTabProps> = ({ advisories, malware, matches, onOpenCve }) => {
  const { entries, results, affecting, osvChecking } = matches;
  // Filters live in the URL (#/vulns/npm?type=malware&only=fix,kev) like the other tabs; ?advisory= is the panel
  const [daysParam, setDaysParam] = useHashParam('days', String(DEFAULT_NPM_FILTERS.days));
  const [typeParam, setType] = useHashParam('type', DEFAULT_NPM_FILTERS.type);
  const [severityParam, setSeverity] = useHashParam('severity');
  const [query, setQuery] = useHashParam('q');
  const [pkg, setPkg] = useHashParam('package');
  const [flagsParam, setFlagsParam] = useHashParam('only');
  const flags = new Set(flagsParam.split(',').filter(Boolean));
  const toggleFlag = (flag: string) => {
    const next = new Set(flags);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    setFlagsParam([...next].join(','));
  };

  const filters: NpmFilters = {
    days: (NPM_DAY_RANGES as readonly number[]).includes(Number(daysParam)) ? (Number(daysParam) as NpmDays) : DEFAULT_NPM_FILTERS.days,
    type: TYPES.some((t) => t.id === typeParam) ? (typeParam as NpmFilters['type']) : DEFAULT_NPM_FILTERS.type,
    severity: (SEVERITIES as readonly string[]).includes(severityParam) ? severityParam : '',
    mine: flags.has('mine') && entries.length > 0, // a shared link's filter means nothing without a list
    fix: flags.has('fix'),
    kev: flags.has('kev'),
    cve: flags.has('cve'),
    query,
    pkg,
  };

  const [now] = useState(() => Date.now());
  const rows = useMemo(() => npmRows(advisories, malware), [advisories, malware]);
  const stats = useMemo(() => npmStats(rows, now), [rows, now]);
  const filtered = useMemo(
    () => filterNpmRows(rows, filters, affecting, now),
    [rows, affecting, now, filters.days, filters.type, filters.severity, flagsParam, query, pkg] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(filtered.length, 50);

  // Advisories per day over 30 days, by severity: withdrawn ones don't chart
  const perDay = useMemo(() => {
    const today = Math.floor(now / DAY_MS);
    const buckets = Array.from({ length: 30 }, (_, i) => ({ date: new Date((today - 29 + i) * DAY_MS).toISOString().slice(0, 10), counts: {} as Record<string, number> }));
    const byDate = new Map(buckets.map((b) => [b.date, b]));
    for (const r of rows) {
      if (r.kind !== 'vulnerability' || r.withdrawn) continue;
      const b = byDate.get(r.date.slice(0, 10));
      if (b) b.counts[r.severity] = (b.counts[r.severity] || 0) + 1;
    }
    return buckets;
  }, [rows, now]);

  // Malicious releases, the ones your packages are in first
  const yourMalware = results.filter((r) => r.malware);
  const recentMalware = useMemo(() => rows.filter((r) => r.kind === 'malware'), [rows]);
  const affected = results.filter((r) => r.status === 'affected' || r.malware).length;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>My packages{entries.length ? ` (${entries.length})` : ''}</SectionTitle>
        {entries.length === 0 ? (
          <p className="text-sm font-serif text-theme-text-muted">
            <Package className="w-4 h-4 inline -mt-0.5 mr-1" />
            List the npm packages you depend on in <a href={buildHash('settings', 'npm')} className="text-theme-accent underline">Settings → My npm packages</a> to see here which advisories and malicious releases affect them. Matching happens on this device.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[11px] font-mono text-theme-text-muted">
              {results.length
                ? <>{affected} of {results.length} need attention · checked against {advisories.index.length.toLocaleString()} reviewed advisories{malware ? ' and 30 days of malware reports' : ''} on this device · <a href={buildHash('settings', 'npm')} className="underline">edit the list</a></>
                : 'Matching…'}
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((r) => <PackageCard key={formatPackageEntry(r.entry)} result={r} osvChecking={osvChecking} />)}
            </ul>
          </>
        )}
      </div>

      <StatCards stats={[
        { label: 'Advisories (7 days)', value: stats.last7 },
        { label: 'Advisories (30 days)', value: stats.last30 },
        { label: 'Critical · high (30 d)', value: `${stats.critical30} · ${stats.high30}` },
        { label: 'Malware (7 days)', value: stats.malware7, note: 'malicious releases' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>npm advisories per day, by severity (30 days)</SectionTitle>
        <StackedBars
          ariaLabel="npm advisories published or updated per day"
          unit="advisories"
          buckets={perDay.map((d) => ({
            label: d.date,
            short: d.date.slice(5),
            segments: [...SEVERITIES, 'unknown' as const].map((s) => ({ name: s, value: d.counts[s] || 0, className: SEVERITY_FILL[s] })),
          }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {NPM_DAY_RANGES.map((d) => <button key={d} onClick={() => setDaysParam(String(d))} className={chipClass(filters.days === d)}>{d} days</button>)}
        <span className="mx-1 text-theme-border">|</span>
        {TYPES.map((t) => <button key={t.id} onClick={() => setType(t.id)} className={chipClass(filters.type === t.id)}>{t.label}</button>)}
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Package, GHSA, CVE…" aria-label="Search npm advisories" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <button onClick={() => setSeverity('')} className={chipClass(!filters.severity)}>All severities</button>
        {SEVERITIES.map((s) => <button key={s} onClick={() => setSeverity(filters.severity === s ? '' : s)} className={chipClass(filters.severity === s)}>{s}</button>)}
        <span className="mx-1 text-theme-border">|</span>
        {entries.length > 0 && <button onClick={() => toggleFlag('mine')} className={chipClass(flags.has('mine'))} title="Advisories listed for a package in Settings → My npm packages">Affects my packages</button>}
        {FLAGS.map((f) => <button key={f.id} onClick={() => toggleFlag(f.id)} className={chipClass(flags.has(f.id))} title={f.title}>{f.label}</button>)}
        {pkg && <button onClick={() => setPkg('')} className={chipClass(true)}>{pkg} ×</button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Most advisories (30 days)</SectionTitle>
            <BarList color="bg-amber-500/70" rows={stats.topPackages.map(([p, n]) => ({ key: p, label: p, value: n, active: pkg === p, onClick: () => setPkg(pkg === p ? '' : p) }))} />
            {stats.topPackages.length === 0 && <p className="text-xs font-serif italic text-theme-text-muted">None in 30 days.</p>}
          </div>
          <p className="text-[10px] font-mono text-theme-text-muted">Click a package to filter the list; click it again to clear. Rows that affect your packages are highlighted.</p>
        </aside>

        <div className="lg:col-span-3 overflow-x-auto">
          <p className="mb-2 text-[11px] font-mono text-theme-text-muted">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'advisory' : 'advisories'}</p>
          {/* Phones get cards; the table needs more width than a phone has */}
          <ul className="md:hidden divide-y divide-theme-border/60 text-xs">
            {filtered.slice(0, visibleCount).map((r) => {
              const hits = affecting.get(r.id);
              return (
                <li key={r.id} className={`py-2.5 space-y-1 ${hits ? 'bg-rose-500/10 -mx-2 px-2' : ''} ${r.withdrawn ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <SeverityPill severity={r.severity === 'unknown' ? undefined : r.severity} />
                    <span className="text-theme-text break-all">{r.packages.join(', ')}</span>
                    <Badges row={r} />
                  </div>
                  <p className={`font-serif text-theme-text ${r.withdrawn ? 'line-through' : ''}`}>{r.summary}</p>
                  <div className="font-mono text-[11px]"><Ranges row={r} /></div>
                  <YourHits hits={hits} />
                  <p className="font-mono text-[11px] text-theme-text-muted flex flex-wrap items-center gap-1.5">
                    {r.date.slice(0, 10)} · <AdvisoryId id={r.id} />
                    {r.cves.map((c) => <CveButton key={c} cve={c} onOpen={onOpenCve} />)}
                    {r.epss !== undefined && <span>EPSS <EpssValue epss={r.epss} /></span>}
                  </p>
                </li>
              );
            })}
          </ul>
          <table className="hidden md:table w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold" title="Published, or updated when later">Date</th>
                <th className="py-2 pr-3 font-semibold">Severity</th>
                <th className="py-2 pr-3 font-semibold">Package</th>
                <th className="py-2 pr-3 font-semibold">Advisory</th>
                <th className="py-2 pr-3 font-semibold">Vulnerable → patched</th>
                <th className="py-2 pr-3 font-semibold" title="Probability of exploitation in the next 30 days">EPSS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {filtered.slice(0, visibleCount).map((r) => {
                const hits = affecting.get(r.id);
                return (
                  <tr key={r.id} className={`align-top ${hits ? 'bg-rose-500/10' : ''} ${r.withdrawn ? 'opacity-60' : ''}`}>
                    <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted" title={r.date !== r.published ? `published ${r.published.slice(0, 10)}` : undefined}>
                      {r.date.slice(0, 10)}
                      {r.date.slice(0, 10) !== r.published.slice(0, 10) && <span className="block text-[10px]">updated</span>}
                    </td>
                    <td className="py-2 pr-3"><SeverityPill severity={r.severity === 'unknown' ? undefined : r.severity} /></td>
                    <td className="py-2 pr-3 text-theme-text max-w-[12rem] break-words">{r.packages.join(', ')}</td>
                    <td className="py-2 pr-3">
                      <span className={`font-serif text-theme-text ${r.withdrawn ? 'line-through' : ''}`}>{r.summary}</span>
                      <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                        <AdvisoryId id={r.id} />
                        {r.cves.map((c) => <CveButton key={c} cve={c} onOpen={onOpenCve} />)}
                        <Badges row={r} />
                      </span>
                      <YourHits hits={hits} />
                    </td>
                    <td className="py-2 pr-3"><Ranges row={r} /></td>
                    <td className="py-2 pr-3">{r.kind === 'vulnerability' ? <EpssValue epss={r.epss} /> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No npm advisories match these filters.</p>}
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      </div>

      <div>
        <SectionTitle>Malicious releases (last 30 days)</SectionTitle>
        <p className="mb-3 text-xs font-serif text-theme-text-muted">
          Packages GitHub found publishing malicious code, often typosquats or hijacked releases whose install scripts steal credentials. Installing one means the machine should be treated as compromised.
        </p>
        {yourMalware.length > 0 && (
          <ul className="mb-3 space-y-1">
            {yourMalware.map((r) => (
              <li key={formatPackageEntry(r.entry)} className="flex flex-wrap items-center gap-2 p-2 rounded border border-rose-600 bg-rose-600/10 text-xs font-mono">
                <SeverityPill severity="critical" />
                <span className="font-bold text-theme-text">Your {formatPackageEntry(r.entry)}</span>
                {r.advisories.filter((a) => a.malware).map((a) => <AdvisoryId key={a.id} id={a.id} />)}
              </li>
            ))}
          </ul>
        )}
        {recentMalware.length ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono">
            {recentMalware.slice(0, MALWARE_SHOWN).map((r) => (
              <li key={r.id} className={`flex items-baseline gap-2 min-w-0 ${affecting.has(r.id) ? 'text-rose-600 dark:text-rose-300 font-bold' : ''}`}>
                <span className="text-theme-text-muted whitespace-nowrap">{r.date.slice(0, 10)}</span>
                <span className="truncate text-theme-text" title={r.packages.join(', ')}>{r.packages.join(', ')}</span>
                <span className="ml-auto"><AdvisoryId id={r.id} /></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs font-serif italic text-theme-text-muted">{malware ? 'No malicious releases reported in the last 30 days.' : 'The malware reports have not loaded.'}</p>}
        {recentMalware.length > MALWARE_SHOWN && (
          <button onClick={() => setType('malware')} className="mt-2 text-xs font-mono text-theme-accent hover:underline">
            All {recentMalware.length.toLocaleString()} in the list above
          </button>
        )}
      </div>

      <p className="text-[11px] font-serif text-theme-text-muted">
        Reviewed npm advisories from the <a href="https://github.com/advisories?query=ecosystem%3Anpm" target="_blank" rel="noopener noreferrer" className="underline">GitHub Advisory Database</a>, refreshed with the site snapshot: the list holds advisories published or updated in the last 90 days, and your packages are checked against every reviewed npm advisory.
        Your package list stays on this device unless you turn on the OSV.dev check in Settings.
      </p>
    </div>
  );
};
