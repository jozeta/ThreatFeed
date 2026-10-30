import React, { useMemo } from 'react';
import { ActorProfile, ActorsData, Article } from '../../types';
import { Mentions } from '../../services/intelligence/actors';
import { countryFlag, countryName } from '../../utils/countries';
import { SectionTitle } from '../incidents/shared';
import { EntityText } from '../../components/EntityText';
import { Aliases, chipLink, Coverage, CvesAlongside, ExternalLinks, MentionTrend, ProfilePanel } from './shared';
import { ExternalLink } from 'lucide-react';

const techniqueUrl = (id: string) => `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`;

interface ActorPanelProps {
  actor: ActorProfile;
  data: ActorsData;
  mentions?: Mentions;
  onOpenMalware: (id: string) => void;
  onOpenCve: (cve: string) => void;
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** One threat actor: who it is, how it operates (ATT&CK), its tools, and what the feeds say about it */
export const ActorPanel: React.FC<ActorPanelProps> = ({ actor, data, mentions, onOpenMalware, onOpenCve, onOpenArticle, onClose }) => {
  const malwareByAttackId = useMemo(() => new Map(data.malware.filter((m) => m.attackId).map((m) => [m.attackId!, m])), [data]);
  const articles = mentions?.articles ?? [];

  return (
    <ProfilePanel
      title={actor.name}
      label={`${actor.name} threat actor`}
      onClose={onClose}
      subtitle={<>
        <p className="text-xs font-mono text-theme-text-muted mt-1">
          {actor.id}
          {actor.country && <> · {countryFlag(actor.country)} {countryName(actor.country)}</>}
          {actor.firstSeen && <> · active since {actor.firstSeen}</>}
        </p>
        <Aliases aliases={actor.aliases} />
      </>}
    >
      <div className="flex items-center gap-3 text-xs font-mono text-theme-text-muted">
        <span>Mentions in your feeds (30 days)</span>
        <MentionTrend mentions={mentions} width={120} height={24} />
      </div>

      {actor.description && <p className="text-sm font-serif text-theme-text leading-relaxed"><EntityText text={actor.description} self={{ kind: 'actor', id: actor.id }} /></p>}

      {actor.techniques.length > 0 && (
        <div>
          <SectionTitle>Techniques ({actor.techniques.length})</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {actor.techniques.map((t) => (
              <a key={t.id} href={techniqueUrl(t.id)} target="_blank" rel="noopener noreferrer" title={`${t.name} on MITRE ATT&CK`} className={`${chipLink} border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300`}>
                <span className="font-bold">{t.id}</span> <span className="truncate max-w-[12rem]">{t.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {actor.software.length > 0 && (
        <div>
          <SectionTitle>Malware and tools ({actor.software.length})</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {actor.software.map((s) => {
              const profile = malwareByAttackId.get(s.id);
              return profile ? (
                <button key={s.id} onClick={() => onOpenMalware(profile.id)} className={`${chipLink} border-theme-border text-theme-text`}>{s.name}</button>
              ) : (
                <a key={s.id} href={`https://attack.mitre.org/software/${s.id}/`} target="_blank" rel="noopener noreferrer" className={`${chipLink} border-theme-border text-theme-text-muted`}>
                  {s.name} <ExternalLink className="w-3 h-3" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      <CvesAlongside articles={articles} onOpenCve={onOpenCve} />
      <Coverage articles={articles} onOpenArticle={onOpenArticle} />
      <ExternalLinks links={[{ label: `${actor.id} on MITRE ATT&CK`, url: actor.url }]} />
    </ProfilePanel>
  );
};
