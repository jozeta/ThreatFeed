import React, { useEffect, useMemo } from 'react';
import { Article, LeakSiteVictim, RansomwareGroupProfile } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { countryFlag, countryName, groupDisplayName } from '../../utils/countries';
import { formatRelativeTime } from '../../utils/date';
import { BarList, countBy, SectionTitle } from './shared';
import { X, ExternalLink } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

interface GroupPanelProps {
  group: string;
  victims: LeakSiteVictim[]; // all victims (30 days)
  profile?: RansomwareGroupProfile;
  articles: Article[];
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** Everything known about one ransomware group: profile, activity, victims, and coverage in the feeds. */
export const GroupPanel: React.FC<GroupPanelProps> = ({ group, victims, profile, articles, onOpenArticle, onClose }) => {
  const mine = useMemo(() => victims.filter((v) => v.group.toLowerCase() === group.toLowerCase()), [victims, group]);
  const name = groupDisplayName(profile?.name || group);
  const lastWeek = mine.filter((v) => Date.now() - new Date(v.discoveredAt).getTime() < 7 * DAY_MS).length;

  // Coverage in the feeds: whole-word name match, plus ransomware context so short names don't misfire
  const news = useMemo(
    () => articles
      .filter((a) => containsTerm(`${a.title} ${a.description || ''}`, name) && /ransom|extortion|leak/i.test(`${a.title} ${a.description || ''}`))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 12),
    [articles, name]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name} ransomware group`}>
      <div className="w-full max-w-xl h-full overflow-y-auto bg-theme-bg border-l border-theme-border p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-extrabold text-theme-text">{name}</h2>
            <p className="text-xs font-mono text-theme-text-muted mt-1">
              {mine.length} victims in 30 days · {lastWeek} in the last 7
              {mine[0] && <> · last post {formatRelativeTime(mine[0].discoveredAt)}</>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-theme-text-muted hover:text-theme-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {profile?.description && <p className="text-sm font-serif text-theme-text leading-relaxed">{profile.description}</p>}
        {profile?.url && (
          <a href={profile.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-theme-accent hover:underline">
            Group profile on Ransomware.live <ExternalLink className="w-3 h-3" />
          </a>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div>
            <SectionTitle>Sectors</SectionTitle>
            <BarList rows={countBy(mine, (v) => v.sector).slice(0, 6).map(([k, n]) => ({ key: k, label: k, value: n }))} />
          </div>
          <div>
            <SectionTitle>Countries</SectionTitle>
            <BarList rows={countBy(mine, (v) => v.country).slice(0, 6).map(([k, n]) => ({ key: k, label: `${countryFlag(k)} ${countryName(k)}`, value: n }))} />
          </div>
        </div>

        <div>
          <SectionTitle>In the news ({news.length})</SectionTitle>
          {news.length ? (
            <ul className="space-y-2">
              {news.map((a) => (
                <li key={a.id}>
                  <button onClick={() => onOpenArticle(a)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent">{a.title}</button>
                  <p className="text-[11px] font-mono text-theme-text-muted">{a.sourceName} · {formatRelativeTime(a.publishedAt)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs font-serif italic text-theme-text-muted">No coverage of this group in your feeds right now.</p>}
        </div>

        <div>
          <SectionTitle>Recent victims</SectionTitle>
          <ul className="divide-y divide-theme-border/60 text-xs font-mono">
            {mine.slice(0, 25).map((v) => (
              <li key={v.id} className="py-1.5 flex items-center gap-2">
                <span className="w-16 text-theme-text-muted flex-shrink-0">{formatRelativeTime(v.discoveredAt)}</span>
                <span className="flex-1 truncate text-theme-text">{v.victim}</span>
                <span title={countryName(v.country)}>{v.country ? countryFlag(v.country) : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
