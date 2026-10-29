import { useEffect } from 'react';
import { useFeeds } from '../context/FeedContext';
import { RansomwareIntel, VulnData } from '../types';

/**
 * Vulnerability data for views that need it. The first use loads data/vulns.json (about 160 KB
 * compressed); the newspaper and other views never pay for it.
 */
export function useVulns(): VulnData | null {
  const { vulns, ensureVulns, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureVulns();
  }, [ensureVulns, snapshotGeneratedAt]);
  return vulns;
}

/** Ransomware group intel, public reports and payments (data/ransomware.json), loaded on first use */
export function useRansomwareIntel(): RansomwareIntel | null {
  const { ransomwareIntel, ensureRansomwareIntel, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureRansomwareIntel();
  }, [ensureRansomwareIntel, snapshotGeneratedAt]);
  return ransomwareIntel;
}
