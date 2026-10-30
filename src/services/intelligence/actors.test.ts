import { describe, expect, it } from 'vitest';
import { actorMentions, buildActorProfiles, buildMalwareProfiles, clip, countryFromDescription, decodeActors, encodeActors, findProfile, refreshActors } from './actors';
import { ActorsData, Article } from '../../types';

// A trimmed-down ATT&CK enterprise bundle: two groups, three pieces of software, techniques and "uses" links
const ref = (id: string, kind: string) => [{ source_name: 'mitre-attack', external_id: id, url: `https://attack.mitre.org/${kind}/${id.replace('.', '/')}` }];
const bundle = {
  objects: [
    {
      type: 'intrusion-set', id: 'intrusion-set--apt28', name: 'APT28', aliases: ['APT28', 'Fancy Bear', 'Sofacy'],
      description: "[APT28](https://attack.mitre.org/groups/G0007) is a threat group that has been attributed to Russia's General Staff Main Intelligence Directorate (GRU).(Citation: NSA) This group has been active since at least 2004.(Citation: DOJ)\n\nA second paragraph that is left out.",
      external_references: ref('G0007', 'groups'),
    },
    {
      type: 'intrusion-set', id: 'intrusion-set--quiet', name: 'Quiet Group', aliases: ['Quiet Group'],
      description: 'Quiet Group has targeted organizations in South Korea and Japan.',
      external_references: ref('G9999', 'groups'),
    },
    { type: 'intrusion-set', id: 'intrusion-set--old', name: 'Old Group', revoked: true, external_references: ref('G0001', 'groups') },
    { type: 'intrusion-set', id: 'intrusion-set--gone', name: 'Gone Group', x_mitre_deprecated: true, external_references: ref('G0002', 'groups') },
    { type: 'attack-pattern', id: 'attack-pattern--phish', name: 'Spearphishing Attachment', external_references: ref('T1566.001', 'techniques') },
    { type: 'attack-pattern', id: 'attack-pattern--ps', name: 'PowerShell', external_references: ref('T1059.001', 'techniques') },
    { type: 'attack-pattern', id: 'attack-pattern--dead', name: 'Old Technique', x_mitre_deprecated: true, external_references: ref('T1000', 'techniques') },
    {
      type: 'malware', id: 'malware--xagent', name: 'X-Agent', x_mitre_aliases: ['X-Agent', 'CHOPSTICK'],
      description: '[X-Agent](https://attack.mitre.org/software/S0023) is a modular backdoor used by [APT28](https://attack.mitre.org/groups/G0007).(Citation: FireEye)',
      external_references: ref('S0023', 'software'),
    },
    { type: 'tool', id: 'tool--mimikatz', name: 'Mimikatz', description: 'Credential dumper.', external_references: ref('S0002', 'software') },
    { type: 'tool', id: 'tool--net', name: 'Net', description: 'The net utility.', external_references: ref('S0039', 'software') },
    { type: 'malware', id: 'malware--retired', name: 'Retired', revoked: true, external_references: ref('S0999', 'software') },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'attack-pattern--phish' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'attack-pattern--ps' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'attack-pattern--ps' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'attack-pattern--dead' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'malware--xagent' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--apt28', target_ref: 'tool--mimikatz' },
    { type: 'relationship', relationship_type: 'uses', source_ref: 'intrusion-set--quiet', target_ref: 'tool--mimikatz', revoked: true },
  ],
};

const malpedia = {
  'win.xagent': { common_name: 'X-Agent', alt_names: ['Sofacy backdoor', 'CHOPSTICK'], attribution: ['APT28'], description: 'Malpedia text', urls: ['a', 'b'] },
  'elf.xagent': { common_name: 'X-Agent', alt_names: [], attribution: ['APT28'], description: '', urls: ['a'] },
  'win.lumma': { common_name: 'Lumma Stealer', alt_names: ['LummaC2'], attribution: [], description: 'An infostealer sold as a service.', urls: [] },
  'win.unseen': { common_name: 'Unseen Loader', alt_names: [], attribution: [], description: 'Never in the news.', urls: [] },
};

const NOW = Date.parse('2026-10-30T12:00:00Z');
const article = (id: string, title: string, daysAgo: number, extra: Partial<Article> = {}): Article => ({
  id, title, url: `https://example.com/${id}`, sourceId: 'news', sourceName: 'News', publishedAt: new Date(NOW - daysAgo * 86400000).toISOString(),
  tags: [], categories: [], read: false, viewed: false, bookmarked: false, ...extra,
});

