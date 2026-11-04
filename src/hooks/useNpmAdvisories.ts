import { useEffect } from 'react';
import { useFeeds } from '../context/FeedContext';
import type { NpmAdvisoryData, NpmMalwareData } from '../services/npm/advisories';

/**
 * The npm advisories (data/npm-advisories.json, about 700 KB compressed) and malware reports
 * (data/npm-malware.json), loaded on first use: only the npm views and package matching pay for them.
 */
export function useNpmAdvisories(): { advisories: NpmAdvisoryData | null; malware: NpmMalwareData | null } {
  const { npmAdvisories, ensureNpmAdvisories, npmMalware, ensureNpmMalware, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureNpmAdvisories();
    void ensureNpmMalware();
  }, [ensureNpmAdvisories, ensureNpmMalware, snapshotGeneratedAt]);
  return { advisories: npmAdvisories, malware: npmMalware };
}
