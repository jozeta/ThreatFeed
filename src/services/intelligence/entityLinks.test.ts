import { describe, expect, it } from 'vitest';
import { buildEntityMatcher, linkify, Segment } from './entityLinks';
import { EntitiesData } from '../../types';

const ENTITIES: EntitiesData = {
  vendors: ['Fortinet', 'Barracuda Networks', 'Microsoft', 'Akira Labs', 'Conti'],
  groups: [
    { key: 'akira', name: 'Akira', aliases: [] },
    { key: 'play', name: 'Play', aliases: ['PlayCrypt'] },
    { key: 'barracuda', name: 'Barracuda', aliases: [] },
    { key: 'payload', name: 'Payload', aliases: [] },
    { key: 'black basta', name: 'Black Basta', aliases: [] },
  ],
  actors: [
    { id: 'G0007', name: 'APT28', aliases: ['Fancy Bear', 'Sednit'] },
    { id: 'G0032', name: 'Lazarus Group', aliases: ['Lazarus'] },
    { id: 'G0034', name: 'Sandworm Team', aliases: [] },
    { id: 'G9999', name: 'Conti', aliases: [] },
  ],
  malware: [
    { id: 'akira-malware', name: 'Akira', aliases: [] },
    { id: 'sandworm-tool', name: 'Sandworm', aliases: [] },
    { id: 'conti', name: 'Conti', aliases: [] },
    { id: 'mimikatz', name: 'Mimikatz', aliases: ['Sednit'] },
  ],
};
const matcher = buildEntityMatcher(ENTITIES);
/** Only the linked segments, as "text→kind:id" */
const links = (text: string, context?: string | boolean) => linkify(text, matcher, context).filter(s => s.entity).map(s => `${s.text}→${s.entity!.kind}:${s.entity!.id}`);

describe('linkify', () => {
  it('returns the whole text, split around the links', () => {
    const text = 'Fortinet patched it. Then FORTINET, again (Fortinet).';
    const segments = linkify(text, matcher);
    expect(segments.map(s => s.text).join('')).toBe(text);
    expect(segments.filter(s => s.entity)).toEqual<Segment[]>([
      { text: 'Fortinet', entity: { kind: 'vendor', id: 'Fortinet' } },
      { text: 'FORTINET', entity: { kind: 'vendor', id: 'Fortinet' } },
      { text: 'Fortinet', entity: { kind: 'vendor', id: 'Fortinet' } },
    ]);
  });

  it('links a one-word vendor only with a capital, as it is a name and not the word', () => {
    const oracle = buildEntityMatcher({ vendors: ['Oracle', 'Apple', 'Palo Alto Networks', 'n8n'], groups: [], actors: [], malware: [] });
    const vendors = (text: string) => linkify(text, oracle).filter(s => s.entity).map(s => s.text);
    expect(vendors('a padding oracle attack on an apple')).toEqual([]);
    expect(vendors('Oracle and Apple patched')).toEqual(['Oracle', 'Apple']);
    // Names of several words, and names the vendor itself writes in lower case, link in any case
    expect(vendors('palo alto networks and n8n')).toEqual(['palo alto networks', 'n8n']);
    expect(vendors('CVE-2026-12345 in lower case: cve-2026-12345')).toEqual(['CVE-2026-12345', 'cve-2026-12345']);
  });

  it('takes a threat word already found in the wider context as given', () => {
    expect(links('Lazarus stole funds', true)).toEqual(['Lazarus→actor:G0032']);
    expect(links('Lazarus stole funds', false)).toEqual([]);
    expect(links('Lazarus hackers stole funds', false)).toEqual(['Lazarus→actor:G0032']);
  });

  it('matches whole words only', () => {
    expect(links('Fortinets and SubFortinet and Fortinet_x')).toEqual([]);
    expect(links("Akira's leak site lists more ransomware victims")).toEqual(["Akira→group:akira"]);
  });

  it('links CVE ids, upper-cased, even without any entity data', () => {
    expect(links('Patch cve-2026-21643 and CVE-2025-1234 now')).toEqual(['cve-2026-21643→cve:CVE-2026-21643', 'CVE-2025-1234→cve:CVE-2025-1234']);
    expect(linkify('CVE-2026-1 is too short; CVE-2026-12345 is fine', buildEntityMatcher(null)).filter(s => s.entity).map(s => s.text)).toEqual(['CVE-2026-12345']);
  });

  it('links distinctive names and aliases anywhere, whitespace in names included', () => {
    expect(links('APT28, also known as Fancy\nBear, struck again')).toEqual(['APT28→actor:G0007', 'Fancy\nBear→actor:G0007']);
  });

  it('links a plain one-word name only when capitalized and the text is about threats', () => {
    expect(links('Lazarus hackers stole funds')).toEqual(['Lazarus→actor:G0032']);
    expect(links('Lazarus rose from the dead')).toEqual([]);
    expect(links('the lazarus hackers')).toEqual([]);
    // The context can be wider than the text being linked (a card's title and summary)
    expect(links('Lazarus stole funds', 'North Korean hackers')).toEqual(['Lazarus→actor:G0032']);
  });

  it('links an everyday-word name only right next to a threat word', () => {
    expect(links('Play ransomware hit a city; the attack was no play, the ransomware said')).toEqual(['Play→group:play']);
    expect(links('the ransomware Play and the Play gang')).toEqual(['Play→group:play', 'Play→group:play']);
    expect(links('The ransomware payload was dropped by hackers')).toEqual([]);
    expect(links('Payload ransomware claims a hospital')).toEqual(['Payload→group:payload']);
    expect(links('PlayCrypt hackers')).toEqual(['PlayCrypt→group:play']);
  });

  it('prefers the longest match where names overlap', () => {
    expect(links('Sandworm Team hackers struck')).toEqual(['Sandworm Team→actor:G0034']);
    expect(links('Barracuda Networks fixed ESG; Barracuda ransomware hit')).toEqual(['Barracuda Networks→vendor:Barracuda Networks', 'Barracuda→group:barracuda']);
    expect(links('Akira Labs and Akira ransomware')).toEqual(['Akira Labs→vendor:Akira Labs', 'Akira→group:akira']);
  });

  it('breaks ties group, then actor, then malware, then vendor', () => {
    expect(links('Akira malware')).toEqual(['Akira→group:akira']);
    expect(links('Conti ransomware')).toEqual(['Conti→actor:G9999']);
    const noGroups = buildEntityMatcher({ ...ENTITIES, groups: [], actors: [] });
    expect(linkify('Conti ransomware', noGroups).find(s => s.entity)?.entity).toEqual({ kind: 'malware', id: 'conti' });
  });

  it('gives a name to the profile it names before one that lists it as an alias', () => {
    expect(links('Sednit malware')).toEqual(['Sednit→actor:G0007']);
    const malwareOnly = buildEntityMatcher({ ...ENTITIES, actors: [], malware: [{ id: 'a', name: 'Xtrem', aliases: ['ZeroRAT'] }, { id: 'b', name: 'ZeroRAT', aliases: [] }] });
    expect(linkify('ZeroRAT', malwareOnly).find(s => s.entity)?.entity).toEqual({ kind: 'malware', id: 'b' });
  });

  it('links every occurrence of multi-word names', () => {
    expect(links('Black Basta, then black basta again')).toEqual(['Black Basta→group:black basta', 'black basta→group:black basta']);
  });

  it('leaves text without names as one plain segment', () => {
    expect(linkify('Nothing to see here', matcher)).toEqual([{ text: 'Nothing to see here' }]);
    expect(linkify('', matcher)).toEqual([]);
  });
});
