import React, { useEffect, useState } from 'react';
import { getSyncConfig, saveSyncConfig, syncNow, GistSyncConfig } from '../../services/sync/gistSync';
import { formatRelativeTime } from '../../utils/date';
import { RefreshCcw, ExternalLink } from 'lucide-react';

export const SyncSettings: React.FC = () => {
  const [config, setConfig] = useState<GistSyncConfig | null>(null);
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' | 'error' | 'done'; text?: string }>({ kind: 'idle' });

  useEffect(() => {
    getSyncConfig().then((c) => setConfig(c));
  }, []);

  const runSync = async (cfg: GistSyncConfig) => {
    setStatus({ kind: 'working', text: 'Syncing…' });
    try {
      const updated = await syncNow(cfg);
      setConfig(updated);
      setStatus({ kind: 'done', text: 'Synced. Reloading to apply merged data…' });
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      setStatus({ kind: 'error', text: err?.message || 'Sync failed' });
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cfg: GistSyncConfig = { token: token.trim(), gistId: gistId.trim() || undefined };
    await saveSyncConfig(cfg);
    setToken('');
    setConfig(cfg);
    await runSync(cfg);
  };

  const disconnect = async () => {
    await saveSyncConfig(null);
    setConfig(null);
    setStatus({ kind: 'idle' });
  };

  const input = 'w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent';

  return (
    <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-5">
      <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
        <RefreshCcw className="w-5 h-5 text-theme-accent" />
        <div>
          <h2 className="font-serif text-xl font-bold text-theme-text">Cross-Device Sync</h2>
          <p className="font-serif text-xs text-theme-text-muted">
            Keep bookmarks, read state, feeds and keyword lists in step across browsers through a private GitHub Gist.
          </p>
        </div>
      </div>

      {config?.token ? (
        <div className="space-y-3 text-xs font-mono">
          <p className="text-theme-text">
            Connected{config.gistId && (
              <> to gist <a href={`https://gist.github.com/${config.gistId}`} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline inline-flex items-center gap-1">{config.gistId.slice(0, 8)}… <ExternalLink className="w-3 h-3" /></a></>
            )}
            {config.lastSyncedAt && <span className="text-theme-text-muted"> · last synced {formatRelativeTime(config.lastSyncedAt)}</span>}
          </p>
          <p className="text-theme-text-muted font-serif">
            On another device, connect with a token and this gist ID to share the same data: <span className="font-mono text-theme-text">{config.gistId}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => runSync(config)} disabled={status.kind === 'working'} className="px-3 py-2 rounded bg-theme-accent text-white font-bold disabled:opacity-50">
              Sync now
            </button>
            <button onClick={disconnect} className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-rose-500">
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-3 max-w-lg">
          <p className="text-xs font-serif text-theme-text-muted">
            Create a GitHub personal access token with only the <span className="font-mono">gist</span> scope
            (classic token, or fine-grained with "Gists: read and write"). It's stored only in this browser, and is never
            included in backups or in the synced data. Leave the gist ID empty on your first device; one is created for you.
          </p>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="GitHub token (gist scope)" className={input} />
          <input type="text" value={gistId} onChange={(e) => setGistId(e.target.value)} placeholder="Existing gist ID (optional, from your other device)" className={input} />
          <button type="submit" disabled={!token.trim() || status.kind === 'working'} className="px-3 py-2 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50">
            Connect & sync
          </button>
        </form>
      )}

      {status.text && (
        <p className={`text-xs font-mono ${status.kind === 'error' ? 'text-rose-500' : 'text-theme-text-muted'}`}>{status.text}</p>
      )}
      <p className="text-[11px] font-serif text-theme-text-muted">
        Merging: for each article, whichever device changed it last wins (including un-bookmarking). Feeds and bookmarked
        articles are combined; keyword lists are combined; other settings stay per device.
      </p>
    </section>
  );
};
