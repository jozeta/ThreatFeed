// The Vulnerabilities → npm tab's list and stats: the detailed advisories and the malware reports as one list
// of rows, its filters and the stats strip. Pure, so the tab only renders.

import type { NpmAdvisoryData, NpmMalwareData, NpmRange } from './advisories';
import type { PackageResult, Severity } from './match';
import { formatPackageEntry } from './semver';

const DAY_MS = 24 * 60 * 60 * 1000;

export type NpmRowKind = 'vulnerability' | 'malware';

/** One advisory as the list shows it; a malware advisory is grouped over its packages and read as critical */
export interface NpmRow {
  id: string;
  kind: NpmRowKind;
  severity: Severity;
  packages: string[];
  summary: string;
  ranges: NpmRange[];
  cves: string[];
  epss?: number;
  kev?: boolean;
  published: string;
  date: string; // the later of published and updated: what the date range and the order go by
  withdrawn: boolean;
}

export const NPM_DAY_RANGES = [7, 30, 90] as const;
export type NpmDays = (typeof NPM_DAY_RANGES)[number];

export interface NpmFilters {
  severity: string; // '' for any
  type: 'all' | NpmRowKind;
  mine: boolean; // affects a watched package
  fix: boolean; // a patched version exists
  kev: boolean;
  cve: boolean;
  days: NpmDays;
  query: string;
  pkg: string; // one package, '' for any
}

export const DEFAULT_NPM_FILTERS: NpmFilters = { severity: '', type: 'vulnerability', mine: false, fix: false, kev: false, cve: false, days: 30, query: '', pkg: '' };

/** A watched entry an advisory affects (or may affect), as matchPackages listed it */
export interface AffectedEntry {
  entry: string;
  versioned: boolean; // false for an entry without a version: listed for the package, not known to affect it
  vulnerable: string;
  patched?: string;
  unparsed?: boolean;
}

const time = (iso: string) => Date.parse(iso) || 0;

/** The detailed advisories and the malware reports, newest first */
export function npmRows(data: NpmAdvisoryData | null, malware: NpmMalwareData | null): NpmRow[] {
  const rows: NpmRow[] = (data?.recent ?? []).map((a) => {
    const row: NpmRow = {
      id: a.id,
      kind: 'vulnerability',
      severity: a.severity,
      packages: [...new Set(a.ranges.map((r) => r.package))],
      summary: a.summary,
      ranges: a.ranges,
      cves: a.cves,
      published: a.published,
      date: time(a.updated) > time(a.published) ? a.updated : a.published,
      withdrawn: Boolean(a.withdrawn),
    };
    if (a.epss) row.epss = a.epss.score;
    if (a.kev) row.kev = true;
    return row;
  });

  const malwareRows = new Map<string, NpmRow>();
  for (const [id, pkg, vulnerable, published] of malware?.entries ?? []) {
    const row = malwareRows.get(id);
    if (row) {
      if (!row.packages.includes(pkg)) row.packages.push(pkg);
      row.ranges.push({ package: pkg, vulnerable });
      continue;
    }
    malwareRows.set(id, { id, kind: 'malware', severity: 'critical', packages: [pkg], summary: '', ranges: [{ package: pkg, vulnerable }], cves: [], published, date: published, withdrawn: false });
  }
  for (const row of malwareRows.values()) row.summary = `Malicious code in ${row.packages.join(', ')}`;

  return [...rows, ...malwareRows.values()].sort((a, b) => time(b.date) - time(a.date) || a.id.localeCompare(b.id));
}

export function filterNpmRows(rows: NpmRow[], f: NpmFilters, affecting: ReadonlyMap<string, AffectedEntry[]>, now: number): NpmRow[] {
  const since = now - f.days * DAY_MS;
  const q = f.query.trim().toLowerCase();
  const pkg = f.pkg.toLowerCase();
  return rows.filter((r) =>
    time(r.date) >= since &&
    (f.type === 'all' || r.kind === f.type) &&
    (!f.severity || r.severity === f.severity) &&
    (!f.mine || affecting.has(r.id)) &&
    (!f.fix || r.ranges.some((x) => x.patched)) &&
    (!f.kev || r.kev) &&
    (!f.cve || r.cves.length > 0) &&
    (!pkg || r.packages.some((p) => p.toLowerCase() === pkg)) &&
    (!q || `${r.id} ${r.cves.join(' ')} ${r.packages.join(' ')} ${r.summary}`.toLowerCase().includes(q))
  );
}

/** Each advisory matchPackages listed for a watched entry, with the entries and the ranges that matched */
export function affectingByAdvisory(results: PackageResult[]): Map<string, AffectedEntry[]> {
  const map = new Map<string, AffectedEntry[]>();
  for (const r of results) {
    const entry = formatPackageEntry(r.entry);
    for (const a of r.advisories) {
      const hit: AffectedEntry = { entry, versioned: Boolean(r.entry.version), vulnerable: a.vulnerable };
      if (a.patched) hit.patched = a.patched;
      if (a.unparsed) hit.unparsed = true;
      const list = map.get(a.id);
      if (list) list.push(hit);
      else map.set(a.id, [hit]);
    }
  }
  return map;
}

export interface NpmStats {
  last7: number;
  last30: number;
  critical30: number;
  high30: number;
  malware7: number;
  topPackages: [string, number][]; // the 5 packages with the most advisories in 30 days
}

/** The stats strip, over all rows (not the filters). Withdrawn advisories don't count */
export function npmStats(rows: NpmRow[], now: number): NpmStats {
  const within = (r: NpmRow, days: number) => time(r.date) >= now - days * DAY_MS;
  const vulns30 = rows.filter((r) => r.kind === 'vulnerability' && !r.withdrawn && within(r, 30));
  const counts = new Map<string, number>();
  for (const r of vulns30) for (const p of r.packages) counts.set(p, (counts.get(p) ?? 0) + 1);
  return {
    last7: vulns30.filter((r) => within(r, 7)).length,
    last30: vulns30.length,
    critical30: vulns30.filter((r) => r.severity === 'critical').length,
    high30: vulns30.filter((r) => r.severity === 'high').length,
    malware7: rows.filter((r) => r.kind === 'malware' && within(r, 7)).length,
    topPackages: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
  };
}
