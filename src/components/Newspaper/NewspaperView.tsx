import React, { useMemo } from 'react';
import { Article } from '../../types';
import { HeroArticle } from '../ArticleCard/HeroArticle';
import { FeatureArticle } from '../ArticleCard/FeatureArticle';
import { TextArticle } from '../ArticleCard/TextArticle';
import { BannerArticle } from '../ArticleCard/BannerArticle';
import { QuarterBriefArticle } from '../ArticleCard/QuarterBriefArticle';
import { NewspaperSkeleton } from '../Common/NewspaperSkeleton';
import { EmptyState } from '../Common/EmptyState';
import { Flame, ShieldAlert, Cpu, Radio, Sparkles } from 'lucide-react';

interface NewspaperViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
}

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
  const criticalTags = ['zero-day', '0-day', 'ransomware', 'apt', 'critical', 'exploit', 'vulnerability', 'cve', 'cisa', 'remote code execution'];
  
  for (const tag of article.tags) {
    if (criticalTags.includes(tag.toLowerCase())) {
      score += 3;
    }
  }

  // Sources with high editorial weight
  const topSources = ['cisa-advisories', 'google-project-zero', 'the-hacker-news', 'cisco-talos', 'krebs-on-security'];
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
      // If importance difference is minor, maintain freshness
      if (Math.abs(impDiff) <= 1) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      return impDiff;
    });
  }, [articles]);

  // Lead story
  const heroStory = sortedStories[0];
  const sideHighlights = sortedStories.slice(1, 4);

  // Group the rest of articles into variable, asymmetric editorial rows
  const remaining = sortedStories.slice(4);

  // Helper to chunk remaining articles into varied editorial patterns
  const editorialSections = useMemo(() => {
    const sections: {
      type: 'full-banner' | 'duo-7-5' | 'quad-briefs' | 'half-and-half' | 'inverted-4-8' | 'trio-columns';
      items: Article[];
      title?: string;
      icon?: React.ReactNode;
    }[] = [];

    let index = 0;
    let patternCycle = 0;

    while (index < remaining.length) {
      const remainingCount = remaining.length - index;

      switch (patternCycle % 6) {
        case 0:
          // Pattern A: Full-Width Broadsheet Banner (Takes 100% width)
          sections.push({
            type: 'full-banner',
            items: [remaining[index]],
            title: 'Critical Threat Intelligence Briefing',
            icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
          });
          index += 1;
          break;

        case 1:
          // Pattern B: Asymmetric Duo (Takes 7/12 + 5/12 width)
          if (remainingCount >= 2) {
            sections.push({
              type: 'duo-7-5',
              items: remaining.slice(index, index + 2),
            });
            index += 2;
          } else {
            sections.push({ type: 'full-banner', items: [remaining[index]] });
            index += 1;
          }
          break;

        case 2:
          // Pattern C: Four 1/4 Width Columns (Takes 25% width each)
          if (remainingCount >= 4) {
            sections.push({
              type: 'quad-briefs',
              items: remaining.slice(index, index + 4),
              title: 'Telemetry & Rapid Dispatches',
              icon: <Radio className="w-4 h-4 text-theme-accent" />,
            });
            index += 4;
          } else if (remainingCount >= 2) {
            sections.push({
              type: 'half-and-half',
              items: remaining.slice(index, index + 2),
            });
            index += 2;
          } else {
            sections.push({ type: 'full-banner', items: [remaining[index]] });
            index += 1;
          }
          break;

        case 3:
          // Pattern D: Dual Half-Width Stories (Takes 50% width each)
          if (remainingCount >= 2) {
            sections.push({
              type: 'half-and-half',
              items: remaining.slice(index, index + 2),
              title: 'Exploit Research & Analysis',
              icon: <Cpu className="w-4 h-4 text-theme-accent" />,
            });
            index += 2;
          } else {
            sections.push({ type: 'full-banner', items: [remaining[index]] });
            index += 1;
          }
          break;

        case 4:
          // Pattern E: Inverted Asymmetric (Takes 4/12 + 8/12 width)
          if (remainingCount >= 2) {
            sections.push({
              type: 'inverted-4-8',
              items: remaining.slice(index, index + 2),
            });
            index += 2;
          } else {
            sections.push({ type: 'full-banner', items: [remaining[index]] });
            index += 1;
          }
          break;

        case 5:
          // Pattern F: Trio Columns (Takes 33% width each)
          if (remainingCount >= 3) {
            sections.push({
              type: 'trio-columns',
              items: remaining.slice(index, index + 3),
              title: 'Global Cybersecurity Dispatches',
              icon: <Sparkles className="w-4 h-4 text-amber-500" />,
            });
            index += 3;
          } else {
            sections.push({
              type: 'half-and-half',
              items: remaining.slice(index, index + remainingCount),
            });
            index += remainingCount;
          }
          break;
      }

      patternCycle++;
    }

    return sections;
  }, [remaining]);

  return (
    <div className="newspaper-container main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: THE FRONT PAGE LEAD (8 cols Hero + 4 cols Briefs)
          ───────────────────────────────────────────────────────────── */}
      <section className="newspaper-row mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Hero Story (Takes 2/3 of width) */}
          <div className="lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8">
            <HeroArticle article={heroStory} onOpen={() => onOpenArticle(heroStory)} />
          </div>

          {/* Right Column Briefs (Takes 1/3 of width) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-theme-accent">
              <Flame className="w-4 h-4 text-theme-accent" />
              <h3 className="font-mono text-xs font-black uppercase tracking-widest text-theme-text">
                TOP DEVELOPMENTS
              </h3>
            </div>

            {sideHighlights.map((story, idx) => (
              <div key={story.id}>
                {idx === 0 && story.image ? (
                  <FeatureArticle article={story} onOpen={() => onOpenArticle(story)} />
                ) : (
                  <TextArticle
                    article={story}
                    onOpen={() => onOpenArticle(story)}
                    showDivider={idx < sideHighlights.length - 1}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2+: FLOWING ASYMMETRIC EDITORIAL SECTIONS (Continuous variation)
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

              {/* 1. Full-Width Banner (100% width) */}
              {sec.type === 'full-banner' && sec.items[0] && (
                <div className="w-full">
                  <BannerArticle
                    article={sec.items[0]}
                    onOpen={() => onOpenArticle(sec.items[0])}
                  />
                </div>
              )}

              {/* 2. Asymmetric Duo (7/12 + 5/12 width) */}
              {sec.type === 'duo-7-5' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {sec.items[0] && (
                    <div className="lg:col-span-7 lg:border-r lg:border-theme-border lg:pr-8">
                      <FeatureArticle
                        article={sec.items[0]}
                        orientation="vertical"
                        onOpen={() => onOpenArticle(sec.items[0])}
                      />
                    </div>
                  )}
                  {sec.items[1] && (
                    <div className="lg:col-span-5">
                      <TextArticle
                        article={sec.items[1]}
                        onOpen={() => onOpenArticle(sec.items[1])}
                        showDivider={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 3. Four 1/4 Width Columns (25% width each) */}
              {sec.type === 'quad-briefs' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {sec.items.map((story) => (
                    <div key={story.id} className="h-full">
                      <QuarterBriefArticle
                        article={story}
                        onOpen={() => onOpenArticle(story)}
                        withImage={Boolean(story.image)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Dual Half-Width Stories (50% width each) */}
              {sec.type === 'half-and-half' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                  {sec.items[0] && (
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between">
                      <FeatureArticle
                        article={sec.items[0]}
                        orientation="vertical"
                        onOpen={() => onOpenArticle(sec.items[0])}
                      />
                    </div>
                  )}
                  {sec.items[1] && (
                    <div className="p-5 rounded-xl bg-theme-surface border border-theme-border flex flex-col justify-between">
                      {sec.items[1].image ? (
                        <FeatureArticle
                          article={sec.items[1]}
                          orientation="vertical"
                          onOpen={() => onOpenArticle(sec.items[1])}
                        />
                      ) : (
                        <TextArticle
                          article={sec.items[1]}
                          onOpen={() => onOpenArticle(sec.items[1])}
                          showDivider={false}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Inverted Asymmetric (4/12 + 8/12 width) */}
              {sec.type === 'inverted-4-8' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {sec.items[0] && (
                    <div className="lg:col-span-4 lg:border-r lg:border-theme-border lg:pr-8">
                      <TextArticle
                        article={sec.items[0]}
                        onOpen={() => onOpenArticle(sec.items[0])}
                        showDivider={false}
                      />
                    </div>
                  )}
                  {sec.items[1] && (
                    <div className="lg:col-span-8">
                      <FeatureArticle
                        article={sec.items[1]}
                        orientation="horizontal"
                        onOpen={() => onOpenArticle(sec.items[1])}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 6. Trio Columns (33% width each) */}
              {sec.type === 'trio-columns' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {sec.items.map((story) => (
                    <div
                      key={story.id}
                      className="p-4 rounded-lg bg-theme-surface border border-theme-border flex flex-col justify-between"
                    >
                      {story.image ? (
                        <FeatureArticle
                          article={story}
                          orientation="vertical"
                          onOpen={() => onOpenArticle(story)}
                        />
                      ) : (
                        <TextArticle
                          article={story}
                          onOpen={() => onOpenArticle(story)}
                          showDivider={false}
                        />
                      )}
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
