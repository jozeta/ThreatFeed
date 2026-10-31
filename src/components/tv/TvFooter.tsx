import { useEffect, useState } from 'react';
import { useFeeds } from '../../context/FeedContext';
import { lastFreshAt, staleLevel } from '../../services/tv/staleness';
import PageCounter from './PageCounter';

const TICK_MS = 30_000; // the indicator updates at least once a minute

/** "14:05", or "30 Oct 14:05" when it is not today */
function freshLabel(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date(now).toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

/** The bottom-right line of a TV screen: when its data was last fresh (amber after 1 h, red after 3 h), then the page counter */
export default function TvFooter({ label }: { label: { page: number; of: number } | null }) {
  const { lastUpdated, snapshotGeneratedAt } = useFeeds();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const fresh = lastFreshAt(lastUpdated, snapshotGeneratedAt);
  const level = staleLevel(fresh, now);
  const parts = [fresh !== null ? `Updated ${freshLabel(fresh, now)}` : null, level === 'red' ? 'Data may be out of date' : null].filter(Boolean);

  return (
    <div className="tv-footer" aria-live="off">
      <span className="tv-fresh" data-level={level}>{parts.join(' · ')}</span>
      <PageCounter label={label} />
    </div>
  );
}
