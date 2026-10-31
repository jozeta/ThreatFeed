import { CSSProperties, useEffect, useRef, useState } from 'react';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { useTvSettings } from './useTvSettings';
import { useVulns } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import { filterAndSortArticles } from '../../services/articles/filterSort';
import { buildBriefing } from '../../services/intelligence/briefing';
import { tilesForBriefing, tilesForFront, tilesForRansomware, toEngineItems, TvTile } from '../../services/tv/tiles';
import { EngineItem, GRIDS, Slot } from '../../services/tv/tileEngine';
import { mixItems } from '../../services/tv/mix';
import { useReducedMotion } from '../Common/SidePanel';
import TvTileCard from './TvTileCard';
import TvFooter from './TvFooter';
import { useLivingWall } from './useLivingWall';
import { useBreakingDetection, useBreakingNews } from './useBreakingNews';
import { kevAddedMap } from '../../services/tv/breaking';
import { CellDelayContext, cellDelayMs, SPEED_FACTOR, wallOutMs, wallTransition } from './wallMotion';
import { PanelDef } from './DashboardWall';
import { VulnCtx, vulnNumberPanels } from './dashPanels';

/** Mixed mode's number panels: ids kept apart from story ids */
const NUM = 'num:';
const NONE: string[] = []; // stable, so the panels' data memo still hits when a setting is missing

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
  const { articles, feeds, cveIntel, incidents, initialSyncDone, msrc, stats, ensureMsrc, ensureStats, snapshotGeneratedAt } = useFeeds();
  const vulns = useVulns();
  const { victims } = useLeakSiteVictims();
  const { settings } = useSettings();
  const tv = useTvSettings();
  const reduced = useReducedMotion();
  // Mixed mode (Latest only): the Vulns number panels join the queue; Patch Tuesday and the stats load only then
  const mixed = page === 'latest' && tv.mix;
  useEffect(() => {
    if (!mixed) return;
    void ensureMsrc();
    void ensureStats();
  }, [mixed, ensureMsrc, ensureStats, snapshotGeneratedAt]);

  // The wall rebuilds on its own schedule (refills, data signature); it reads the latest data through this ref
  const latest = { page, articles, feeds, cveIntel, incidents, vulns, victims, settings, mixed, msrc, stats };
  const ref = useRef(latest);
  ref.current = latest;
  // Tile content by id: every build's tiles, with the on-screen copy winning for tiles still on screen
  const tilesById = useRef(new Map<string, TvTile>());
  const onScreen = useRef<Slot[]>([]);
  // Mixed mode's number panels by item id ('num:…'), kept the same way
  const panelsById = useRef(new Map<string, PanelDef>());
  const vulnCtx = (): VulnCtx => {
    const d = ref.current;
    return { vulns: d.vulns, msrc: d.msrc, stats: d.stats, stackKeywords: d.settings.stackKeywords ?? NONE, watchedCves: d.settings.watchedCves ?? NONE, now: Date.now() };
  };
  const numbers = (): PanelDef[] => (ref.current.mixed ? vulnNumberPanels(vulnCtx(), vulnCtx) : []);

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

  const news = useBreakingNews();
  const size = tv.size;
  const { slots, leaving, label, prioritize, acceptsNews } = useLivingWall(
    full => {
      const tiles = build();
      if (full) news.markSeen(tiles);
      const next = new Map(tiles.map(t => [t.id, t]));
      // Tiles on screen keep their content until they swap out
      for (const s of onScreen.current) {
        const t = tilesById.current.get(s.itemId);
        if (t) next.set(t.id, t);
      }
      tilesById.current = next;
      const panels = numbers();
      const nextPanels = new Map(panels.map(p => [NUM + p.id, p]));
      for (const s of onScreen.current) {
        const p = panelsById.current.get(s.itemId);
        if (p) nextPanels.set(s.itemId, p);
      }
      panelsById.current = nextPanels;
      const numberItems: EngineItem[] = panels.map(p => ({ id: NUM + p.id, weight: p.weight, shapes: p.shapes }));
      return mixItems(toEngineItems(tiles), numberItems);
    },
    size,
    tv.intervalSeconds * 1000,
    {
      signature: `${page}|${mixed ? `mix|${msrc ? 'm' : '-'}|${stats ? 's' : '-'}|` : ''}${articles.length}|${vulns ? 'v' : '-'}|${victims.length}|${Object.keys(cveIntel ?? {}).length}|${incidents ? 'i' : '-'}`,
      outMs: wallOutMs(reduced, tv.transition, tv.speed),
    }
  );
  onScreen.current = slots;

  // Breaking news: on data changes (the wall's own rebuilds stop after its first swap), stories that arrived since the
  // wall started jump the queue
  useBreakingDetection(news, {
    page,
    data: [articles, vulns, cveIntel, victims, incidents],
    synced: initialSyncDone,
    build,
    kevAdded: () => kevAddedMap(ref.current.vulns, ref.current.cveIntel),
    acceptsNews,
    onBreaking: found => {
      for (const t of found) tilesById.current.set(t.id, t);
      prioritize(toEngineItems(found));
    },
  });

  const now = Date.now();
  const shown = slots.filter(s => tilesById.current.has(s.itemId) || panelsById.current.has(s.itemId));
  if (shown.length === 0) return <Empty />;

  const grid = GRIDS[size];
  const transition = wallTransition(reduced, tv.transition);
  return (
    <>
      <div
        className="tv-wall"
        data-size={size}
        data-transition={transition}
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`, ['--k' as string]: SPEED_FACTOR[tv.speed] } as CSSProperties}
      >
        {shown.map(s => panelsById.current.has(s.itemId) ? (
          // A number panel: the dashboard's cell and count-up, as on the Vulns dashboard
          <div
            key={s.key}
            className="tv-cell tv-slot"
            data-size={size}
            data-panel={s.itemId}
            data-leaving={leaving.has(s.key) ? '1' : undefined}
            style={{ gridColumn: `${s.col + 1} / span ${s.w}`, gridRow: `${s.row + 1} / span ${s.h}`, ['--i' as string]: s.order } as CSSProperties}
          >
            <CellDelayContext.Provider value={cellDelayMs(transition, s.order, tv.speed)}>
              {panelsById.current.get(s.itemId)!.render()}
            </CellDelayContext.Provider>
          </div>
        ) : (
          <TvTileCard
            key={s.key}
            tile={tilesById.current.get(s.itemId)!}
            size={size}
            area={s.w * s.h}
            leaving={leaving.has(s.key)}
            isNew={news.isNew(s)}
            now={now}
            style={{ gridColumn: `${s.col + 1} / span ${s.w}`, gridRow: `${s.row + 1} / span ${s.h}`, ['--i' as string]: s.order } as CSSProperties}
          />
        ))}
      </div>
      <TvFooter label={label} />
    </>
  );
}
