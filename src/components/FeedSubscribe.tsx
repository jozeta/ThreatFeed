import React, { useState } from 'react';
import { Rss, Copy, Check } from 'lucide-react';
import { CHANNELS } from '../services/feeds/build';
import type { FeedName } from '../services/feeds/candidates';

const ROWS: { name: FeedName; label: string }[] = [
  { name: 'news', label: 'News' },
  { name: 'vulns', label: 'Vulnerabilities' },
  { name: 'ransomware', label: 'Ransomware' },
  { name: 'npm', label: 'npm advisories' },
];

const feedUrl = (name: FeedName) => `${window.location.origin}${import.meta.env.BASE_URL}data/feeds/${name}.xml`;

/** The RSS feeds the snapshot job publishes, with a copy button for each URL. */
export const FeedSubscribe: React.FC = () => {
  const [copied, setCopied] = useState<FeedName | null>(null);

  const copy = async (name: FeedName) => {
    try {
      await navigator.clipboard.writeText(feedUrl(name));
    } catch {
      return; // clipboard blocked: leave the button unchanged
    }
    setCopied(name);
    setTimeout(() => setCopied((c) => (c === name ? null : c)), 2000);
  };

  return (
    <section className="mt-8 p-4 rounded-lg bg-theme-surface border border-theme-border">
      <h2 className="font-serif text-xl font-bold text-theme-text flex items-center gap-2">
        <Rss className="w-4 h-4 text-theme-accent" />
        Subscribe
      </h2>
      <p className="font-serif text-sm text-theme-text-muted mt-1">
        Add these to any RSS reader. They cover the last 7 days and every item opens in ThreatFeed.
      </p>
      <ul className="mt-4 divide-y divide-theme-border">
        {ROWS.map(({ name, label }) => (
          <li key={name} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-theme-text">{label}</div>
              <div className="text-xs text-theme-text-muted">{CHANNELS[name].description}</div>
              <code className="block mt-1 font-mono text-xs text-theme-text break-all">{feedUrl(name)}</code>
            </div>
            <button
              type="button"
              onClick={() => copy(name)}
              aria-label={`Copy ${label} feed URL`}
              className="shrink-0 self-start sm:self-center px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center gap-1.5 font-mono text-xs"
            >
              {copied === name ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === name ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
