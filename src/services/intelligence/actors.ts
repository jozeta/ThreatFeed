import { ActorProfile, ActorsData, Article, MalwareProfile } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { isLeakSitePost } from './incidents';

/**
 * Threat actor and malware profiles for data/actors.json: MITRE ATT&CK intrusion sets and software,
 * merged with Malpedia's family list. The snapshot builds them once a day (when it refreshes both
 * sources for the ransomware intel); the app counts their mentions in the articles itself.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TECHNIQUES = 40;
const MAX_ALIASES = 12;
const MAX_ACTORS = 15;
// Descriptions are clipped to keep actors.json near 400 KB; the panels link to MITRE and Malpedia for the rest
const MAX_ACTOR_DESCRIPTION = 400;
const MAX_MALWARE_DESCRIPTION = 220;
const ATTACK = 'https://attack.mitre.org/';
const MALPEDIA = 'https://malpedia.caad.fkie.fraunhofer.de/';

const usable = (o: any) => o && !o.revoked && !o.x_mitre_deprecated;
const attackRef = (o: any) => (o?.external_references ?? []).find((r: any) => r?.source_name === 'mitre-attack') ?? {};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : []);
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Aliases without the name itself and without duplicates that only differ in case */
function aliasList(name: string, ...lists: string[][]): string[] {
  const seen = new Set([name.toLowerCase()]);
  const result: string[] = [];
  for (const a of lists.flat()) {
    if (seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    result.push(a);
  }
  return result.slice(0, MAX_ALIASES);
}

/** ATT&CK's first paragraph as plain text: "[APT28](https://…)" becomes "APT28", "(Citation: …)" goes */
export function firstParagraph(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.split(/\n\s*\n/)[0]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(Citation:[^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text cut to `max` characters, at the end of a sentence when there is one in the second half, else at a word */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max / 2) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,;:.]+$/, '')}…`;
}

// Origin countries ATT&CK attributes groups to, as written in its descriptions
const COUNTRIES: [string, string][] = [
  ['North Korean?|DPRK', 'KP'], ['South Korean?', 'KR'], ['Russian?', 'RU'], ['China|Chinese', 'CN'], ['Iran(?:ian)?', 'IR'],
  ['Vietnam(?:ese)?', 'VN'], ['Pakistan(?:i)?', 'PK'], ['India(?:n)?', 'IN'], ['Leban(?:on|ese)', 'LB'], ['Belarus(?:ian)?', 'BY'],
  ['Turkey|Turkish|Türkiye', 'TR'], ['Nigerian?', 'NG'], ['Syrian?', 'SY'], ['Gaza|Palestinian', 'PS'], ['United Arab Emirates|UAE', 'AE'],
];
const COUNTRY_NAMES = COUNTRIES.map(([n]) => n).join('|');
// "attributed to Russia's GRU", "operating on behalf of the Chinese government", "a Pakistan-based group",
// "a suspected Iranian threat group", "with Chinese origins", "Iran's Ministry of Intelligence"; "targets Russian
// government entities" is a victim and "Russian-speaking" a language, neither an origin
const ORIGIN = [
  new RegExp(`\\b(?:attributed to|linked to|associated with|affiliated with|operat(?:e|es|ing) (?:out )?of|based in|on behalf of|sponsored by|working for|supports?) (?:the )?(?:government of )?(${COUNTRY_NAMES})\\b`),
  new RegExp(`(?<!target(?:s|ed|ing)? (?:the )?)\\b(${COUNTRY_NAMES})(?: \\([A-Z]{2,5}\\))?(?:[-–](?:based|nexus|linked|sponsored|backed|aligned|related)|(?:'s|’s)? (?:Ministry|General Staff)|,? (?:state|government|intelligence|military|threat|cyber(?! ?crim)|espionage|APT|actors?|group|hackers?|origins?|nexus)\\b)`),
];

/** The country a group is attributed to, when its description says so plainly; undefined otherwise */
export function countryFromDescription(text: string): string | undefined {
  const hits = ORIGIN.map(re => re.exec(text)).filter((m): m is RegExpExecArray => m !== null).sort((a, b) => a.index - b.index);
  const name = hits[0]?.[1];
  return name ? COUNTRIES.find(([n]) => new RegExp(`^(?:${n})$`).test(name))?.[1] : undefined;
}

const FIRST_SEEN = /\b(?:since|as early as)\s+(?:at least\s+)?(?:(?:early|mid|late)[- ]?)?(?:[A-Z][a-z]+\s+)?((?:19|20)\d{2})\b/;

/** Every intrusion set "uses" link, by source: techniques and software in one map */
function usesBySource(objects: any[]): Map<string, any[]> {
  const byId = new Map(objects.map(o => [o?.id, o]));
  const uses = new Map<string, any[]>();
  for (const r of objects) {
    if (r?.type !== 'relationship' || r.relationship_type !== 'uses' || r.revoked) continue;
    const target = byId.get(r.target_ref);
    if (!usable(target)) continue;
    const list = uses.get(r.source_ref) ?? [];
    if (!list.includes(target)) list.push(target);
    uses.set(r.source_ref, list);
  }
  return uses;
}

const bundleObjects = (bundle: any): any[] => (Array.isArray(bundle?.objects) ? bundle.objects : []);
const isSoftware = (o: any) => o?.type === 'malware' || o?.type === 'tool';

/** Threat actors from the ATT&CK enterprise bundle (intrusion sets that are neither revoked nor deprecated) */
export function buildActorProfiles(bundle: any): ActorProfile[] {
  const objects = bundleObjects(bundle);
  const uses = usesBySource(objects);
  const ref = (o: any) => ({ id: String(attackRef(o).external_id ?? ''), name: String(o.name ?? '') });
  const actors: ActorProfile[] = [];
  for (const o of objects) {
    if (o?.type !== 'intrusion-set' || !usable(o) || typeof o.name !== 'string') continue;
    const { external_id: id, url } = attackRef(o);
    if (typeof id !== 'string') continue;
    const full = firstParagraph(o.description);
    const description = clip(full, MAX_ACTOR_DESCRIPTION);
    const used = uses.get(o.id) ?? [];
    const country = countryFromDescription(full);
    const firstSeen = typeof o.first_seen === 'string' ? o.first_seen.slice(0, 4) : full.match(FIRST_SEEN)?.[1];
    actors.push({
      id,
      name: o.name,
      aliases: aliasList(o.name, strings(o.aliases)),
      description,
      ...(country ? { country } : {}),
      ...(firstSeen ? { firstSeen } : {}),
      techniques: used.filter(t => t.type === 'attack-pattern').map(ref).filter(t => t.id).sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_TECHNIQUES),
      software: used.filter(isSoftware).map(ref).filter(t => t.id).sort((a, b) => a.name.localeCompare(b.name)),
      url: typeof url === 'string' && url.startsWith(ATTACK) ? url : `${ATTACK}groups/${id}`,
    });
  }
  return actors.sort((a, b) => a.name.localeCompare(b.name));
}

