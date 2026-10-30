import { useMemo } from 'react';
import { useStats } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import { ransomDashboard } from '../../services/tv/dashboard';
import { DailyArea, flagOf, HBarList, ListPanel, StatCard, useDashNow } from './dashParts';

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (isNaN(m)) return '';
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

export default function RansomDashboard() {
  const { victims } = useLeakSiteVictims();
  const stats = useStats();
  const now = useDashNow();
  const d = useMemo(() => ransomDashboard(victims, stats, now), [victims, stats, now]);

  return (
    <div className="tv-dash" style={{ gridTemplateRows: 'auto 1fr 1fr' }}>
      <StatCard label="Victims · 24 h" figure={d.victims24h} versus="vs yesterday" color="#c084fc" />
      <StatCard label="Victims · 7 days" figure={d.victims7d} color="#c084fc" />
      <StatCard label="Active groups · 7 days" value={d.groups7d.value} color="#e7ebf0" note={`${d.groups7d.newThisWeek} new this week`} />
      <StatCard
        label="Most hit sector"
        text={d.topSector?.name ?? '—'}
        color="#e7ebf0"
        note={d.topSector ? `${d.topSector.share}% of victims` : 'No data yet'}
      />
      <HBarList label="Top groups · 7 days" data={d.topGroups} color="#a855f7" />
      <DailyArea label="Victims per day · 30 days" daily={d.daily} color="#a855f7" />
      <HBarList
        label="Top countries · 7 days"
        data={d.topCountries}
        color="#6366f1"
        format={c => <>{flagOf(c)} {c.toUpperCase()}</>}
      />
      <ListPanel
        label="Latest victims"
        items={d.latest}
        row={v => (
          <>
            <span className="tv-row-main">{v.victim}</span>
            <span className="tv-row-meta">{v.group} {'·'} {ago(v.discoveredAt, now)}</span>
          </>
        )}
      />
    </div>
  );
}
