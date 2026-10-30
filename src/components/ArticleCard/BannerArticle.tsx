import React, { useMemo } from 'react';
import { EntityText } from '../EntityText';
import { TagChip } from '../TagChip';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { useSettings } from '../../context/SettingsContext';
import { SeverityBadge, WatchlistBadge, CveChip, ClusterPill, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { AlertCircle, Zap } from 'lucide-react';

interface BannerArticleProps {
  article: Article;
  onOpen: () => void;
  clusterCount?: number;
  clusterSources?: string[];
  onOpenCluster?: () => void;
}

export const BannerArticle: React.FC<BannerArticleProps> = ({
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

  const isBreaking = article.tags.some(t => 
    ['zero-day', '0-day', 'cve', 'ransomware', 'exploit', 'critical'].includes(t.toLowerCase())
  );

  const headlineClass = {
    normal: 'text-2xl lg:text-3xl font-bold',
    prominent: 'text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight',
    dramatic: 'text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-tight',
  }[settings.headlineScale];

  return (
    <article
      onClick={onOpen}
      className={`lift group cursor-pointer w-full p-5 sm:p-7 rounded-xl bg-theme-surface border border-theme-border hover:border-theme-accent/60 transition-all duration-200 ${
        article.read ? 'opacity-85' : 'opacity-100 shadow-md'
      }`}
    >
      <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-theme-border/60">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={article.severity} score={article.severityScore} />
          <StackBadge article={article} />
          {watchlistMatch.matched && (
            <WatchlistBadge terms={watchlistMatch.matchedTerms} />
          )}
          {isBreaking ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/30">
              <Zap className="w-3 h-3 fill-rose-500" />
              SPECIAL DISPATCH
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-wider text-theme-accent">
              <AlertCircle className="w-3.5 h-3.5" />
              FEATURED REPORT
            </span>
          )}
          <span className="font-mono text-xs font-semibold text-theme-text-muted">
            {article.sourceName}
          </span>
        </div>

        <time className="font-mono text-xs text-theme-text-muted">
          {formatRelativeTime(article.publishedAt)}
        </time>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Wide cinematic image */}
        {article.image && (
          <div className="lg:col-span-6 rounded-lg overflow-hidden border border-theme-border/50">
            <ArticleImage
              src={article.image}
              alt={article.title}
              sourceName={article.sourceName}
              category={article.categories[0] || 'Security'}
              aspectClass="aspect-[16/10] max-h-[380px]"
            />
          </div>
        )}

        {/* Right / Center: Big Headline & Summary */}
        <div className={`${article.image ? 'lg:col-span-6' : 'lg:col-span-12'} flex flex-col justify-between`}>
          <div>
            <h2 className={`font-serif text-theme-text group-hover:text-theme-accent transition-colors mb-3.5 ${headlineClass}`}>
              {article.title}
            </h2>

            {article.description && (
              <p className="font-serif text-base sm:text-lg text-theme-text/90 leading-relaxed mb-4 line-clamp-3 sm:line-clamp-4">
                <EntityText text={article.description} context={article.title} />
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-theme-border/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {article.tags.slice(0, 3).map((tag) => (
                <TagChip
                  key={tag}
                  tag={tag}
                  className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-theme-card text-theme-text-muted border border-theme-border hover:text-theme-accent"
                >
                  #{tag}
                </TagChip>
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
        </div>
      </div>
    </article>
  );
};
