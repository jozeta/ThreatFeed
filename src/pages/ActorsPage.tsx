import React, { useCallback, useMemo } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { useActors, useVulns } from '../hooks/useVulns';
import { parseHash, useHashParam, useHashRoute } from '../hooks/useHashRoute';
import { usePagedCount } from '../hooks/usePagedCount';
import { actorMentions, Mentions } from '../services/intelligence/actors';
import { countryFlag, countryName } from '../utils/countries';
import { LoadMoreButton } from '../components/Common/LoadMoreButton';
import { selectClass } from './incidents/shared';
import { articlesByCve } from './vulns/shared';
import { CvePanel } from './vulns/CvePanel';
import { ActorPanel } from './actors/ActorPanel';
import { MalwarePanel } from './actors/MalwarePanel';
import { MentionTrend } from './actors/shared';
import { Crosshair, Bug, Search } from 'lucide-react';

type Sub = 'actors' | 'malware';
type Sort = 'mentions' | 'name';
const PAGE = 50;
const PANELS = ['actor', 'malware', 'cve'] as const;

/** The CVE panel on top of an actor or malware panel; vulns.json only loads once one is opened */
const CvePanelHost: React.FC<{ cve: string; articles: Article[]; onOpenArticle: (a: Article) => void; onClose: () => void }> = ({ cve, articles, onOpenArticle, onClose }) => {
  const vulns = useVulns();
  const { settings, updateSettings } = useSettings();
  const watched = settings.watchedCves;
  const news = useMemo(() => articlesByCve(articles).get(cve) ?? [], [articles, cve]);
  return (
    <CvePanel
      cve={cve}
      vulns={vulns}
      news={news}
      watched={watched.includes(cve)}
      onToggleWatch={() => updateSettings({ watchedCves: watched.includes(cve) ? watched.filter((c) => c !== cve) : [...watched, cve] })}
      onOpenArticle={onOpenArticle}
      onClose={onClose}
    />
  );
};

