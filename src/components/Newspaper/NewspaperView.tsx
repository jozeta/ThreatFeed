import React, { useMemo } from 'react';
import { Article } from '../../types';
import { HeroArticle } from '../ArticleCard/HeroArticle';
import { FeatureArticle } from '../ArticleCard/FeatureArticle';
import { TextArticle } from '../ArticleCard/TextArticle';
import { BannerArticle } from '../ArticleCard/BannerArticle';
import { QuarterBriefArticle } from '../ArticleCard/QuarterBriefArticle';
import { ThumbnailArticle } from '../ArticleCard/ThumbnailArticle';
import { NewspaperSkeleton } from '../Common/NewspaperSkeleton';
import { EmptyState } from '../Common/EmptyState';
import { Flame, ShieldAlert, Cpu, Radio, Sparkles, ShieldCheck } from 'lucide-react';

interface NewspaperViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
}

// Section types that guarantee 100% horizontal & vertical space filling with zero gaps
type EditorialSection =
  | {
      type: 'full-banner';
      items: [Article];
      title?: string;
      icon?: React.ReactNode;
    }
  | {
      type: 'feature-left-stack-right';
      main: Article;
      side: Article[];
      title?: string;
      icon?: React.ReactNode;
    }
  | {
      type: 'stack-left-feature-right';
      side: Article[];
      main: Article;
      title?: string;
      icon?: React.ReactNode;
    }
  | {
      type: 'duo-half';
      items: [Article, Article];
      title?: string;
      icon?: React.ReactNode;
    }
  | {
      type: 'trio-columns';
      items: [Article, Article, Article];
      title?: string;
      icon?: React.ReactNode;
    }
  | {
      type: 'quad-briefs';
      items: [Article, Article, Article, Article];
      title?: string;
      icon?: React.ReactNode;
    };

// Deterministic hash to provide stable organic randomness per article
function getArticleHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Calculate importance score based on threat tags and high-impact indicators
function calculateImportance(article: Article): number {
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

  // Sources with high editorial weight
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

  // Add organic pseudo-randomness (0 to 2)
  const pseudoRandom = getArticleHash(article.id) % 3;
  return score + pseudoRandom;
}