interface Family { id: string; f: any; common: string; keys: string[]; urls: number }

/** Malpedia's families with their normalized name keys (common name first) */
function malpediaFamilies(families: Record<string, any> | null): Family[] {
  return Object.entries(families ?? {})
    .filter(([, f]) => f && typeof f.common_name === 'string' && nameKey(f.common_name).length >= 3)
    .map(([id, f]) => ({
      id, f,
      common: nameKey(f.common_name),
      keys: [...new Set([f.common_name, ...strings(f.alt_names)].map(nameKey).filter(k => k.length >= 3))],
      urls: strings(f.urls).length,
    }));
}

const malpediaUrl = (id: string) => `${MALPEDIA}details/${encodeURIComponent(id)}`;

/**
 * Malware and tools: ATT&CK software (with the groups using it) merged with its Malpedia family. Malpedia lists
 * thousands more families, so those only come in when the articles mention them; everything else would be dead
 * weight in the file.
 *
 * Merging: an ATT&CK name equal to a family's common name is a match (with several platform variants, win.x and
 * elf.x, the best-documented one). Otherwise aliases may match, but only when they point at a single family and
 * no other ATT&CK entry claims it: Malpedia's EternalPetya lists both NotPetya and BadRabbit, and neither should
 * inherit the other's names. A family sharing any name with ATT&CK software never becomes a profile of its own.
 */
