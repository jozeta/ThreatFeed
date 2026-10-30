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
  const { feeds, articles, cveIntel, vulns, ensureVulns, isRefreshing } = useFeeds();
  const { settings } = useSettings();
  const latest = useRef({ feeds, articles, cveIntel, vulns, settings });
  latest.current = { feeds, articles, cveIntel, vulns, settings };
  const running = useRef(false);
  const rerun = useRef(false);
  const needsVulns = settings.alertRules.some(r => r.enabled && r.kind === 'vulns');

  useEffect(() => {
    if (needsVulns) void ensureVulns();
  }, [needsVulns, ensureVulns]);

  const check = async () => {
    if (running.current) { rerun.current = true; return; }
    running.current = true;
    try {
      const { feeds: feedList, articles: list, cveIntel: intel, vulns: data, settings: s } = latest.current;
      const epss = s.watchedCves.length > 0 ? await fetchEpssScores(s.watchedCves) : new Map<string, number>();
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
    } finally {
      running.current = false;
      if (rerun.current) { rerun.current = false; void check(); }
    }
  };
  const checkRef = useRef(check);
  checkRef.current = check;

  // After a refresh settles, and whenever the rules or lists they read change
  useEffect(() => {
    if (isRefreshing) return;
    void checkRef.current();
  }, [isRefreshing, vulns, settings.alertRules, settings.watchlistKeywords, settings.stackKeywords, settings.watchedCves, settings.alertGapHours]);

  useEffect(() => {
    const timer = window.setInterval(() => void checkRef.current(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
