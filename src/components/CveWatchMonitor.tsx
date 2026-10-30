import { useEffect, useRef } from 'react';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { buildWatchState, fetchEpssScores, loadWatchStore, saveWatchStore } from '../services/intelligence/cveWatch';

/**
 * Checks watched CVEs after every refresh: newly listed in KEV, a jump in EPSS, or new articles.
 * Changes stay highlighted on the Vulns page's Watching tab until marked as seen (notifying is the alert
 * rules' job, see AlertMonitor). Renders nothing.
 */
export function CveWatchMonitor(): null {
  const { articles, cveIntel, vulns, ensureVulns, snapshotGeneratedAt, isRefreshing } = useFeeds();
  const { settings } = useSettings();
  const latest = useRef({ articles, cveIntel, vulns });
  latest.current = { articles, cveIntel, vulns };
  const watched = settings.watchedCves;
  const watchedKey = watched.join(',');

  // Watching CVEs is a reason to load the vulnerability data even if the Vulns page is never opened (and to
  // reload it with each new snapshot)
  useEffect(() => {
    if (watched.length > 0) void ensureVulns();
  }, [watchedKey, ensureVulns, snapshotGeneratedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (watched.length === 0 || isRefreshing) return; // check once a refresh has settled
    let cancelled = false;
    (async () => {
      const epss = await fetchEpssScores(watched);
      if (cancelled) return;
      const { articles: list, cveIntel: intel, vulns: data } = latest.current;
      const store = await loadWatchStore();
      for (const cve of watched) {
        const now = buildWatchState(cve, data, intel, list, epss);
        store.notified[cve] = now;
        store.seen[cve] ??= now;
      }
      for (const cve of Object.keys(store.notified)) if (!watched.includes(cve)) delete store.notified[cve];
      for (const cve of Object.keys(store.seen)) if (!watched.includes(cve)) delete store.seen[cve];
      if (cancelled) return;
      await saveWatchStore(store);
    })();
    return () => { cancelled = true; };
  }, [watchedKey, isRefreshing, vulns]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