export function buildMalwareProfiles(bundle: any, malpedia: Record<string, any> | null, articles: Article[]): MalwareProfile[] {
  const objects = bundleObjects(bundle);
  const uses = usesBySource(objects);
  const usedBy = new Map<string, string[]>();
  for (const o of objects) {
    if (o?.type !== 'intrusion-set' || !usable(o) || typeof o.name !== 'string') continue;
    for (const t of uses.get(o.id) ?? []) if (isSoftware(t)) usedBy.set(t.id, [...(usedBy.get(t.id) ?? []), o.name]);
  }
  const families = malpediaFamilies(malpedia);
  // Variants share a common name; the best-documented one stands for them all
  const byCommon = new Map<string, Family>();
  for (const fam of families) {
    const best = byCommon.get(fam.common);
    if (!best || fam.urls > best.urls) byCommon.set(fam.common, fam);
  }
  const commonsByKey = new Map<string, Set<string>>();
  for (const fam of families) for (const k of fam.keys) commonsByKey.set(k, (commonsByKey.get(k) ?? new Set()).add(fam.common));

  const software = objects.filter(o => isSoftware(o) && usable(o) && typeof o.name === 'string' && typeof attackRef(o).external_id === 'string');
  const attackKeys = new Set<string>();
  const ownKeys = new Map<any, Set<string>>();
  const claims = new Map<any, { common: string; strong: boolean }>();
  // How many ATT&CK entries share any name with each family: an alias match only counts when it's one
  const contenders = new Map<string, number>();
  for (const o of software) {
    const keys = new Set([o.name, ...strings(o.x_mitre_aliases)].map(nameKey).filter(k => k.length >= 3));
    ownKeys.set(o, keys);
    keys.forEach(k => attackKeys.add(k));
    const candidates = new Set([...keys].flatMap(k => [...(commonsByKey.get(k) ?? [])]));
    candidates.forEach(c => contenders.set(c, (contenders.get(c) ?? 0) + 1));
    if (byCommon.has(nameKey(o.name))) claims.set(o, { common: nameKey(o.name), strong: true });
    else if (candidates.size === 1) claims.set(o, { common: [...candidates][0], strong: false });
  }
  const strongClaims = new Set([...claims.values()].filter(c => c.strong).map(c => c.common));

  const result: MalwareProfile[] = [];
  const ids = new Set<string>();
  const uniqueId = (name: string, fallback: string) => {
    let id = slug(name) || fallback.toLowerCase();
    if (ids.has(id)) id = `${id}-${fallback.toLowerCase()}`;
    ids.add(id);
    return id;
  };

  for (const o of software) {
    const { external_id: attackId, url } = attackRef(o);
    const claim = claims.get(o);
    // A contested alias match is dropped: to the entry named like the family when there is one, else to nobody
    const merged = claim && (claim.strong || (contenders.get(claim.common) === 1 && !strongClaims.has(claim.common))) ? byCommon.get(claim.common) : undefined;
    const family = merged?.f;
    // Malpedia names that are another ATT&CK entry's name or alias stay with that entry
    const own = ownKeys.get(o)!;
    const imported = family ? [family.common_name.trim(), ...strings(family.alt_names)].filter(n => own.has(nameKey(n)) || !attackKeys.has(nameKey(n))) : [];
    result.push({
      id: uniqueId(o.name, attackId),
      name: o.name,
      aliases: aliasList(o.name, strings(o.x_mitre_aliases), imported),
      description: clip(firstParagraph(o.description) || firstParagraph(family?.description), MAX_MALWARE_DESCRIPTION),
      kind: o.type,
      attackId,
      actors: actorNames(usedBy.get(o.id) ?? [], strings(family?.attribution)),
      ...(merged ? { malpediaUrl: malpediaUrl(merged.id) } : {}),
      url: typeof url === 'string' && url.startsWith(ATTACK) ? url : `${ATTACK}software/${attackId}`,
    });
  }

  // Malpedia-only families the news names, one per name: a family sharing a name with ATT&CK software or with
  // a better-documented family already added is left out, so a name never resolves to two profiles
  const candidates = [...byCommon.values()].filter(fam => !fam.keys.some(k => attackKeys.has(k)) && !ids.has(slug(fam.f.common_name)) && slug(fam.f.common_name));
  const extra = new Map(candidates.map(fam => [fam, {
    id: slug(fam.f.common_name),
    name: fam.f.common_name.trim(),
    aliases: aliasList(fam.f.common_name.trim(), strings(fam.f.alt_names)),
    description: clip(firstParagraph(fam.f.description), MAX_MALWARE_DESCRIPTION),
    kind: 'malware' as const,
    actors: actorNames([], strings(fam.f.attribution)),
    malpediaUrl: malpediaUrl(fam.id),
  }]));
  const mentioned = actorMentions(articles, [...extra.values()], Infinity);
  const taken = new Set<string>();
  for (const [fam, m] of [...extra].filter(([, m]) => mentioned.has(m.id)).sort((a, b) => b[0].urls - a[0].urls)) {
    if (taken.has(m.id) || fam.keys.some(k => taken.has(k))) continue;
    fam.keys.forEach(k => taken.add(k));
    taken.add(m.id);
    result.push(m);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function actorNames(...lists: string[][]): string[] {
  const seen = new Set<string>();
  return lists.flat().filter(n => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, MAX_ACTORS);
}

// ---------- Mentions in the articles (computed in the browser) ----------

export interface Mentionable { id: string; name: string; aliases: string[] }
export interface Mentions {
  count: number; // distinct articles in the window
  daily: number[]; // per-day counts, oldest first
  articles: Article[]; // newest first
}

// Windows commands that ATT&CK lists as tools: never counted, they're in every how-to article
export const COMMAND_TERMS = new Set([
  'ping', 'route', 'expand', 'systeminfo', 'ipconfig', 'netstat', 'whoami', 'schtasks', 'tasklist', 'nltest', 'forfiles', 'wevtutil',
  'xcopy', 'msiexec', 'powershell', 'esentutl', 'certutil', 'netsh', 'nbtstat', 'dsquery', 'rundll32', 'regsvr32', 'wmic', 'telnet', 'curl', 'wget',
]);
// Real threat names that are also everyday words, places or products: counted only right next to a threat
// word ("Play ransomware", "Royal group", "Cuba ransomware gang"), never just anywhere in a security story
export const AMBIGUOUS_TERMS = new Set([
  'cuba', 'royal', 'play', 'prestige', 'explosive', 'chaos', 'rover', 'equation', 'silence', 'machete', 'inception', 'patchwork',
  'cleaver', 'axiom', 'lead', 'zinc', 'nickel', 'mercury', 'platinum', 'gold', 'iron', 'cobalt', 'copper', 'radium',
  // Malpedia families seen matching ordinary news (checked against a month of articles)
  'nexus', 'rock', 'dark', 'leverage', 'milan', 'global', 'glasses', 'sage', 'resident', 'anchor', 'stop', 'chromium', 'bluesky',
  'james', 'saga', 'lorem ipsum', 'red alert',
]);
export const countable = (term: string) => term.length >= 4 && !COMMAND_TERMS.has(term.toLowerCase());
const firstWord = (term: string) => term.toLowerCase().match(/\w+/)?.[0];
// "APT28", "Fancy Bear", "ShinyHunters" are unmistakable; a plain word like "Carbon" or "Sofacy" also
// needs the article to be about threats, or every carbon-price story would count for Turla's backdoor
export const distinctive = (term: string) => /\d|[\s-]|[a-z][A-Z]/.test(term);
const THREAT_WORDS = 'malware|ransomware|backdoors?|trojans?|(?:info)?stealers?|loaders?|botnets?|RATs?|spyware|wipers?|rootkits?|droppers?|hack(?:er|ers|ed|ing)|threat (?:actor|group)s?|APTs?|espionage|state-sponsored|nation-state';
export const THREAT_CONTEXT = new RegExp(`\\b(?:${THREAT_WORDS})\\b`, 'i');
// What may sit right after an ambiguous name ("Play ransomware", "Royal group") or right before it ("the ransomware Play")
export const THREAT_AFTER = `(?:${THREAT_WORDS}|gang|group|operators?|affiliates?|crew|actors?)`;
export const THREAT_BEFORE = '(?:ransomware|malware|backdoor|trojan|stealer|botnet|APT|group)';
const adjacentCache = new Map<string, RegExp>();
function adjacentToThreat(text: string, term: string): boolean {
  let re = adjacentCache.get(term);
  if (!re) {
    const t = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?<!\\w)${t}(?:'s)?\\s+${THREAT_AFTER}\\b|\\b${THREAT_BEFORE}\\s+${t}(?!\\w)`, 'i');
    adjacentCache.set(term, re);
  }
  return re.test(text);
}

/**
 * How often each profile's name or aliases appear in the articles (title and summary, whole words,
 * ignoring case) in the last `days` days. Plain one-word names also need a threat word (malware, hackers,
 * APT…) in the same text, and everyday-word names one right next to them. Terms are indexed by their first
 * word so each article is only checked against the few profiles it could match. Leak-site victim posts aren't coverage.
 */
export function actorMentions(articles: Article[], profiles: Mentionable[], days = 30, now = Date.now()): Map<string, Mentions> {
  const byWord = new Map<string, { id: string; term: string; needsContext: boolean; ambiguous: boolean }[]>();
  for (const p of profiles) {
    for (const term of new Set([p.name, ...p.aliases])) {
      const word = countable(term) ? firstWord(term) : undefined;
      if (word) byWord.set(word, [...(byWord.get(word) ?? []), { id: p.id, term, needsContext: !distinctive(term), ambiguous: AMBIGUOUS_TERMS.has(term.toLowerCase()) }]);
    }
  }
  const start = now - days * DAY_MS;
  const slots = Number.isFinite(days) ? days : 1;
  const result = new Map<string, Mentions>();
  const sorted = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  for (const a of sorted) {
    const t = Date.parse(a.publishedAt);
    if (!(t >= start) || t > now + DAY_MS || isLeakSitePost(a)) continue;
    const text = `${a.title} ${a.description ?? ''}`;
    const hits = new Set<string>();
    let threat: boolean | undefined;
    for (const word of new Set(text.toLowerCase().match(/\w+/g) ?? [])) {
      for (const c of byWord.get(word) ?? []) {
        if (hits.has(c.id) || !containsTerm(text, c.term)) continue;
        if (c.ambiguous ? !adjacentToThreat(text, c.term) : c.needsContext && !(threat ??= THREAT_CONTEXT.test(text))) continue;
        hits.add(c.id);
      }
    }
    for (const id of hits) {
      let m = result.get(id);
      if (!m) result.set(id, (m = { count: 0, daily: new Array(slots).fill(0), articles: [] }));
      m.count++;
      m.daily[Number.isFinite(days) ? Math.max(0, Math.min(slots - 1, Math.floor((t - start) / DAY_MS))) : 0]++;
      m.articles.push(a);
    }
  }
  return result;
}

/** The actor (or else malware) profile a name or alias belongs to, ignoring case; names before aliases */
export function findProfile(data: Pick<ActorsData, 'actors' | 'malware'> | null, name: string): { kind: 'actor' | 'malware'; id: string } | null {
  const key = name.trim().toLowerCase();
  if (!data || !key) return null;
  // A profile by that name beats one that only lists it as an alias (ATT&CK itself has a few shared aliases)
  const named = (p: { name: string }) => p.name.toLowerCase() === key;
  const aliased = (p: { aliases: string[] }) => p.aliases.some(a => a.toLowerCase() === key);
  for (const match of [named, aliased]) {
    const actor = data.actors.find(match);
    if (actor) return { kind: 'actor', id: actor.id };
    const malware = data.malware.find(match);
    if (malware) return { kind: 'malware', id: malware.id };
  }
  return null;
}

// ---------- The file (snapshot and app) ----------

const actorUrl = (id: string) => `${ATTACK}groups/${encodeURIComponent(id)}`;
const softwareUrl = (id: string) => `${ATTACK}software/${encodeURIComponent(id)}`;

/**
 * actors.json in its compact published form: technique names live once in `techniqueNames` (actors share
 * most of them), software that is in the malware list is just its ID, and empty or derivable fields are left
 * out. That more than halves the file; decodeActors expands it back.
 */
export function encodeActors(data: ActorsData): Record<string, unknown> {
  const techniqueNames: Record<string, string> = {};
  const softwareNames = new Map(data.malware.filter(m => m.attackId).map(m => [m.attackId!, m.name]));
  const actors = data.actors.map(({ techniques, software, url, ...a }) => ({
    ...a,
    techniques: techniques.map(t => ((techniqueNames[t.id] ??= t.name) === t.name ? t.id : t)),
    software: software.map(s => (softwareNames.get(s.id) === s.name ? s.id : s)),
    ...(url === actorUrl(a.id) ? {} : { url }),
  }));
  const malware = data.malware.map(({ aliases, description, kind, actors, url, ...m }) => ({
    ...m,
    ...(aliases.length ? { aliases } : {}),
    ...(description ? { description } : {}),
    ...(kind === 'tool' ? { kind } : {}),
    ...(actors.length ? { actors } : {}),
    ...(url && url !== softwareUrl(m.attackId ?? '') ? { url } : {}),
  }));
  return { generatedAt: data.generatedAt, updates: data.updates, techniqueNames, actors, malware };
}

const optional = <K extends string>(key: K, v: unknown, ok: (s: string) => boolean): { [P in K]?: string } =>
  (typeof v === 'string' && ok(v) ? { [key]: v } : {}) as { [P in K]?: string };

/**
 * actors.json as published (compact or not), or null if it isn't. It comes over the network (the app's copy,
 * and the previous run's in the snapshot), so malformed entries are dropped and links are kept only to MITRE
 * and Malpedia: a bad entry can't throw in a panel.
 */
export function decodeActors(raw: any): ActorsData | null {
  if (!raw || !Array.isArray(raw.actors) || !Array.isArray(raw.malware)) return null;
  const techniqueNames: Record<string, unknown> = raw.techniqueNames && typeof raw.techniqueNames === 'object' ? raw.techniqueNames : {};
  const malware: MalwareProfile[] = raw.malware
    .filter((m: any) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m: any) => {
      const attackId = typeof m.attackId === 'string' ? m.attackId : undefined;
      const url = typeof m.url === 'string' && m.url.startsWith(ATTACK) ? m.url : attackId && softwareUrl(attackId);
      return {
        id: m.id,
        name: m.name,
        aliases: strings(m.aliases),
        description: typeof m.description === 'string' ? m.description : '',
        kind: m.kind === 'tool' ? 'tool' : 'malware',
        ...(attackId ? { attackId } : {}),
        actors: strings(m.actors),
        ...optional('malpediaUrl', m.malpediaUrl, s => s.startsWith(MALPEDIA)),
        ...(url ? { url } : {}),
      };
    });
  const softwareNames = new Map(malware.filter(m => m.attackId).map(m => [m.attackId!, m.name]));
  // Entries are either a bare ID (name looked up) or { id, name }; anything else is dropped
  const refs = (v: unknown, names: (id: string) => unknown) =>
    (Array.isArray(v) ? v : [])
      .map((r: any) => (typeof r === 'string' ? { id: r, name: names(r) } : r))
      .filter((r: any) => r && typeof r.id === 'string' && typeof r.name === 'string')
      .map((r: any) => ({ id: r.id as string, name: r.name as string }));
  const actors: ActorProfile[] = raw.actors
    .filter((a: any) => a && typeof a.id === 'string' && typeof a.name === 'string')
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      aliases: strings(a.aliases),
      description: typeof a.description === 'string' ? a.description : '',
      ...optional('country', a.country, s => /^[A-Z]{2}$/.test(s)),
      ...optional('firstSeen', a.firstSeen, s => s.length <= 10),
      techniques: refs(a.techniques, id => techniqueNames[id]),
      software: refs(a.software, id => softwareNames.get(id)),
      url: typeof a.url === 'string' && a.url.startsWith(ATTACK) ? a.url : actorUrl(a.id),
    }));
  return { generatedAt: raw.generatedAt, actors, malware, updates: raw.updates && typeof raw.updates === 'object' ? raw.updates : {} };
}

