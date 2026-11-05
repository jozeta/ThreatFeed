// Matching watched npm packages against the published advisory data (and OSV, when that is on). A wrong
// "not affected" is the worst outcome: a range that can't be read makes the package unknown, a missing
// fix leaves the minimum safe version unset, and anything OSV reports as affecting is taken as affecting.

import { NPM_MALWARE_DAYS, type NpmAdvisory, type NpmAdvisoryData, type NpmMalwareData } from './advisories';
import type { OsvResult } from './osv';
import { compareVersions, formatPackageEntry, parseGhsaRange, parseVersion, type PackageEntry, type RangeTest, type Version } from './semver';

export type PackageStatus = 'affected' | 'not-affected' | 'no-version' | 'unknown';
export type Severity = NpmAdvisory['severity'];

export interface MatchedAdvisory {
  id: string;
  severity: Severity;
  summary?: string;
  vulnerable: string; // the range that matched, or all the package's ranges joined with " || "
  patched?: string;
  source: 'ghsa' | 'osv';
  malware?: boolean;
  unparsed?: boolean; // a range couldn't be read, so the entry may be affected
}

export interface PackageResult {
  entry: PackageEntry;
  status: PackageStatus;
  advisories: MatchedAdvisory[];
  minSafeVersion?: string;
  highestSeverity?: Severity;
  malware: boolean;
  malwareCheckedDays: number | null; // the malware window checked, null when the malware file isn't loaded
  osv: 'checked' | 'unavailable' | 'off';
}

interface Range { vulnerable: string; patched?: string }

/** One advisory as it applies to one package */
interface Candidate { id: string; severity: Severity; summary?: string; ranges: Range[]; malware: boolean }

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
const rank = (s: Severity | undefined) => (s ? SEVERITY_RANK[s] : 5);

/** The highest of the versions, or undefined when one is missing or unreadable (no fix, no safe version) */
function highestVersion(versions: (string | undefined)[]): string | undefined {
  let best: { text: string; v: Version } | undefined;
  for (const text of versions) {
    const v = text ? parseVersion(text) : null;
    if (!text || !v) return undefined;
    if (!best || compareVersions(v, best.v) > 0) best = { text, v };
  }
  return best?.text;
}

/** The range shown for an OSV vulnerability whose details weren't fetched: OSV reported it, without ranges */
export const OSV_ONLY_RANGE = 'per OSV';

const joined = (ranges: Range[]) => ranges.map(r => r.vulnerable).join(' || ');

/**
 * The first of the package's fixed versions, from `from` up, that no range of the package covers or might
 * cover (an unreadable range): a fix for one advisory can still sit inside another. Undefined when none is clear.
 */
function safeVersion(from: string | undefined, candidates: Candidate[], pick: (ranges: Range[], v: Version) => Range | 'unparsed' | null): string | undefined {
  const start = from ? parseVersion(from) : null;
  if (!start) return undefined;
  const fixes = new Map<string, Version>();
  for (const c of candidates) {
    for (const r of c.ranges) {
      const v = r.patched ? parseVersion(r.patched) : null;
      if (r.patched && v && compareVersions(v, start) >= 0) fixes.set(r.patched, v);
    }
  }
  fixes.set(from!, start);
  const ranges = candidates.flatMap(c => c.ranges);
  return [...fixes].sort((a, b) => compareVersions(a[1], b[1])).find(([, v]) => pick(ranges, v) === null)?.[0];
}

/** The ids of our own data, which the OSV lookup doesn't need details for */
export function knownAdvisoryIds(data: NpmAdvisoryData, malware: NpmMalwareData | null): Set<string> {
  return new Set([...data.index.map(e => e[0]), ...(malware?.entries ?? []).map(m => m[0])]);
}

/**
 * Each distinct entry's status against the reviewed advisory index and the malware list, plus OSV's
 * results when given (undefined: OSV off; null: the lookup failed). Withdrawn advisories never match.
 * Ordered malware first, then by highest severity, then by name.
 */
