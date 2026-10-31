import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Article, StoryCluster, NewspaperSectionConfig, ThreatSeverity } from '../../types';
import { HeroArticle } from '../ArticleCard/HeroArticle';
import { FeatureArticle } from '../ArticleCard/FeatureArticle';
import { TextArticle } from '../ArticleCard/TextArticle';
import { BannerArticle } from '../ArticleCard/BannerArticle';
import { QuarterBriefArticle } from '../ArticleCard/QuarterBriefArticle';
import { ThumbnailArticle } from '../ArticleCard/ThumbnailArticle';
import { NewspaperSkeleton } from '../Common/NewspaperSkeleton';
import { EmptyState } from '../Common/EmptyState';
import { ClusterModal } from './ClusterModal';
import { CustomizeSectionsModal } from './CustomizeSectionsModal';
import { useSettings } from '../../context/SettingsContext';
import { clusterArticles } from '../../services/articles/clustering';
import { calculateImportance } from '../../services/articles/importance';
import { TrendingStrip } from './TrendingStrip';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../Common/LoadMoreButton';
import { fitGridItems, newspaperModes } from '../../utils/layout';
import { partitionStream, FILL_POOL, type BlockFill } from './streamBlocks';
import {
  Flame,
  ShieldAlert,
  Cpu,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  Layers,
  Shield,
  Binary,
  Clock,
} from 'lucide-react';

interface NewspaperViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
  onSearch?: (query: string) => void;
  chronological?: boolean; // newest first, sections and clustering off unless toggled in this view
}

/**
 * Sorts in place by editorial importance, newest first among stories of similar importance.
 * Importance is bucketed in pairs (0-1, 2-3, ...) so the comparison stays consistent; the old
 * "within 1 point counts as equal" rule wasn't transitive, which made the order erratic.
 * Scores and timestamps are computed once per article rather than in every comparison.
 */
function sortByImportance(list: Article[], stackKeywords: string[] = []): void {
  const keys = new Map(
    list.map((a) => [a.id, { bucket: Math.floor(calculateImportance(a, stackKeywords) / 2), time: new Date(a.publishedAt).getTime() || 0 }])
  );
  list.sort((a, b) => {
    const ka = keys.get(a.id)!;
    const kb = keys.get(b.id)!;
    return kb.bucket - ka.bucket || kb.time - ka.time;
  });
}

function sortByTimeDesc(list: Article[]): Article[] {
  return list
    .map((a) => ({ a, t: new Date(a.publishedAt).getTime() || 0 }))
    .sort((x, y) => y.t - x.t)
    .map((x) => x.a);
}

const STREAM_PAGE_SIZE = 40;
const SECTION_PAGE_SIZE = 8;

/**
 * Articles a section's editorial layout has no room for. Collapsed at first; each
 * "Show more" reveals another page as a grid of briefs.
 */
const SectionOverflow: React.FC<{ articles: Article[]; onOpenArticle: (article: Article) => void }> = ({
  articles,
  onOpenArticle,
}) => {
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(articles.length, SECTION_PAGE_SIZE, 0);

  return (
    <>
      {visibleCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch mt-8 pt-6 border-t border-theme-border/60">
          {articles.slice(0, visibleCount).map((story) => (
            <div key={story.id} className="h-full">
              <QuarterBriefArticle article={story} onOpen={() => onOpenArticle(story)} withImage={false} />
            </div>
          ))}
        </div>
      )}
      {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
    </>
  );
};

type ClusterProps = { clusterCount?: number; clusterSources?: string[]; onOpenCluster?: () => void };

/**
 * Fills the height a column has left under its own stories (the other column of the row being
 * taller) with the stories that follow, as compact briefs: only whole rows that fit, nothing below
 * lg (one column, no gap to fill). flex: 1 1 0 + min-height: 0 + overflow: hidden, so it takes only
 * the height the row already has and can never make the row taller. Reports how many it shows so
 * the stories after it start there.
 */
