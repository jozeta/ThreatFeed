import React, { useMemo } from 'react';
import { Article, GroupIntel, LeakSiteVictim, RansomwareGroupProfile } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { isLeakSitePost } from '../../services/intelligence/incidents';
import { countryFlag, countryName, groupDisplayName } from '../../utils/countries';
import { formatRelativeTime } from '../../utils/date';
import { BarList, countBy, SectionTitle } from './shared';
import { GroupIntelSection, LeakSiteStatus } from './GroupIntelSection';
import { activityChange, groupActivity } from '../../services/intelligence/groupActivity';
import { StackedBars } from '../vulns/StackedBars';
import { PanelCloseButton, SidePanel } from '../../components/Common/SidePanel';
import { EntityText } from '../../components/EntityText';
import { ExternalLink } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

interface GroupPanelProps {
  group: string;
  victims: LeakSiteVictim[]; // all victims (30 days)
  profile?: RansomwareGroupProfile;
  intel?: GroupIntel; // techniques, tools, ATT&CK, CVEs, payments (data/ransomware.json)
  articles: Article[];
  onOpenArticle: (article: Article) => void;
  onClose: () => void;
}

/** Everything known about one ransomware group: profile, activity, victims, and coverage in the feeds. */
export const GroupPanel: React.FC<GroupPanelProps> = ({ group, victims, profile, intel, articles, onOpenArticle, onClose }) => {
  const mine = useMemo(() => victims.filter((v) => v.group.toLowerCase() === group.toLowerCase()), [victims, group]);
  const name = groupDisplayName(profile?.name || group);
  const lastWeek = mine.filter((v) => Date.now() - new Date(v.discoveredAt).getTime() < 7 * DAY_MS).length;

  // Activity compared with every other group: rank, trend, change versus the previous 30 days
  const { activity, groupCount, historyDays } = useMemo(() => {
    const all = groupActivity(victims);
    const first = victims.reduce((min, v) => (v.discoveredAt < min ? v.discoveredAt : min), new Date().toISOString());
    return { activity: all.get(group.toLowerCase()), groupCount: all.size, historyDays: (Date.now() - Date.parse(first)) / DAY_MS };
  }, [victims, group]);
  const change = activity ? activityChange(activity, historyDays) : undefined;

  // Coverage in the feeds: whole-word name match, plus ransomware context so short names don't misfire
  const news = useMemo(
    () => articles
      // Automated leak-site victim posts aren't coverage; they're already in the victim list below
      .filter((a) => !isLeakSitePost(a) && containsTerm(`${a.title} ${a.description || ''}`, name) && /ransom|extortion|leak/i.test(`${a.title} ${a.description || ''}`))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 12),
    [articles, name]
  );

  return (
    <SidePanel onClose={onClose} title={`${name} ransomware group`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-extrabold text-theme-text">{name}</h2>
          <p className="text-xs font-mono text-theme-text-muted mt-1">
            {mine.length} victims in 90 days · {lastWeek} in the last 7
            {mine[0] && <> · last post {formatRelativeTime(mine[0].discoveredAt)}</>}
          </p>
          {(intel?.firstSeen || intel?.altNames) && (
            <p className="text-xs font-mono text-theme-text-muted mt-0.5">
              {intel.firstSeen && <>first seen {intel.firstSeen}</>}
              {intel.firstSeen && intel.altNames && ' · '}
              {intel.altNames && <>also known as {intel.altNames.join(', ')}</>}
            </p>
          )}
        </div>
        <PanelCloseButton />
      </div>

      {activity && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Last 7 days', value: activity.last7 },
              { label: 'Last 30 days', value: activity.last30, note: change === undefined ? undefined : `${change >= 0 ? '+' : ''}${change}% vs prior 30` },
              { label: 'Rank (30 days)', value: `#${activity.rank}`, note: `of ${groupCount} groups` },
              { label: 'Last post', value: formatRelativeTime(activity.lastPost) },
            ].map((s) => (
              <div key={s.label} className="p-2.5 rounded bg-theme-surface border border-theme-border">
                <span className="block text-[10px] font-mono uppercase text-theme-text-muted">{s.label}</span>
                <span className="block font-serif text-lg font-bold text-theme-text">{s.value}</span>
                {s.note && <span className={`block text-[10px] font-mono ${change !== undefined && change > 0 ? 'text-rose-500' : 'text-theme-text-muted'}`}>{s.note}</span>}
              </div>
            ))}
          </div>
          <StackedBars
            ariaLabel={`${name} victims per week`}
            unit="victims"
            buckets={activity.weekly.map((n, i) => {
              const start = new Date(Date.now() - (activity.weekly.length - i) * 7 * DAY_MS);
              return { label: `week of ${start.toISOString().slice(0, 10)}`, short: i === 0 ? '13 weeks ago' : 'this week', segments: [{ name: 'victims', value: n, className: 'fill-rose-500' }] };
            })}
          />
          {intel?.leakSites && <p className="text-xs"><LeakSiteStatus sites={intel.leakSites} /> <span className="text-[10px] font-mono text-theme-text-muted">· as of Ransomware.live's last check; addresses are never shown</span></p>}
        </div>
      )}

      {(intel?.description || profile?.description) && <p className="text-sm font-serif text-theme-text leading-relaxed"><EntityText text={(intel?.description || profile?.description)!} self={{ kind: 'group', id: group }} /></p>}
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

      <GroupIntelSection intel={intel} />

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
    </SidePanel>
  );
};
