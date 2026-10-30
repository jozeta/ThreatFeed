import { useEffect, useState } from 'react';

const IDLE_MS = 3000;

interface WakeLockLike { release: () => Promise<void> }
type WakeLockNav = { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } };

/** Idle after 3 s without input (the × fades, the cursor hides); keeps the screen awake while mounted */
export function useTvChrome(): { idle: boolean } {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const events = ['mousemove', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, wake));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  useEffect(() => {
    let lock: WakeLockLike | null = null;
    let gone = false;
    const acquire = async () => {
      try {
        const next = await (navigator as unknown as WakeLockNav).wakeLock?.request('screen');
        if (!next) return;
        if (gone) void next.release().catch(() => {});
        else lock = next;
      } catch { /* unsupported, or refused (low battery) */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  return { idle };
}