export const NewspaperView: React.FC<NewspaperViewProps> = ({
  articles,
  isLoading,
  onOpenArticle,
}) => {
  if (isLoading && articles.length === 0) {
    return <NewspaperSkeleton />;
  }

  if (articles.length === 0) {
    return <EmptyState />;
  }

  // Sort articles by importance & publication to create an editorial hierarchy
  const sortedStories = useMemo(() => {
    return [...articles].sort((a, b) => {
      const impDiff = calculateImportance(b) - calculateImportance(a);
      if (Math.abs(impDiff) <= 1) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      return impDiff;
    });
  }, [articles]);

  // Section 1: Lead story + Side column
  // If there are at least 5 articles, provide 4 side stories to match the Hero's vertical height
  const heroStory = sortedStories[0];
  const sideHighlightCount = Math.min(4, Math.max(0, sortedStories.length - 1));
  const sideHighlights = sortedStories.slice(1, 1 + sideHighlightCount);

  // Group the rest of articles into variable, gap-free editorial sections
  const remaining = sortedStories.slice(1 + sideHighlightCount);

  const editorialSections = useMemo(() => {
    const sections: EditorialSection[] = [];
    let index = 0;
    let cycle = 0;

    while (index < remaining.length) {
      const count = remaining.length - index;

      // Strict remainder handling: Always pair or trio remaining articles so no grid slot is empty
      if (count === 1) {
        sections.push({
          type: 'full-banner',
          items: [remaining[index]],
          title: 'Special Threat Dispatch',
          icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
        });
        index += 1;
        break;
      }

      if (count === 2) {
        sections.push({
          type: 'duo-half',
          items: [remaining[index], remaining[index + 1]],
          title: 'Threat Analysis & Research',
          icon: <Cpu className="w-4 h-4 text-theme-accent" />,
        });
        index += 2;
        break;
      }

      if (count === 3) {
        sections.push({
          type: 'trio-columns',
          items: [remaining[index], remaining[index + 1], remaining[index + 2]],
          title: 'Security Wire & Reports',
          icon: <Sparkles className="w-4 h-4 text-amber-500" />,
        });
        index += 3;
        break;
      }

      // When count >= 4, rotate through organic asymmetric layouts:
      switch (cycle % 6) {
        case 0:
          // Pattern A: Full-Width Cinematic Banner (Takes 100% width)
          sections.push({
            type: 'full-banner',
            items: [remaining[index]],
            title: 'Critical Threat Intelligence Briefing',
            icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
          });
          index += 1;
          break;

        case 1:
          // Pattern B: Feature Left (7 cols) + 3 Articles Stacked Right (5 cols)
          // The 3 stacked articles fill the vertical space beside the feature story with NO gap!
          if (count >= 4) {
            sections.push({
              type: 'feature-left-stack-right',
              main: remaining[index],
              side: [remaining[index + 1], remaining[index + 2], remaining[index + 3]],
              title: 'Lead Investigation & Dispatches',
              icon: <Flame className="w-4 h-4 text-orange-500" />,
            });
            index += 4;
          } else {
            sections.push({
              type: 'trio-columns',
              items: [remaining[index], remaining[index + 1], remaining[index + 2]],
            });
            index += 3;
          }
          break;

        case 2:
          // Pattern C: Four 1/4 Width Telemetry Columns (Takes 4 articles across 100%)
          if (count >= 4) {
            sections.push({
              type: 'quad-briefs',
              items: [
                remaining[index],
                remaining[index + 1],
                remaining[index + 2],
                remaining[index + 3],
              ],
              title: 'Telemetry & Rapid Dispatches',
              icon: <Radio className="w-4 h-4 text-theme-accent" />,
            });
            index += 4;
          } else {
            sections.push({
              type: 'trio-columns',
              items: [remaining[index], remaining[index + 1], remaining[index + 2]],
            });
            index += 3;
          }
          break;

        case 3:
          // Pattern D: Dual Half-Width Stories (Takes 2 articles across 100%)
          sections.push({
            type: 'duo-half',
            items: [remaining[index], remaining[index + 1]],
            title: 'Exploit Research & Analysis',
            icon: <Cpu className="w-4 h-4 text-theme-accent" />,
          });
          index += 2;
          break;

        case 4:
          // Pattern E: 3 Articles Stacked Left (5 cols) + Horizontal Feature Right (7 cols)
          // The 3 stacked articles fill the vertical space beside the feature story with NO gap!
          if (count >= 4) {
            sections.push({
              type: 'stack-left-feature-right',
              side: [remaining[index], remaining[index + 1], remaining[index + 2]],
              main: remaining[index + 3],
              title: 'Vulnerability Disclosures & Advisories',
              icon: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
            });
            index += 4;
          } else {
            sections.push({
              type: 'trio-columns',
              items: [remaining[index], remaining[index + 1], remaining[index + 2]],
            });
            index += 3;
          }
          break;

        case 5:
          // Pattern F: Trio Columns (Takes 3 articles across 100%)
          sections.push({
            type: 'trio-columns',
            items: [remaining[index], remaining[index + 1], remaining[index + 2]],
            title: 'Global Cybersecurity Dispatches',
            icon: <Sparkles className="w-4 h-4 text-amber-500" />,
          });
          index += 3;
          break;
      }

      cycle++;
    }

    return sections;
  }, [remaining]);

  return (
    <div className="newspaper-container main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: THE FRONT PAGE LEAD (Hero Story + Side Column Stack)
          Both columns stretch to equal height (items-stretch), zero gaps!
          ───────────────────────────────────────────────────────────── */}
      <section className="newspaper-row mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Main Hero Story (Takes 8 cols if side column exists, or full 12 cols if single) */}
          <div
            className={`${
              sideHighlights.length > 0
                ? 'lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8'
                : 'lg:col-span-12'
            } flex flex-col justify-between`}
          >
            <HeroArticle article={heroStory} onOpen={() => onOpenArticle(heroStory)} />
          </div>

          {/* Right Column Stack: Up to 4 stories stacked so vertical height balances the Hero */}
          {sideHighlights.length > 0 && (
            <div className="lg:col-span-4 flex flex-col justify-between h-full">
              <div className="flex items-center gap-2 pb-2 mb-3 border-b-2 border-theme-accent">
                <Flame className="w-4 h-4 text-theme-accent" />
                <h3 className="font-mono text-xs font-black uppercase tracking-widest text-theme-text">
                  TOP DEVELOPMENTS · INTEL WIRE
                </h3>
              </div>

              <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                {sideHighlights.map((story, idx) => (
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

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2+: FLOWING ASYMMETRIC EDITORIAL SECTIONS (Continuous variation)
          Zero empty grid slots, and side columns packed with stacked articles!
          ───────────────────────────────────────────────────────────── */}
      <div className="space-y-12">
        {editorialSections.map((sec, secIdx) => {
          return (
            <div key={secIdx} className="pt-6 border-t-2 border-theme-border">
              {/* Optional Section Masthead Bar */}
              {sec.title && (
                <div className="flex items-center justify-between mb-6 pb-2 border-b border-theme-border">
                  <div className="flex items-center gap-2">
                    {sec.icon}
                    <h2 className="font-serif text-xl sm:text-2xl font-bold text-theme-text tracking-tight">
                      {sec.title}
                    </h2>
                  </div>
                  <span className="font-mono text-[11px] text-theme-text-muted uppercase hidden sm:inline">
                    EDITION WIRE · VERIFIED TELEMETRY
                  </span>
                </div>
              )}

              {/* RENDER BASED ON ASYMMETRIC PATTERN */}

              {/* 1. Full-Width Banner (100% width, cinematic edge-to-edge) */}
              {sec.type === 'full-banner' && sec.items[0] && (
                <div className="w-full">
                  <BannerArticle
                    article={sec.items[0]}
                    onOpen={() => onOpenArticle(sec.items[0])}
                  />
                </div>
              )}

              {/* 2. Feature Left (7 cols) + 3 Articles Stacked Right (5 cols) */}
              {sec.type === 'feature-left-stack-right' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                  <div className="lg:col-span-7 lg:border-r lg:border-theme-border lg:pr-8 flex flex-col justify-between h-full">
                    <FeatureArticle
                      article={sec.main}
                      orientation="vertical"
                      showBorder={false}
                      className="h-full flex flex-col justify-between"
                      onOpen={() => onOpenArticle(sec.main)}
                    />
                  </div>
                  <div className="lg:col-span-5 flex flex-col justify-between h-full">
                    <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                      {sec.side.map((story, sIdx) => (
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

              {/* 3. Four 1/4 Width Telemetry Columns (25% each across 100%) */}
              {sec.type === 'quad-briefs' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
                  {sec.items.map((story) => (
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

              {/* 4. Dual Half-Width Stories (50% each across 100%) */}
              {sec.type === 'duo-half' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                  <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                    <FeatureArticle
                      article={sec.items[0]}
                      orientation="vertical"
                      showBorder={false}
                      className="h-full flex flex-col justify-between"
                      onOpen={() => onOpenArticle(sec.items[0])}
                    />
                  </div>
                  <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between h-full">
                    <FeatureArticle
                      article={sec.items[1]}
                      orientation="vertical"
                      showBorder={false}
                      className="h-full flex flex-col justify-between"
                      onOpen={() => onOpenArticle(sec.items[1])}
                    />
                  </div>
                </div>
              )}

              {/* 5. 3 Articles Stacked Left (5 cols) + Horizontal Feature Right (7 cols) */}
              {sec.type === 'stack-left-feature-right' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                  <div className="lg:col-span-5 lg:border-r lg:border-theme-border lg:pr-8 flex flex-col justify-between h-full order-2 lg:order-1">
                    <div className="flex flex-col flex-grow justify-between divide-y divide-theme-border/60">
                      {sec.side.map((story, sIdx) => (
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
                  <div className="lg:col-span-7 flex flex-col justify-between h-full order-1 lg:order-2">
                    <FeatureArticle
                      article={sec.main}
                      orientation="horizontal"
                      showBorder={false}
                      className="h-full flex flex-col justify-between"
                      onOpen={() => onOpenArticle(sec.main)}
                    />
                  </div>
                </div>
              )}

              {/* 6. Trio Columns (33.3% each across 100%) */}
              {sec.type === 'trio-columns' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                  {sec.items.map((story) => (
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
