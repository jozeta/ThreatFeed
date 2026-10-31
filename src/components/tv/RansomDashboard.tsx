import { useRef } from 'react';
import { useStats } from '../../hooks/useVulns';
import { useLeakSiteVictims } from '../../hooks/useLeakSiteVictims';
import DashboardWall from './DashboardWall';
import { RansomCtx, ransomPanels } from './dashPanels';

/** The ransomware dashboard: its own panel pool on a living wall */
export default function RansomDashboard() {
  const { victims } = useLeakSiteVictims();
  const stats = useStats();
  // The wall builds and its panels mount on their own schedule; both read the latest data through this ref
  const ref = useRef<Omit<RansomCtx, 'now'>>(null!);
  ref.current = { victims, stats };
  const fresh = (): RansomCtx => ({ ...ref.current, now: Date.now() });

  return <DashboardWall build={() => ransomPanels(fresh(), fresh)} signature={`${victims.length}|${stats ? 's' : '-'}`} />;
}