describe('buildActorProfiles', () => {
  const actors = buildActorProfiles(bundle);

  it('keeps intrusion sets that are neither revoked nor deprecated', () => {
    expect(actors.map(a => a.id)).toEqual(['G0007', 'G9999']);
  });

  it('builds the profile with the first paragraph, links and citations stripped', () => {
    const apt28 = actors[0];
    expect(apt28).toMatchObject({
      id: 'G0007', name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], country: 'RU', firstSeen: '2004', url: 'https://attack.mitre.org/groups/G0007',
    });
    expect(apt28.description).toBe("APT28 is a threat group that has been attributed to Russia's General Staff Main Intelligence Directorate (GRU). This group has been active since at least 2004.");
  });

  it('links techniques and software through "uses", deduplicated and without deprecated ones', () => {
    expect(actors[0].techniques).toEqual([{ id: 'T1059.001', name: 'PowerShell' }, { id: 'T1566.001', name: 'Spearphishing Attachment' }]);
    expect(actors[0].software).toEqual([{ id: 'S0002', name: 'Mimikatz' }, { id: 'S0023', name: 'X-Agent' }]);
    expect(actors[1].software).toEqual([]); // its only link is revoked
  });

  it('leaves the country out when the description only names targets', () => {
    expect(actors[1].country).toBeUndefined();
    expect(actors[1].firstSeen).toBeUndefined();
  });

  it('reads the origin country from ATT&CK phrasing, not from targets or languages', () => {
    expect(countryFromDescription('a group believed to be operating out of Iran.')).toBe('IR');
    expect(countryFromDescription('a cyber espionage group with likely Chinese origins')).toBe('CN');
    expect(countryFromDescription("a People's Republic of China (PRC)-aligned actor")).toBe('CN');
    expect(countryFromDescription('a North Korea–aligned threat group')).toBe('KP');
    expect(countryFromDescription('a Pakistan-based group primarily targeting India')).toBe('PK');
    expect(countryFromDescription('affiliates recruited on Russian cybercrime forums')).toBeUndefined();
    expect(countryFromDescription('a Russian-speaking group')).toBeUndefined();
    expect(countryFromDescription('it targeted Russian government entities')).toBeUndefined();
  });

  it('caps techniques at 40', () => {
    const many = { objects: [
      { type: 'intrusion-set', id: 'g', name: 'Busy', external_references: ref('G1', 'groups') },
      ...Array.from({ length: 50 }, (_, i) => ({ type: 'attack-pattern', id: `t${i}`, name: `T${i}`, external_references: ref(`T${1000 + i}`, 'techniques') })),
      ...Array.from({ length: 50 }, (_, i) => ({ type: 'relationship', relationship_type: 'uses', source_ref: 'g', target_ref: `t${i}` })),
    ] };
    expect(buildActorProfiles(many)[0].techniques).toHaveLength(40);
  });

  it('returns nothing for a malformed bundle', () => {
    expect(buildActorProfiles(null)).toEqual([]);
    expect(buildActorProfiles({ objects: 'nope' })).toEqual([]);
  });
});

describe('buildMalwareProfiles', () => {
  const articles = [article('a1', 'LummaC2 infostealer returns', 2), article('a2', 'Weekly roundup', 3)];
  const malware = buildMalwareProfiles(bundle, malpedia, articles);
  const byName = new Map(malware.map(m => [m.name, m]));

  it('keeps ATT&CK software with its users, merged with the Malpedia family by name', () => {
    expect(byName.get('X-Agent')).toEqual({
      id: 'x-agent', name: 'X-Agent', aliases: ['CHOPSTICK', 'Sofacy backdoor'], kind: 'malware', attackId: 'S0023', actors: ['APT28'],
      description: 'X-Agent is a modular backdoor used by APT28.',
      malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.xagent', // the variant with the most references
      url: 'https://attack.mitre.org/software/S0023',
    });
    expect(byName.get('Mimikatz')).toMatchObject({ kind: 'tool', attackId: 'S0002', actors: ['APT28'] });
    expect(byName.has('Retired')).toBe(false);
  });

  it('adds Malpedia-only families only when the articles mention them', () => {
    expect(byName.get('Lumma Stealer')).toEqual({
      id: 'lumma-stealer', name: 'Lumma Stealer', aliases: ['LummaC2'], kind: 'malware', actors: [],
      description: 'An infostealer sold as a service.', malpediaUrl: 'https://malpedia.caad.fkie.fraunhofer.de/details/win.lumma',
    });
    expect(byName.has('Unseen Loader')).toBe(false);
  });

  it('works without Malpedia', () => {
    expect(buildMalwareProfiles(bundle, null, articles).map(m => m.name)).toEqual(['Mimikatz', 'Net', 'X-Agent']);
  });
});

