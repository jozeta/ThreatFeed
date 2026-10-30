import { useMemo } from 'react';
import { LeakSiteVictim } from '../types';
import { useFeeds } from '../context/FeedContext';
import { ransomwareVictims } from '../services/intelligence/ransomware';
import { countryCodeFromName } from '../utils/countries';

/**
 * Leak-site victims: the snapshot's structured list, or without one, parsed from the ransomware.live RSS feed.
 * `structured` says which, as the victims table shows more columns for the snapshot's.
 */
export function useLeakSiteVictims(): { victims: LeakSiteVictim[]; structured: boolean } {
  const { articles, incidents } = useFeeds();
  const structured = Boolean(incidents && incidents.victims.length > 0);
  const victims = useMemo(() => {
    if (incidents && incidents.victims.length > 0) return incidents.victims;
    return ransomwareVictims(articles).map((v) => ({
      id: v.id,
      victim: v.victim,
      group: v.group,
      country: countryCodeFromName(v.country),
      sector: v.sector,
      discoveredAt: v.publishedAt,
      url: v.url,
      description: v.description,
    }));
  }, [incidents, articles]);
  return { victims, structured };
}