export interface ActorsRefresh {
  data: ActorsData;
  built: ('actors' | 'malware')[];
  carried: ('actors' | 'malware')[];
}

/**
 * This run's actors.json. ATT&CK and Malpedia are refreshed once a day; on the runs in between (null here)
 * the previous file's actors and malware are carried over. Without a previous file, whatever came in is used.
 */
export function refreshActors(previous: ActorsData | null, bundle: any, malpedia: Record<string, any> | null, articles: Article[], now = Date.now()): ActorsRefresh {
  const stamp = new Date(now).toISOString();
  const updates = { ...(previous?.updates ?? {}) };
  const result: ActorsRefresh = { data: { actors: previous?.actors ?? [], malware: previous?.malware ?? [], updates }, built: [], carried: [] };
  if (bundle) {
    result.data.actors = buildActorProfiles(bundle);
    updates.actors = stamp;
    result.built.push('actors');
  } else if (previous?.actors.length) {
    result.carried.push('actors');
  }
  // Malware needs both: without Malpedia, yesterday's merged list beats an ATT&CK-only one
  if (bundle && (malpedia || !previous?.malware.length)) {
    result.data.malware = buildMalwareProfiles(bundle, malpedia, articles);
    updates.malware = stamp;
    result.built.push('malware');
  } else if (previous?.malware.length) {
    result.carried.push('malware');
  }
  return result;
}
