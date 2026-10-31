import { useRef } from 'react';
import { useRansomwareIntel, useStats } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import DashboardWall from './DashboardWall';
import { RansomCtx, ransomPanels } from './dashPanels';

/** The ransomware dashboard: its own panel pool on a living wall */
export default function RansomDashboard() {
  const { victims } = useLeakSiteVictims();
  const stats = useStats();
  const intel = useRansomwareIntel(); // public attack reports, loaded on mount
  // The wall builds and its panels mount on their own schedule; both read the latest data through this ref
  const ref = useRef<Omit<RansomCtx, 'now'>>(null!);
  ref.current = { victims, stats, intel };
  const fresh = (): RansomCtx => ({ ...ref.current, now: Date.now() });

  return <DashboardWall build={() => ransomPanels(fresh(), fresh)} signature={`${victims.length}|${stats ? 's' : '-'}|${intel ? 'i' : '-'}`} />;
}
