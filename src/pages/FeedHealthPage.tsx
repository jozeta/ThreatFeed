import React from 'react';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { formatRelativeTime } from '../utils/date';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Info,
  Sliders
} from 'lucide-react';

interface FeedHealthPageProps {
  onOpenSettings: () => void;
}

export const FeedHealthPage: React.FC<FeedHealthPageProps> = ({ onOpenSettings }) => {
  const { feeds, feedHealth, refreshFeeds, isRefreshing, toggleFeedEnabled } = useFeeds();
  const { settings } = useSettings();

  const totalFeeds = feeds.length;
  const healthyCount = Object.values(feedHealth).filter((h) => h.status === 'healthy').length;
  const corsCount = Object.values(feedHealth).filter((h) => h.status === 'cors_error').length;
  const otherErrorsCount = Object.values(feedHealth).filter(
    (h) => h.status !== 'healthy' && h.status !== 'cors_error'
  ).length;

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Healthy</span>
          </span>
        );
      case 'cors_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>CORS Restriction</span>
          </span>
        );
      case 'invalid_xml':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            <span>Invalid XML</span>
          </span>
        );
      case 'timeout':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Clock className="w-3.5 h-3.5" />
            <span>Timeout</span>
          </span>
        );
      case 'http_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            <span>HTTP Error</span>
          </span>
        );
      case 'network_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            <span>Network Error</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono text-theme-text-muted bg-theme-card border border-theme-border">
            <span>Pending Check</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-theme-accent" />
            <span>Feed Health & Telemetry</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            Real-time feed reachability, CORS verification, and XML ingestion telemetry.
          </p>
        </div>

        <button
          onClick={() => refreshFeeds()}
          disabled={isRefreshing}
          className="px-4 py-2 rounded bg-theme-accent text-white hover:bg-theme-accent-hover font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Testing Feeds...' : 'Test All Feeds'}</span>
        </button>
      </div>

      {/* Telemetry Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
          <span className="font-mono text-xs text-theme-text-muted uppercase">Total Feeds</span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">{totalFeeds}</p>
        </div>

        <div className="p-4 rounded-lg bg-theme-surface border border-emerald-500/30">
          <span className="font-mono text-xs text-emerald-500 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Healthy
          </span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">{healthyCount}</p>
        </div>

        <div className="p-4 rounded-lg bg-theme-surface border border-amber-500/30">
          <span className="font-mono text-xs text-amber-500 uppercase flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            CORS Restricted
          </span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">{corsCount}</p>
        </div>

        <div className="p-4 rounded-lg bg-theme-surface border border-rose-500/30">
          <span className="font-mono text-xs text-rose-500 uppercase flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            Failed / Malformed
          </span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">{otherErrorsCount}</p>
        </div>
      </div>

      {/* Client-Side Architecture & CORS Explanation Banner */}
      <div className="mb-8 p-4 rounded-lg bg-theme-card border border-theme-border flex items-start gap-3">
        <Info className="w-5 h-5 text-theme-accent flex-shrink-0 mt-0.5" />
        <div className="text-xs font-mono space-y-1 text-theme-text-muted">
          <p className="text-theme-text font-bold">Client-Only Architecture & CORS Note:</p>
          <p>
            ThreatFeed operates strictly client-side inside your browser with no backend server. Certain third-party servers restrict direct browser fetches by not serving `Access-Control-Allow-Origin: *`.
          </p>
          <div className="pt-1 flex items-center gap-3">
            <span>Current Fetch Mode: <strong className="text-theme-text uppercase">{settings.proxyMode}</strong></span>
            <button
              onClick={onOpenSettings}
              className="text-theme-accent underline hover:text-theme-accent-hover font-bold flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>Change Mode in Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feeds Health Table */}
      <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-theme-card/70 border-b border-theme-border text-theme-text-muted uppercase tracking-wider">
                <th className="py-3 px-4">Feed Source</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Articles</th>
                <th className="py-3 px-4">Last Ingestion</th>
                <th className="py-3 px-4">Diagnostics</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border/60">
              {feeds.map((feed) => {
                const health = feedHealth[feed.id];

                return (
                  <tr key={feed.id} className="hover:bg-theme-card/30 transition-colors">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-serif font-bold text-sm text-theme-text">
                        {feed.name}
                      </div>
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-theme-text-muted hover:underline flex items-center gap-1 truncate max-w-xs mt-0.5"
                      >
                        <span className="truncate">{feed.url}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {getStatusBadge(health?.status)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-theme-text font-semibold">
                      {health?.articleCount !== undefined ? `${health.articleCount} items` : '—'}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-theme-text-muted">
                      {health?.lastFetchedAt
                        ? formatRelativeTime(health.lastFetchedAt)
                        : 'Never'}
                    </td>

                    <td className="py-3 px-4 text-theme-text-muted max-w-xs">
                      {health?.errorMessage ? (
                        <span className="text-amber-500/90 truncate block" title={health.errorMessage}>
                          {health.errorMessage}
                        </span>
                      ) : health?.status === 'healthy' ? (
                        <span className="text-emerald-500">Ingestion OK</span>
                      ) : (
                        <span>Ready</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => refreshFeeds(feed.id)}
                          disabled={isRefreshing}
                          title="Retry fetch for this feed"
                          className="px-2.5 py-1 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                        <button
                          onClick={() => toggleFeedEnabled(feed.id)}
                          title={feed.enabled ? 'Disable feed' : 'Enable feed'}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            feed.enabled
                              ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                          }`}
                        >
                          {feed.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
