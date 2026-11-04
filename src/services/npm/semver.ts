// Version and range logic for the npm vulnerability watch. A wrong "not affected" is the worst
// outcome, so everything here is strict: input that cannot be understood yields null, never a
// quiet "false". Advisory text is untrusted; nothing is evaluated, only matched by regex.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: (string | number)[];
}

export type RangeTest = (v: Version) => boolean;

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

const NUM = '(0|[1-9]\\d*)';
const PRE_ID = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMVER_RE = new RegExp(
  `^${NUM}\\.${NUM}\\.${NUM}(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
// "3", "3.1" as GitHub writes them in ranges (no prerelease on a partial version).
const PARTIAL_RE = new RegExp(`^${NUM}(?:\\.${NUM})?$`);

function safeInt(s: string): number | null {
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Strict semver `MAJOR.MINOR.PATCH[-pre][+build]`; one leading `v` is tolerated. Else null. */
export function parseVersion(input: string): Version | null {
  const s = input.startsWith('v') ? input.slice(1) : input;
  const m = SEMVER_RE.exec(s);
  if (!m) return null;
  const major = safeInt(m[1]);
  const minor = safeInt(m[2]);
  const patch = safeInt(m[3]);
  if (major === null || minor === null || patch === null) return null;
  const pre: (string | number)[] = [];
  if (m[4] !== undefined) {
    for (const id of m[4].split('.')) {
      if (/^\d+$/.test(id)) {
        const n = safeInt(id);
        if (n === null) return null;
        pre.push(n);
      } else {
        pre.push(id);
      }
    }
  }
  return { major, minor, patch, pre };
}

function cmpNum(a: number, b: number): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver 2.0.0 precedence. Build metadata is not part of Version, so it is ignored. */
export function compareVersions(a: Version, b: Version): -1 | 0 | 1 {
  const core = cmpNum(a.major, b.major) || cmpNum(a.minor, b.minor) || cmpNum(a.patch, b.patch);
  if (core) return core as -1 | 1;
  // A version without prerelease outranks the same core with one.
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  const n = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < n; i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return cmpNum(x, y);
    if (typeof x === 'number') return -1; // numeric identifiers rank below alphanumeric ones
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1; // ASCII order
  }
  return cmpNum(a.pre.length, b.pre.length); // a shorter set ranks lower
}

const ZERO: Version = { major: 0, minor: 0, patch: 0, pre: [] };

/** Bound as written in an advisory: full semver, or a partial "3" / "3.1" read as 3.0.0 / 3.1.0. */
function parseBound(s: string): Version | null {
  const full = parseVersion(s);
  if (full) return full;
  const m = PARTIAL_RE.exec(s);
  if (!m) return null;
  const major = safeInt(m[1]);
  const minor = m[2] === undefined ? 0 : safeInt(m[2]);
  if (major === null || minor === null) return null;
  return { major, minor, patch: 0, pre: [] };
}

// "0" means "from the very beginning": it must include 0.0.0 prereleases, which sort below 0.0.0.
const isBeginning = (s: string) => s === '0';

const COMPARATOR_RE = /^(>=|<=|>|<|=)\s*(\S+)$/;

/** GitHub Advisory `vulnerable_version_range`, e.g. ">= 3.25.0, < 3.90.0". Null when unparseable. */
export function parseGhsaRange(range: string): RangeTest | null {
  const tests: RangeTest[] = [];
  for (const part of range.split(',')) {
    const m = COMPARATOR_RE.exec(part.trim());
    if (!m) return null;
    const [, op, text] = m;
    if (op === '>=' && isBeginning(text)) {
      tests.push(() => true);
      continue;
    }
    const bound = parseBound(text);
    if (!bound) return null;
    switch (op) {
      case '>=': tests.push((v) => compareVersions(v, bound) >= 0); break;
      case '>': tests.push((v) => compareVersions(v, bound) > 0); break;
      case '<=': tests.push((v) => compareVersions(v, bound) <= 0); break;
      case '<': tests.push((v) => compareVersions(v, bound) < 0); break;
      default: tests.push((v) => compareVersions(v, bound) === 0); break;
    }
  }
  return (v) => tests.every((t) => t(v));
}

type Resolved = { kind: 'introduced' | 'fixed' | 'last_affected'; ver: Version; beginning: boolean };
const KIND_ORDER = { fixed: 0, introduced: 1, last_affected: 2 } as const;

/**
 * OSV `SEMVER` range semantics over an event list: walk the events in version order, introduced
 * switches "affected" on, fixed switches it off, last_affected switches it off after that version.
 * Null when the events are empty, malformed, or never introduce anything.
 */
export function osvAffected(v: Version, events: OsvEvent[]): boolean | null {
  const resolved: Resolved[] = [];
  for (const e of events) {
    const keys = (['introduced', 'fixed', 'last_affected'] as const).filter((k) => e[k] !== undefined);
    if (keys.length !== 1) return null;
    const kind = keys[0];
    const text = e[kind];
    if (typeof text !== 'string') return null;
    const beginning = kind === 'introduced' && isBeginning(text);
    const ver = beginning ? ZERO : parseVersion(text);
    if (!ver) return null;
    resolved.push({ kind, ver, beginning });
  }
  if (!resolved.some((r) => r.kind === 'introduced')) return null;
  resolved.sort((a, b) => {
    if (a.beginning !== b.beginning) return a.beginning ? -1 : 1;
    // At the same version, fixed is applied before introduced, so re-introduction wins.
    return compareVersions(a.ver, b.ver) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
  let affected = false;
  for (const r of resolved) {
    const c = r.beginning ? -1 : compareVersions(r.ver, v);
    if (r.kind === 'introduced') { if (c <= 0) affected = true; }
    else if (r.kind === 'fixed') { if (c <= 0) affected = false; }
    else if (c < 0) affected = false;
  }
  return affected;
}

export interface PackageEntry {
  name: string;
  version?: string;
}

// npm naming: lowercase, URL-safe, no leading dot or underscore, optional @scope/.
const NAME_PART = '[a-z0-9~-][a-z0-9._~-]*';
const NAME_RE = new RegExp(`^(?:@${NAME_PART}/)?${NAME_PART}$`);

/** `name`, `name@1.2.3`, `@scope/name` or `@scope/name@1.2.3`, with an exact version. Else null. */
export function parsePackageEntry(s: string): PackageEntry | null {
  const at = s.lastIndexOf('@');
  const hasVersion = at > 0;
  const name = hasVersion ? s.slice(0, at) : s;
  if (name.length > 214 || !NAME_RE.test(name)) return null;
  if (!hasVersion) return { name };
  const version = s.slice(at + 1);
  // No leading "v": the entry must format back to exactly what was typed.
  if (version.startsWith('v') || !parseVersion(version)) return null;
  return { name, version };
}

export function formatPackageEntry(e: PackageEntry): string {
  return e.version ? `${e.name}@${e.version}` : e.name;
}
