import React, { useState, useMemo, useEffect } from 'react';
import { describeUpdateSource } from '../services/rss/updateSource';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { formatRelativeTime, formatFullDateTime } from '../utils/date';
import { Feed, ProxyMode } from '../types';
import { pingGateway, testFeedGateway, GatewayProbeResult, FeedDiagnosticResult } from '../services/rss/fetcher';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Sliders,
  Zap,
  Copy,
  Check,
  Terminal,
  Bug,
  Search,
  Globe,
  ChevronRight,
  ChevronsUpDown,
  Calendar,
  ArrowUpRight,
  FileText,
  Filter,
  Workflow
} from 'lucide-react';

interface FeedHealthPageProps {
  onOpenSettings: () => void;
}

export const FeedHealthPage: React.FC<FeedHealthPageProps> = ({ onOpenSettings }) => {
  const {
    feeds,
    articles,
    feedHealth,
    refreshFeeds,
    refreshFailedFeeds,
    isRefreshing,
    refreshProgress,
    toggleFeedEnabled,
    snapshotGeneratedAt,
    dataSources
  } = useFeeds();

  const { settings, updateSettings } = useSettings();

  // Re-render every 30s so "updated X ago" stays current while the page is open
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const snapshotFeedCount = Object.values(feedHealth).filter((h) => h.gatewayUsed === 'snapshot').length;
  const snapshotAgeMin = snapshotGeneratedAt ? (Date.now() - new Date(snapshotGeneratedAt).getTime()) / 60000 : null;

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'failed' | 'cors' | 'timeout' | 'unreachable'>('all');

  // Accordion expanded feeds state
  const [expandedFeedIds, setExpandedFeedIds] = useState<Set<string>>(new Set());

  const toggleExpandFeed = (feedId: string) => {
    setExpandedFeedIds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) {
        next.delete(feedId);
      } else {
        next.add(feedId);
      }
      return next;
    });
  };

  // Group articles by sourceId for O(1) instant lookup of 5 latest items
  const feedArticlesMap = useMemo(() => {
    const map = new Map<string, typeof articles>();
    for (const a of articles) {
      const list = map.get(a.sourceId) || [];
      list.push(a);
      map.set(a.sourceId, list);
    }
    map.forEach((list) => {
      list.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    });
    return map;
  }, [articles]);

  // Diagnostics modal state
  const [debugFeed, setDebugFeed] = useState<Feed | null>(null);
  const [probeResult, setProbeResult] = useState<FeedDiagnosticResult | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Gateway Ping / Benchmark state
  const [isPingingGateways, setIsPingingGateways] = useState(false);
  const [gatewayPings, setGatewayPings] = useState<Record<string, GatewayProbeResult>>({});
  const [copiedReport, setCopiedReport] = useState(false);

  // Metric counts
  const totalFeeds = feeds.length;
  const healthyCount = Object.values(feedHealth).filter((h) => h.status === 'healthy').length;
  const corsCount = Object.values(feedHealth).filter((h) => h.status === 'cors_error').length;
  const timeoutCount = Object.values(feedHealth).filter((h) => h.status === 'timeout').length;
  const unreachableCount = Object.values(feedHealth).filter((h) => h.status === 'proxy_unreachable').length;
  const failedCount = Object.values(feedHealth).filter(
    (h) => h.status !== 'healthy' && h.status !== 'cors_error'
  ).length;

  // Average latency
  const avgLatency = useMemo(() => {
    const latencies = Object.values(feedHealth)
      .map((h) => h.latencyMs)
      .filter((l): l is number => typeof l === 'number' && l > 0);
    if (latencies.length === 0) return null;
    const sum = latencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / latencies.length);
  }, [feedHealth]);

  // Filtered feeds list
  const filteredFeeds = useMemo(() => {
    return feeds.filter((feed) => {
      const health = feedHealth[feed.id];

      // Status filter
      if (statusFilter === 'healthy' && health?.status !== 'healthy') return false;
      if (statusFilter === 'cors' && health?.status !== 'cors_error') return false;
      if (statusFilter === 'timeout' && health?.status !== 'timeout') return false;
      if (statusFilter === 'unreachable' && health?.status !== 'proxy_unreachable') return false;
      if (statusFilter === 'failed' && (!health || health.status === 'healthy')) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = feed.name.toLowerCase().includes(q);
        const matchesUrl = feed.url.toLowerCase().includes(q);
        const matchesCat = feed.category?.toLowerCase().includes(q);
        if (!matchesName && !matchesUrl && !matchesCat) return false;
      }

      return true;
    });
  }, [feeds, feedHealth, statusFilter, searchQuery]);

  // Gateway Benchmark runner
  const handleBenchmarkGateways = async () => {
    setIsPingingGateways(true);
    const modes: ProxyMode[] = ['corsfix', 'rss2json', 'allorigins', 'direct'];
    const results: Record<string, GatewayProbeResult> = {};

    for (const mode of modes) {
      try {
        const res = await pingGateway(mode, settings.customProxyUrl);
        results[mode] = res;
      } catch (err: any) {
        results[mode] = { alive: false, latencyMs: 0, status: 0, error: err.message };
      }
    }

    setGatewayPings(results);
    setIsPingingGateways(false);
  };

  // Copy full diagnostics markdown report to clipboard
  const handleCopyDiagnosticsReport = () => {
    const lines: string[] = [];
    lines.push('# ThreatFeed Telemetry & Diagnostics Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Current Active Gateway: ${settings.proxyMode.toUpperCase()}`);
    lines.push(`Total Feeds: ${totalFeeds} | Healthy: ${healthyCount} | CORS Restricted: ${corsCount} | Failed/Timeout: ${failedCount}`);
    if (avgLatency) lines.push(`Average Latency: ${avgLatency}ms`);
    lines.push('');

    lines.push('## Gateway Benchmarks');
    if (Object.keys(gatewayPings).length > 0) {
      lines.push('| Gateway | Status | Latency | HTTP | Notes |');
      lines.push('|---|---|---|---|---|');
      for (const [gw, r] of Object.entries(gatewayPings)) {
        lines.push(`| ${gw} | ${r.alive ? 'ONLINE' : 'DOWN'} | ${r.latencyMs}ms | ${r.status || '—'} | ${r.error || 'OK'} |`);
      }
    } else {
      lines.push('*(Run Gateway Benchmark to probe live latency)*');
    }
    lines.push('');

    lines.push('## Problematic Feeds Summary');
    const failing = feeds.filter(f => feedHealth[f.id] && feedHealth[f.id].status !== 'healthy');
    if (failing.length === 0) {
      lines.push('All enabled feeds are healthy!');
    } else {
      lines.push('| Feed Name | Status | Last Fetched | Updated Via | Latency | Diagnostic Error | URL |');
      lines.push('|---|---|---|---|---|---|---|');
      failing.forEach(f => {
        const h = feedHealth[f.id];
        lines.push(`| ${f.name} | ${h?.status || 'Unknown'} | ${h?.lastFetchedAt ? formatRelativeTime(h.lastFetchedAt) : 'Never'} | ${h?.gatewayUsed ? describeUpdateSource(h.gatewayUsed).label : '—'} | ${h?.latencyMs ? `${h.latencyMs}ms` : '—'} | ${h?.errorMessage || '—'} | ${f.url} |`);
      });
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // Live probe single gateway on feed
  const runFeedProbe = async (gateway: ProxyMode) => {
    if (!debugFeed) return;
    setIsProbing(true);
    setProbeResult(null);
    try {
      const res = await testFeedGateway(
        debugFeed,
        gateway,
        settings.customProxyUrl,
        settings.maxArticlesPerFeed ?? 25,
        settings.maxArticleAgeDays ?? 30
      );
      setProbeResult(res);
    } catch (e: any) {
      setProbeResult({
        ok: false,
        gateway,
        status: 0,
        latencyMs: 0,
        articleCount: 0,
        rawSnippet: '',
        errorMessage: e.message || 'Probe execution failed'
      });
    } finally {
      setIsProbing(false);
    }
  };

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
      case 'proxy_unreachable':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Globe className="w-3.5 h-3.5" />
            <span>Proxy Can't Reach Site</span>
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
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Title & Main Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-theme-accent" />
            <span>Feed Health & Telemetry</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            Real-time feed reachability, multi-gateway latency telemetry, and interactive diagnostic debugging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleBenchmarkGateways}
            disabled={isPingingGateways}
            title="Probe all CORS gateways to test live latency & availability"
            className="px-3.5 py-2 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-text font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${isPingingGateways ? 'animate-pulse' : ''}`} />
            <span>{isPingingGateways ? 'Pinging...' : 'Benchmark Gateways'}</span>
          </button>

          {failedCount > 0 && (
            <button
              onClick={() => refreshFailedFeeds()}
              disabled={isRefreshing}
              title="Only retry feeds that timed out or failed"
              className="px-3.5 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Retry {failedCount} Failed Feeds</span>
            </button>
          )}

          <button
            onClick={handleCopyDiagnosticsReport}
            title="Copy markdown diagnostic summary to clipboard"
            className="px-3.5 py-2 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-text font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            {copiedReport ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Report Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-theme-text-muted" />
                <span>Copy Report</span>
              </>
            )}
          </button>

          <button
            onClick={() => refreshFeeds()}
            disabled={isRefreshing}
            className="px-4 py-2 rounded bg-theme-accent text-white hover:bg-theme-accent-hover font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Testing Feeds...' : 'Test All Feeds'}</span>
          </button>
        </div>
      </div>

      {/* Live Refresh Progress Bar */}
      {isRefreshing && (
        <div className="p-3.5 rounded-lg bg-theme-card border border-theme-accent/40 shadow-sm animate-pulse">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-theme-accent font-bold flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Ingesting: {refreshProgress.currentFeedName || 'Connecting to feeds...'}
            </span>
            <span className="text-theme-text-muted">
              {refreshProgress.completed} / {refreshProgress.total} completed ({Math.round((refreshProgress.completed / Math.max(refreshProgress.total, 1)) * 100)}%)
            </span>
          </div>
          <div className="w-full bg-theme-surface h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-theme-accent h-full transition-all duration-200"
              style={{ width: `${(refreshProgress.completed / Math.max(refreshProgress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Server snapshot status: how the default feeds are kept up to date */}
      <div className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3 ${
        snapshotAgeMin !== null && snapshotAgeMin > 90 ? 'bg-amber-500/5 border-amber-500/30' : 'bg-theme-surface border-theme-border'
      }`}>
        <Workflow className="w-6 h-6 text-theme-accent flex-shrink-0" />
        {snapshotGeneratedAt && settings.dataSource !== 'live' ? (
          <div className="text-xs font-mono space-y-0.5">
            <p className="text-theme-text">
              <span className="font-bold">Server snapshot</span> built{' '}
              <span title={formatFullDateTime(snapshotGeneratedAt)} className="font-bold text-theme-accent cursor-help">{formatRelativeTime(snapshotGeneratedAt)}</span>{' '}
              by the GitHub Action · covers {snapshotFeedCount} feed{snapshotFeedCount === 1 ? '' : 's'}
            </p>
            <p className="text-theme-text-muted font-serif">
              Rebuilt every 30 minutes (GitHub may start runs a few minutes late)
              {snapshotAgeMin !== null && snapshotAgeMin > 90
                ? '. This snapshot is older than expected: check the "Deploy to GitHub Pages" workflow runs on GitHub.'
                : `; the next one is due ${snapshotAgeMin !== null && snapshotAgeMin < 30 ? `in about ${Math.max(1, Math.round(30 - snapshotAgeMin))} min` : 'any minute'}.`}
              {' '}Feeds not in the snapshot (ones you added) are fetched live through the {settings.proxyMode} gateway.
            </p>
          </div>
        ) : (
          <p className="text-xs font-serif text-theme-text-muted">
            {settings.dataSource === 'live'
              ? 'Data source is set to "Live only": every feed is fetched in your browser through the CORS gateway. Switch to the server snapshot in Settings → Data Source.'
              : 'No server snapshot loaded (local development builds have none unless you run "npm run snapshot"): feeds are fetched live through the CORS gateway.'}
          </p>
        )}
      </div>

      {/* External data sources used by the snapshot (KEV, NVD, EPSS, GitHub, Ransomware.live, HIBP) */}
      {dataSources.length > 0 && settings.dataSource !== 'live' && (
        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border space-y-2">
          <p className="text-xs font-mono font-bold text-theme-text uppercase tracking-wider">
            Data sources in the last snapshot
            <span className="ml-2 font-normal normal-case tracking-normal text-theme-text-muted">
              {dataSources.filter((d) => d.status === 'ok').length}/{dataSources.length} fetched
            </span>
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono">
            {dataSources.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-1px] ${d.status === 'ok' ? 'bg-emerald-500' : d.status === 'cached' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <span className="text-theme-text">{d.label}</span>
                <span className={d.status === 'ok' ? 'text-theme-text-muted' : d.status === 'cached' ? 'text-amber-500' : 'text-rose-500'}>
                  {d.status === 'ok' ? (d.count !== undefined ? d.count.toLocaleString() : 'ok') : d.status === 'cached' ? 'reused previous data' : 'failed'}
                </span>
                {d.detail && <span className="text-theme-text-muted truncate" title={d.detail}>· {d.detail}</span>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] font-serif text-theme-text-muted">A failed source means that part of the data is missing or older until a later run succeeds; the rest of the snapshot is unaffected.</p>
        </div>
      )}

      {/* Telemetry Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <Clock className="w-3.5 h-3.5" />
            Timeout / Failed
          </span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">{failedCount}</p>
        </div>

        <div className="p-4 rounded-lg bg-theme-surface border border-theme-border col-span-2 md:col-span-1">
          <span className="font-mono text-xs text-theme-text-muted uppercase flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Avg Latency
          </span>
          <p className="font-serif text-2xl font-bold text-theme-text mt-1">
            {avgLatency !== null ? `${avgLatency}ms` : '—'}
          </p>
        </div>
      </div>

      {/* Gateway Telemetry & Quick Switcher Console */}
      <div className="p-4 rounded-xl bg-theme-surface border border-theme-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-theme-accent" />
            <h3 className="font-serif font-bold text-sm text-theme-text">Gateway Telemetry & Switcher</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-theme-card border border-theme-border text-theme-text-muted">
              Active: <strong className="text-theme-text uppercase">{settings.proxyMode}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBenchmarkGateways}
              disabled={isPingingGateways}
              className="text-xs font-mono text-theme-accent hover:underline flex items-center gap-1 font-bold"
            >
              <Zap className="w-3 h-3" />
              <span>Probe Latency</span>
            </button>
            <span className="text-theme-border">|</span>
            <button
              onClick={onOpenSettings}
              className="text-xs font-mono text-theme-text-muted hover:text-theme-text flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>Proxy Settings</span>
            </button>
          </div>
        </div>

        {/* 4 Gateway Cards with One-Click Activation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'corsfix' as ProxyMode,
              name: 'CORSFix Gateway',
              endpoint: 'proxy.corsfix.com',
              badge: 'Recommended',
              desc: 'High-speed browser CORS proxy with automated failover'
            },
            {
              id: 'rss2json' as ProxyMode,
              name: 'RSS2JSON API',
              endpoint: 'api.rss2json.com',
              desc: 'Structured JSON converter for standard RSS/Atom feeds'
            },
            {
              id: 'allorigins' as ProxyMode,
              name: 'AllOrigins',
              endpoint: 'api.allorigins.win',
              badge: 'Degraded',
              badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
              desc: 'Open-source proxy. Intermittent Cloudflare 520 timeouts'
            },
            {
              id: 'direct' as ProxyMode,
              name: 'Direct Browser Fetch',
              endpoint: 'Strict Origin',
              desc: 'No gateway. Only loads feeds with native CORS headers'
            }
          ].map((gw) => {
            const isActive = settings.proxyMode === gw.id;
            const ping = gatewayPings[gw.id];

            return (
              <div
                key={gw.id}
                className={`p-3 rounded-lg border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-theme-accent bg-theme-accent-subtle/40 shadow-sm'
                    : 'border-theme-border bg-theme-card/70 hover:border-theme-border/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-serif font-bold text-xs text-theme-text truncate">{gw.name}</span>
                    {isActive ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-accent text-white font-bold">
                        ACTIVE
                      </span>
                    ) : gw.badge ? (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${gw.badgeColor || 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'}`}>
                        {gw.badge}
                      </span>
                    ) : null}
                  </div>

                  <p className="font-mono text-[11px] text-theme-text-muted truncate mb-2">{gw.endpoint}</p>
                  <p className="font-sans text-[11px] text-theme-text-muted line-clamp-2 leading-tight mb-3">{gw.desc}</p>
                </div>

                <div className="pt-2 border-t border-theme-border/50 flex items-center justify-between text-[11px] font-mono">
                  <div>
                    {ping ? (
                      <span className={`flex items-center gap-1 font-bold ${ping.alive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {ping.alive ? `⚡ ${ping.latencyMs}ms` : 'Offline / Hang'}
                      </span>
                    ) : (
                      <span className="text-theme-text-muted/60">—</span>
                    )}
                  </div>

                  {!isActive && (
                    <button
                      onClick={() => updateSettings({ proxyMode: gw.id })}
                      className="px-2 py-0.5 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-text text-[10px] uppercase font-bold"
                    >
                      Use Gateway
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feeds Table & Filter Toolbar */}
      <div className="bg-theme-surface rounded-xl border border-theme-border overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-theme-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds by name, category, or URL..."
                className="w-full pl-8 pr-3 py-1.5 rounded bg-theme-card border border-theme-border text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <span className="text-theme-text-muted flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" />
              Filter:
            </span>
            {[
              { id: 'all', label: `All (${feeds.length})` },
              { id: 'healthy', label: `Healthy (${healthyCount})` },
              { id: 'failed', label: `Failed/Errors (${failedCount})` },
              { id: 'cors', label: `CORS (${corsCount})` },
              { id: 'timeout', label: `Timeout (${timeoutCount})` },
              { id: 'unreachable', label: `Proxy Can't Reach (${unreachableCount})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === f.id
                    ? 'bg-theme-accent text-white font-bold'
                    : 'bg-theme-card text-theme-text-muted hover:text-theme-text border border-theme-border'
                }`}
              >
                {f.label}
              </button>
            ))}

            {/* Expand All / Collapse All Button */}
            {filteredFeeds.length > 0 && (
              <button
                onClick={() => {
                  if (expandedFeedIds.size === filteredFeeds.length) {
                    setExpandedFeedIds(new Set());
                  } else {
                    setExpandedFeedIds(new Set(filteredFeeds.map((f) => f.id)));
                  }
                }}
                title={expandedFeedIds.size === filteredFeeds.length ? 'Collapse all feed sources' : 'Expand all feed sources'}
                className="px-2.5 py-1 rounded bg-theme-card text-theme-text-muted hover:text-theme-text hover:border-theme-accent border border-theme-border font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                <span>{expandedFeedIds.size === filteredFeeds.length ? 'Collapse All' : 'Expand All'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Feed Sources Vertical Accordion List */}
        <div className="divide-y divide-theme-border/60">
          {filteredFeeds.length === 0 ? (
            <div className="py-12 text-center text-theme-text-muted font-serif">
              No feed sources match the selected criteria.
            </div>
          ) : (
            filteredFeeds.map((feed) => {
              const health = feedHealth[feed.id];
              const isExpanded = expandedFeedIds.has(feed.id);
              const recentArticles = feedArticlesMap.get(feed.id)?.slice(0, 5) || [];

              return (
                <div
                  key={feed.id}
                  className={`transition-colors ${
                    isExpanded ? 'bg-theme-card/30' : 'hover:bg-theme-card/15'
                  }`}
                >
                  {/* Accordion Row Header */}
                  <div
                    onClick={() => toggleExpandFeed(feed.id)}
                    className="p-3.5 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    {/* Left: Chevron + Name + Category + URL */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`p-1 rounded text-theme-text-muted transition-transform duration-200 mt-0.5 sm:mt-0 ${
                          isExpanded ? 'rotate-90 text-theme-accent' : ''
                        }`}
                      >
                        <ChevronRight className="w-4 h-4 flex-shrink-0" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-serif font-bold text-sm text-theme-text hover:text-theme-accent transition-colors">
                            {feed.name}
                          </span>
                          {feed.category && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-theme-card border border-theme-border text-theme-text-muted uppercase">
                              {feed.category}
                            </span>
                          )}
                          {feed.isCustom && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase font-bold">
                              Custom
                            </span>
                          )}
                        </div>

                        <a
                          href={feed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[11px] text-theme-text-muted hover:underline hover:text-theme-text inline-flex items-center gap-1 truncate max-w-md mt-0.5"
                        >
                          <span className="truncate">{feed.url}</span>
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      </div>
                    </div>

                    {/* Right: Status Badge + Item Count + Last Fetched + Quick Retry */}
                    <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-5 flex-wrap text-xs font-mono pl-7 sm:pl-0">
                      <div>{getStatusBadge(health?.status)}</div>

                      <div className="text-theme-text font-semibold whitespace-nowrap">
                        {health?.articleCount !== undefined ? `${health.articleCount} items` : '—'}
                      </div>

                      <div className="text-theme-text-muted whitespace-nowrap">
                        {health?.lastFetchedAt ? (() => {
                          const source = describeUpdateSource(health.gatewayUsed);
                          const failed = health.status !== 'healthy';
                          const tooltip = [
                            source.detail,
                            `Last attempt: ${formatFullDateTime(health.lastFetchedAt)}`,
                            `Last success: ${health.lastSuccessAt ? formatFullDateTime(health.lastSuccessAt) : 'never'}`,
                          ].join('\n');
                          return (
                            <span title={tooltip} className="inline-flex items-center gap-1.5 cursor-help hover:text-theme-text transition-colors">
                              <Clock className="w-3 h-3 text-theme-text-muted/70 flex-shrink-0" />
                              <span>
                                {failed
                                  ? `Tried ${formatRelativeTime(health.lastFetchedAt)}${health.lastSuccessAt ? ` · last OK ${formatRelativeTime(health.lastSuccessAt)}` : ''}`
                                  : `Updated ${formatRelativeTime(health.lastSuccessAt || health.lastFetchedAt)}`}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                source.kind === 'snapshot'
                                  ? 'bg-theme-accent/10 text-theme-accent border-theme-accent/30'
                                  : 'bg-theme-card text-theme-text-muted border-theme-border'
                              }`}>
                                {source.label}
                              </span>
                            </span>
                          );
                        })() : (
                          <span className="text-theme-text-muted/50">Never</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => refreshFeeds(feed.id)}
                          disabled={isRefreshing}
                          title="Retry fetch for this feed"
                          className="px-2.5 py-1 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors flex items-center gap-1 text-[11px]"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          <span>Retry</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Expanded Content Drawer */}
                  {isExpanded && (
                    <div className="border-t border-theme-border/60 bg-theme-card/40 p-4 sm:p-5 space-y-4 text-xs font-mono animate-fade-in">
                      {/* Telemetry & Action Bar */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-3.5 rounded-lg bg-theme-surface border border-theme-border">
                        {/* Telemetry info: Latency, Gateway, and Status Diagnostics */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                          {/* Latency */}
                          <div>
                            <span className="text-[10px] uppercase text-theme-text-muted block">Latency</span>
                            <span className="text-sm font-bold text-theme-text flex items-center gap-1 mt-0.5">
                              <Zap className="w-3.5 h-3.5 text-amber-500" />
                              {health?.latencyMs !== undefined ? `${health.latencyMs}ms` : '—'}
                            </span>
                          </div>

                          {/* Gateway Info */}
                          <div>
                            <span className="text-[10px] uppercase text-theme-text-muted block">Updated Via</span>
                            <span
                              title={describeUpdateSource(health?.gatewayUsed || settings.proxyMode).detail}
                              className="px-2 py-0.5 rounded bg-theme-card border border-theme-border text-xs font-bold text-theme-text inline-block mt-0.5 cursor-help"
                            >
                              {describeUpdateSource(health?.gatewayUsed || settings.proxyMode).label}
                            </span>
                          </div>

                          {/* HTTP Status & Diagnostics */}
                          <div className="max-w-md">
                            <span className="text-[10px] uppercase text-theme-text-muted block">Status & Diagnostic Info</span>
                            <div className="mt-0.5">
                              {health?.errorMessage ? (
                                <span className="text-rose-400 font-sans text-xs block leading-tight">
                                  {health.errorMessage}
                                </span>
                              ) : health?.status === 'healthy' ? (
                                <span className="text-emerald-500 text-xs">
                                  {health.httpStatus ? `HTTP ${health.httpStatus} OK` : 'Ingested successfully'}
                                </span>
                              ) : (
                                <span className="text-theme-text-muted">Ready for ingestion</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions moved here: Debug and Disable/Enable */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setDebugFeed(feed);
                              setProbeResult(null);
                            }}
                            title="Open Deep Diagnostics Terminal & Live Probes"
                            className="px-3 py-1.5 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-accent transition-colors flex items-center gap-1.5 font-bold text-xs"
                          >
                            <Bug className="w-3.5 h-3.5" />
                            <span>Debug Feed</span>
                          </button>

                          <button
                            onClick={() => toggleFeedEnabled(feed.id)}
                            title={feed.enabled ? 'Disable feed' : 'Enable feed'}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                              feed.enabled
                                ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'
                            }`}
                          >
                            {feed.enabled ? 'Disable Feed' : 'Enable Feed'}
                          </button>
                        </div>
                      </div>

                      {/* Multi-tier Attempt Trace */}
                      {health?.attemptedGateways && health.attemptedGateways.length > 0 && (
                        <div className="p-3 rounded bg-theme-surface border border-theme-border space-y-1">
                          <span className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider block">
                            Failover Attempt Trace:
                          </span>
                          <div className="space-y-0.5">
                            {health.attemptedGateways.map((attempt, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-[11px]">
                                <span className="text-theme-text-muted font-bold">[{idx + 1}]</span>
                                <span className={attempt.includes('OK') ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                                  {attempt}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 5 Last Fetched Items List */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between pb-1 border-b border-theme-border/60">
                          <h4 className="font-serif font-bold text-sm text-theme-text flex items-center gap-2">
                            <FileText className="w-4 h-4 text-theme-accent" />
                            <span>5 Last Fetched Items</span>
                          </h4>
                          <span className="text-[11px] text-theme-text-muted">
                            Headlines, publication dates, and fetch timestamps
                          </span>
                        </div>

                        {recentArticles.length === 0 ? (
                          <div className="py-4 text-center text-theme-text-muted font-sans text-xs italic">
                            No dispatches stored for this source yet. Click "Retry" to fetch latest articles.
                          </div>
                        ) : (
                          <div className="divide-y divide-theme-border/40 border border-theme-border/60 rounded-lg overflow-hidden bg-theme-surface/50">
                            {recentArticles.map((article, idx) => (
                              <div
                                key={article.id || idx}
                                className="p-3 hover:bg-theme-card/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                {/* Headline Link */}
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-serif font-semibold text-xs sm:text-sm text-theme-text hover:text-theme-accent hover:underline flex items-start gap-1.5 leading-snug"
                                  >
                                    <span className="text-theme-text-muted font-mono text-[11px] flex-shrink-0 mt-0.5">
                                      {idx + 1}.
                                    </span>
                                    <span>{article.title}</span>
                                    <ArrowUpRight className="w-3 h-3 text-theme-text-muted flex-shrink-0 mt-0.5 opacity-60" />
                                  </a>
                                </div>

                                {/* Published & Fetched Timestamps */}
                                <div className="flex items-center gap-3 sm:gap-4 text-[11px] font-mono text-theme-text-muted flex-shrink-0 pl-4 sm:pl-0">
                                  <span
                                    title={`Published: ${formatFullDateTime(article.publishedAt)}`}
                                    className="inline-flex items-center gap-1 cursor-help"
                                  >
                                    <Calendar className="w-3 h-3 text-theme-text-muted/70 flex-shrink-0" />
                                    <span>Published {formatRelativeTime(article.publishedAt)}</span>
                                  </span>

                                  <span className="text-theme-border">|</span>

                                  <span
                                    title={`Fetched: ${formatFullDateTime(article.fetchedAt || health?.lastFetchedAt || article.publishedAt)}`}
                                    className="inline-flex items-center gap-1 cursor-help text-theme-text"
                                  >
                                    <Clock className="w-3 h-3 text-theme-accent flex-shrink-0" />
                                    <span>Fetched {formatRelativeTime(article.fetchedAt || health?.lastFetchedAt || article.publishedAt)}</span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* FEED DEEP DEBUGGER MODAL */}
      {debugFeed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-theme-surface border border-theme-border rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-theme-border flex items-center justify-between bg-theme-card/60">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-theme-accent" />
                <div>
                  <h3 className="font-serif font-bold text-lg text-theme-text flex items-center gap-2">
                    <span>{debugFeed.name}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-theme-surface border border-theme-border text-theme-text-muted">
                      {debugFeed.category}
                    </span>
                  </h3>
                  <a
                    href={debugFeed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-theme-text-muted hover:underline flex items-center gap-1 mt-0.5 truncate max-w-md"
                  >
                    <span>{debugFeed.url}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              </div>

              <button
                onClick={() => setDebugFeed(null)}
                className="p-1.5 rounded-lg text-theme-text-muted hover:text-theme-text hover:bg-theme-card transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs font-mono">
              {/* Telemetry Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded bg-theme-card border border-theme-border">
                  <span className="text-[10px] text-theme-text-muted uppercase">Health Status</span>
                  <div className="mt-1">{getStatusBadge(feedHealth[debugFeed.id]?.status)}</div>
                </div>

                <div className="p-3 rounded bg-theme-card border border-theme-border">
                  <span className="text-[10px] text-theme-text-muted uppercase">Latency</span>
                  <p className="text-sm font-bold text-theme-text mt-1">
                    {feedHealth[debugFeed.id]?.latencyMs !== undefined
                      ? `${feedHealth[debugFeed.id]?.latencyMs}ms`
                      : '—'}
                  </p>
                </div>

                <div className="p-3 rounded bg-theme-card border border-theme-border">
                  <span className="text-[10px] text-theme-text-muted uppercase">Gateway Used</span>
                  <p className="text-sm font-bold text-theme-text mt-1 uppercase">
                    {feedHealth[debugFeed.id]?.gatewayUsed || '—'}
                  </p>
                </div>

                <div className="p-3 rounded bg-theme-card border border-theme-border">
                  <span className="text-[10px] text-theme-text-muted uppercase">Last Ingestion</span>
                  <p className="text-xs font-sans text-theme-text mt-1">
                    {feedHealth[debugFeed.id]?.lastFetchedAt
                      ? formatRelativeTime(feedHealth[debugFeed.id]!.lastFetchedAt!)
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Failover Attempt Trace */}
              {feedHealth[debugFeed.id]?.attemptedGateways &&
                feedHealth[debugFeed.id]!.attemptedGateways!.length > 0 && (
                  <div className="p-3 rounded bg-theme-card border border-theme-border space-y-1.5">
                    <span className="text-[10px] font-bold text-theme-text-muted uppercase tracking-wider block">
                      Multi-Tier Gateway Attempt Trace:
                    </span>
                    <div className="space-y-1">
                      {feedHealth[debugFeed.id]!.attemptedGateways!.map((attempt, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[11px]">
                          <span className="text-theme-text-muted font-bold">[{idx + 1}]</span>
                          <span className={attempt.includes('OK') ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                            {attempt}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Error Details */}
              {feedHealth[debugFeed.id]?.errorMessage && (
                <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Error Diagnosis:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{feedHealth[debugFeed.id]!.errorMessage}</p>
                </div>
              )}

              {/* Live Gateway Probes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-text uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Live Gateway Probes
                  </span>
                  <span className="text-[11px] text-theme-text-muted">
                    Click to test this feed directly through different gateways:
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => runFeedProbe('corsfix')}
                    disabled={isProbing}
                    className="p-2 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-center transition-colors disabled:opacity-50"
                  >
                    <span className="font-bold text-theme-text block text-xs">CORSFix</span>
                    <span className="text-[10px] text-theme-text-muted block">proxy.corsfix.com</span>
                  </button>

                  <button
                    onClick={() => runFeedProbe('direct')}
                    disabled={isProbing}
                    className="p-2 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-center transition-colors disabled:opacity-50"
                  >
                    <span className="font-bold text-theme-text block text-xs">Direct Fetch</span>
                    <span className="text-[10px] text-theme-text-muted block">Native CORS test</span>
                  </button>

                  <button
                    onClick={() => runFeedProbe('rss2json')}
                    disabled={isProbing}
                    className="p-2 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-center transition-colors disabled:opacity-50"
                  >
                    <span className="font-bold text-theme-text block text-xs">RSS2JSON</span>
                    <span className="text-[10px] text-theme-text-muted block">api.rss2json.com</span>
                  </button>

                  <button
                    onClick={() => runFeedProbe('allorigins')}
                    disabled={isProbing}
                    className="p-2 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-center transition-colors disabled:opacity-50"
                  >
                    <span className="font-bold text-theme-text block text-xs">AllOrigins</span>
                    <span className="text-[10px] text-theme-text-muted block">api.allorigins.win</span>
                  </button>
                </div>

                {/* Probe Live Result Box */}
                {isProbing && (
                  <div className="p-3 rounded bg-theme-card border border-theme-border flex items-center gap-2 text-theme-accent">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing live probe request...</span>
                  </div>
                )}

                {probeResult && (
                  <div
                    className={`p-3.5 rounded border space-y-2 ${
                      probeResult.ok
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-xs flex items-center gap-1.5">
                        {probeResult.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        )}
                        Probe Result: {probeResult.gateway} ({probeResult.status || 'No Response'})
                      </span>
                      <span className="text-xs font-mono font-bold">
                        ⚡ {probeResult.latencyMs}ms | {probeResult.articleCount} items parsed
                      </span>
                    </div>

                    {probeResult.errorMessage && (
                      <p className="text-[11px] font-mono text-rose-300">
                        Error: {probeResult.errorMessage}
                      </p>
                    )}

                    {probeResult.rawSnippet && (
                      <div className="mt-2">
                        <span className="text-[10px] uppercase text-theme-text-muted block mb-1">
                          Probe Payload Snippet:
                        </span>
                        <pre className="p-2 rounded bg-black/40 text-[10px] text-theme-text overflow-x-auto max-h-36 whitespace-pre-wrap">
                          {probeResult.rawSnippet}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Raw Response Payload Preview */}
              {feedHealth[debugFeed.id]?.rawSnippet && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-text uppercase tracking-wider">
                      Response XML/JSON Preview:
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(feedHealth[debugFeed.id]!.rawSnippet!);
                        setCopiedSnippet(true);
                        setTimeout(() => setCopiedSnippet(false), 2000);
                      }}
                      className="text-[11px] text-theme-accent hover:underline flex items-center gap-1 font-bold"
                    >
                      {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet ? 'Copied' : 'Copy Payload'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-black/50 border border-theme-border text-theme-text overflow-x-auto max-h-48 text-[11px] font-mono whitespace-pre-wrap leading-tight">
                    {feedHealth[debugFeed.id]!.rawSnippet}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-theme-border bg-theme-card/60 flex items-center justify-between">
              <span className="text-xs text-theme-text-muted">
                Feed ID: <code className="text-theme-text">{debugFeed.id}</code>
              </span>
              <button
                onClick={() => setDebugFeed(null)}
                className="px-4 py-1.5 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text text-xs font-bold uppercase transition-colors"
              >
                Close Debugger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
