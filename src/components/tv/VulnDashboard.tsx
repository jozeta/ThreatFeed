import { useRef } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useMsrc, useStats, useVulns } from '../../hooks/useVulns';
import DashboardWall from './DashboardWall';
import { VulnCtx, vulnPanels } from './dashPanels';

/** The vulnerabilities dashboard: its own panel pool on a living wall */
export default function VulnDashboard() {
  const vulns = useVulns();
  const msrc = useMsrc();
  const stats = useStats();
  const { settings } = useSettings();
  // The wall builds and its panels mount on their own schedule; both read the latest data through this ref
  const ref = useRef<Omit<VulnCtx, 'now'>>(null!);
  ref.current = { vulns, msrc, stats, stackKeywords: settings.stackKeywords ?? [], watchedCves: settings.watchedCves ?? [] };
  const fresh = (): VulnCtx => ({ ...ref.current, now: Date.now() });

  return <DashboardWall build={() => vulnPanels(fresh(), fresh)} signature={`${vulns ? 'v' : '-'}|${msrc ? 'm' : '-'}|${stats ? 's' : '-'}`} />;
}
