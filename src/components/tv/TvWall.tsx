import { CSSProperties, useEffect, useRef, useState } from 'react';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { useVulns } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import { filterAndSortArticles } from '../../services/articles/filterSort';
import { buildBriefing } from '../../services/intelligence/briefing';
import { tilesForBriefing, tilesForFront, tilesForRansomware, toEngineItems, TvTile } from '../../services/tv/tiles';
import { GRIDS, Slot } from '../../services/tv/tileEngine';
import { useReducedMotion } from '../Common/SidePanel';
import TvTileCard from './TvTileCard';
import PageCounter from './PageCounter';
import { useLivingWall } from './useLivingWall';
import { wallOutMs, wallTransition } from './wallMotion';

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

  // The wall rebuilds on its own schedule (refills, data signature); it reads the latest data through this ref
  const latest = { page, articles, feeds, cveIntel, incidents, vulns, victims, settings };
  const ref = useRef(latest);
  ref.current = latest;
  // Tile content by id: every build's tiles, with the on-screen copy winning for tiles still on screen
  const tilesById = useRef(new Map<string, TvTile>());
  const onScreen = useRef<Slot[]>([]);

  const build = (): TvTile[] => {
    const d = ref.current;
    const now = Date.now();
    if (d.page === 'newspaper' || d.page === 'latest') {
      const shown = filterAndSortArticles(d.articles, NO_FILTERS, false, d.feeds, d.settings.watchlistKeywords, {
        mutedKeywords: d.settings.mutedKeywords,
        hiddenCategories: d.page === 'newspaper' ? d.settings.frontPageHiddenCategories : [],
      });
      return tilesForFront(shown, d.settings.stackKeywords, now);
    }
    if (d.page === 'briefing') {
      return tilesForBriefing(
        buildBriefing(d.articles, d.cveIntel, d.settings.watchlistKeywords, d.settings.stackKeywords, 24, now, d.incidents, d.vulns)
      );
    }
    if (d.page === 'ransomware') {
      const groupNames = Array.from(new Set(d.victims.map(v => v.group))).filter(g => g.length >= 4);
      return tilesForRansomware(d.articles, d.victims, groupNames, now);
    }
    return [];
  };

  const size = settings.tvTileSize;
  const { slots, leaving, label } = useLivingWall(
    () => {
      const tiles = build();
      const next = new Map(tiles.map(t => [t.id, t]));
      // Tiles on screen keep their content until they swap out
      for (const s of onScreen.current) {
        const t = tilesById.current.get(s.itemId);
        if (t) next.set(t.id, t);
      }
      tilesById.current = next;
      return toEngineItems(tiles);
    },
    size,
    settings.tvIntervalSeconds * 1000,
    {
      signature: `${page}|${articles.length}|${vulns ? 'v' : '-'}|${victims.length}|${Object.keys(cveIntel ?? {}).length}|${incidents ? 'i' : '-'}`,
      outMs: wallOutMs(reduced, settings.tvTransition),
    }
  );
  onScreen.current = slots;

  const now = Date.now();
  const shown = slots.filter(s => tilesById.current.has(s.itemId));
  if (shown.length === 0) return <Empty />;

  const grid = GRIDS[size];
  return (
    <>
      <div
        className="tv-wall"
        data-size={size}
        data-transition={wallTransition(reduced, settings.tvTransition)}
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}
      >
        {shown.map(s => (
          <TvTileCard
            key={s.key}
            tile={tilesById.current.get(s.itemId)!}
            size={size}
            area={s.w * s.h}
            leaving={leaving.has(s.key)}
            now={now}
            style={{ gridColumn: `${s.col + 1} / span ${s.w}`, gridRow: `${s.row + 1} / span ${s.h}`, ['--i' as string]: s.order } as CSSProperties}
          />
        ))}
      </div>
      <PageCounter label={label} />
    </>
  );
}
