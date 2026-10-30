import React, { useMemo } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useActors, useRansomwareIntel } from '../hooks/useVulns';
import { useLeakSiteVictims } from '../hooks/useLeakSiteVictims';
import { openPanel, setHashParams } from '../hooks/useHashRoute';
import { actorMentions } from '../services/intelligence/actors';
import { ActorPanel } from '../pages/actors/ActorPanel';
import { MalwarePanel } from '../pages/actors/MalwarePanel';
import { GroupPanel } from '../pages/incidents/GroupPanel';

/**
 * The actor (?actor=G0007), malware (?malware=<id>) and ransomware group (?group=<key>) panels, mounted once by
 * the app so any page can open them. What a panel opens (software, a group, a CVE) goes on top of it, with a
 * history entry so Back returns to the one below. Reading an article closes them.
 */
const PROFILE_KEYS = { actor: '', malware: '', cve: '' };
const openProfile = (key: 'actor' | 'malware', id: string) => openPanel(key, id);
const openCve = (cve: string) => openPanel('cve', cve);

type Props = { id: string; onOpenArticle: (article: Article) => void };

export const ActorPanelHost: React.FC<Props> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const data = useActors();
  const actor = data?.actors.find((a) => a.id === id);
  // Counted here rather than in the snapshot, so the user's own feeds count too
  const mentions = useMemo(() => (actor ? actorMentions(articles, [actor]).get(actor.id) : undefined), [articles, actor]);
  if (!data || !actor) return null;
  return (
    <ActorPanel
      actor={actor}
      data={data}
      mentions={mentions}
      onOpenMalware={(m) => openProfile('malware', m)}
      onOpenCve={openCve}
      onOpenArticle={(a) => { setHashParams(PROFILE_KEYS); onOpenArticle(a); }}
      onClose={() => setHashParams({ actor: '' })}
    />
  );
};

export const MalwarePanelHost: React.FC<Props> = ({ id, onOpenArticle }) => {
  const { articles } = useFeeds();
  const data = useActors();
  const malware = data?.malware.find((m) => m.id === id);
  const mentions = useMemo(() => (malware ? actorMentions(articles, [malware]).get(malware.id) : undefined), [articles, malware]);
  if (!data || !malware) return null;
  return (
    <MalwarePanel
      malware={malware}
      data={data}
      mentions={mentions}
      onOpenActor={(a) => openProfile('actor', a)}
      onOpenCve={openCve}
      onOpenArticle={(a) => { setHashParams(PROFILE_KEYS); onOpenArticle(a); }}
      onClose={() => setHashParams({ malware: '' })}
    />
  );
};

/** `id` is the group's name, lowercased as leak-site victims and the snapshot's profiles key it */
export const GroupPanelHost: React.FC<Props> = ({ id: param, onOpenArticle }) => {
  const id = param.toLowerCase();
  const { articles, incidents } = useFeeds();
  const intel = useRansomwareIntel();
  const { victims } = useLeakSiteVictims();
  return (
    <GroupPanel
      group={id}
      victims={victims}
      profile={incidents?.groups[id]}
      intel={intel?.groups[id]}
      articles={articles}
      onOpenArticle={(a) => { setHashParams({ group: '' }); onOpenArticle(a); }}
      onClose={() => setHashParams({ group: '' })}
    />
  );
};
