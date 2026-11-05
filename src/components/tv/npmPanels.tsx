import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../../services/npm/advisories';
import type { PackageResult } from '../../services/npm/match';
import type { Figure } from '../../services/tv/dashboard';
import {
  malwarePerDay, myPackagesStatus, newestCriticalNpm, npmFixShare, npmPerDayBySeverity, npmSeverityShare, npmTopCwes, npmTopPackages, npmVulnVsMalware,
} from '../../services/charts/figures';
import type { Slice } from '../charts/chartData';
import { dayLabel, dayTotals, memoLast, pool, sum } from './dashPool';
import { chartReady, DonutPanel, HBarList, Panel, StackedPanel, StatCard, TV_SEVERITY } from './dashParts';
import { PanelDef } from './DashboardWall';
import { shortAge } from './TvTileCard';

export interface NpmCtx {
  data: NpmAdvisoryData | null; malware: NpmMalwareData | null;
  /** The watched packages matched against the advisories; empty when none are watched */
  results: PackageResult[]; now: number;
}


/** Advisories published in the last 7 days, and the change from the 7 days before */
export function npmWeek(data: NpmAdvisoryData, now: number): Figure {
  const days = dayTotals(npmPerDayBySeverity(data, now, 14));
  const week = sum(days.slice(7)), before = sum(days.slice(0, 7));
  return { value: week, delta: week - before };
}

const NO_NPM: NpmAdvisoryData = { version: 1, generatedAt: '', updatedAt: '', recent: [], index: [] };
const npmData = memoLast((c: NpmCtx) => {
  const data = c.data ?? NO_NPM;
  return {
    week: npmWeek(data, c.now),
    daily: npmPerDayBySeverity(data, c.now),
    severity: npmSeverityShare(data, c.now),
    kinds: npmVulnVsMalware(data, c.malware, c.now).map(s => (s.label === 'Vulnerabilities' ? { ...s, label: NEW_OR_UPDATED } : s)),
    packages: npmTopPackages(data, c.now),
    cwes: npmTopCwes(data, c.now),
    mine: myPackagesStatus(c.results),
    critical: newestCriticalNpm(data),
    malware7d: c.malware ? malwarePerDay(c.malware, c.now, 7) : null,
    fix: npmFixShare(data, c.now),
  };
});

// npm donut colours by slice label: severities as the per-day bars' fills (SEVERITY_DOT), package statuses as their badges
// The vulnerabilities slice counts advisories published or updated in the window, so it is named for that: the
// "npm advisories · 7 days" number on the same wall counts publications only
const NEW_OR_UPDATED = 'New or updated advisories';
const NPM_KIND_HEX: Record<string, string> = { [NEW_OR_UPDATED]: '#f59e0b', Malware: '#e11d48', 'Fix available': '#10b981', 'No fix': '#e11d48' };
// Package statuses as their badges; "Unknown" is grey like every not-a-category slice
const NPM_STATUS_HEX: Record<string, string> = { Affected: '#e11d48', 'No version': '#f97316', Clean: '#10b981' };
export const NpmWeekCard = ({ figure }: { figure: Figure }) => <StatCard label="npm advisories · 7 days" figure={figure} color="#f59e0b" />;
export const NpmSeverityDonut = ({ data }: { data: Slice[] }) => <DonutPanel label="npm advisories by severity · 30 days" data={data} colors={TV_SEVERITY} />;

/** The newest critical npm advisory: package and fix, the summary (as text), ids and age */
function NewestNpm({ a, now }: { a: NpmAdvisory; now: number }) {
  const r = a.ranges[0];
  return (
    <Panel label="Newest critical npm advisory">
      {r && (
        <div className="tv-panel-sub">
          <b style={{ color: '#e7ebf0' }}>{r.package}</b> {r.vulnerable} {'·'} {r.patched ? `fixed in ${r.patched}` : 'no fix yet'}
          {a.ranges.length > 1 ? ` · +${a.ranges.length - 1} more` : ''}
        </div>
      )}
      <div className="tv-stat">
        <div className="tv-big tv-big-text tv-big-text-long" style={{ color: '#fca5a5' }} title={a.summary}>{a.summary}</div>
        <span className="tv-delta">{a.id}{a.cves.length ? ` · ${a.cves.join(', ')}` : ''} {'·'} {shortAge(a.published, now)} ago</span>
      </div>
    </Panel>
  );
}

/**
 * The npm dashboard; no panels without the advisories (the malware count also needs the malware file). The two number
 * panels let the Medium and Large grids tile (each needs two 1×1 cells) instead of falling back to full-height columns.
 */
export function npmPanels(ctx: NpmCtx, fresh: () => NpmCtx = () => ctx): PanelDef[] {
  if (!ctx.data) return [];
  const { out, add, first: f } = pool(ctx, fresh, npmData);
  add('npmWeek', false, true, d => <NpmWeekCard figure={d.week} />);
  add('npmDaily', true, chartReady(dayTotals(f.daily).map(n => [n])), d => (
    <StackedPanel label="npm advisories per day by severity · 30 days" buckets={d.daily} axis={dayLabel} colors={TV_SEVERITY} />
  ));
  add('npmSeverity', true, f.severity.length > 0, d => <NpmSeverityDonut data={d.severity} />);
  add('npmKinds', true, f.kinds.length > 0, d => <DonutPanel label="Advisories vs malware · 7 days" data={d.kinds} colors={NPM_KIND_HEX} />);
  add('npmTopPackages', true, f.packages.length > 0, d => (
    <HBarList label="Most affected packages · 30 days" data={d.packages.map(r => [r.label, r.value] as [string, number])} color="#f59e0b" format={name => <span title={name}>{name}</span>} />
  ));
  add('npmTopCwes', true, f.cwes.length > 0, d => (
    <HBarList label="Top weakness types · npm · 30 days" data={d.cwes.map(r => [r.label, r.value] as [string, number])} color="#38bdf8" format={name => <span title={name}>{name}</span>} />
  ));
  add('npmMine', true, f.mine.length > 0, d => <DonutPanel label="My packages" data={d.mine} colors={NPM_STATUS_HEX} />);
  add('npmNewestCritical', true, !!f.critical, (d, now) => (d.critical ? <NewestNpm a={d.critical} now={now} /> : <Panel label="Newest critical npm advisory"><div className="tv-note">Nothing to show yet</div></Panel>));
  add('npmMalware7d', false, !!f.malware7d, d => (
    <StatCard label="Malware releases · 7 days" value={sum(d.malware7d ?? [])} color="#f43f5e" note="malicious npm packages reported" spark={d.malware7d ?? undefined} />
  ));
  add('npmFixShare', true, f.fix.length > 0, d => <DonutPanel label="Advisories with a fix · 30 days" data={d.fix} colors={NPM_KIND_HEX} />);
  return out;
}
