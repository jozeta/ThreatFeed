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

/** Malpedia families by every normalized name; with several platform variants (win.x, elf.x), the best-documented one */
function malpediaIndex(families: Record<string, any> | null): Map<string, [string, any]> {
  const index = new Map<string, [string, any]>();
  for (const [id, f] of Object.entries(families ?? {})) {
    if (!f || typeof f.common_name !== 'string') continue;
    for (const n of [f.common_name, ...strings(f.alt_names)]) {
      const key = nameKey(n);
      const existing = index.get(key);
      if (key.length >= 3 && (!existing || strings(f.urls).length > strings(existing[1].urls).length)) index.set(key, [id, f]);
    }
  }
  return index;
}

const malpediaUrl = (id: string) => `${MALPEDIA}details/${encodeURIComponent(id)}`;

/**
 * Malware and tools: ATT&CK software (with the groups using it) merged with the Malpedia family of the
 * same name or alias. Malpedia lists thousands more families, so those only come in when the articles
 * mention them; everything else would be dead weight in the file.
 */
export function buildMalwareProfiles(bundle: any, malpedia: Record<string, any> | null, articles: Article[]): MalwareProfile[] {
  const objects = bundleObjects(bundle);
  const uses = usesBySource(objects);
  const usedBy = new Map<string, string[]>();
  for (const o of objects) {
    if (o?.type !== 'intrusion-set' || !usable(o) || typeof o.name !== 'string') continue;
    for (const t of uses.get(o.id) ?? []) if (isSoftware(t)) usedBy.set(t.id, [...(usedBy.get(t.id) ?? []), o.name]);
  }
  const index = malpediaIndex(malpedia);
  const matched = new Set<string>();
  const result: MalwareProfile[] = [];
  const ids = new Set<string>();
  const uniqueId = (name: string, fallback: string) => {
    let id = slug(name) || fallback.toLowerCase();
    if (ids.has(id)) id = `${id}-${fallback.toLowerCase()}`;
    ids.add(id);
    return id;
  };

  for (const o of objects) {
    if (!isSoftware(o) || !usable(o) || typeof o.name !== 'string') continue;
    const { external_id: attackId, url } = attackRef(o);
    if (typeof attackId !== 'string') continue;
    const names = [o.name, ...strings(o.x_mitre_aliases)];
    const hit = names.map(n => index.get(nameKey(n))).find(Boolean);
    if (hit) matched.add(hit[0]);
    const family = hit?.[1];
    result.push({
      id: uniqueId(o.name, attackId),
      name: o.name,
      aliases: aliasList(o.name, strings(o.x_mitre_aliases), strings(family?.alt_names)),
      description: clip(firstParagraph(o.description) || firstParagraph(family?.description), MAX_MALWARE_DESCRIPTION),
      kind: o.type,
      attackId,
      actors: actorNames(usedBy.get(o.id) ?? [], strings(family?.attribution)),
      ...(hit ? { malpediaUrl: malpediaUrl(hit[0]) } : {}),
      url: typeof url === 'string' && url.startsWith(ATTACK) ? url : `${ATTACK}software/${attackId}`,
    });
  }

  // Malpedia-only families, one per name (the best-documented variant), when the news names them
  const extra = new Map<string, MalwareProfile>();
  for (const [id, f] of new Set(index.values())) {
    if (matched.has(id)) continue;
    const key = slug(f.common_name);
    if (!key || extra.has(key) || ids.has(key)) continue;
    extra.set(key, {
      id: key,
      name: f.common_name.trim(),
      aliases: aliasList(f.common_name.trim(), strings(f.alt_names)),
      description: clip(firstParagraph(f.description), MAX_MALWARE_DESCRIPTION),
      kind: 'malware',
      actors: actorNames([], strings(f.attribution)),
      malpediaUrl: malpediaUrl(id),
    });
  }
  const mentioned = actorMentions(articles, [...extra.values()], Infinity);
  for (const m of extra.values()) if (mentioned.has(m.id)) result.push(m);

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

// Software and alias names that are everyday words or Windows commands: they'd match far more than the malware
const GENERIC_TERMS = new Set([
  'ping', 'route', 'expand', 'systeminfo', 'ipconfig', 'netstat', 'whoami', 'schtasks', 'tasklist', 'nltest', 'forfiles', 'wevtutil',
  'xcopy', 'msiexec', 'powershell', 'esentutl', 'certutil', 'netsh', 'nbtstat', 'dsquery', 'rundll32', 'regsvr32', 'wmic', 'telnet',
  'curl', 'wget', 'cuba', 'royal', 'play', 'prestige', 'explosive', 'chaos', 'rover', 'equation', 'silence', 'machete', 'inception',
  'patchwork', 'cleaver', 'axiom', 'lead', 'zinc', 'nickel', 'mercury', 'platinum', 'gold', 'iron', 'cobalt', 'copper', 'radium',
  // Malpedia families seen matching ordinary news (checked against a month of articles)
  'nexus', 'rock', 'dark', 'leverage', 'milan', 'global', 'glasses', 'sage', 'resident', 'anchor', 'stop', 'chromium', 'bluesky', 'james', 'saga',
  'lorem ipsum', 'red alert',
]);
const countable = (term: string) => term.length >= 4 && !GENERIC_TERMS.has(term.toLowerCase());
const firstWord = (term: string) => term.toLowerCase().match(/\w+/)?.[0];
// "APT28", "Fancy Bear", "ShinyHunters" are unmistakable; a plain word like "Carbon" or "Sofacy" also
// needs the article to be about threats, or every carbon-price story would count for Turla's backdoor
const distinctive = (term: string) => /\d|[\s-]|[a-z][A-Z]/.test(term);
const THREAT_CONTEXT = /malware|ransomware|backdoor|trojan|stealer|loader|botnet|\bRATs?\b|implant|spyware|wiper|rootkit|dropper|hack(?:er|ed|ing)|threat (?:actor|group)|\bAPTs?\b|espionage|state-sponsored|nation-state/i;

/**
 * How often each profile's name or aliases appear in the articles (title and summary, whole words,
 * ignoring case) in the last `days` days; plain one-word names also need a threat word (malware, hackers, APT…) in the same text. Terms are indexed by their first word so each article is
 * only checked against the few profiles it could match. Leak-site victim posts aren't coverage.
 */
export function actorMentions(articles: Article[], profiles: Mentionable[], days = 30, now = Date.now()): Map<string, Mentions> {
  const byWord = new Map<string, { id: string; term: string; needsContext: boolean }[]>();
  for (const p of profiles) {
    for (const term of new Set([p.name, ...p.aliases])) {
      const word = countable(term) ? firstWord(term) : undefined;
      if (word) byWord.set(word, [...(byWord.get(word) ?? []), { id: p.id, term, needsContext: !distinctive(term) }]);
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
        if (c.needsContext && !(threat ??= THREAT_CONTEXT.test(text))) continue;
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

/** The actor (or else malware) profile a name or alias belongs to, ignoring case */
export function findProfile(data: Pick<ActorsData, 'actors' | 'malware'> | null, name: string): { kind: 'actor' | 'malware'; id: string } | null {
  const key = name.trim().toLowerCase();
  if (!data || !key) return null;
  const matches = (p: { name: string; aliases: string[] }) => p.name.toLowerCase() === key || p.aliases.some(a => a.toLowerCase() === key);
  const actor = data.actors.find(matches);
  if (actor) return { kind: 'actor', id: actor.id };
  const malware = data.malware.find(matches);
  return malware ? { kind: 'malware', id: malware.id } : null;
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
