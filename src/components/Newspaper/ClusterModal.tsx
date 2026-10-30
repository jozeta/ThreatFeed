import React from 'react';
import { Article, StoryCluster } from '../../types';
import { X, ExternalLink, Layers, Shield, Clock, BookOpen } from 'lucide-react';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, CveChip } from '../Common/ThreatBadges';
import { EntityText } from '../EntityText';

interface ClusterModalProps {
  cluster: StoryCluster | null;
  onClose: () => void;
  onOpenArticle: (article: Article) => void;
}

export const ClusterModal: React.FC<ClusterModalProps> = ({
  cluster,
  onClose,
  onOpenArticle,
}) => {
  if (!cluster) return null;

  const allArticles = [cluster.primaryArticle, ...cluster.relatedArticles];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div
        className="glass-modal rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-theme-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between bg-theme-surface/70">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-theme-accent/15 text-theme-accent">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-theme-text">
                Multi-Source Story Coverage
              </h3>
              <p className="font-mono text-xs text-theme-text-muted">
                Grouped reporting across {allArticles.length} independent publishers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-theme-text-muted hover:text-theme-text hover:bg-theme-surface transition-colors"
            title="Close coverage modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-grow">
          {/* Lead Story Summary Card */}
          <div className="p-4 rounded-lg bg-theme-surface border border-theme-accent/30 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-mono">
              <span className="font-bold text-theme-accent uppercase tracking-wider">
                Lead Story · {cluster.primaryArticle.sourceName}
              </span>
              <SeverityBadge
                severity={cluster.primaryArticle.severity}
                score={cluster.primaryArticle.severityScore}
                showScore
              />
            </div>
            <h4
              onClick={() => {
                onClose();
                onOpenArticle(cluster.primaryArticle);
              }}
              className="font-serif text-lg font-bold text-theme-text hover:text-theme-accent cursor-pointer transition-colors"
            >
              {cluster.primaryArticle.title}
            </h4>
            {cluster.primaryArticle.description && (
              <p className="font-sans text-xs text-theme-text-muted line-clamp-3">
                <EntityText text={cluster.primaryArticle.description} context={cluster.primaryArticle.title} />
              </p>
            )}
            <div className="pt-2 flex items-center justify-between text-xs font-mono text-theme-text-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(cluster.primaryArticle.publishedAt)}
              </span>
              <button
                onClick={() => {
                  onClose();
                  onOpenArticle(cluster.primaryArticle);
                }}
                className="inline-flex items-center gap-1 text-theme-accent hover:underline font-semibold"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Read Full Story</span>
              </button>
            </div>
          </div>

          {/* Shared Disclosed CVEs */}
          {cluster.sharedCVEs && cluster.sharedCVEs.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-theme-text-muted flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-rose-500" />
                Shared Disclosed Vulnerabilities:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {cluster.sharedCVEs.map((cve) => (
                  <CveChip key={cve} cve={cve} />
                ))}
              </div>
            </div>
          )}

          {/* Related Coverage from Other Sources */}
          <div className="space-y-3">
            <h5 className="font-mono text-xs font-bold uppercase tracking-wider text-theme-text-muted">
              Related Coverage ({cluster.relatedArticles.length} additional sources)
            </h5>

            <div className="space-y-2">
              {cluster.relatedArticles.map((article) => (
                <div
                  key={article.id}
                  className="p-3.5 rounded-lg bg-theme-surface/70 border border-theme-border hover:border-theme-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-grow space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                      <span className="font-semibold text-theme-accent">
                        {article.sourceName}
                      </span>
                      <span className="text-theme-border">·</span>
                      <span className="text-theme-text-muted">
                        {formatRelativeTime(article.publishedAt)}
                      </span>
                      {article.severity && article.severity !== 'info' && (
                        <SeverityBadge severity={article.severity} />
                      )}
                    </div>
                    <h6
                      onClick={() => {
                        onClose();
                        onOpenArticle(article);
                      }}
                      className="font-serif text-sm font-medium text-theme-text hover:text-theme-accent cursor-pointer transition-colors"
                    >
                      {article.title}
                    </h6>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenArticle(article);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-mono bg-theme-card hover:bg-theme-accent hover:text-white border border-theme-border transition-colors flex items-center gap-1"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Read</span>
                    </button>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-card transition-colors"
                      title="Open source website in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-theme-border bg-theme-surface/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-mono text-xs font-semibold bg-theme-border hover:bg-theme-border/80 text-theme-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
