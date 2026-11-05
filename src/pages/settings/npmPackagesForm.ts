import { formatPackageEntry, parsePackageEntry } from '../../services/npm/semver';

export interface PackageInputResult {
  added: string[]; // new, valid entries in typed order
  invalid: string[]; // tokens that are not `name` or `name@exact.version`
}

/** Splits pasted text on commas and whitespace and checks each token; entries already in `existing` (or repeated) are skipped silently */
export function parsePackageInput(input: string, existing: string[]): PackageInputResult {
  const seen = new Set(existing.map(e => e.toLowerCase()));
  const added: string[] = [];
  const invalid: string[] = [];
  for (const token of input.split(/[\s,]+/).filter(Boolean)) {
    const entry = parsePackageEntry(token);
    if (!entry) { invalid.push(token); continue; }
    const formatted = formatPackageEntry(entry);
    if (seen.has(formatted)) continue;
    seen.add(formatted);
    added.push(formatted);
  }
  return { added, invalid };
}
