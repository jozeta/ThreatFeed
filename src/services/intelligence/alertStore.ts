import { getStoredValue, saveStoredValue } from '../storage/indexeddb';
import { ALERT_STORE_KEY, AlertStore, emptyAlertStore } from './alertEngine';
import { loadWatchStore } from './cveWatch';

export const ALERT_STORE_EVENT = 'threatfeed:alerts'; // fired on window when the store changes

export async function loadAlertStore(): Promise<AlertStore> {
  const stored = await getStoredValue<AlertStore>(ALERT_STORE_KEY);
  if (stored) {
    return { ...emptyAlertStore(), ...stored, seen: stored.seen ?? {} };
  }
  // First run: watched-CVE history carries over as the baseline new events are measured against
  const store = emptyAlertStore();
  store.watch = { ...(await loadWatchStore()).notified };
  return store;
}

export async function saveAlertStore(store: AlertStore): Promise<void> {
  await saveStoredValue(ALERT_STORE_KEY, store);
  window.dispatchEvent(new Event(ALERT_STORE_EVENT));
}
