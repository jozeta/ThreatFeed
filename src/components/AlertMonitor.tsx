import { useEffect, useRef } from 'react';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { runAlertCheck } from '../services/intelligence/alertEngine';
import { loadAlertStore, saveAlertStore } from '../services/intelligence/alertStore';
import { fetchEpssScores } from '../services/intelligence/cveWatch';
import { notificationsSupported, notifyAlertMatches } from '../services/notifications';

const CHECK_INTERVAL_MS = 5 * 60_000; // sends matches held by the gap once it ends, even with auto-refresh off

/**
 * Runs the alert rules after every refresh, when the rules change, and every few minutes. New matches become
 * one combined desktop notification; the rest is recorded for My Feed. Renders nothing.
 */
export function AlertMonitor(): null {
  const { feeds, articles, cveIntel, vulns, ensureVulns, snapshotGeneratedAt, isRefreshing, initialSyncDone } = useFeeds();
  const { settings } = useSettings();
  const latest = useRef({ feeds, articles, cveIntel, vulns, settings, initialSyncDone });
  latest.current = { feeds, articles, cveIntel, vulns, settings, initialSyncDone };
  const running = useRef(false);
  const rerun = useRef(false);
  const needsVulns = settings.alertRules.some(r => r.enabled && r.kind === 'vulns');

  // Again for every new snapshot, like useVulns: otherwise a long-open tab keeps checking the first vulns.json
  useEffect(() => {
    if (needsVulns) void ensureVulns();
  }, [needsVulns, ensureVulns, snapshotGeneratedAt]);

  const check = async () => {
    // Before the stored data and first refresh have landed, articles/vulns are partial and would mis-baseline
    if (!latest.current.initialSyncDone) return;
    if (running.current) { rerun.current = true; return; }
    running.current = true;
    try {
      const watched = latest.current.settings.watchedCves;
      const epss = watched.length > 0 ? await fetchEpssScores(watched) : new Map<string, number>();
      const { feeds: feedList, articles: list, cveIntel: intel, vulns: data, settings: s } = latest.current; // read after the await
      const store = await loadAlertStore();
      const categories = new Map(feedList.map(f => [f.id, f.category]));
      const result = runAlertCheck({
        rules: s.alertRules,
        settings: s,
        articles: list,
        vulns: data,
        cveIntel: intel,
        epss,
        feedCategory: id => categories.get(id),
        now: new Date(),
        permissionGranted: notificationsSupported() && Notification.permission === 'granted',
      }, store);
      await saveAlertStore(result.store);
      notifyAlertMatches(result.notify);
    } catch (err) {
      console.warn('Alert check failed:', err);
    } finally {
      running.current = false;
      if (rerun.current) { rerun.current = false; void check(); }
    }
  };
  const checkRef = useRef(check);
  checkRef.current = check;

  // After a refresh settles, and whenever the rules or lists they read change
  useEffect(() => {
    if (isRefreshing || !initialSyncDone) return;
    void checkRef.current();
  }, [isRefreshing, initialSyncDone, vulns, settings.alertRules, settings.watchlistKeywords, settings.stackKeywords, settings.watchedCves, settings.alertGapHours]);

  useEffect(() => {
    const timer = window.setInterval(() => void checkRef.current(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
