import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { AlertStore, NPM_RULE_ID, npmUnseenCount } from '../services/intelligence/alertEngine';
import { ALERT_STORE_EVENT, loadAlertStore, saveAlertStore } from '../services/intelligence/alertStore';

/**
 * New npm alerts (advisories affecting your packages, alerted by "My npm packages") since the Vulns npm tab was
 * last open, for its badge. While `open`, the tab counts as seen: the time is saved in the alert store, again
 * whenever another alert comes in, so the badge stays clear while you look at the tab.
 */
export function useNpmUnseen(open: boolean): number {
  const { settings } = useSettings();
  const [store, setStore] = useState<AlertStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => { void loadAlertStore().then(s => { if (!cancelled) setStore(s); }); };
    load();
    window.addEventListener(ALERT_STORE_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(ALERT_STORE_EVENT, load); };
  }, []);

  const enabled = settings.alertRules.some(r => r.builtIn === NPM_RULE_ID && r.enabled);
  const count = store && enabled ? npmUnseenCount(store, settings.npmPackages) : 0;

  useEffect(() => {
    if (!open || count === 0) return;
    void loadAlertStore().then(current => saveAlertStore({ ...current, seen: { ...current.seen, npm: new Date().toISOString() } }));
  }, [open, count]);

  return open ? 0 : count;
}
