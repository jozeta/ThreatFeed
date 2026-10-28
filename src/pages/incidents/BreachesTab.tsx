import React, { useMemo, useState } from 'react';
import { BreachRecord } from '../../types';
import { formatRelativeTime } from '../../utils/date';
import { chipClass, formatCount, selectClass } from './shared';
import { ShieldCheck, Search, ExternalLink } from 'lucide-react';

// Data types that make a breach materially worse for the people in it
const HIGH_RISK = new Set(['Passwords', 'Credit cards', 'Partial credit card data', 'Bank account numbers', 'Government issued IDs',
  'Social security numbers', 'Passport numbers', 'Health insurance information', 'Medical records', 'Auth tokens', 'Security questions and answers']);

export const BreachesTab: React.FC<{ breaches: BreachRecord[] }> = ({ breaches }) => {
  const [sort, setSort] = useState<'added' | 'records'>('added');
  const [dataClass, setDataClass] = useState('');
  const [query, setQuery] = useState('');

  const dataClasses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of breaches) for (const c of b.dataClasses) counts.set(c, (counts.get(c) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [breaches]);

  const shown = breaches
    .filter((b) => (!dataClass || b.dataClasses.includes(dataClass)) &&
      (!query || `${b.title} ${b.domain ?? ''} ${b.description ?? ''}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => (sort === 'records' ? b.records - a.records : b.addedAt.localeCompare(a.addedAt)));

  const total = shown.reduce((sum, b) => sum + b.records, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setSort('added')} className={chipClass(sort === 'added')}>Newest</button>
        <button onClick={() => setSort('records')} className={chipClass(sort === 'records')}>Largest</button>
        <select value={dataClass} onChange={(e) => setDataClass(e.target.value)} className={selectClass} aria-label="Filter by exposed data">
          <option value="">Any exposed data</option>
          {dataClasses.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-theme-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company or domain…" className="bg-transparent font-mono text-theme-text focus:outline-none w-40" />
        </label>
        <span className="text-xs font-mono text-theme-text-muted ml-auto">{shown.length} breaches · {formatCount(total)} accounts</span>
      </div>

      <ul className="divide-y divide-theme-border/60">
        {shown.map((b) => (
          <li key={b.name} className="py-3 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a href={`https://haveibeenpwned.com/Breach/${encodeURIComponent(b.name)}`} target="_blank" rel="noopener noreferrer"
                className="font-serif text-base font-bold text-theme-text hover:text-theme-accent inline-flex items-center gap-1">
                {b.title} <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              {b.domain && <span className="text-xs font-mono text-theme-text-muted">{b.domain}</span>}
              <span className="text-sm font-mono font-bold text-rose-500">{formatCount(b.records)} accounts</span>
              {b.verified && <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-emerald-500"><ShieldCheck className="w-3 h-3" />verified</span>}
            </div>
            <p className="text-[11px] font-mono text-theme-text-muted">
              Breached {b.breachDate} · added to HIBP {formatRelativeTime(b.addedAt)}
            </p>
            {b.description && <p className="text-xs font-serif text-theme-text-muted leading-relaxed">{b.description}</p>}
            <div className="flex flex-wrap gap-1">
              {b.dataClasses.map((c) => (
                <span key={c} className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${HIGH_RISK.has(c) ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 font-bold' : 'bg-theme-surface text-theme-text-muted border-theme-border'}`}>{c}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-xs font-serif italic text-theme-text-muted">No breaches match.</p>}
      <p className="text-[11px] font-serif text-theme-text-muted">
        Breaches added to <a href="https://haveibeenpwned.com" target="_blank" rel="noopener noreferrer" className="underline">Have I Been Pwned</a> in the last 90 days (CC BY 4.0). Red tags mark high-risk data such as passwords, ID numbers or payment data.
      </p>
    </div>
  );
};
