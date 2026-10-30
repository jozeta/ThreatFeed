import { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { useVulns } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import { filterAndSortArticles } from '../../services/articles/filterSort';
import { buildBriefing } from '../../services/intelligence/briefing';
import { chunkSets, tilesForBriefing, tilesForFront, tilesForRansomware, TvSet, TvTile } from '../../services/tv/tiles';
import { useReducedMotion } from '../Common/SidePanel';
import TvTileCard from './TvTileCard';
import { OUT_MS, useRotation } from './useRotation';

const NO_FILTERS = {
  searchQuery: '', selectedCategory: null, selectedSourceId: null, selectedTag: null,
  readStatus: 'all', viewedStatus: 'all', bookmarkedOnly: false, dateRange: 'all', sortBy: 'newest',
} as const;

function useClock(): string {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 15000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function Empty() {
  const time = useClock();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div style={{ fontSize: 'clamp(2rem, 4vw, 5rem)', color: '#9aa4b2' }}>No new stories</div>
      <div className="font-mono" style={{ fontSize: 'clamp(3rem, 8vw, 9rem)', color: '#e7ebf0' }}>{time}</div>
    </div>
  );
}

export default function TvWall({ page }: { page: ActiveNavTab }) {
  const { articles, feeds, cveIntel, incidents } = useFeeds();
  const vulns = useVulns();
  const { victims } = useLeakSiteVictims();
  const { settings } = useSettings();
  const reduced = useReducedMotion();

  // The rotation rebuilds only at mount and at wrap; it reads the latest data through this ref
  const latest = { page, articles, feeds, cveIntel, incidents, vulns, victims, settings };
  const ref = useRef(latest);
  ref.current = latest;

  const build = (): TvSet[] => {
    const d = ref.current;
    const now = Date.now();
    let tiles: TvTile[] = [];
    if (d.page === 'newspaper' || d.page === 'latest') {
      const shown = filterAndSortArticles(d.articles, NO_FILTERS, false, d.feeds, d.settings.watchlistKeywords, {
        mutedKeywords: d.settings.mutedKeywords,
        hiddenCategories: d.page === 'newspaper' ? d.settings.frontPageHiddenCategories : [],
      });
      tiles = tilesForFront(shown, d.settings.stackKeywords, now);
    } else if (d.page === 'briefing') {
      tiles = tilesForBriefing(
        buildBriefing(d.articles, d.cveIntel, d.settings.watchlistKeywords, d.settings.stackKeywords, 24, now, d.incidents, d.vulns)
      );
    } else if (d.page === 'ransomware') {
      const groupNames = Array.from(new Set(d.victims.map(v => v.group))).filter(g => g.length >= 4);
      tiles = tilesForRansomware(d.articles, d.victims, groupNames, now);
    }
    return chunkSets(tiles);
  };

  const intervalMs = Math.max(1, settings.tvIntervalMinutes) * 60000;
  const revealMs = (set: TvSet) => OUT_MS + 80 * set.tiles.length;
  const { sets, index, phase, cycle } = useRotation(build, intervalMs, {
    outMs: settings.tvTransition === 'reveal' && !reduced ? revealMs : undefined,
    signature: `${page}|${articles.length}|${vulns ? 'v' : '-'}|${victims.length}|${Object.keys(cveIntel ?? {}).length}|${incidents ? 'i' : '-'}`,
    setKey: s => s.tiles.map(t => t.id).join(','),
  });

  const set = sets[index];
  const now = useMemo(() => Date.now(), [cycle, index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!set || set.tiles.length === 0) return <Empty />;

  return (
    <div
      key={`${index}|${set.tiles.map(t => t.id).join(',')}`}
      className="tv-set"
      data-phase={phase}
      data-transition={reduced ? 'reduced' : settings.tvTransition}
    >
      {set.tiles.map((t, i) => <TvTileCard key={t.id} tile={t} index={i} now={now} />)}
    </div>
  );
}
