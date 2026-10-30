import React, { useMemo } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useActors, useRansomwareIntel, useTrends, useVulns } from '../hooks/useVulns';
import { useLeakSiteVictims } from '../hooks/useLeakSiteVictims';
import { closePanel, openPanel } from '../hooks/useHashRoute';
import { actorMentions } from '../services/intelligence/actors';
import { weeklySeries } from '../services/intelligence/trends';
import { groupDisplayName } from '../utils/countries';
import { ActorPanel } from '../pages/actors/ActorPanel';
import { MalwarePanel } from '../pages/actors/MalwarePanel';
import { GroupPanel } from '../pages/incidents/GroupPanel';
import { TagPanel } from './TagPanel';

/**
 * The actor (?actor=G0007), malware (?malware=<id>), ransomware group (?group=<key>) and tag (?tag=Ransomware) panels, mounted once by
 * the app so any page can open them. What a panel opens (software, a group, a CVE) goes on top of it, with a
 * history entry so Back returns to the one below. Reading an article closes them all (App's onOpenArticle).
 */
const openProfile = (key: 'actor' | 'malware', id: string) => openPanel(key, id);
const openCve = (cve: string) => openPanel('cve', cve);

type Props = { id: string; onOpenArticle: (article: Article) => void };

// The trends history keys an entity by the name the vocabulary has for it, which may be any of its aliases
const historyKeys = (kinds: string[], names: string[]) => kinds.flatMap((k) => names.map((n) => `${k}:${n}`));

export const ActorPanelHost: React.FC<Props> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const data = useActors();
  const actor = data?.actors.find((a) => a.id === id);
  // Counted here rather than in the snapshot, so the user's own feeds count too
  const mentions = useMemo(() => (actor ? actorMentions(articles, [actor]).get(actor.id) : undefined), [articles, actor]);
  const trends = useTrends();
  const weekly = useMemo(() => (actor ? weeklySeries(trends, historyKeys(['actor'], [actor.name, ...actor.aliases])) : []), [trends, actor]);
  if (!data || !actor) return null;
  return (
    <ActorPanel
      actor={actor}
      data={data}
      mentions={mentions}
      weekly={weekly}
      onOpenMalware={(m) => openProfile('malware', m)}
      onOpenCve={openCve}
      onOpenArticle={onOpenArticle}
      onClose={() => closePanel('actor')}
    />
  );
};

export const MalwarePanelHost: React.FC<Props> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const data = useActors();
  const malware = data?.malware.find((m) => m.id === id);
  const mentions = useMemo(() => (malware ? actorMentions(articles, [malware]).get(malware.id) : undefined), [articles, malware]);
  const trends = useTrends();
  // Malware isn't a kind of its own in the history; ransomware families and tools named like a product are
  const weekly = useMemo(() => (malware ? weeklySeries(trends, historyKeys(['ransomware', 'product', 'actor'], [malware.name, ...malware.aliases])) : []), [trends, malware]);
  if (!data || !malware) return null;
  return (
    <MalwarePanel
      malware={malware}
      data={data}
      mentions={mentions}
      weekly={weekly}
      onOpenActor={(a) => openProfile('actor', a)}
      onOpenCve={openCve}
      onOpenArticle={onOpenArticle}
      onClose={() => closePanel('malware')}
    />
  );
};

/** `id` is the group's name, lowercased as leak-site victims and the snapshot's profiles key it */
export const GroupPanelHost: React.FC<Props> = ({ id: param, onOpenArticle }) => {
  const id = param.toLowerCase();
  const { articles, incidents } = useFeeds();
  const intel = useRansomwareIntel();
  const { victims } = useLeakSiteVictims();
  const trends = useTrends();
  const profile = incidents?.groups[id];
  const weekly = useMemo(() => weeklySeries(trends, historyKeys(['ransomware'], [groupDisplayName(profile?.name || id), id])), [trends, profile, id]);
  return (
    <GroupPanel
      group={id}
      weekly={weekly}
      victims={victims}
      profile={profile}
      intel={intel?.groups[id]}
      articles={articles}
      onOpenArticle={onOpenArticle}
      onClose={() => closePanel('group')}
    />
  );
};

/** `id` is the tag as its chip shows it; matching ignores case */
export const TagPanelHost: React.FC<Props> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const vulns = useVulns();
  return (
    <TagPanel
      tag={id}
      articles={articles}
      vulns={vulns}
      onOpenArticle={onOpenArticle}
      onOpenCve={openCve}
      onClose={() => closePanel('tag')}
    />
  );
};
