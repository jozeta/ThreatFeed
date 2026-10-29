import React, { useMemo, useState } from 'react';
import { LeakSiteVictim, RansomwareIntel } from '../../types';
import { activityChange, groupActivity } from '../../services/intelligence/groupActivity';
import { countryFlag, countryName, groupDisplayName } from '../../utils/countries';
import { formatRelativeTime } from '../../utils/date';
import { Sparkline } from '../../components/Common/Sparkline';
import { StatCards } from '../vulns/shared';
import { chipClass, countBy, selectClass } from './shared';
import { LeakSiteStatus } from './GroupIntelSection';
import { Search } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
type Sort = 'last30' | 'last7' | 'change' | 'firstSeen' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'last30', label: 'Most active (30 days)' },
  { id: 'last7', label: 'Most active (7 days)' },
  { id: 'change', label: 'Fastest growing' },
  { id: 'firstSeen', label: 'Newest' },
  { id: 'name', label: 'Name' },
];

/** Every group with victims in the collected history: activity, trend, targets, and what intel exists for it */
export const GroupsTab: React.FC<{ victims: LeakSiteVictim[]; intel: RansomwareIntel | null; onOpenGroup: (group: string) => void }> = ({ victims, intel, onOpenGroup }) => {
  const [sort, setSort] = useState<Sort>('last30');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const historyDays = useMemo(() => {
    const first = victims.reduce((min, v) => (v.discoveredAt < min ? v.discoveredAt : min), new Date().toISOString());
    return (Date.now() - Date.parse(first)) / DAY_MS;
  }, [victims]);

  const rows = useMemo(() => {
    const activity = groupActivity(victims);
    const byGroup = new Map<string, LeakSiteVictim[]>();
    for (const v of victims) {
      const key = v.group.toLowerCase();
      byGroup.set(key, [...(byGroup.get(key) ?? []), v]);
    }
    return [...activity.values()].map((a) => {
      const info = intel?.groups[a.key];
      const list = byGroup.get(a.key) ?? [];
      return {
        ...a,
        info,
        change: activityChange(a, historyDays),
        topSector: countBy(list, (v) => v.sector)[0]?.[0],
        topCountry: countBy(list, (v) => v.country)[0]?.[0],
        firstSeen: info?.firstSeen,
      };
    });
  }, [victims, intel, historyDays]);

  const shown = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = rows.filter((r) =>
      (!activeOnly || r.last30 > 0) &&
      (!q || `${r.name} ${(r.info?.altNames ?? []).join(' ')} ${(r.info?.attribution ?? []).join(' ')}`.toLowerCase().includes(q))
    );
    const by: Record<Sort, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      last30: (a, b) => b.last30 - a.last30,
      last7: (a, b) => b.last7 - a.last7 || b.last30 - a.last30,
      change: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) || b.last30 - a.last30,
      firstSeen: (a, b) => (b.firstSeen ?? '').localeCompare(a.firstSeen ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return filtered.sort(by[sort]);
  }, [rows, query, activeOnly, sort]);

  const active30 = rows.filter((r) => r.last30 > 0).length;
  const newGroups = rows.filter((r) => r.firstSeen && Date.now() - Date.parse(r.firstSeen) < 90 * DAY_MS).length;
  const top = [...rows].sort((a, b) => b.last30 - a.last30)[0];
  const share = top && victims.length ? Math.round((top.last30 / Math.max(1, rows.reduce((s, r) => s + r.last30, 0))) * 100) : 0;

  const badge = 'px-1 rounded border text-[9px] font-bold uppercase whitespace-nowrap';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectClass} aria-label="Sort groups">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={() => setActiveOnly(!activeOnly)} className={chipClass(activeOnly)}>Active in the last 30 days</button>
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Group, alias, Storm-…" className="bg-transparent font-mono text-theme-text focus:outline-none w-40" />
        </label>
      </div>

      <StatCards stats={[
        { label: 'Active groups', value: active30, note: 'posted in the last 30 days' },
        { label: 'Most active', value: top ? groupDisplayName(top.name) : '—', note: top ? `${top.last30} victims, ${share}% of all` : '' },
        { label: 'New groups', value: newGroups, note: 'first seen in the last 90 days' },
        { label: 'History', value: `${Math.round(historyDays)} days`, note: 'trends compare the last 30 days with the 30 before' },
      ]} />

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
              <th className="py-2 pr-3 font-semibold">#</th>
              <th className="py-2 pr-3 font-semibold">Group</th>
              <th className="py-2 pr-3 font-semibold text-right">7d</th>
              <th className="py-2 pr-3 font-semibold text-right">30d</th>
              <th className="py-2 pr-3 font-semibold" title="Victims per week, last 13 weeks">Trend</th>
              <th className="py-2 pr-3 font-semibold hidden md:table-cell">Targets most</th>
              <th className="py-2 pr-3 font-semibold hidden lg:table-cell">First seen</th>
              <th className="py-2 pr-3 font-semibold hidden lg:table-cell">Leak sites</th>
              <th className="py-2 pr-3 font-semibold hidden sm:table-cell">Intel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border/60">
            {shown.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="py-2 pr-3 text-theme-text-muted">{r.rank}</td>
                <td className="py-2 pr-3">
                  <button onClick={() => onOpenGroup(r.key)} className="text-rose-500 font-bold hover:underline text-left">{groupDisplayName(r.name)}</button>
                  {(r.info?.altNames?.length || r.info?.attribution?.length) ? (
                    <span className="block text-[10px] text-theme-text-muted truncate max-w-[14rem]">{[...(r.info?.attribution ?? []), ...(r.info?.altNames ?? [])].slice(0, 3).join(', ')}</span>
                  ) : null}
                  <span className="block text-[10px] text-theme-text-muted">last post {formatRelativeTime(r.lastPost)}</span>
                </td>
                <td className="py-2 pr-3 text-right text-theme-text">{r.last7 || ''}</td>
                <td className="py-2 pr-3 text-right">
                  <span className="text-theme-text font-bold">{r.last30 || ''}</span>
                  {r.change !== undefined && (
                    <span className={`block text-[10px] ${r.change > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{r.change > 0 ? '+' : ''}{r.change}%</span>
                  )}
                </td>
                <td className="py-2 pr-3"><Sparkline values={r.weekly} width={70} height={18} className="text-rose-500" /></td>
                <td className="py-2 pr-3 hidden md:table-cell text-theme-text-muted">
                  {r.topSector && <span className="block truncate max-w-[10rem]">{r.topSector}</span>}
                  {r.topCountry && <span className="block">{countryFlag(r.topCountry)} {countryName(r.topCountry)}</span>}
                </td>
                <td className="py-2 pr-3 hidden lg:table-cell text-theme-text-muted whitespace-nowrap">{r.firstSeen ?? '—'}</td>
                <td className="py-2 pr-3 hidden lg:table-cell"><LeakSiteStatus sites={r.info?.leakSites} /></td>
                <td className="py-2 pr-3 hidden sm:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {r.info?.ttps && <span className={`${badge} border-theme-border text-theme-text`} title="Tactics & techniques documented">TTPs</span>}
                    {r.info?.attack && <span className={`${badge} border-violet-500/40 text-violet-500`} title={`MITRE ATT&CK ${r.info.attack.id}`}>ATT&CK</span>}
                    {r.info?.cves?.length ? <span className={`${badge} border-rose-500/40 text-rose-500`} title="CVEs this group exploits">{r.info.cves.length} CVE</span> : null}
                    {r.info?.advisories?.length ? <span className={`${badge} border-sky-500/40 text-sky-500`} title="CISA #StopRansomware advisory">CISA</span> : null}
                    {r.info?.references?.length ? <span className={`${badge} border-theme-border text-theme-text-muted`} title="Research write-ups (Malpedia)">{r.info.references.length} reports</span> : null}
                    {r.info?.payments && <span className={`${badge} border-amber-500/40 text-amber-500`} title="Known ransom payments (Ransomwhere)">$</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No groups match.</p>}
      </div>
      <p className="text-[11px] font-serif text-theme-text-muted">
        Activity from the leak-site victims collected so far. Click a group for its full profile: techniques, tools, CVEs, ATT&CK, research and payments.
      </p>
    </div>
  );
};
