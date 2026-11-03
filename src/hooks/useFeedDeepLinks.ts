import { useCallback, useEffect, useState } from 'react';
import { useFeeds } from '../context/FeedContext';
import { useLeakSiteVictims } from './useLeakSiteVictims';
import { setHashParams, useHashRoute } from './useHashRoute';
import { resolveDeepLink } from '../services/feeds/deepLink';

export interface DeepLinkNoticeState {
  kind: 'story' | 'victim';
  src: string; // the story's original URL (unchecked), '' for a victim
}

/**
 * Opens the targets of the RSS feeds' links: ?article=<id>&src=<url> opens the reader on that story, and
 * ?victim=<id> (on the Ransomware page, where VictimsTab highlights the row) is checked to exist. A target that
 * isn't on this device gives a notice instead.
 */
export function useFeedDeepLinks(): { notice: DeepLinkNoticeState | null; dismiss: () => void } {
  const { articles, initialSyncDone, setActiveArticle } = useFeeds();
  const { victims } = useLeakSiteVictims();
  const [route] = useHashRoute();
  const [notice, setNotice] = useState<DeepLinkNoticeState | null>(null);
  const articleId = route.params.get('article');
  const src = route.params.get('src') ?? '';
  const victimId = route.page === 'ransomware' ? route.params.get('victim') : null;

  useEffect(() => {
    if (!articleId) return;
    const result = resolveDeepLink(articleId, articles, initialSyncDone);
    if (result.state === 'waiting') return;
    if (result.state === 'found') setActiveArticle(result.item);
    else setNotice({ kind: 'story', src });
    setHashParams({ article: '', src: '' }); // replaces the entry, so Back doesn't reopen the link
  }, [articleId, src, articles, initialSyncDone, setActiveArticle]);

  useEffect(() => {
    if (!victimId) return;
    const result = resolveDeepLink(victimId, victims, initialSyncDone);
    if (result.state !== 'missing') return; // found: VictimsTab highlights it
    setNotice({ kind: 'victim', src: '' });
    setHashParams({ victim: '' });
  }, [victimId, victims, initialSyncDone]);

  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, dismiss };
}
