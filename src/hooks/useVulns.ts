import { useEffect } from 'react';
import { useFeeds } from '../context/FeedContext';
import { ActorsData, MsrcData, RansomwareIntel, TrendsData, VulnData } from '../types';

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

/** The latest Patch Tuesday releases (data/msrc.json), loaded on first use */
export function useMsrc(): MsrcData | null {
  const { msrc, ensureMsrc, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureMsrc();
  }, [ensureMsrc, snapshotGeneratedAt]);
  return msrc;
}

/** Threat actor and malware profiles (data/actors.json), loaded on first use */
export function useActors(): ActorsData | null {
  const { actors, ensureActors, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureActors();
  }, [ensureActors, snapshotGeneratedAt]);
  return actors;
}

/** The trends history (data/trends.json), loaded on first use */
export function useTrends(): TrendsData | null {
  const { trends, ensureTrends, snapshotGeneratedAt } = useFeeds();
  useEffect(() => {
    void ensureTrends();
  }, [ensureTrends, snapshotGeneratedAt]);
  return trends;
}
