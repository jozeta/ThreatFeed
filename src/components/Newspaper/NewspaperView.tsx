import React, { useMemo, useState } from 'react';
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
import { stackMatches } from '../../services/intelligence/stack';
import { TrendingStrip } from './TrendingStrip';
import { usePagedCount } from '../../hooks/usePagedCount';
import { LoadMoreButton } from '../Common/LoadMoreButton';
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
}

// Section types that guarantee 100% horizontal & vertical space filling with zero gaps
type EditorialBlock =
  | { type: 'full-banner'; items: [Article] }
  | { type: 'duo-half'; items: [Article, Article] }
  | { type: 'trio-columns'; items: [Article, Article, Article] }
  | { type: 'quad-briefs'; items: [Article, Article, Article, Article] }
  | { type: 'feature-left-stack-right'; main: Article; side: Article[] };

// Deterministic hash to provide stable organic randomness per article
function getArticleHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Calculate importance score based on threat tags and high-impact indicators
function calculateImportance(article: Article, stackKeywords: string[] = []): number {
  let score = 0;
  const criticalTags = [
    'zero-day',
    '0-day',
    'ransomware',
    'apt',
    'critical',
    'exploit',
    'vulnerability',
    'cve',
    'cisa',
    'remote code execution',
  ];

  for (const tag of article.tags) {
    if (criticalTags.includes(tag.toLowerCase())) {
      score += 3;
    }
  }

  const topSources = [
    'cisa-advisories',
    'google-project-zero',
    'the-hacker-news',
    'cisco-talos',
    'krebs-on-security',
  ];
  if (topSources.includes(article.sourceId)) {
    score += 2;
  }

  if (article.image) score += 2;
  if (article.bookmarked) score += 1;
  // Stories about products the user runs belong near the top of their section
  if (stackMatches(article, stackKeywords).length > 0) score += 4;
  if (article.severity === 'critical') score += 4;
  else if (article.severity === 'high') score += 2;

  const pseudoRandom = getArticleHash(article.id) % 3;
  return score + pseudoRandom;
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
}) => {
  const { settings, updateSetting } = useSettings();
  const [selectedCluster, setSelectedCluster] = useState<StoryCluster | null>(null);
  const [isCustomizingSections, setIsCustomizingSections] = useState(false);

  // Clustering only depends on which articles are shown and their severity/image (primary pick),
  // not on read/bookmark state, so key the expensive pass on that and map results to live copies.
  const clusterSignature = useMemo(
    () => articles.map((a) => `${a.id}:${a.severityScore ?? 0}:${a.image ? 1 : 0}`).join('|'),
    [articles]
  );
  const rawClusters = useMemo(() => {
    if (!settings.clusteringEnabled) return [];
    return clusterArticles(articles);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- articles is captured via clusterSignature
  }, [clusterSignature, settings.clusteringEnabled]);
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
    if (!settings.clusteringEnabled) return new Set<string>();
    const ids = new Set<string>();
    clusters.forEach((c) => {
      c.relatedArticles.forEach((r) => ids.add(r.id));
    });
    return ids;
  }, [clusters, settings.clusteringEnabled]);

  // Distinct articles to display on the newspaper front
  const primaryDisplayArticles = useMemo(() => {
    if (!settings.clusteringEnabled) return articles;
    return articles.filter((a) => !clusteredSecondaryIds.has(a.id));
  }, [articles, clusteredSecondaryIds, settings.clusteringEnabled]);

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

  // The stream below the lead row is rendered in pages
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(chronologicalStories.length - 5, STREAM_PAGE_SIZE);

  // Partition chronological remaining stories into gap-free blocks
  const chronologicalBlocks = useMemo(() => {
    const remaining = chronologicalStories.slice(5, 5 + visibleCount);
    const blocks: EditorialBlock[] = [];
    let idx = 0;
    let cycle = 0;

    while (idx < remaining.length) {
      const count = remaining.length - idx;

      if (count === 1) {
        blocks.push({ type: 'full-banner', items: [remaining[idx]] });
        idx += 1;
        break;
      }

      if (count === 2) {
        blocks.push({ type: 'duo-half', items: [remaining[idx], remaining[idx + 1]] });
        idx += 2;
        break;
      }

      if (count === 3) {
        blocks.push({
          type: 'trio-columns',
          items: [remaining[idx], remaining[idx + 1], remaining[idx + 2]],
        });
        idx += 3;
        break;
      }

      switch (cycle % 4) {
        case 0:
          blocks.push({
            type: 'feature-left-stack-right',
            main: remaining[idx],
            side: [remaining[idx + 1], remaining[idx + 2], remaining[idx + 3]],
          });
          idx += 4;
          break;
        case 1:
          blocks.push({
            type: 'quad-briefs',
            items: [
              remaining[idx],
              remaining[idx + 1],
              remaining[idx + 2],
              remaining[idx + 3],
            ],
          });
          idx += 4;
          break;
        case 2:
          blocks.push({
            type: 'duo-half',
            items: [remaining[idx], remaining[idx + 1]],
          });
          idx += 2;
          break;
        case 3:
          blocks.push({
            type: 'full-banner',
            items: [remaining[idx]],
          });
          idx += 1;
          break;
      }
      cycle++;
    }

    return blocks;
  }, [chronologicalStories, visibleCount]);

  // Group articles by user configured sections
  const sectionedGroups = useMemo(() => {
    if (settings.sectionsEnabled === false) return null;

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
  }, [primaryDisplayArticles, settings.newspaperSections, settings.sectionsEnabled, settings.stackKeywords]);

  if (isLoading && articles.length === 0) {
    return <NewspaperSkeleton />;
  }

  if (articles.length === 0) {
    return <EmptyState />;
  }

  const isSectionsActive = settings.sectionsEnabled !== false;

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
            onClick={() => updateSetting('sectionsEnabled', !isSectionsActive)}
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
            onClick={() => updateSetting('clusteringEnabled', !settings.clusteringEnabled)}
            title="Toggle multi-source story clustering"
            className={`hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              settings.clusteringEnabled
                ? 'bg-theme-surface text-theme-accent border border-theme-accent/40 font-bold'
                : 'text-theme-text-muted hover:text-theme-text hover:bg-theme-surface border border-theme-border'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Clustering: {settings.clusteringEnabled ? 'ON' : 'OFF'}</span>
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
                  /* Feature Left + Stack Right for 5+ items */
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                    <div className="lg:col-span-7 lg:border-r lg:border-theme-border lg:pr-8 flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={items[0]}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(items[0])}
                        {...getClusterProps(items[0])}
                      />
                    </div>
                    <div className="lg:col-span-5 flex flex-col justify-between h-full">
                      <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                        {items.slice(1, 4).map((story, sIdx) => (
                          <div
                            key={story.id}
                            className="py-3 first:pt-0 last:pb-0 flex-1 flex flex-col justify-between"
                          >
                            {sIdx === 0 ? (
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
                  </div>
                )}

                {/* Articles beyond what the layout above shows: first section 5, 5+ layout 4, smaller layouts all */}
                <SectionOverflow
                  articles={items.slice(isFirstSection ? 5 : items.length >= 5 ? 4 : items.length)}
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
            {chronologicalBlocks.map((blk, bIdx) => (
              <div key={bIdx} className="pt-6 border-t border-theme-border/80">
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
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                    <div className="lg:col-span-7 lg:border-r lg:border-theme-border lg:pr-8 flex flex-col justify-between h-full">
                      <FeatureArticle
                        article={blk.main}
                        orientation="vertical"
                        showBorder={false}
                        className="h-full flex flex-col justify-between"
                        onOpen={() => onOpenArticle(blk.main)}
                        {...getClusterProps(blk.main)}
                      />
                    </div>
                    <div className="lg:col-span-5 flex flex-col justify-between h-full">
                      <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                        {blk.side.map((story, sIdx) => (
                          <div
                            key={story.id}
                            className="py-3 first:pt-0 last:pb-0 flex-1 flex flex-col justify-between"
                          >
                            {sIdx === 0 ? (
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
                  </div>
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
