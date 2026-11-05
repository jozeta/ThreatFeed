import { useEffect, useState } from 'react';
import { useFeeds } from '../context/FeedContext';
import type { NpmAdvisoryData, NpmMalwareData } from '../services/npm/advisories';

/**
 * The npm advisories (data/npm-advisories.json, about 700 KB compressed) and malware reports
 * (data/npm-malware.json), loaded on first use: only the npm views and package matching pay for them.
 */
export function useNpmAdvisories(): { advisories: NpmAdvisoryData | null; malware: NpmMalwareData | null; failed: boolean } {
  const { npmAdvisories, ensureNpmAdvisories, npmMalware, ensureNpmMalware, snapshotGeneratedAt } = useFeeds();
  const [failed, setFailed] = useState(false); // the advisories couldn't be loaded and no stored copy exists
  useEffect(() => {
    void ensureNpmAdvisories().then((data) => setFailed(!data), () => setFailed(true));
    void ensureNpmMalware();
  }, [ensureNpmAdvisories, ensureNpmMalware, snapshotGeneratedAt]);
  return { advisories: npmAdvisories, malware: npmMalware, failed: failed && !npmAdvisories };
}
