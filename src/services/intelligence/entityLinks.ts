import { EntitiesData } from '../../types';
import { AMBIGUOUS_TERMS, countable, distinctive, THREAT_AFTER, THREAT_BEFORE, THREAT_CONTEXT } from './actors';

/**
 * Vendors, ransomware groups, threat actors, malware and CVEs named in text, for linking them to their panels.
 * The rules follow actorMentions, so a name links where it would count as a mention: a plain one-word name
 * ("Lazarus", "Akira") needs a capital letter and a threat word somewhere in the text, an everyday word
 * ("Play", "Payload") a threat word right next to it. Vendors link wherever they appear, a one-word name with
 * its capital ("Oracle", not "padding oracle"); CVE ids in any case.
 */

export type EntityKind = 'vendor' | 'group' | 'actor' | 'malware' | 'cve';
export interface EntityRef { kind: EntityKind; id: string }
export interface Segment { text: string; entity?: EntityRef }
export interface EntityMatch { start: number; end: number; entity: EntityRef }

// Leak-site group names and ATT&CK/Malpedia names that are ordinary words, seen in article text; linked like
// AMBIGUOUS_TERMS, only right next to a threat word. A plain capitalized word still needs a threat word nearby
const EVERYDAY_NAMES = new Set([
  'payload', 'aurora', 'barracuda', 'genesis', 'storm', 'eclipse', 'helix', 'falcon', 'pear', 'cloak', 'termite', 'nitrogen',
  'redact', 'interlock', 'deadlock', 'sarcoma', 'everest', 'wallstreet', 'panzer', 'byod', 'endzone', 'spirals', 'kairos',
  'page', 'photo', 'calendar', 'catch', 'crash', 'blame', 'epic', 'karma', 'agenda', 'solar', 'smoke', 'spark', 'beacon',
  'responder', 'reaper', 'ruler', 'soldier', 'empire', 'flame', 'trinity', 'pandora', 'mango', 'lotus', 'mantis', 'shark',
  'snake', 'viper', 'scorpion', 'octopus', 'raccoon', 'oyster', 'mosquito', 'pony', 'minion', 'maze', 'mirage', 'monsoon',
  'meteor', 'supernova', 'sunburst', 'rogue', 'havoc', 'grunt', 'trickster', 'avenger', 'proton', 'samurai', 'covenant',
  'embargo', 'hive', 'carbon', 'canopy', 'crimson', 'griffon', 'glimpse', 'hangman', 'leviathan', 'lurk', 'reptile', 'shindig',
  'silicon', 'sliver', 'tick', 'uppercut', 'vermin', 'windigo', 'apostle', 'bitter', 'cannon', 'chimera', 'emissary', 'ferocious',
]);
// Ties between names of the same length go to the more specific panel
const RANK: Record<EntityKind, number> = { cve: 0, group: 1, actor: 2, malware: 3, vendor: 4 };
const CVE = /\bCVE-\d{4}-\d{4,}\b/gi;
const AFTER_RE = new RegExp(`(?:'s)?\\s+${THREAT_AFTER}\\b`, 'iy');
const BEFORE_RE = new RegExp(`\\b${THREAT_BEFORE}\\s+$`, 'i');

interface Term {
  re: RegExp; // sticky, so it can be tried at a word's position
  entity: EntityRef;
  rank: number;
  plain: boolean; // one word without digits, hyphens or inner capitals: needs a capital and a threat word
  everyday: boolean; // needs a threat word right next to it
  capital: boolean; // needs a capital letter: plain names, and one-word vendors that write theirs with one
}

export interface EntityMatcher {
  byWord: Map<string, Term[]>; // terms by their first word, lowercase
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (term: string) => term.toLowerCase().match(/\w+/)?.[0];

/** One matcher for all the names (CVE ids need none); build it once per entities.json */
export function buildEntityMatcher(entities: EntitiesData | null): EntityMatcher {
  const byWord = new Map<string, Term[]>();
  const taken = new Set<string>(); // `${kind}:${term}`, so a name goes to the profile named by it before one aliased
  const add = (kind: EntityKind, id: string, term: string, rules: boolean) => {
    const key = term.toLowerCase();
    const word = firstWord(term);
    if (!word || taken.has(`${kind}:${key}`) || (rules && !countable(term))) return;
    taken.add(`${kind}:${key}`);
    const plain = rules && !distinctive(term);
    byWord.set(word, [...(byWord.get(word) ?? []), {
      re: new RegExp(`${escape(term.trim()).replace(/\s+/g, '\\s+')}(?!\\w)`, 'iy'),
      entity: { kind, id },
      rank: RANK[kind],
      plain,
      everyday: plain && (AMBIGUOUS_TERMS.has(key) || EVERYDAY_NAMES.has(key)),
      capital: plain || (kind === 'vendor' && !/\s/.test(term.trim()) && /^\p{Lu}/u.test(term.trim())),
    }]);
  };
  for (const v of entities?.vendors ?? []) add('vendor', v, v, false);
  for (const [kind, list] of [['group', entities?.groups.map(g => ({ ...g, id: g.key })) ?? []], ['actor', entities?.actors ?? []], ['malware', entities?.malware ?? []]] as const) {
    for (const p of list) add(kind, p.id, p.name, true);
    for (const p of list) for (const a of p.aliases) add(kind, p.id, a, true);
  }
  return { byWord };
}

const nextToThreat = (text: string, start: number, end: number) => {
  AFTER_RE.lastIndex = end;
  return AFTER_RE.test(text) || BEFORE_RE.test(text.slice(Math.max(0, start - 20), start));
};

/**
 * Every name in the text, not overlapping: where two overlap the longer wins, and a tie goes by RANK. `context`
 * is more text a threat word may be in (a card's title, for its summary), or whether it has one, when the caller
 * has already looked (linkifyHtmlTextNodes, once for a whole article rather than per text node).
 */
export function findEntities(text: string, matcher: EntityMatcher, context?: string | boolean): EntityMatch[] {
  const found: (EntityMatch & { rank: number })[] = [];
  for (const m of text.matchAll(CVE)) found.push({ start: m.index!, end: m.index! + m[0].length, entity: { kind: 'cve', id: m[0].toUpperCase() }, rank: 0 });
  let threat: boolean | undefined;
  for (const w of text.matchAll(/\w+/g)) {
    const start = w.index!;
    for (const t of matcher.byWord.get(w[0].toLowerCase()) ?? []) {
      t.re.lastIndex = start;
      const m = t.re.exec(text);
      if (!m) continue;
      const end = start + m[0].length;
      if (t.capital && !/\p{Lu}/u.test(text[start])) continue;
      if (t.everyday ? !nextToThreat(text, start, end) : t.plain && !(threat ??= context === true || THREAT_CONTEXT.test(text) || (typeof context === 'string' && THREAT_CONTEXT.test(context)))) continue;
      found.push({ start, end, entity: t.entity, rank: t.rank });
    }
  }
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.rank - b.rank || a.start - b.start);
  const kept: EntityMatch[] = [];
  for (const f of found) if (!kept.some(k => f.start < k.end && k.start < f.end)) kept.push({ start: f.start, end: f.end, entity: f.entity });
  return kept.sort((a, b) => a.start - b.start);
}

/** The text in order, as plain and linked segments */
export function linkify(text: string, matcher: EntityMatcher, context?: string | boolean): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const m of findEntities(text, matcher, context)) {
    if (m.start > at) segments.push({ text: text.slice(at, m.start) });
    segments.push({ text: text.slice(m.start, m.end), entity: m.entity });
    at = m.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}
