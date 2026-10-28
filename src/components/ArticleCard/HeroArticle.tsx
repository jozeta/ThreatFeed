import React, { useMemo } from 'react';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { useSettings } from '../../context/SettingsContext';
import { SeverityBadge, WatchlistBadge, CveChip, ClusterPill, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { Shield } from 'lucide-react';

interface HeroArticleProps {
  article: Article;
  onOpen: () => void;
  clusterCount?: number;
  clusterSources?: string[];
  onOpenCluster?: () => void;
}

export const HeroArticle: React.FC<HeroArticleProps> = ({
  article,
  onOpen,
  clusterCount = 1,
  clusterSources = [],
  onOpenCluster
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );

  const headlineClass = {
    normal: 'text-2xl lg:text-3xl font-bold',
    prominent: 'text-3xl lg:text-4xl xl:text-5xl font-extrabold tracking-tight',
    dramatic: 'text-4xl lg:text-5xl xl:text-6xl font-black tracking-tighter leading-[1.08]',
  }[settings.headlineScale];

  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex flex-col transition-all duration-200 border-b border-theme-border pb-6 mb-6 ${
        article.read ? 'opacity-85' : 'opacity-100'
      }`}
    >
      {/* Editorial Category & Freshness Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-theme-border/60">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={article.severity} score={article.severityScore} />
          <StackBadge article={article} />
          {watchlistMatch.matched && (
            <WatchlistBadge terms={watchlistMatch.matchedTerms} />
          )}
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold tracking-widest text-theme-accent uppercase">
            <Shield className="w-3 h-3" />
            LEAD STORY · {article.sourceName}
          </span>
          {article.bookmarked && (
            <span className="bg-theme-accent-subtle text-theme-accent text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
              BOOKMARKED
            </span>
          )}
          {!article.read && (
            <span className="w-2 h-2 rounded-full bg-theme-accent animate-pulse" />
          )}
        </div>
        <time className="font-mono text-xs text-theme-text-muted">
          {formatRelativeTime(article.publishedAt)}
        </time>
      </div>

      {/* Hero Headline */}
      <h2
        className={`font-serif text-theme-text group-hover:text-theme-accent transition-colors mb-3 ${headlineClass}`}
      >
        {article.title}
      </h2>

      {/* Large Featured Image */}
      <div className="mb-4 rounded-sm overflow-hidden border border-theme-border/50">
        <ArticleImage
          src={article.image}
          alt={article.title}
          sourceName={article.sourceName}
          category={article.categories[0] || 'Security'}
          aspectClass="aspect-[16/9] sm:aspect-[21/9] max-h-[460px]"
        />
      </div>

      {/* Subtitle / Excerpt */}
      {article.description && (
        <p className="font-serif text-base lg:text-lg text-theme-text/90 leading-relaxed mb-4 line-clamp-3">
          {article.description}
        </p>
      )}

      {/* Footer: Tags, Author & Interactive Actions */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {article.author && (
            <span className="text-xs font-mono text-theme-text-muted mr-2">
              By <span className="text-theme-text font-medium">{article.author}</span>
            </span>
          )}
          {article.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-theme-card text-theme-text-muted border border-theme-border/60 hover:border-theme-accent hover:text-theme-accent transition-colors"
            >
              #{tag}
            </span>
          ))}
          {article.cves && article.cves.slice(0, 3).map((cve) => (
            <CveChip key={cve} cve={cve} />
          ))}
          {clusterCount > 1 && (
            <ClusterPill
              count={clusterCount}
              sources={clusterSources}
              onClick={onOpenCluster}
            />
          )}
        </div>

        <ArticleActions article={article} onOpenReader={onOpen} />
      </div>
    </article>
  );
};
