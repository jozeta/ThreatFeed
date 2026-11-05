import { useRef } from 'react';
import { useNpmAdvisories } from '../../hooks/useNpmAdvisories';
import { useNpmMatches } from '../../hooks/useNpmMatches';
import DashboardWall from './DashboardWall';
import { NpmCtx, npmPanels } from './dashPanels';

/** The npm dashboard (#/vulns/npm?dash=1): its own panel pool on a living wall */
export default function NpmDashboard() {
  const { advisories, malware } = useNpmAdvisories();
  const { results } = useNpmMatches(advisories, malware); // asks OSV only when that setting is on
  // The wall builds and its panels mount on their own schedule; both read the latest data through this ref
  const ref = useRef<Omit<NpmCtx, 'now'>>(null!);
  ref.current = { data: advisories, malware, results };
  const fresh = (): NpmCtx => ({ ...ref.current, now: Date.now() });

  return <DashboardWall build={() => npmPanels(fresh(), fresh)} signature={`${advisories ? 'a' : '-'}|${malware ? 'm' : '-'}|${results.length}`} />;
}
