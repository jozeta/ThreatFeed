import React, { useMemo, useState } from 'react';
import { openPanel } from '../../hooks/useHashRoute';
import { isPubliclyReported, publicReportIndex } from '../../services/intelligence/enrichment';
import { LeakSiteVictim, RansomwareIntel } from '../../types';
import { countryFlag, countryName, groupDisplayName, localCountry, NORDIC_COUNTRIES } from '../../utils/countries';
import { formatRelativeTime } from '../../utils/date';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { ActivityChart } from './ActivityChart';
import { BarList, chipClass, countBy, SectionTitle, selectClass } from './shared';
import { ExternalLink, Search } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

interface VictimsTabProps {
  victims: LeakSiteVictim[];
  structured: boolean; // false = fallback parsed from the RSS feed
  intel: RansomwareIntel | null;
}

export const VictimsTab: React.FC<VictimsTabProps> = ({ victims, structured, intel }) => {
  const [days, setDays] = useState(7);
  const [region, setRegion] = useState<'all' | 'local' | 'nordic'>('all');
  const [group, setGroup] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [query, setQuery] = useState('');
  const [reportedOnly, setReportedOnly] = useState(false);
  // Opening a group sets ?group= in the URL; the app shows its panel over any page
  const setOpenGroup = (g: string) => openPanel('group', g.toLowerCase());

  // Victims that also show up in press reports or official breach notices (Ransomware.live)
  const reports = useMemo(() => publicReportIndex(intel?.attacks ?? []), [intel]);
  const reported = useMemo(() => new Set(victims.filter((v) => isPubliclyReported(v, reports)).map((v) => v.id)), [victims, reports]);
  const home = localCountry();

  // Region and text filters apply to the chart too; the time range only to the lists below it
  const filtered = useMemo(() => victims.filter((v) =>
    (region === 'all' || (region === 'local' ? v.country === home : NORDIC_COUNTRIES.includes(v.country || ''))) &&
    (!group || v.group === group) &&
    (!country || v.country === country) &&
    (!sector || v.sector === sector) &&
    (!reportedOnly || reported.has(v.id)) &&
    (!query || `${v.victim} ${v.domain ?? ''} ${v.sector ?? ''} ${v.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  ), [victims, region, home, group, country, sector, query, reportedOnly, reported]);

  // Groups that appeared recently (first seen by Ransomware.live in the last 90 days) and ones that went quiet
  // (3+ victims in the 60 days before the last 30, none since)
  const { newGroups, quietGroups } = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10);
    const recent = new Set(victims.filter((v) => Date.now() - new Date(v.discoveredAt).getTime() < 30 * DAY_MS).map((v) => v.group.toLowerCase()));
    const before = countBy(victims.filter((v) => Date.now() - new Date(v.discoveredAt).getTime() >= 30 * DAY_MS), (v) => v.group.toLowerCase());
    return {
      newGroups: Object.entries(intel?.groups ?? {})
        .filter(([, g]) => g.firstSeen && g.firstSeen >= cutoff)
        .sort((a, b) => (b[1].firstSeen ?? '').localeCompare(a[1].firstSeen ?? ''))
        .map(([key, g]) => ({ key, name: g.name, firstSeen: g.firstSeen! })),
      quietGroups: before.filter(([g, n]) => n >= 3 && !recent.has(g)).map(([key, n]) => ({ key, count: n })),
    };
  }, [victims, intel]);

  // Where the collected history begins (the chart starts there, whatever the filters)
  const historyStart = useMemo(() => victims.reduce<string | undefined>((min, v) => (!min || v.discoveredAt < min ? v.discoveredAt : min), undefined), [victims]);
  const inRange = useMemo(() => filtered.filter((v) => Date.now() - new Date(v.discoveredAt).getTime() < days * DAY_MS), [filtered, days]);
  const previous = filtered.filter((v) => {
    const age = Date.now() - new Date(v.discoveredAt).getTime();
    return age >= days * DAY_MS && age < 2 * days * DAY_MS;
  }).length;

  const groupsInRange = countBy(inRange, (v) => v.group);
  const sectorsInRange = countBy(inRange, (v) => v.sector);
  const countriesInRange = countBy(inRange, (v) => v.country);
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(inRange.length, 100);

  const allGroups = useMemo(() => countBy(victims, (v) => v.group), [victims]);
  const allCountries = useMemo(() => countBy(victims, (v) => v.country), [victims]);
  const allSectors = useMemo(() => countBy(victims, (v) => v.sector), [victims]);
  const change = previous > 0 ? Math.round(((inRange.length - previous) / previous) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => <button key={r.days} onClick={() => setDays(r.days)} className={chipClass(days === r.days)}>{r.label}</button>)}
        <span className="mx-1 text-theme-border">|</span>
        <button onClick={() => setRegion('all')} className={chipClass(region === 'all')}>🌍 All</button>
        {home && <button onClick={() => setRegion('local')} className={chipClass(region === 'local')}>{countryFlag(home)} {countryName(home)}</button>}
        <button onClick={() => setRegion('nordic')} className={chipClass(region === 'nordic')}>Nordics</button>
        {reported.size > 0 && (
          <button onClick={() => setReportedOnly(!reportedOnly)} className={chipClass(reportedOnly)} title="Victims also named in press reports or official breach notices">
            Publicly reported ({reported.size})
          </button>
        )}
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectClass} aria-label="Filter by group">
          <option value="">All groups ({allGroups.length})</option>
          {allGroups.map(([g, n]) => <option key={g} value={g}>{groupDisplayName(g)} ({n})</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass} aria-label="Filter by country">
          <option value="">All countries ({allCountries.length})</option>
          {allCountries.map(([c, n]) => <option key={c} value={c}>{countryName(c)} ({n})</option>)}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)} className={selectClass} aria-label="Filter by sector">
          <option value="">All sectors ({allSectors.length})</option>
          {allSectors.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
        </select>
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Victim, domain…" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Victims', value: inRange.length, note: change === null ? '' : `${change >= 0 ? '+' : ''}${change}% vs previous ${RANGES.find((r) => r.days === days)?.label}` },
          { label: 'Active groups', value: groupsInRange.length },
          { label: 'Countries', value: countriesInRange.length },
          { label: 'Top sector', value: sectorsInRange[0]?.[0] ?? '—' },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-lg bg-theme-surface border border-theme-border">
            <span className="font-mono text-xs text-theme-text-muted uppercase">{s.label}</span>
            <p className="font-serif text-2xl font-bold text-theme-text mt-1 truncate">{s.value}</p>
            {s.note && <p className="text-[11px] font-mono text-theme-text-muted">{s.note}</p>}
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>Leak-site posts over time</SectionTitle>
        <ActivityChart victims={filtered} historyStart={historyStart} maxDays={90} highlightDays={days} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Most active groups</SectionTitle>
            <BarList rows={groupsInRange.slice(0, 12).map(([g, n]) => ({ key: g, label: groupDisplayName(g), value: n, onClick: () => setOpenGroup(g) }))} />
            <p className="mt-2 text-[10px] font-mono text-theme-text-muted">Click a group for its profile and news coverage.</p>
          </div>
          <div>
            <SectionTitle>Sectors</SectionTitle>
            <BarList color="bg-amber-500/70" rows={sectorsInRange.slice(0, 8).map(([s, n]) => ({ key: s, label: s, value: n, active: sector === s, onClick: () => setSector(sector === s ? '' : s) }))} />
          </div>
          <div>
            <SectionTitle>Countries</SectionTitle>
            <BarList color="bg-sky-500/70" rows={countriesInRange.slice(0, 8).map(([c, n]) => ({ key: c, label: `${countryFlag(c)} ${countryName(c)}`, value: n, active: country === c, onClick: () => setCountry(country === c ? '' : c) }))} />
          </div>
          {newGroups.length > 0 && (
            <div>
              <SectionTitle>New groups (90 days)</SectionTitle>
              <ul className="space-y-1 text-xs font-mono">
                {newGroups.slice(0, 8).map((g) => (
                  <li key={g.key} className="flex items-center gap-2">
                    <button onClick={() => setOpenGroup(g.key)} className="text-rose-500 font-bold hover:underline truncate">{groupDisplayName(g.name)}</button>
                    <span className="text-theme-text-muted ml-auto whitespace-nowrap">since {g.firstSeen}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quietGroups.length > 0 && (
            <div>
              <SectionTitle>Gone quiet</SectionTitle>
              <ul className="space-y-1 text-xs font-mono">
                {quietGroups.slice(0, 8).map((g) => (
                  <li key={g.key} className="flex items-center gap-2">
                    <button onClick={() => setOpenGroup(g.key)} className="text-theme-text hover:underline truncate">{groupDisplayName(g.key)}</button>
                    <span className="text-theme-text-muted ml-auto whitespace-nowrap">{g.count} earlier, none in 30d</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">Posted</th>
                <th className="py-2 pr-3 font-semibold">Group</th>
                <th className="py-2 pr-3 font-semibold">Victim</th>
                <th className="py-2 pr-3 font-semibold">Sector</th>
                <th className="py-2 pr-3 font-semibold">Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {inRange.slice(0, visibleCount).map((v) => (
                <tr key={v.id} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted" title={v.attackedAt ? `Attack date: ${v.attackedAt.slice(0, 10)}` : undefined}>{formatRelativeTime(v.discoveredAt)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <button onClick={() => setOpenGroup(v.group)} className="text-rose-500 font-bold hover:underline">{groupDisplayName(v.group)}</button>
                  </td>
                  <td className="py-2 pr-3 text-theme-text">
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noopener noreferrer" title={v.description} className="hover:text-theme-accent inline-flex items-center gap-1">
                        {v.victim} <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ) : <span title={v.description}>{v.victim}</span>}
                    {reported.has(v.id) && <span className="ml-1.5 px-1 rounded bg-sky-600 text-white text-[9px] font-bold uppercase" title="Also named in a press report or official breach notice">reported</span>}
                    {v.domain && v.domain !== v.victim.toLowerCase() && <span className="block text-[10px] text-theme-text-muted">{v.domain}</span>}
                  </td>
                  <td className="py-2 pr-3 text-theme-text-muted">{v.sector ?? '—'}</td>
                  <td className="py-2 pr-3 text-theme-text-muted whitespace-nowrap">{v.country ? `${countryFlag(v.country)} ${countryName(v.country)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inRange.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No victims match these filters.</p>}
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      </div>

      <p className="text-[11px] font-serif text-theme-text-muted">
        {structured
          ? <>Leak-site data from <a href="https://www.ransomware.live" target="_blank" rel="noopener noreferrer" className="underline">Ransomware.live</a>, refreshed with the site snapshot. Links go to Ransomware.live, never to the leak sites themselves.</>
          : 'Showing victims parsed from the Ransomware.live RSS feed (country and sector are best-effort). The full dataset arrives with the server snapshot.'}
      </p>

    </div>
  );
};