export function matchPackages(
  entries: PackageEntry[],
  data: NpmAdvisoryData,
  malware: NpmMalwareData | null,
  osv?: Map<string, OsvResult> | null,
): PackageResult[] {
  const summaries = new Map(data.recent.map(a => [a.id, a.summary]));
  const withdrawn = new Set<string>();
  const byPackage = new Map<string, Map<string, Candidate>>();
  // npm names are lowercase, but some advisories spell them otherwise ("Electron"): match case-insensitively
  const add = (pkg: string, c: Omit<Candidate, 'ranges'>, range: Range) => {
    const name = pkg.toLowerCase();
    let forPkg = byPackage.get(name);
    if (!forPkg) byPackage.set(name, (forPkg = new Map()));
    const existing = forPkg.get(c.id);
    if (existing) existing.ranges.push(range);
    else forPkg.set(c.id, { ...c, ranges: [range] });
  };
  for (const [id, severity, ranges, isWithdrawn] of data.index) {
    if (isWithdrawn) { withdrawn.add(id); continue; }
    const summary = summaries.get(id);
    for (const [pkg, vulnerable, patched] of ranges) {
      add(pkg, { id, severity, summary, malware: false }, patched ? { vulnerable, patched } : { vulnerable });
    }
  }
  for (const [id, pkg, vulnerable] of malware?.entries ?? []) {
    add(pkg, { id, severity: 'critical', malware: true }, { vulnerable });
  }

  const parsed = new Map<string, RangeTest | null>();
  const test = (range: string) => {
    if (!parsed.has(range)) parsed.set(range, parseGhsaRange(range));
    return parsed.get(range)!;
  };
  /** The first range containing the version; 'unparsed' when none does but one couldn't be read */
  const pick = (ranges: Range[], v: Version): Range | 'unparsed' | null => {
    let unreadable = false;
    for (const r of ranges) {
      const t = test(r.vulnerable);
      if (!t) unreadable = true;
      else if (t(v)) return r;
    }
    return unreadable ? 'unparsed' : null;
  };
  const matched = (c: Candidate, source: MatchedAdvisory['source'], range: Range | null, unparsed = false): MatchedAdvisory => {
    const vulnerable = range ? range.vulnerable : c.ranges.length ? joined(c.ranges) : OSV_ONLY_RANGE;
    const a: MatchedAdvisory = { id: c.id, severity: c.severity, vulnerable, source };
    const patched = range ? range.patched : highestVersion(c.ranges.map(r => r.patched));
    if (c.summary) a.summary = c.summary;
    if (patched) a.patched = patched;
    if (c.malware) a.malware = true;
    if (unparsed) a.unparsed = true;
    return a;
  };

  const seen = new Set<string>();
  const results: PackageResult[] = [];
  for (const entry of entries) {
    const key = formatPackageEntry(entry);
    if (seen.has(key)) continue;
    seen.add(key);

    // No version, or one we can't read: every advisory on the package is listed
    const version = entry.version ? parseVersion(entry.version) : null;
    const candidates = [...(byPackage.get(entry.name.toLowerCase())?.values() ?? [])];
    const advisories: MatchedAdvisory[] = [];
    let affected = false;
    for (const c of candidates) {
      if (!version) { advisories.push(matched(c, 'ghsa', null)); continue; }
      const hit = pick(c.ranges, version);
      if (hit === 'unparsed') advisories.push(matched(c, 'ghsa', null, true));
      else if (hit) { advisories.push(matched(c, 'ghsa', hit)); affected = true; }
    }

    const osvOnly: Candidate[] = [];
    let osvState: PackageResult['osv'] = 'off';
    if (osv !== undefined) {
      const found = osv?.get(key);
      osvState = found?.complete ? 'checked' : 'unavailable';
      for (const vuln of found?.vulns ?? []) {
        const ids = [vuln.id, ...vuln.aliases];
        if (ids.some(id => withdrawn.has(id))) continue;
        const listed = advisories.find(a => ids.includes(a.id));
        if (listed) {
          // OSV confirms an advisory whose range we couldn't read
          if (listed.unparsed && version) { delete listed.unparsed; affected = true; }
          continue;
        }
        const ours = candidates.find(c => ids.includes(c.id));
        const c: Candidate = ours ?? { id: vuln.id, severity: vuln.severity, summary: vuln.summary, ranges: vuln.ranges, malware: vuln.malware };
        if (!ours) osvOnly.push(c);
        // With a version OSV only reports what affects it, so it counts even where our ranges disagree
        const hit = version ? pick(c.ranges, version) : null;
        advisories.push(matched(c, 'osv', hit && hit !== 'unparsed' ? hit : null));
        if (version) affected = true;
      }
    }

    advisories.sort((a, b) => Number(Boolean(b.malware)) - Number(Boolean(a.malware)) || rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id));
    let status: PackageStatus;
    if (entry.version && !version) status = 'unknown';
    else if (!advisories.length) status = 'not-affected';
    else if (!entry.version) status = 'no-version';
    else status = affected ? 'affected' : 'unknown';

    const result: PackageResult = {
      entry: entry.version ? { name: entry.name, version: entry.version } : { name: entry.name },
      status,
      advisories,
      malware: advisories.some(a => a.malware),
      malwareCheckedDays: malware ? NPM_MALWARE_DAYS : null,
      osv: osvState,
    };
    const minSafe = advisories.length ? safeVersion(highestVersion(advisories.map(a => a.patched)), [...candidates, ...osvOnly], pick) : undefined;
    if (minSafe) result.minSafeVersion = minSafe;
    if (advisories.length) result.highestSeverity = advisories[0].malware ? 'critical' : advisories.reduce((s, a) => (rank(a.severity) < rank(s) ? a.severity : s), advisories[0].severity);
    results.push(result);
  }

  return results.sort((a, b) => Number(b.malware) - Number(a.malware) || rank(a.highestSeverity) - rank(b.highestSeverity)
    || (a.entry.name < b.entry.name ? -1 : a.entry.name > b.entry.name ? 1 : 0)
    || (a.entry.version ?? '').localeCompare(b.entry.version ?? ''));
}

/**
 * Notification keys for the advisories listed on the results: `advisoryId|package@version`, or
 * `advisoryId|package` for an unversioned entry. Unreadable ranges count: they are flagged, never safe.
 */
export function affectingKeys(results: PackageResult[]): string[] {
  const keys = new Set<string>();
  for (const r of results) {
    for (const a of r.advisories) keys.add(`${a.id}|${formatPackageEntry(r.entry)}`);
  }
  return [...keys];
}
