import { useMemo } from 'react';
import { useMsrc, useStats, useVulns } from '../../hooks/useVulns';
import { vulnDashboard } from '../../services/tv/dashboard';
import { ListPanel, StatCard, useDashNow, WeeklyBarsLine } from './dashParts';

export default function VulnDashboard() {
  const vulns = useVulns();
  const msrc = useMsrc();
  const stats = useStats();
  const now = useDashNow();
  const d = useMemo(() => vulnDashboard(vulns, msrc, stats, now), [vulns, msrc, stats, now]);
  const pt = d.patchTuesday;

  return (
    <div className="tv-dash" style={{ gridTemplateRows: 'auto 1fr 1fr' }}>
      <StatCard label="Critical CVEs · 7 days" figure={d.critical7d} color="#f87171" />
      <StatCard label="Added to CISA KEV · 7 days" figure={d.kev7d} color="#fb923c" />
      <StatCard label="Public exploits · 7 days" figure={d.exploits7d} color="#fbbf24" />
      <StatCard
        label={pt ? `Patch Tuesday · ${pt.month}` : 'Patch Tuesday'}
        value={pt?.total ?? 0}
        color="#e7ebf0"
        note={pt ? `${pt.critical} critical · ${pt.zeroDays} zero-day${pt.zeroDays === 1 ? '' : 's'}` : 'No data yet'}
      />
      <ListPanel
        label="Exploited right now"
        tall
        items={d.exploitedNow}
        empty="No exploited CVEs right now"
        row={it => (
          <>
            <span className="tv-row-main">
              <span className="tv-score">{it.score !== undefined ? it.score.toFixed(1) : '—'}</span> {it.title}
            </span>
            <span className={`tv-pill ${it.tag === 'KEV' ? 'tv-kev' : 'tv-poc'}`}>{it.tag}</span>
          </>
        )}
      />
      <WeeklyBarsLine label="Critical & exploited · last 90 days (weekly)" weekly={d.weekly} tall />
    </div>
  );
}
