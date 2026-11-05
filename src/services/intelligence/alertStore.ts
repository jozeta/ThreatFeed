import { getStoredValue, saveStoredValue, updateStoredValue } from '../storage/indexeddb';
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

/**
 * Sets one "seen" time and nothing else, in one transaction: saving a whole loaded copy instead could overwrite
 * what an alert check saved in between (its new matches and npm keys).
 */
export async function saveAlertSeen(kind: keyof AlertStore['seen'], at: string): Promise<void> {
  await updateStoredValue<AlertStore>(ALERT_STORE_KEY, current => {
    const store = current ?? emptyAlertStore();
    return { ...store, seen: { ...store.seen, [kind]: at } };
  });
  window.dispatchEvent(new Event(ALERT_STORE_EVENT));
}
