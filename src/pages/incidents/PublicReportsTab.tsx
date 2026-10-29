import React, { useMemo, useState } from 'react';
import { PublicAttack } from '../../types';
import { countryFlag, countryName, groupDisplayName } from '../../utils/countries';
import { buildHash } from '../../hooks/useHashRoute';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../../components/Common/LoadMoreButton';
import { StackedBars } from '../vulns/StackedBars';
import { StatCards } from '../vulns/shared';
import { BarList, chipClass, countBy, SectionTitle } from './shared';
import { ExternalLink, Search } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 13;

/** Attacks reported by the press or in official breach notices (Ransomware.live), whether or not a gang claimed them */
export const PublicReportsTab: React.FC<{ attacks: PublicAttack[] }> = ({ attacks }) => {
  const [country, setCountry] = useState('');
  const [claimedOnly, setClaimedOnly] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => attacks.filter((a) =>
    (!country || a.country === country) &&
    (!claimedOnly || a.group) &&
    (!query || `${a.victim} ${a.domain ?? ''} ${a.summary ?? ''} ${a.group ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  ), [attacks, country, claimedOnly, query]);

  // Reports recorded per week, claimed by a ransomware group or not
  const weeks = useMemo(() => {
    const start = Date.now() - WEEKS * 7 * DAY_MS;
    const buckets = Array.from({ length: WEEKS }, (_, i) => ({ start: new Date(start + i * 7 * DAY_MS), claimed: 0, other: 0 }));
    for (const a of filtered) {
      const i = Math.floor((Date.parse(a.added) - start) / (7 * DAY_MS));
      if (i >= 0 && i < WEEKS) buckets[i][a.group ? 'claimed' : 'other']++;
    }
    return buckets;
  }, [filtered]);

  const countries = countBy(attacks, (a) => a.country);
  const claimed = filtered.filter((a) => a.group).length;
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(filtered.length, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setClaimedOnly(!claimedOnly)} className={chipClass(claimedOnly)}>Claimed by a group</button>
        {country && <button onClick={() => setCountry('')} className={chipClass(true)}>{countryFlag(country)} {countryName(country)} ×</button>}
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Organisation, group…" className="bg-transparent font-mono text-theme-text focus:outline-none w-40" />
        </label>
      </div>

      <StatCards stats={[
        { label: 'Reported attacks', value: filtered.length, note: 'last 90 days' },
        { label: 'Claimed by a group', value: claimed, note: filtered.length ? `${Math.round((claimed / filtered.length) * 100)}%` : '' },
        { label: 'Countries', value: countBy(filtered, (a) => a.country).length },
        { label: 'With a source', value: filtered.filter((a) => a.sourceUrl).length, note: 'press article or official notice' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>Reports per week</SectionTitle>
        <StackedBars
          ariaLabel="Publicly reported attacks per week"
          unit="reports"
          buckets={weeks.map((w) => ({
            label: `week of ${w.start.toISOString().slice(0, 10)}`,
            short: w.start.toISOString().slice(5, 10),
            segments: [
              { name: 'claimed by a group', value: w.claimed, className: 'fill-rose-600' },
              { name: 'unclaimed', value: w.other, className: 'fill-sky-500/70' },
            ],
          }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <div>
            <SectionTitle>Countries</SectionTitle>
            <BarList color="bg-sky-500/70" rows={countries.slice(0, 10).map(([c, n]) => ({ key: c, label: `${countryFlag(c)} ${countryName(c)}`, value: n, active: country === c, onClick: () => setCountry(country === c ? '' : c) }))} />
          </div>
          <div>
            <SectionTitle>Claimed by</SectionTitle>
            <BarList rows={countBy(filtered, (a) => a.group).slice(0, 8).map(([g, n]) => ({ key: g, label: groupDisplayName(g), value: n }))} />
          </div>
        </aside>

        <ul className="lg:col-span-3 divide-y divide-theme-border/60">
          {filtered.slice(0, visibleCount).map((a) => (
            <li key={a.id} className="py-3 space-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-serif font-bold text-sm text-theme-text">{a.victim}</span>
                {a.country && <span className="text-xs" title={countryName(a.country)}>{countryFlag(a.country)}</span>}
                {a.group && (
                  <a href={buildHash('ransomware', '', new URLSearchParams({ group: a.group.toLowerCase() }))} className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase hover:underline">
                    {groupDisplayName(a.group)}
                  </a>
                )}
                <span className="ml-auto text-[11px] font-mono text-theme-text-muted whitespace-nowrap">
                  {a.date && a.date !== a.added ? `attack ${a.date} · ` : ''}reported {a.added}
                </span>
              </div>
              {a.summary && <p className="text-xs font-serif text-theme-text-muted leading-relaxed">{a.summary}</p>}
              <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                {a.sourceUrl && (
                  <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline inline-flex items-center gap-1">
                    Source ({new URL(a.sourceUrl).hostname.replace(/^www\./, '')}) <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-theme-text-muted hover:underline inline-flex items-center gap-1">Ransomware.live <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-6 text-xs font-serif italic text-theme-text-muted">No reports match these filters.</li>}
          {hasMore && <li><LoadMoreButton remaining={remaining} onClick={showMore} /></li>}
        </ul>
      </div>
      <p className="text-[11px] font-serif text-theme-text-muted">
        Attacks reported in the press or in official breach notifications, collected by <a href="https://www.ransomware.live" target="_blank" rel="noopener noreferrer" className="underline">Ransomware.live</a>.
        Leak-site victims that match one get a "reported" badge on the victims tab.
      </p>
    </div>
  );
};