const StoryFiller: React.FC<{
  articles: Article[];
  columns: 1 | 2;
  onFit: (count: number) => void;
  onOpenArticle: (article: Article) => void;
}> = ({ articles, columns, onFit, onOpenArticle }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  // Re-measure when the stories change, not on every render's fresh slice of them
  const storyKey = articles.map((a) => a.id).join('|');

  useLayoutEffect(() => {
    const box = boxRef.current;
    const grid = gridRef.current;
    if (!box || !grid) return;
    const measure = () => {
      // Below lg the box is display:none and measures 0, so nothing fits
      const heights = Array.from(grid.children, (el) => (el as HTMLElement).offsetHeight);
      const style = getComputedStyle(grid);
      const columns = style.gridTemplateColumns.split(' ').length;
      // The last row's bottom margin (the spacing setting's, on every article) is blank, so it may be clipped
      const article = grid.querySelector('article');
      const margin = article ? parseFloat(getComputedStyle(article).marginBottom) || 0 : 0;
      const room = box.clientHeight > 0 ? box.clientHeight + margin : 0;
      setCount(fitGridItems(room, heights, columns, parseFloat(style.rowGap) || 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [storyKey]);

  useLayoutEffect(() => onFit(count), [count, onFit]);
  useLayoutEffect(() => () => onFit(0), [onFit]);

  if (articles.length === 0) return null;
  return (
    <div ref={boxRef} className="hidden lg:block" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }} data-lead-filler>
      <div ref={gridRef} className={columns === 2 ? 'grid grid-cols-2 gap-x-8 gap-y-3 items-stretch' : 'grid grid-cols-1'}>
        {articles.map((story, i) => (
          // Stories past the ones that fit stay laid out (to be measured) but hidden and inert.
          // A single column continues the stack above it, divider and all
          <div
            key={story.id}
            className={`min-w-0 ${columns === 1 ? 'border-t border-theme-border/60 pt-3' : ''} ${i < count ? '' : 'invisible'}`}
            aria-hidden={i < count ? undefined : true}
          >
            <TextArticle article={story} compact showDivider={false} onOpen={() => onOpenArticle(story)} />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Feature story on the left, a stack of stories on the right. Both columns keep their stories at
 * their natural height from the top, and whichever column is shorter fills the rest with the stories
 * that follow (the right column first; the left one gets those after what the right one shows).
 */
const FeatureStackRow: React.FC<{
  main: Article;
  side: Article[];
  rightPool: Article[];
  leftPool: Article[];
  onFitRight: (count: number) => void;
  onFitLeft: (count: number) => void;
  onOpenArticle: (article: Article) => void;
  clusterProps: (article: Article) => ClusterProps;
}> = ({ main, side, rightPool, leftPool, onFitRight, onFitLeft, onOpenArticle, clusterProps }) => (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
    <div className="lg:col-span-7 lg:border-r lg:border-theme-border lg:pr-8 flex flex-col">
      <FeatureArticle
        article={main}
        orientation="vertical"
        showBorder={false}
        onOpen={() => onOpenArticle(main)}
        {...clusterProps(main)}
      />
      <StoryFiller articles={leftPool} columns={2} onFit={onFitLeft} onOpenArticle={onOpenArticle} />
    </div>
    <div className="lg:col-span-5 flex flex-col">
      <div className="flex flex-col divide-y divide-theme-border/60">
        {side.map((story, sIdx) => (
          <div key={story.id} className="py-3 first:pt-0">
            {sIdx === 0 ? (
              <ThumbnailArticle
                article={story}
                variant="newspaper"
                showBorder={false}
                onOpen={() => onOpenArticle(story)}
              />
            ) : (
              <TextArticle article={story} showDivider={false} onOpen={() => onOpenArticle(story)} />
            )}
          </div>
        ))}
      </div>
      <StoryFiller articles={rightPool} columns={1} onFit={onFitRight} onOpenArticle={onOpenArticle} />
    </div>
  </div>
);

const SEVERITY_RANK: Record<ThreatSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function getSectionIcon(sectionId: string) {
  switch (sectionId) {
    case 'breaking-threats':
    case 'critical-intel':
      return <ShieldAlert className="w-4 h-4 text-rose-500" />;
    case 'threat-intel':
      return <Flame className="w-4 h-4 text-orange-500" />;
    case 'vulns':
      return <ShieldCheck className="w-4 h-4 text-amber-500" />;
    case 'red-team':
      return <Binary className="w-4 h-4 text-red-400" />;
    case 'blue-team':
      return <Shield className="w-4 h-4 text-blue-400" />;
    case 'tech':
      return <Cpu className="w-4 h-4 text-theme-accent" />;
    default:
      return <Sparkles className="w-4 h-4 text-theme-accent" />;
  }
}

export const NewspaperView: React.FC<NewspaperViewProps> = ({
  articles,
  isLoading,
  onOpenArticle,
  onSearch,
  chronological = false,
}) => {
  const { settings, updateSetting } = useSettings();
  const [localModes, setLocalModes] = useState({ sections: false, clustering: false });
  const modes = newspaperModes(chronological, settings, localModes);
  const toggleSections = () => chronological
    ? setLocalModes((m) => ({ ...m, sections: !m.sections }))
    : updateSetting('sectionsEnabled', !modes.sections);
  const toggleClustering = () => chronological
    ? setLocalModes((m) => ({ ...m, clustering: !m.clustering }))
    : updateSetting('clusteringEnabled', !modes.clustering);
  const [selectedCluster, setSelectedCluster] = useState<StoryCluster | null>(null);
  const [isCustomizingSections, setIsCustomizingSections] = useState(false);
  // How many stories after the lead row's five fill the space under its hero (LeadFiller reports it)
  const [leadFill, setLeadFill] = useState(0);
  // How many following stories fill each column of the feature + stack rows, keyed by the row
  // (`section:<id>`, or the main story's id in the stream); each filler reports through fitFor
  const [blockFills, setBlockFills] = useState<Record<string, BlockFill>>({});
  const fitters = useRef(new Map<string, (count: number) => void>());
  const fitFor = useCallback((key: string, side: keyof BlockFill) => {
    const id = `${key}|${side}`;
    let fit = fitters.current.get(id);
    if (!fit) {
      fit = (count: number) =>
        setBlockFills((prev) => {
          const cur = prev[key] ?? { right: 0, left: 0 };
          return cur[side] === count ? prev : { ...prev, [key]: { ...cur, [side]: count } };
        });
      fitters.current.set(id, fit);
    }
    return fit;
  }, []);

  // Clustering only depends on which articles are shown and their severity/image (primary pick),
  // not on read/bookmark state, so key the expensive pass on that and map results to live copies.
  const clusterSignature = useMemo(
    () => articles.map((a) => `${a.id}:${a.severityScore ?? 0}:${a.image ? 1 : 0}`).join('|'),
    [articles]
  );
  const rawClusters = useMemo(() => {
    if (!modes.clustering) return [];
    return clusterArticles(articles);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- articles is captured via clusterSignature
  }, [clusterSignature, modes.clustering]);
  const clusters = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    const live = (a: Article) => byId.get(a.id) ?? a;
    return rawClusters.map((c) => ({
      ...c,
      primaryArticle: live(c.primaryArticle),
      relatedArticles: c.relatedArticles.map(live),
    }));
  }, [rawClusters, articles]);

  // Fast cluster lookup by primary article ID
  const clusterMap = useMemo(() => {
    const map = new Map<string, StoryCluster>();
    clusters.forEach((c) => {
      map.set(c.primaryArticle.id, c);
    });
    return map;
  }, [clusters]);

  // Set of related article IDs hidden from main page when clustering is active
  const clusteredSecondaryIds = useMemo(() => {
    if (!modes.clustering) return new Set<string>();
    const ids = new Set<string>();
    clusters.forEach((c) => {
      c.relatedArticles.forEach((r) => ids.add(r.id));
    });
    return ids;
  }, [clusters, modes.clustering]);

  // Distinct articles to display on the newspaper front
  const primaryDisplayArticles = useMemo(() => {
    if (!modes.clustering) return articles;
    return articles.filter((a) => !clusteredSecondaryIds.has(a.id));
  }, [articles, clusteredSecondaryIds, modes.clustering]);

  // Helper to extract cluster props for any article
  const getClusterProps = (article: Article) => {
    const cluster = clusterMap.get(article.id);
    if (!cluster || cluster.clusterSize <= 1) return {};
    return {
      clusterCount: cluster.clusterSize,
      clusterSources: cluster.relatedArticles.map((r) => r.sourceName),
      onOpenCluster: () => setSelectedCluster(cluster),
    };
  };

  // Chronological sort of all articles (newest first)
  const chronologicalStories = useMemo(() => {
    return sortByTimeDesc(primaryDisplayArticles);
  }, [primaryDisplayArticles]);

  // The stream below the lead row (its five stories and those filling under the hero) is rendered in pages
  const streamStart = 5 + leadFill;
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(chronologicalStories.length - streamStart, STREAM_PAGE_SIZE);

  // Partition the visible part of the stream into gap-free blocks; stories filling a block's columns leave the stream there
  const chronologicalBlocks = useMemo(
    () => partitionStream(chronologicalStories.slice(streamStart, streamStart + visibleCount), blockFills),
    [chronologicalStories, streamStart, visibleCount, blockFills]
  );

  // Group articles by user configured sections
  const sectionedGroups = useMemo(() => {
    if (!modes.sections) return null;

    const configs = [...(settings.newspaperSections || [])]
      .filter((s) => s.enabled)
      .sort((a, b) => a.order - b.order);

    if (configs.length === 0) return null;

    const usedIds = new Set<string>();
    const groups: { config: NewspaperSectionConfig; articles: Article[] }[] = [];

    for (const conf of configs) {
      const matched = primaryDisplayArticles.filter((a) => {
        if (usedIds.has(a.id)) return false;

        // Check severity match
        if (conf.minSeverity) {
          const reqRank = SEVERITY_RANK[conf.minSeverity] ?? 0;
          const artRank = SEVERITY_RANK[a.severity || 'info'] ?? 0;
          return artRank >= reqRank;
        }

        // Check category match
        if (conf.category) {
          const catLower = conf.category.toLowerCase();
          const matchCat = a.categories.some((c) => c.toLowerCase().includes(catLower));
          const matchTag = a.tags.some((t) => t.toLowerCase().includes(catLower));
          return matchCat || matchTag;
        }

        return false;
      });

      // Sort matched articles by editorial importance
      if (matched.length > 0) {
        sortByImportance(matched, settings.stackKeywords);
        matched.forEach((a) => usedIds.add(a.id));
        groups.push({ config: conf, articles: matched });
      }
    }

    // Capture remaining unmatched articles
    const remainingUnmatched = primaryDisplayArticles.filter((a) => !usedIds.has(a.id));
    if (remainingUnmatched.length > 0) {
      sortByImportance(remainingUnmatched, settings.stackKeywords);
      groups.push({
        config: {
          id: 'wire-general',
          title: 'Intelligence Wire & Dispatches',
          enabled: true,
          order: 999,
        },
        articles: remainingUnmatched,
      });
    }

    return groups;
  }, [primaryDisplayArticles, settings.newspaperSections, modes.sections, settings.stackKeywords]);

  if (isLoading && articles.length === 0) {
    return <NewspaperSkeleton />;
  }

  if (articles.length === 0) {
    return <EmptyState />;
  }

  const isSectionsActive = modes.sections;

  return (
    <div className="newspaper-container main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {onSearch && <TrendingStrip articles={articles} stackKeywords={settings.stackKeywords} onSearch={onSearch} />}

      {/* ─────────────────────────────────────────────────────────────
          EDITORIAL MASTHEAD CONTROLS BAR
          Zero clutter, toggle between Section Grouping and Chronological Order
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-6 border-b border-theme-border/60 text-xs font-mono text-theme-text-muted gap-3">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="font-bold uppercase tracking-wider text-theme-text">
            {isSectionsActive ? 'EDITORIAL SECTION EDITION' : 'CHRONOLOGICAL DISPATCH STREAM'}
          </span>
          <span className="text-theme-border">·</span>
          <span>{primaryDisplayArticles.length} stories</span>
          {clusters.length > 0 && (
            <span className="inline-flex items-center gap-1 text-theme-accent bg-theme-accent/10 px-2 py-0.5 rounded">
              <Layers className="w-3 h-3" />
              {clusters.filter((c) => c.clusterSize > 1).length} clusters
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Section Mode Toggle (Requirement: Disable sections -> Chronological order) */}
          <button
            onClick={toggleSections}
            title={
              isSectionsActive
                ? 'Disable sections to view all articles in strict chronological order'
                : 'Enable editorial section grouping'
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors text-xs font-mono font-bold ${
              !isSectionsActive
                ? 'bg-theme-accent text-white shadow-sm'
                : 'bg-theme-surface text-theme-text hover:bg-theme-card border border-theme-border hover:border-theme-accent'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isSectionsActive ? 'Sections: ON' : 'Chronological (Sections OFF)'}</span>
          </button>

          {/* Clustering Toggle */}
          <button
            onClick={toggleClustering}
            title="Toggle multi-source story clustering"
            className={`hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              modes.clustering
                ? 'bg-theme-surface text-theme-accent border border-theme-accent/40 font-bold'
                : 'text-theme-text-muted hover:text-theme-text hover:bg-theme-surface border border-theme-border'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Clustering: {modes.clustering ? 'ON' : 'OFF'}</span>
          </button>

          {/* Customize Sections Button (Only shown/enabled when sections are on) */}
          {isSectionsActive && (
            <button
              onClick={() => setIsCustomizingSections(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-theme-surface hover:bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors font-medium"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-theme-accent" />
              <span>Customize Sections</span>
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODE A: SECTIONS ENABLED (Categorized Editorial Blocks)
          ───────────────────────────────────────────────────────────── */}
      {isSectionsActive && sectionedGroups && sectionedGroups.length > 0 ? (
        <div className="space-y-12">
          {sectionedGroups.map((group, gIdx) => {
            const items = group.articles;
            const isFirstSection = gIdx === 0;
            // Stories filling the shorter column of the 5+ layout (reported by its fillers)
            const rowKey = `section:${group.config.id}`;
            const reported = blockFills[rowKey] ?? { right: 0, left: 0 };
            const rightFill = Math.min(reported.right, Math.max(items.length - 4, 0));
            const rowFill = { right: rightFill, left: Math.min(reported.left, Math.max(items.length - 4 - rightFill, 0)) };

            return (
              <section key={group.config.id} className="pt-2">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-theme-accent">
                  <div className="flex items-center gap-2">
                    {getSectionIcon(group.config.id)}
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-theme-text tracking-tight uppercase">
                      {group.config.title}
                    </h2>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-theme-surface text-theme-text-muted border border-theme-border">
                      {items.length}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-theme-text-muted uppercase hidden sm:inline">
                    SECTION {gIdx + 1}
                  </span>
                </div>

                {/* Section Layout */}
                {isFirstSection ? (
                  /* Lead Hero + Side Column Stack for first section */
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-8">
                    <div
                      className={`${
                        items.length > 1
                          ? 'lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8'
                          : 'lg:col-span-12'
                      } flex flex-col justify-between`}
                    >
                      <HeroArticle
                        article={items[0]}
                        onOpen={() => onOpenArticle(items[0])}
                        {...getClusterProps(items[0])}
                      />
                      <StoryFiller
                        articles={items.slice(5, 5 + FILL_POOL)}
                        columns={2}
                        onFit={setLeadFill}
                        onOpenArticle={onOpenArticle}
                      />
                    </div>

                    {items.length > 1 && (
                      <div className="lg:col-span-4 flex flex-col justify-between h-full">
                        <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                          {items.slice(1, 5).map((story, idx) => (
                            <div
                              key={story.id}
                              className="py-2.5 first:pt-0 last:pb-0 flex-1 flex flex-col justify-between"
                            >
                              {idx === 0 ? (
                                <ThumbnailArticle
                                  article={story}
                                  variant="newspaper"
                                  showBorder={false}
                                  onOpen={() => onOpenArticle(story)}
                                />
                              ) : (
                                <TextArticle
                                  article={story}
                                  showDivider={false}
                                  className="h-full flex flex-col justify-between"
                                  onOpen={() => onOpenArticle(story)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : items.length === 1 ? (
                  /* Single story banner */
                  <div className="w-full">
                    <BannerArticle
                      article={items[0]}
                      onOpen={() => onOpenArticle(items[0])}
                      {...getClusterProps(items[0])}
                    />
                  </div>
                ) : items.length === 2 ? (
                  /* Dual column half */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={items[0]}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(items[0])}
                        {...getClusterProps(items[0])}
                      />
                    </div>
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={items[1]}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(items[1])}
                        {...getClusterProps(items[1])}
                      />
                    </div>
                  </div>
                ) : items.length === 3 ? (
                  /* Trio columns */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                    {items.map((story) => (
                      <div
                        key={story.id}
                        className="p-4 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between h-full"
                      >
                        <QuarterBriefArticle
                          article={story}
                          onOpen={() => onOpenArticle(story)}
                          withImage={true}
                        />
                      </div>
                    ))}
                  </div>
                ) : items.length === 4 ? (
                  /* Quad briefs across 4 columns */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
                    {items.map((story) => (
                      <div key={story.id} className="h-full">
                        <QuarterBriefArticle
                          article={story}
                          onOpen={() => onOpenArticle(story)}
                          withImage={true}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Feature Left + Stack Right for 5+ items, the shorter column filled with the section's next stories */
                  <FeatureStackRow
                    main={items[0]}
                    side={items.slice(1, 4)}
                    rightPool={items.slice(4, 4 + FILL_POOL)}
                    leftPool={items.slice(4 + rowFill.right, 4 + rowFill.right + FILL_POOL)}
                    onFitRight={fitFor(rowKey, 'right')}
                    onFitLeft={fitFor(rowKey, 'left')}
                    onOpenArticle={onOpenArticle}
                    clusterProps={getClusterProps}
                  />
                )}

                {/* Articles beyond what the layout above shows: first section 5 plus those under its hero,
                    5+ layout 4 plus those filling its columns, smaller layouts all */}
                <SectionOverflow
                  articles={items.slice(
                    isFirstSection ? 5 + leadFill : items.length >= 5 ? 4 + rowFill.right + rowFill.left : items.length
                  )}
                  onOpenArticle={onOpenArticle}
                />
              </section>
            );
          })}
        </div>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────
          MODE B: SECTIONS DISABLED (Strict Chronological Order Stream)
          ───────────────────────────────────────────────────────────── */}
      {!isSectionsActive && chronologicalStories.length > 0 && (
        <div className="space-y-10">
          {/* Chronological Lead Row (Newest article as Hero + Next 4 Newest as Stack) */}
          <section className="newspaper-row">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Newest Article as Hero Story */}
              <div
                className={`${
                  chronologicalStories.length > 1
                    ? 'lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8'
                    : 'lg:col-span-12'
                } flex flex-col justify-between`}
              >
                <HeroArticle
                  article={chronologicalStories[0]}
                  onOpen={() => onOpenArticle(chronologicalStories[0])}
                  {...getClusterProps(chronologicalStories[0])}
                />
                <StoryFiller
                  articles={chronologicalStories.slice(5, 5 + FILL_POOL)}
                  columns={2}
                  onFit={setLeadFill}
                  onOpenArticle={onOpenArticle}
                />
              </div>

              {/* Next 4 Articles in Descending Chronological Order */}
              {chronologicalStories.length > 1 && (
                <div className="lg:col-span-4 flex flex-col justify-between h-full">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b-2 border-theme-accent">
                    <Clock className="w-4 h-4 text-theme-accent" />
                    <h3 className="font-mono text-xs font-black uppercase tracking-widest text-theme-text">
                      LATEST DISPATCHES · CHRONOLOGICAL
                    </h3>
                  </div>

                  <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                    {chronologicalStories.slice(1, 5).map((story, idx) => (
                      <div
                        key={story.id}
                        className="py-2.5 first:pt-0 last:pb-0 flex-1 flex flex-col justify-between"
                      >
                        {idx === 0 ? (
                          <ThumbnailArticle
                            article={story}
                            variant="newspaper"
                            showBorder={false}
                            onOpen={() => onOpenArticle(story)}
                          />
                        ) : (
                          <TextArticle
                            article={story}
                            showDivider={false}
                            className="h-full flex flex-col justify-between"
                            onOpen={() => onOpenArticle(story)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Flowing Chronological Blocks for Remaining Articles */}
          <div className="space-y-12">
            {chronologicalBlocks.map((blk) => (
              // Keyed by the block's first story: a filled block moves the ones after it, which then start anew
              <div key={blk.type === 'feature-left-stack-right' ? blk.main.id : blk.items[0].id} className="pt-6 border-t border-theme-border/80">
                {blk.type === 'full-banner' && (
                  <div className="w-full">
                    <BannerArticle
                      article={blk.items[0]}
                      onOpen={() => onOpenArticle(blk.items[0])}
                      {...getClusterProps(blk.items[0])}
                    />
                  </div>
                )}

                {blk.type === 'duo-half' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={blk.items[0]}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(blk.items[0])}
                        {...getClusterProps(blk.items[0])}
                      />
                    </div>
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={blk.items[1]}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(blk.items[1])}
                        {...getClusterProps(blk.items[1])}
                      />
                    </div>
                  </div>
                )}

                {blk.type === 'trio-columns' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                    {blk.items.map((story) => (
                      <div
                        key={story.id}
                        className="p-4 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between h-full"
                      >
                        <QuarterBriefArticle
                          article={story}
                          onOpen={() => onOpenArticle(story)}
                          withImage={true}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {blk.type === 'quad-briefs' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
                    {blk.items.map((story) => (
                      <div key={story.id} className="h-full">
                        <QuarterBriefArticle
                          article={story}
                          onOpen={() => onOpenArticle(story)}
                          withImage={true}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {blk.type === 'feature-left-stack-right' && (
                  <FeatureStackRow
                    main={blk.main}
                    side={blk.side}
                    rightPool={blk.rightPool}
                    leftPool={blk.leftPool}
                    onFitRight={fitFor(blk.main.id, 'right')}
                    onFitLeft={fitFor(blk.main.id, 'left')}
                    onOpenArticle={onOpenArticle}
                    clusterProps={getClusterProps}
                  />
                )}
              </div>
            ))}
          </div>
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
        </div>
      )}

      {/* Cluster Modal */}
      <ClusterModal
        cluster={selectedCluster}
        onClose={() => setSelectedCluster(null)}
        onOpenArticle={onOpenArticle}
      />

      {/* Customize Sections Modal */}
      <CustomizeSectionsModal
        isOpen={isCustomizingSections}
        onClose={() => setIsCustomizingSections(false)}
      />
    </div>
  );
};