export const ActorsPage: React.FC<{ onOpenArticle: (article: Article) => void }> = ({ onOpenArticle }) => {
  const { articles } = useFeeds();
  const data = useActors();

  // #/actors[/malware]?q=…&sort=name; the open panel is ?actor=G0007, ?malware=<id> and/or ?cve=…
  const [route, navigate] = useHashRoute();
  const sub: Sub = route.sub === 'malware' ? 'malware' : 'actors';
  const [query, setQuery] = useHashParam('q');
  const [sortParam, setSort] = useHashParam('sort', 'mentions');
  const sort: Sort = sortParam === 'name' ? 'name' : 'mentions';
  const actorId = route.params.get('actor');
  const malwareId = route.params.get('malware');
  const cve = route.params.get('cve');

  // Opening an actor or malware panel replaces the other one; a CVE opens on top of it, so closing goes back
  const openPanel = useCallback((key: (typeof PANELS)[number], id: string) => {
    const params = new URLSearchParams(parseHash(window.location.hash).params);
    if (key !== 'cve') PANELS.forEach((k) => params.delete(k));
    params.set(key, id);
    navigate('actors', route.sub, params);
  }, [navigate, route.sub]);
  const closePanel = useCallback((...keys: (typeof PANELS)[number][]) => {
    const params = new URLSearchParams(parseHash(window.location.hash).params);
    keys.forEach((k) => params.delete(k));
    navigate('actors', route.sub, params, true);
  }, [navigate, route.sub]);
  const readArticle = (a: Article) => { closePanel(...PANELS); onOpenArticle(a); };
  // Escape reaches every open panel; with a CVE open on top, only the CVE panel should close
  const closeUnlessCve = (key: 'actor' | 'malware') => () => { if (!parseHash(window.location.hash).params.get('cve')) closePanel(key); };

  // Counted here rather than in the snapshot, so the user's own feeds count too
  const mentions = useMemo(() => ({
    actors: actorMentions(articles, data?.actors ?? []),
    malware: actorMentions(articles, data?.malware ?? []),
  }), [articles, data]);

  const rows = useMemo(() => {
    const list: { id: string; name: string; aliases: string[]; mentions?: Mentions; detail: React.ReactNode; count: number; haystack: string }[] = sub === 'actors'
      ? (data?.actors ?? []).map((a) => ({
          id: a.id, name: a.name, aliases: a.aliases, mentions: mentions.actors.get(a.id), count: a.techniques.length,
          detail: a.country ? <span title={countryName(a.country)}>{countryFlag(a.country)}</span> : null,
          haystack: [a.id, a.name, ...a.aliases, a.country ? countryName(a.country) : ''].join(' ').toLowerCase(),
        }))
      : (data?.malware ?? []).map((m) => ({
          id: m.id, name: m.name, aliases: m.aliases, mentions: mentions.malware.get(m.id), count: m.actors.length,
          detail: m.kind === 'tool' ? <span className="px-1 rounded border border-theme-border text-[9px] font-bold uppercase text-theme-text-muted">tool</span> : null,
          haystack: [m.attackId ?? '', m.name, ...m.aliases, ...m.actors].join(' ').toLowerCase(),
        }));
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => !q || r.haystack.includes(q))
      .sort((a, b) => (sort === 'mentions' ? (b.mentions?.count ?? 0) - (a.mentions?.count ?? 0) : 0) || a.name.localeCompare(b.name));
  }, [sub, data, mentions, query, sort]);

  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(rows.length, PAGE);

  const openActor = data && actorId ? data.actors.find((a) => a.id === actorId) : undefined;
  const openMalware = data && malwareId ? data.malware.find((m) => m.id === malwareId) : undefined;
  const mentioned = sub === 'actors' ? mentions.actors.size : mentions.malware.size;

  const tabs: { id: Sub; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'actors', label: 'Threat actors', icon: <Crosshair className="w-4 h-4" />, count: data?.actors.length },
    { id: 'malware', label: 'Malware & tools', icon: <Bug className="w-4 h-4" />, count: data?.malware.length },
  ];

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="pb-6 border-b border-theme-border">
        <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
          <Crosshair className="w-6 h-6 text-rose-500" />
          <span>Threat Actors & Malware</span>
        </h1>
        <p className="font-serif text-sm text-theme-text-muted mt-1">
          Who is behind the attacks and what they use: MITRE ATT&CK groups and software, Malpedia families, and how often your feeds mention each.
        </p>
      </div>

      <div className="flex gap-1 mt-6 mb-6 border-b border-theme-border overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={sub === t.id}
            onClick={() => navigate('actors', t.id === 'actors' ? '' : t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
              sub === t.id ? 'border-theme-accent text-theme-text' : 'border-transparent text-theme-text-muted hover:text-theme-text'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined && <span className="px-1.5 rounded-full bg-theme-surface border border-theme-border text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-sm font-serif text-theme-text-muted">Threat actor and malware profiles arrive with the server snapshot (Settings → Data Source).</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass} aria-label="Sort">
              <option value="mentions">Mentioned in your feeds (30 days)</option>
              <option value="name">Name</option>
            </select>
            <label className="flex items-center gap-1.5 bg-theme-card border border-theme-border rounded px-2 py-1.5 text-xs flex-1 min-w-0 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-theme-text-muted flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={sub === 'actors' ? 'Name, alias, country, G0007…' : 'Name, alias, group, S0154…'}
                aria-label="Search"
                className="bg-transparent font-mono text-theme-text focus:outline-none w-full sm:w-48"
              />
            </label>
            <span className="text-[11px] font-mono text-theme-text-muted">{mentioned} mentioned in the last 30 days</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-left text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                  <th className="py-2 pr-3 font-semibold">{sub === 'actors' ? 'Group' : 'Name'}</th>
                  <th className="py-2 pr-3 font-semibold" title="Articles in your feeds, last 30 days">Mentions</th>
                  <th className="py-2 pr-3 font-semibold text-right" title={sub === 'actors' ? 'ATT&CK techniques documented' : 'Groups known to use it'}>
                    {sub === 'actors' ? 'Techniques' : 'Groups'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border/60">
                {rows.slice(0, visibleCount).map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => openPanel(sub === 'actors' ? 'actor' : 'malware', r.id)} className="text-rose-500 font-bold hover:underline text-left">{r.name}</button>
                        {r.detail}
                      </span>
                      {r.aliases.length > 0 && <span className="block text-[10px] text-theme-text-muted truncate max-w-[16rem] sm:max-w-md">{r.aliases.slice(0, 4).join(', ')}</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap"><MentionTrend mentions={r.mentions} /></td>
                    <td className="py-2 pr-3 text-right text-theme-text">{r.count || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-xs font-serif italic text-theme-text-muted">Nothing matches.</p>}
          </div>
          {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
          <p className="text-[11px] font-serif text-theme-text-muted">
            Profiles from MITRE ATT&CK and Malpedia, refreshed daily. Mentions count articles naming the profile or one of its aliases.
          </p>
        </div>
      )}

      {data && openActor && (
        <ActorPanel
          actor={openActor}
          data={data}
          mentions={mentions.actors.get(openActor.id)}
          onOpenMalware={(id) => openPanel('malware', id)}
          onOpenCve={(c) => openPanel('cve', c)}
          onOpenArticle={readArticle}
          onClose={closeUnlessCve('actor')}
        />
      )}
      {data && openMalware && (
        <MalwarePanel
          malware={openMalware}
          data={data}
          mentions={mentions.malware.get(openMalware.id)}
          onOpenActor={(id) => openPanel('actor', id)}
          onOpenCve={(c) => openPanel('cve', c)}
          onOpenArticle={readArticle}
          onClose={closeUnlessCve('malware')}
        />
      )}
      {cve && <CvePanelHost cve={cve} articles={articles} onOpenArticle={readArticle} onClose={() => closePanel('cve')} />}
    </div>
  );
};
