import { useEffect, useRef, useState } from 'react';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { runAlertCheck } from '../services/intelligence/alertEngine';
import { alertSettingsFrom } from '../services/intelligence/alertRules';
import { getSettingsFromDB } from '../services/storage/indexeddb';
import { loadAlertStore, saveAlertStore } from '../services/intelligence/alertStore';
import { fetchEpssScores } from '../services/intelligence/cveWatch';
import { notificationsSupported, notifyAlertMatches } from '../services/notifications';

const CHECK_INTERVAL_MS = 5 * 60_000; // sends matches held by the gap once it ends, even with auto-refresh off
const LEADER_LOCK = 'threatfeed-alerts';

const locksSupported = () => typeof navigator !== 'undefined' && 'locks' in navigator && !!navigator.locks;

/**
 * Runs the alert rules after every refresh, when the rules change, and every few minutes. New matches become
 * one combined desktop notification; the rest is recorded for My Feed. Renders nothing.
 *
 * Only one tab checks: the alert store is shared, and a tab with older settings would drop the state of rules it
 * doesn't know about (and both would notify). The tab holding the Web Lock runs the checks and reads the saved
 * settings at each check, so rules edited in another tab apply. Without Web Locks every tab checks, as before.
 */
export function AlertMonitor(): null {
  const { feeds, articles, cveIntel, vulns, ensureVulns, snapshotGeneratedAt, isRefreshing, initialSyncDone } = useFeeds();
  const { settings } = useSettings();
  const latest = useRef({ feeds, articles, cveIntel, vulns, settings, initialSyncDone });
  latest.current = { feeds, articles, cveIntel, vulns, settings, initialSyncDone };
  const running = useRef(false);
  const rerun = useRef(false);
  const [isLeader, setIsLeader] = useState(() => !locksSupported());
  const leader = useRef(isLeader);
  leader.current = isLeader;

  // Held for the tab's lifetime; released on unmount so a remount (or StrictMode) can take it again
  useEffect(() => {
    if (!locksSupported()) return;
    let active = true;
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const abort = new AbortController();
    navigator.locks.request(LEADER_LOCK, { signal: abort.signal }, () => {
      if (active) setIsLeader(true);
      return held;
    }).catch(() => { /* aborted on unmount while waiting */ });
    return () => {
      active = false;
      abort.abort();
      release();
      setIsLeader(false);
    };
  }, []);
  const needsVulns = settings.alertRules.some(r => r.enabled && r.kind === 'vulns');

  // Again for every new snapshot, like useVulns: otherwise a long-open tab keeps checking the first vulns.json
  useEffect(() => {
    if (needsVulns) void ensureVulns();
  }, [needsVulns, ensureVulns, snapshotGeneratedAt]);

  const check = async () => {
    // Before the stored data and first refresh have landed, articles/vulns are partial and would mis-baseline
    if (!latest.current.initialSyncDone || !leader.current) return;
    if (running.current) { rerun.current = true; return; }
    running.current = true;
    try {
      const s = alertSettingsFrom(latest.current.settings, await getSettingsFromDB(), new Date());
      // A Vulns rule added in another tab: load the data; its arrival re-runs the check
      if (s.alertRules.some(r => r.enabled && r.kind === 'vulns')) void ensureVulns();
      const watched = s.watchedCves;
      const epss = watched.length > 0 ? await fetchEpssScores(watched) : new Map<string, number>();
      const { feeds: feedList, articles: list, cveIntel: intel, vulns: data } = latest.current; // read after the await
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

  // After a refresh settles, on becoming the checking tab, and whenever the rules or lists they read change
  useEffect(() => {
    if (isRefreshing || !initialSyncDone || !isLeader) return;
    void checkRef.current();
  }, [isRefreshing, initialSyncDone, isLeader, vulns, settings.alertRules, settings.watchlistKeywords, settings.stackKeywords, settings.watchedCves, settings.alertGapHours]);

  useEffect(() => {
    const timer = window.setInterval(() => void checkRef.current(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
