import { EntitiesData } from '../../types';
import { groupDisplayName } from '../../utils/countries';
import { countable } from './actors';
import { AMBIGUOUS_VENDORS } from './trends';
import { canonicalVendor } from './vendor';

/**
 * data/entities.json: the names that turn into links in article text, small enough (about 80 KB) to load
 * shortly after first paint without the KEV catalog, the ransomware intel or the actor profiles behind them.
 * The snapshot writes it from those files; the app links text with entityLinks.ts.
 */

type Named = { name: string; aliases: string[] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : []);

/** Aliases that can match text (see actorMentions), without the name and without case-only duplicates */
function linkable(name: string, aliases: string[]): string[] {
  const seen = new Set([name.toLowerCase()]);
  return aliases.filter(a => countable(a) && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()));
}

/** Profiles with the aliases text can match; one that can't be matched by any name is left out */
function profiles<T extends Named & { id: string }>(list: T[]): { id: string; name: string; aliases: string[] }[] {
  return list
    .map(p => ({ id: p.id, name: p.name, aliases: linkable(p.name, p.aliases) }))
    .filter(p => countable(p.name) || p.aliases.length)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface EntitySources {
  kevVendors: string[];
  groups: { key: string; name: string; aliases: string[] }[]; // ransomware.json's profiled groups
  victimGroups: string[]; // groups posting on leak sites
  actors: { actors: (Named & { id: string })[]; malware: (Named & { id: string })[] } | null;
}

export function buildEntities(s: EntitySources): Omit<EntitiesData, 'generatedAt'> {
  const vendors = new Map<string, string>();
  for (const v of s.kevVendors.map(canonicalVendor)) {
    if (v.length >= 2 && !AMBIGUOUS_VENDORS.has(v.toLowerCase()) && !vendors.has(v.toLowerCase())) vendors.set(v.toLowerCase(), v);
  }
  // Profiled groups first, so their aliases stay; leak-site names add the groups without a profile
  const groups = new Map<string, EntitiesData['groups'][number]>();
  for (const g of [...s.groups, ...s.victimGroups.map(name => ({ key: name, name, aliases: [] as string[] }))]) {
    const key = g.key.toLowerCase();
    const name = groupDisplayName(g.name);
    if (groups.has(key)) continue;
    const aliases = linkable(name, g.aliases);
    if (countable(name) || aliases.length) groups.set(key, { key, name, aliases });
  }
  return {
    vendors: [...vendors.values()].sort((a, b) => a.localeCompare(b)),
    groups: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)),
    actors: profiles(s.actors?.actors ?? []),
    malware: profiles(s.actors?.malware ?? []),
  };
}

/** entities.json as published, or null if it isn't; malformed entries are dropped (it comes over the network) */
export function decodeEntities(raw: any): EntitiesData | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.vendors)) return null;
  const list = <K extends string>(v: unknown, idKey: K) =>
    (Array.isArray(v) ? v : [])
      .filter((p: any) => p && typeof p[idKey] === 'string' && p[idKey] && typeof p.name === 'string' && p.name.trim())
      .map((p: any) => ({ [idKey]: p[idKey], name: p.name, aliases: strings(p.aliases) }) as { [P in K]: string } & Named);
  return {
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    vendors: strings(raw.vendors),
    groups: list(raw.groups, 'key'),
    actors: list(raw.actors, 'id'),
    malware: list(raw.malware, 'id'),
  };
}