describe('actorMentions', () => {
  const profiles = [
    { id: 'G0007', name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'] },
    { id: 'net', name: 'Net', aliases: [] },
    { id: 'G0032', name: 'Lazarus Group', aliases: ['Lazarus', 'HIDDEN COBRA'] },
  ];
  const articles = [
    article('1', 'Fancy Bear phishing wave hits ministries', 1),
    article('2', 'New APT28 backdoor', 3, { description: 'Sofacy is at it again' }), // counted once
    article('3', 'Hidden Cobra steals crypto', 10),
    article('4', 'Sofacyish is not a match', 2),
    article('5', 'APT28 was busy last year', 45), // outside the window
    article('6', 'Net income rises', 1), // too short and generic to count
    article('7', 'Lazarus has just published a new victim', 1, { sourceId: 'ransomware-live' }), // leak-site post
  ];
  const m = actorMentions(articles, profiles, 30, NOW);

  it('counts distinct articles naming the profile or an alias, whole words, case-insensitive', () => {
    expect(m.get('G0007')?.count).toBe(2);
    expect(m.get('G0007')?.articles.map(a => a.id)).toEqual(['1', '2']); // newest first
    expect(m.get('G0032')?.count).toBe(1);
    expect(m.has('net')).toBe(false);
  });

  it('needs a threat word in the text for plain one-word names', () => {
    const carbon = [{ id: 'carbon', name: 'Carbon', aliases: [] }];
    const hits = actorMentions([article('c1', 'Carbon prices climb', 1), article('c2', 'Turla deploys Carbon backdoor', 1)], carbon, 30, NOW);
    expect(hits.get('carbon')?.articles.map(a => a.id)).toEqual(['c2']);
  });

  it('spreads the counts over a per-day series, oldest first', () => {
    const daily = m.get('G0007')!.daily;
    expect(daily).toHaveLength(30);
    expect(daily[29]).toBe(1); // yesterday
    expect(daily[27]).toBe(1); // three days ago
    expect(daily.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('decodeActors and refreshActors', () => {
  const good: ActorsData = {
    generatedAt: '2026-10-29T00:00:00Z',
    actors: buildActorProfiles(bundle),
    malware: buildMalwareProfiles(bundle, malpedia, []),
    updates: { actors: '2026-10-29T00:00:00Z', malware: '2026-10-29T00:00:00Z' },
  };

  it('round-trips through the compact file form, and drops malformed entries', () => {
    const file = JSON.parse(JSON.stringify(encodeActors(good)));
    expect(file.techniqueNames).toEqual({ 'T1059.001': 'PowerShell', 'T1566.001': 'Spearphishing Attachment' });
    expect(file.actors[0]).toMatchObject({ techniques: ['T1059.001', 'T1566.001'], software: ['S0002', 'S0023'] });
    expect(file.actors[0].url).toBeUndefined(); // derivable from the ID
    expect(decodeActors(file)).toEqual(good);
    expect(decodeActors(JSON.parse(JSON.stringify(good)))).toEqual(good); // the expanded form decodes too
    const decoded = decodeActors({
      actors: [null, { id: 'G1', name: 'X', aliases: 'no', techniques: [{ id: 'T1' }, { id: 'T2', name: 'ok' }], url: 'javascript:alert(1)' }, { name: 'no id' }],
      malware: [{ id: 'm', name: 'M', kind: 'virus', malpediaUrl: 'https://evil.example/' }],
    });
    expect(decoded?.actors).toEqual([{ id: 'G1', name: 'X', aliases: [], description: '', techniques: [{ id: 'T2', name: 'ok' }], software: [], url: 'https://attack.mitre.org/groups/G1' }]);
    expect(decoded?.malware).toEqual([{ id: 'm', name: 'M', aliases: [], description: '', kind: 'malware', actors: [] }]);
    expect(decodeActors({ actors: 'x' })).toBeNull();
  });

  it('builds fresh data when both sources came in', () => {
    const r = refreshActors(good, bundle, malpedia, [], NOW);
    expect(r.built).toEqual(['actors', 'malware']);
    expect(r.data.updates).toEqual({ actors: new Date(NOW).toISOString(), malware: new Date(NOW).toISOString() });
  });

  it('carries the previous file over on days the bundles are not refreshed', () => {
    const r = refreshActors(good, null, null, [], NOW);
    expect(r.carried).toEqual(['actors', 'malware']);
    expect(r.data.actors).toBe(good.actors);
    expect(r.data.updates).toEqual(good.updates);
  });

  it('carries only the malware over when Malpedia is missing, unless there is nothing to carry', () => {
    expect(refreshActors(good, bundle, null, [], NOW)).toMatchObject({ built: ['actors'], carried: ['malware'] });
    expect(refreshActors(null, bundle, null, [], NOW)).toMatchObject({ built: ['actors', 'malware'], carried: [] });
    expect(refreshActors(null, null, null, [], NOW).data).toMatchObject({ actors: [], malware: [] });
  });
});

describe('clip', () => {
  it('cuts long text at a sentence end, or else at a word', () => {
    expect(clip('Short.', 20)).toBe('Short.');
    expect(clip('First sentence here. Second one is longer.', 30)).toBe('First sentence here.');
    expect(clip('one two three four five six seven', 20)).toBe('one two three four…');
  });
});

describe('findProfile', () => {
  const data = { actors: buildActorProfiles(bundle), malware: buildMalwareProfiles(bundle, malpedia, []) };
  it('resolves names and aliases, ignoring case', () => {
    expect(findProfile(data, 'fancy bear')).toEqual({ kind: 'actor', id: 'G0007' });
    expect(findProfile(data, 'CHOPSTICK')).toEqual({ kind: 'malware', id: 'x-agent' });
    expect(findProfile(data, 'Nobody')).toBeNull();
    expect(findProfile(null, 'APT28')).toBeNull();
  });
});
