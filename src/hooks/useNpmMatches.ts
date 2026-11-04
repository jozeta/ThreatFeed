import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getStoredValue, saveStoredValue } from '../services/storage/indexeddb';
import type { NpmAdvisoryData, NpmMalwareData } from '../services/npm/advisories';
import { knownAdvisoryIds, matchPackages, type PackageResult } from '../services/npm/match';
import { affectingByAdvisory, type AffectedEntry } from '../services/npm/npmFilters';
import { osvCacheFresh, osvQueryBatch, type OsvResult } from '../services/npm/osv';
import { formatPackageEntry, parsePackageEntry, type PackageEntry } from '../services/npm/semver';

const OSV_CACHE_KEY = 'npmOsv';

/** The last OSV answer on this device: when, for which list (sorted entries), and the results by entry */
interface OsvCache { at: string; key: string; results: [string, OsvResult][] }

// The tab and the advisory panel both match: one lookup per list at a time, shared
interface Lookup { key: string; promise: Promise<Map<string, OsvResult> | null> }
let inFlight: Lookup | null = null;
function lookUp(key: string, entries: PackageEntry[], known: ReadonlySet<string>): Promise<Map<string, OsvResult> | null> {
  if (inFlight?.key === key) return inFlight.promise;
  const lookup: Lookup = { key, promise: Promise.resolve(null) };
  lookup.promise = osvQueryBatch(entries, known).then(async (results) => {
    // Kept only while it is still the latest lookup: an answer for an older list never overwrites a newer one
    if (results && inFlight === lookup) {
      const cache: OsvCache = { at: new Date().toISOString(), key, results: [...results] };
      await saveStoredValue(OSV_CACHE_KEY, cache).catch(() => undefined);
    }
    if (inFlight === lookup) inFlight = null;
    return results;
  });
  inFlight = lookup;
  return lookup.promise;
}

export interface NpmMatches {
  entries: PackageEntry[]; // the watched packages, from Settings
  results: PackageResult[]; // matchPackages' answer, in its order; empty until the advisories load
  affecting: Map<string, AffectedEntry[]>; // advisory id → the watched entries it lists
  osvChecking: boolean; // an OSV lookup is under way
}

/**
 * The watched packages matched against the npm advisories and malware reports. With "Also check full history
 * with OSV.dev" on, OSV is asked at most once a day or when the list changes (the answer is kept in IndexedDB);
 * with it off nothing leaves the device.
 */
export function useNpmMatches(advisories: NpmAdvisoryData | null, malware: NpmMalwareData | null): NpmMatches {
  const { settings } = useSettings();
  const enabled = settings.npmOsvLookup;
  const entries = useMemo(
    () => settings.npmPackages.map(parsePackageEntry).filter((e): e is PackageEntry => e !== null),
    [settings.npmPackages]
  );
  const listKey = useMemo(() => entries.map(formatPackageEntry).sort().join(' '), [entries]);

  // Latest values for the lookup, which only reruns when the setting, the list or the data's arrival changes
  const latest = useRef({ entries, advisories, malware });
  latest.current = { entries, advisories, malware };
  const hasData = advisories !== null;

  const [osv, setOsv] = useState<{ key: string; results: Map<string, OsvResult> | null } | null>(null);
  const [osvChecking, setOsvChecking] = useState(false);
  useEffect(() => {
    if (!enabled || !listKey || !hasData) return;
    let cancelled = false;
    void (async () => {
      const cached = await getStoredValue<OsvCache>(OSV_CACHE_KEY);
      const usable = cached && typeof cached.key === 'string' && typeof cached.at === 'string' && Array.isArray(cached.results);
      if (cancelled) return;
      if (usable && cached.key === listKey) {
        setOsv({ key: listKey, results: new Map(cached.results) });
        if (osvCacheFresh(cached.at, listKey, cached.key, Date.now())) return;
      }
      setOsvChecking(true);
      const { entries, advisories, malware } = latest.current;
      const results = await lookUp(listKey, entries, knownAdvisoryIds(advisories!, malware));
      if (cancelled) return;
      setOsvChecking(false);
      // A failed lookup shows as "OSV unavailable", not as the older answer
      setOsv({ key: listKey, results });
    })();
    return () => {
      cancelled = true;
      setOsvChecking(false);
    };
  }, [enabled, listKey, hasData]);

  // undefined: OSV off; null: not (yet) answered for this list, which shows as unavailable
  const osvResults = useMemo(() => (enabled ? (osv?.key === listKey ? osv.results : null) : undefined), [enabled, osv, listKey]);
  const results = useMemo(
    () => (advisories ? matchPackages(entries, advisories, malware, osvResults) : []),
    [entries, advisories, malware, osvResults]
  );
  const affecting = useMemo(() => affectingByAdvisory(results), [results]);
  return { entries, results, affecting, osvChecking };
}
