import React from 'react';
import { X } from 'lucide-react';
import { safeHttpUrl } from '../../services/rss/sanitizer';
import type { DeepLinkNoticeState } from '../../hooks/useFeedDeepLinks';

const TEXT = {
  story: "This story isn't available in ThreatFeed on this device. It may be older than your article age limit, or its category is turned off.",
  victim: "This victim is no longer in ThreatFeed's 90-day leak-site history.",
};

/** A bottom banner for a feed link whose target isn't here, with the original article when the link carried one */
export const DeepLinkNotice: React.FC<{ notice: DeepLinkNoticeState; onDismiss: () => void }> = ({ notice, onDismiss }) => {
  const original = notice.kind === 'story' ? safeHttpUrl(notice.src) : '';
  // A crafted link can carry any http(s) URL, so the notice names where it goes
  const host = original ? new URL(original).hostname : '';
  return (
    <div role="status" className="fixed bottom-4 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-xl z-[80] flex items-start gap-3 p-4 rounded-lg bg-theme-surface border border-theme-border shadow-lg">
      <div className="flex-1 text-sm font-serif text-theme-text">
        <p>{TEXT[notice.kind]}</p>
        {original && (
          <a href={original} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-mono text-xs underline text-theme-accent">
            Open the original article on {host}
          </a>
        )}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="p-1 text-theme-text-muted hover:text-theme-text">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
