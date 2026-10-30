import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { AlertMatch, AlertStore, feedMatches, isNew } from '../services/intelligence/alertEngine';
import { ALERT_STORE_EVENT, loadAlertStore, saveAlertStore } from '../services/intelligence/alertStore';
import { AlertRuleKind } from '../types';

/** One My Feed row: an item and every rule that matched it */
export interface AlertRow {
  kind: AlertRuleKind;
  ref: string; // article id or CVE
  matches: AlertMatch[]; // newest first; several for an item matched by more than one rule or a CVE with several watched events
  isNew: boolean;
  firstMatchedAt: string;
}

export interface AlertFeed {
  news: AlertRow[];
  vulns: AlertRow[];
  newCount: { news: number; vulns: number };
  markSeen(kind: AlertRuleKind): Promise<void>;
}

/** Groups by kind + ref so an item matched by several rules appears once; newest first */
export function groupMatches(matches: AlertMatch[], store: AlertStore): { news: AlertRow[]; vulns: AlertRow[] } {
  const rows = new Map<string, AlertRow>();
  for (const m of matches) {
    const key = `${m.kind}\n${m.ref}`;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { kind: m.kind, ref: m.ref, matches: [], isNew: false, firstMatchedAt: m.firstMatchedAt }));
    row.matches.push(m);
    row.isNew ||= isNew(m, store);
    if (m.firstMatchedAt > row.firstMatchedAt) row.firstMatchedAt = m.firstMatchedAt;
  }
  const all = [...rows.values()];
  for (const row of all) row.matches.sort((a, b) => b.firstMatchedAt.localeCompare(a.firstMatchedAt));
  all.sort((a, b) => b.firstMatchedAt.localeCompare(a.firstMatchedAt));
  return { news: all.filter(r => r.kind === 'news'), vulns: all.filter(r => r.kind === 'vulns') };
}

/** What the alert rules have matched, for My Feed and the nav badge; reloads whenever the alert store changes */
export function useAlertFeed(): AlertFeed {
  const { feeds, articles, vulns, cveIntel } = useFeeds();
  const { settings } = useSettings();
  const [store, setStore] = useState<AlertStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => { void loadAlertStore().then(s => { if (!cancelled) setStore(s); }); };
    load();
    window.addEventListener(ALERT_STORE_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(ALERT_STORE_EVENT, load); };
  }, []);

  const grouped = useMemo(() => {
    if (!store) return { news: [], vulns: [] };
    const categories = new Map(feeds.map(f => [f.id, f.category]));
    const matches = feedMatches({
      rules: settings.alertRules,
      settings,
      articles,
      vulns,
      cveIntel,
      feedCategory: id => categories.get(id),
    }, store);
    return groupMatches(matches, store);
  }, [store, feeds, articles, vulns, cveIntel, settings]);

  const markSeen = useCallback(async (kind: AlertRuleKind) => {
    const current = await loadAlertStore();
    await saveAlertStore({ ...current, seen: { ...current.seen, [kind]: new Date().toISOString() } });
  }, []);

  return {
    ...grouped,
    newCount: { news: grouped.news.filter(r => r.isNew).length, vulns: grouped.vulns.filter(r => r.isNew).length },
    markSeen,
  };
}
