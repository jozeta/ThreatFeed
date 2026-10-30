import React, { useEffect, useMemo, useState } from 'react';
import { Article, CveIntel, VulnData } from '../../types';
import {
  buildWatchState, CVE_WATCH_EVENT, CveWatchState, CveWatchStore, diffCveWatch, fetchEpssScores, isCveId, loadWatchStore, saveWatchStore,
} from '../../services/intelligence/cveWatch';
import { SectionTitle } from '../incidents/shared';
import { CveButton, EpssValue } from './shared';
import { Eye, Plus, StarOff } from 'lucide-react';

interface WatchingTabProps {
  watched: string[];
  vulns: VulnData | null;
  cveIntel: Record<string, CveIntel>;
  articles: Article[];
  onWatch: (cve: string) => void;
  onUnwatch: (cve: string) => void;
  onOpenCve: (cve: string) => void;
}

/** The CVEs the user follows, their current status, and what changed since they last looked */
export const WatchingTab: React.FC<WatchingTabProps> = ({ watched, vulns, cveIntel, articles, onWatch, onUnwatch, onOpenCve }) => {
  const [store, setStore] = useState<CveWatchStore | null>(null);
  const [epss, setEpss] = useState<Map<string, number>>(new Map());
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const reload = () => { loadWatchStore().then(setStore); };
    reload();
    window.addEventListener(CVE_WATCH_EVENT, reload);
    return () => window.removeEventListener(CVE_WATCH_EVENT, reload);
  }, []);
  useEffect(() => { fetchEpssScores(watched).then(setEpss); }, [watched]);

  const rows = useMemo(() => watched.map((cve) => {
    const now: CveWatchState = buildWatchState(cve, vulns, cveIntel, articles, epss);
    return { cve, now, changes: diffCveWatch(cve, store?.seen[cve], now) };
  }), [watched, vulns, cveIntel, articles, epss, store]);
  const changed = rows.filter((r) => r.changes.length > 0).length;

  const markSeen = async () => {
    const next = await loadWatchStore();
    for (const r of rows) next.seen[r.cve] = r.now;
    await saveWatchStore(next);
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const cve = draft.trim().toUpperCase();
    if (isCveId(cve) && !watched.includes(cve)) onWatch(cve);
    setDraft('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={add} className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="CVE-2026-12345" aria-label="CVE to watch"
            className="bg-theme-card border border-theme-border rounded px-3 py-1.5 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent w-44" />
          <button type="submit" disabled={!isCveId(draft.trim().toUpperCase())} className="px-3 py-1.5 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Watch
          </button>
        </form>
        {changed > 0 && (
          <button onClick={markSeen} className="px-3 py-1.5 rounded border border-theme-border bg-theme-card text-xs font-mono text-theme-text hover:border-theme-accent flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Mark {changed} change{changed === 1 ? '' : 's'} as seen
          </button>
        )}
      </div>

      {watched.length === 0 ? (
        <p className="text-sm font-serif text-theme-text-muted">
          Watch a CVE (with the star in its panel, or above) to follow it: you'll see when it's added to CISA KEV, when its EPSS score jumps,
          and when new articles mention it. With the Watched CVEs rule's 🔔 on (Settings → Alert Rules), changes also send a desktop notification.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <SectionTitle>Watched CVEs ({watched.length})</SectionTitle>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                <th className="py-2 pr-3 font-semibold">CVE</th>
                <th className="py-2 pr-3 font-semibold">KEV</th>
                <th className="py-2 pr-3 font-semibold">EPSS</th>
                <th className="py-2 pr-3 font-semibold">News</th>
                <th className="py-2 pr-3 font-semibold">Since you last looked</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {rows.map(({ cve, now, changes }) => (
                <tr key={cve} className={`align-top ${changes.length ? 'bg-amber-500/5' : ''}`}>
                  <td className="py-2 pr-3"><CveButton cve={cve} onOpen={onOpenCve} /></td>
                  <td className="py-2 pr-3">{now.kev ? <span className="px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">KEV {now.kevDateAdded ?? ''}</span> : <span className="text-theme-text-muted">—</span>}</td>
                  <td className="py-2 pr-3"><EpssValue epss={now.epss} /></td>
                  <td className="py-2 pr-3 text-theme-text-muted">{now.articleIds.length || ''}</td>
                  <td className="py-2 pr-3">
                    {changes.length
                      ? <ul className="space-y-0.5">{changes.map((c) => <li key={c.kind} className="text-amber-600 dark:text-amber-400 font-bold">{c.text}</li>)}</ul>
                      : <span className="text-theme-text-muted">no change</span>}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button onClick={() => onUnwatch(cve)} className="p-1 text-theme-text-muted hover:text-rose-500" title={`Stop watching ${cve}`} aria-label={`Stop watching ${cve}`}>
                      <StarOff className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
