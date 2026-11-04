import { useEffect, useState } from 'react';
import { getStoredValue, saveStoredValue } from '../services/storage/indexeddb';
import { LAST_VISIT_KEY, visitBaseline } from '../services/lastVisit';

/**
 * The time "new since your last visit" is measured from. It is read once per page load and does not
 * move while the user reads (null until it has loaded, and on a first visit, when nothing is new yet). The next visit's baseline is saved when the
 * tab is hidden or the page is closed.
 */
export function useVisitBaseline(): number | null {
  const [baseline, setBaseline] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStoredValue<string>(LAST_VISIT_KEY)
      .catch(() => null) // storage failure: treat as a first visit
      .then((stored) => {
        if (!cancelled) setBaseline(visitBaseline(stored, Date.now()));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const save = () => { saveStoredValue(LAST_VISIT_KEY, new Date().toISOString()).catch(() => {}); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  return baseline;
}
