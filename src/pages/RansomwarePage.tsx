import React, { useMemo, useState } from 'react';
import { useFeeds } from '../context/FeedContext';
import { ransomwareVictims } from '../services/intelligence/ransomware';
import { formatRelativeTime } from '../utils/date';
import { Skull, ExternalLink, Search } from 'lucide-react';

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];

export const RansomwarePage: React.FC = () => {
  const { articles, feeds } = useFeeds();
  const [group, setGroup] = useState('');
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(7);

  const trackerEnabled = feeds.some((f) => f.id === 'ransomware-live' && f.enabled);
  const all = useMemo(() => ransomwareVictims(articles), [articles]);
  const inRange = useMemo(() => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return all.filter((v) => new Date(v.publishedAt).getTime() >= since);
  }, [all, days]);

  const count = (key: 'group' | 'country') => {
    const m = new Map<string, number>();
    for (const v of inRange) {
      const k = v[key];
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const groups = useMemo(() => count('group'), [inRange]);
  const countries = useMemo(() => count('country'), [inRange]);

  const shown = inRange.filter((v) =>
    (!group || v.group === group) &&
    (!country || v.country === country) &&
    (!query || `${v.victim} ${v.sector ?? ''} ${v.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  );

  const select = 'bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent';

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <Skull className="w-6 h-6 text-rose-500" />
          <span>Ransomware Tracker</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          Victims posted on ransomware leak sites, via Ransomware.live. Sector and country are best-effort, read from each post.
        </p>
      </div>

      {!trackerEnabled && (
        <p className="mt-6 text-sm font-serif text-amber-500">Enable the "Ransomware.live (victim tracker)" feed under Sources to populate this page.</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${days === r.days ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-surface border-theme-border text-theme-text-muted hover:text-theme-text'}`}
          >
            {r.label}
          </button>
        ))}
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={select} aria-label="Filter by group">
          <option value="">All groups ({groups.length})</option>
          {groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={select} aria-label="Filter by country">
          <option value="">All countries ({countries.length})</option>
          {countries.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Victim or sector…" className="bg-transparent font-mono text-theme-text focus:outline-none w-36" />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1">
          <h2 className="pb-2 mb-3 border-b-2 border-theme-accent font-mono text-xs font-black uppercase tracking-widest text-theme-text">Most active groups</h2>
          <ul className="space-y-1 text-xs font-mono">
            {groups.slice(0, 15).map(([g, n]) => (
              <li key={g}>
                <button onClick={() => setGroup(group === g ? '' : g)} className={`w-full flex items-center gap-2 text-left hover:text-theme-accent ${group === g ? 'text-theme-accent font-bold' : 'text-theme-text'}`}>
                  <span className="w-24 truncate">{g}</span>
                  <span className="h-1.5 rounded bg-rose-500/70" style={{ width: `${(n / groups[0][1]) * 80}px` }} />
                  <span className="text-theme-text-muted">{n}</span>
                </button>
              </li>
            ))}
          </ul>
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
              {shown.map((v) => (
                <tr key={v.id} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-theme-text-muted">{formatRelativeTime(v.publishedAt)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-rose-500 font-bold">{v.group}</td>
                  <td className="py-2 pr-3 text-theme-text">
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noopener noreferrer" className="hover:text-theme-accent inline-flex items-center gap-1">
                        {v.victim} <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ) : v.victim}
                  </td>
                  <td className="py-2 pr-3 text-theme-text-muted">{v.sector ?? '—'}</td>
                  <td className="py-2 pr-3 text-theme-text-muted">{v.country ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">No victims match these filters.</p>}
        </div>
      </div>
    </div>
  );
};
