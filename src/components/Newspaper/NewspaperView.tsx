import React from 'react';
import { Article } from '../../types';
import { HeroArticle } from '../ArticleCard/HeroArticle';
import { FeatureArticle } from '../ArticleCard/FeatureArticle';
import { TextArticle } from '../ArticleCard/TextArticle';
import { NewspaperSkeleton } from '../Common/NewspaperSkeleton';
import { EmptyState } from '../Common/EmptyState';
import { AlertCircle, Flame, ShieldAlert, Cpu } from 'lucide-react';

interface NewspaperViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
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

  // Segment articles into editorial hierarchy
  // Top Story: Highest priority article with an image (or simply the newest)
  const heroIndex = articles.findIndex((a) => a.image) !== -1 ? articles.findIndex((a) => a.image) : 0;
  const heroStory = articles[heroIndex];

  // Remaining articles
  const remaining = articles.filter((_, idx) => idx !== heroIndex);

  // Secondary highlights (next 3-4 articles)
  const secondaryHighlights = remaining.slice(0, 3);
  
  // Section 1: Vulnerability & Exploit research
  const vulnArticles = remaining.slice(3, 7);

  // Section 2: Threat Intel & Malware reports
  const threatArticles = remaining.slice(7, 13);

  // Section 3: The Newsroom Stream (remaining long-tail articles)
  const streamArticles = remaining.slice(13);

  return (
    <div className="newspaper-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: FRONT PAGE LEAD & TOP INTELLIGENCE
          ───────────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Hero Story */}
          <div className="lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8">
            <HeroArticle article={heroStory} onOpen={() => onOpenArticle(heroStory)} />
          </div>

          {/* Right Editorial Column: Fast Briefs & Secondary Feature */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-theme-accent">
              <Flame className="w-4 h-4 text-theme-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-theme-text">
                TOP INTELLIGENCE
              </h3>
            </div>

            {secondaryHighlights.map((story, idx) => (
              <div key={story.id}>
                {idx === 0 && story.image ? (
                  <FeatureArticle article={story} onOpen={() => onOpenArticle(story)} />
                ) : (
                  <TextArticle
                    article={story}
                    onOpen={() => onOpenArticle(story)}
                    showDivider={idx < secondaryHighlights.length - 1}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: CRITICAL ALERTS & ZERO-DAY DISCLOSURES
          ───────────────────────────────────────────────────────────── */}
      {vulnArticles.length > 0 && (
        <section className="mb-12 pt-6 border-t-2 border-theme-border">
          {/* Editorial Section Header */}
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-theme-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-theme-text tracking-tight">
                Vulnerabilities & Zero-Day Disclosures
              </h2>
            </div>
            <span className="font-mono text-xs text-theme-text-muted hidden sm:inline">
              DISPATCHES · EXPLOIT RESEARCH
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {vulnArticles.map((story) => (
              <div
                key={story.id}
                className="flex flex-col border-b md:border-b-0 md:border-r border-theme-border/60 pb-5 md:pb-0 md:pr-5 last:border-r-0 last:pr-0"
              >
                {story.image ? (
                  <FeatureArticle article={story} onOpen={() => onOpenArticle(story)} />
                ) : (
                  <TextArticle article={story} onOpen={() => onOpenArticle(story)} showDivider={false} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: THREAT ACTORS & MALWARE INVESTIGATIONS
          ───────────────────────────────────────────────────────────── */}
      {threatArticles.length > 0 && (
        <section className="mb-12 pt-6 border-t-2 border-theme-border">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-theme-border">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-theme-accent" />
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-theme-text tracking-tight">
                Threat Actors & Malware Campaigns
              </h2>
            </div>
            <span className="font-mono text-xs text-theme-text-muted hidden sm:inline">
              DEEP ANALYSIS · TELEMETRY
            </span>
          </div>

          {/* Asymmetric Editorial Composition: 1 large horizontal + 2 columns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-6">
            {threatArticles[0] && (
              <div className="lg:col-span-7">
                <FeatureArticle
                  article={threatArticles[0]}
                  orientation="horizontal"
                  onOpen={() => onOpenArticle(threatArticles[0])}
                />
              </div>
            )}
            {threatArticles[1] && (
              <div className="lg:col-span-5">
                <TextArticle
                  article={threatArticles[1]}
                  onOpen={() => onOpenArticle(threatArticles[1])}
                />
              </div>
            )}
          </div>

          {/* Flowing columns for remaining */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {threatArticles.slice(2).map((story) => (
              <div
                key={story.id}
                className="flex flex-col border-b md:border-b-0 md:border-r border-theme-border/60 pb-5 md:pb-0 md:pr-5 last:border-r-0 last:pr-0"
              >
                <TextArticle article={story} onOpen={() => onOpenArticle(story)} showDivider={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: THE SECURITY DISPATCH STREAM (Long-tail articles)
          ───────────────────────────────────────────────────────────── */}
      {streamArticles.length > 0 && (
        <section className="pt-6 border-t-2 border-theme-border">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-theme-border">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-theme-accent" />
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-theme-text tracking-tight">
                Security News Stream
              </h2>
            </div>
            <span className="font-mono text-xs text-theme-text-muted">
              {streamArticles.length} ADDITIONAL REPORTS
            </span>
          </div>

          {/* Masonry-like multi-column flow */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {streamArticles.map((story) => (
              <div
                key={story.id}
                className="p-4 rounded border border-theme-border bg-theme-surface hover:border-theme-accent/50 transition-colors"
              >
                {story.image ? (
                  <FeatureArticle article={story} onOpen={() => onOpenArticle(story)} />
                ) : (
                  <TextArticle article={story} onOpen={() => onOpenArticle(story)} showDivider={false} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
