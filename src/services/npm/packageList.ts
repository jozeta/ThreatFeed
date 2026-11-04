import { formatPackageEntry, parsePackageEntry } from './semver';

/** A stored or imported watched-package list reduced to valid, deduplicated entries (untrusted input: anything malformed is dropped) */
export function cleanPackageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const entry = typeof item === 'string' ? parsePackageEntry(item.trim()) : null;
    if (!entry) continue;
    const formatted = formatPackageEntry(entry);
    if (seen.has(formatted)) continue;
    seen.add(formatted);
    out.push(formatted);
  }
  return out;
}
