import { LeakSiteVictim, RansomwareIntel, StatsData } from '../../types';
import { ransomDashboard, ransomExtras } from '../../services/tv/dashboard';
import { groupShare, victimsBySector, victimsPerDayTopGroups } from '../../services/charts/figures';
import { dayLabel, dayTotals, memoLast, plural, pool, shortDate } from './dashPool';
import { chartReady, DailyArea, DonutPanel, flagOf, HBarList, ListPanel, StackedPanel, StatCard, VBars } from './dashParts';
import { PanelDef } from './DashboardWall';
import { shortAge } from './TvTileCard';
import { WorldMap } from './WorldMap';

export interface RansomCtx {
  victims: LeakSiteVictim[]; stats: StatsData | null; now: number;
  /** Public attack reports and group intel (data/ransomware.json); loads after the victims */
  intel?: RansomwareIntel | null;
}

const ransomData = memoLast((c: RansomCtx) => ({
  d: ransomDashboard(c.victims, c.stats, c.now),
  x: ransomExtras(c.victims, c.stats, c.now, c.intel?.attacks),
  c: {
    sectors: victimsBySector(c.victims, c.now),
    groups: groupShare(c.victims, c.now),
    groupsDaily: victimsPerDayTopGroups(c.victims, c.now),
  },
}));

const PURPLE = '#a855f7';
/** 24 values don't fit above 24 narrow bars: show the peak and every 3rd hour (the labelled ones) */
const peakOrEvery3 = (hours: number[]) => {
  const peak = hours.indexOf(Math.max(...hours));
  return (i: number) => i === peak || i % 3 === 0;
};

export function ransomPanels(ctx: RansomCtx, fresh: () => RansomCtx = () => ctx): PanelDef[] {
  const { out, add, first: { d, x, c } } = pool(ctx, fresh, ransomData);
  const any = ctx.victims.length > 0 || !!ctx.stats;

  add('victims24h', false, any, ({ d }) => <StatCard label="Victims · 24 h" figure={d.victims24h} versus="vs yesterday" color="#c084fc" />);
  add('victims7d', false, any, ({ d }) => <StatCard label="Victims · 7 days" figure={d.victims7d} color="#c084fc" />);
  add('groups7d', false, any, ({ d }) => (
    <StatCard label="Active groups · 7 days" value={d.groups7d.value} color="#e7ebf0" note={`${d.groups7d.newThisWeek} new this week`} />
  ));
  add('topSector', false, !!d.topSector, ({ d }) => (
    <StatCard label="Most hit sector" text={d.topSector?.name ?? '—'} color="#e7ebf0" note={d.topSector ? `${d.topSector.share}% of victims` : 'No data yet'} />
  ));
  add('topGroups', true, d.topGroups.length > 0, ({ d }) => <HBarList label="Top groups · 7 days" data={d.topGroups} color={PURPLE} />);
  add('daily30', true, chartReady(d.daily.map(p => [p.count])), ({ d }) => <DailyArea label="Victims per day · 30 days" daily={d.daily} color={PURPLE} />);
  add('topCountries', true, d.topCountries.length > 0, ({ d }) => (
    <HBarList label="Top countries · 7 days" data={d.topCountries} color="#6366f1" format={c => <>{flagOf(c)} {c.toUpperCase()}</>} />
  ));
  add('countryMap', true, Object.keys(x.countries7d).length > 0, ({ x }) => (
    <WorldMap label="Victims by country · 7 days" counts={x.countries7d} />
  ));
  add('latestVictims', true, d.latest.length > 0, ({ d }, now) => (
    <ListPanel
      label="Latest victims"
      items={d.latest}
      row={v => (
        <>
          <span className="tv-row-main">{v.victim}</span>
          <span className="tv-row-meta">{v.group} {'·'} {shortAge(v.discoveredAt, now)}</span>
        </>
      )}
    />
  ));
  add('topSectors', true, x.topSectors.length > 0, ({ x }) => <HBarList label="Top sectors · 7 days" data={x.topSectors} color="#818cf8" />);
  add('newGroups', true, x.newGroups.length > 0, ({ x }) => (
    <ListPanel
      label="New groups this week"
      items={x.newGroups}
      empty="No new groups this week"
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">{plural(g.victims, 'victim')}</span>
        </>
      )}
    />
  ));
  add('spotlight', true, !!x.spotlight, ({ x: { spotlight: s } }, now) => (
    <ListPanel
      label={s ? `Group spotlight · ${s.group}` : 'Group spotlight'}
      head={s && <div className="tv-panel-sub"><b style={{ color: '#c084fc' }}>{plural(s.count, 'victim')}</b> this week · the most active group</div>}
      items={s?.victims ?? []}
      row={v => (
        <>
          <span className="tv-row-main">{v.country ? `${flagOf(v.country)} ` : ''}{v.victim}</span>
          <span className="tv-row-meta">{shortAge(v.discoveredAt, now)}</span>
        </>
      )}
    />
  ));
  add('weekday', true, x.weekday.some(w => w.count > 0), ({ x }) => (
    <VBars label="Victims by weekday · last 4 weeks" data={x.weekday.map(w => ({ label: w.day, n: w.count }))} color={PURPLE} />
  ));
  add('weekly90', true, chartReady(x.weekly90.map(w => [w.count ?? 0])), ({ x }) => (
    <VBars label="Victims · 90 days (weekly)" data={x.weekly90.map(w => ({ label: shortDate(w.week), n: w.count }))} color={PURPLE} />
  ));
  add('movers', true, x.movers.risers.length + x.movers.fallers.length > 0, ({ x: { movers: m } }) => (
    <ListPanel
      label="Rising & falling groups · this week vs last"
      items={[...m.risers, ...m.fallers]}
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">{g.before} {'→'} {g.week}</span>
          <b className="tv-row-meta" style={{ color: g.change > 0 ? '#f87171' : '#34d399', minWidth: '3.5vw', textAlign: 'right' }}>
            {g.change > 0 ? '▲' : '▼'} {Math.abs(g.change)}
          </b>
        </>
      )}
    />
  ));
  add('sectors30', true, x.sectors30.length > 0, ({ x }) => <HBarList label="Sectors · 30 days" data={x.sectors30} color="#818cf8" />);
  add('hours', true, x.hours.some(n => n > 0), ({ x }) => (
    <VBars
      label="Busiest hours · leak-site posts by hour (UTC) · 14 days"
      data={x.hours.map((n, h) => ({ label: h % 3 === 0 ? String(h).padStart(2, '0') : '\u00a0', n }))}
      color={PURPLE}
      showValue={peakOrEvery3(x.hours)}
    />
  ));
  add('attacks', true, x.attacks.length > 0, ({ x }) => (
    <ListPanel
      label="Publicly reported attacks · 14 days"
      items={x.attacks}
      row={a => (
        <>
          <span className="tv-row-main">{a.victim}</span>
          <span className="tv-row-meta">
            {a.group ? `${a.group} · ` : ''}{a.country ? `${flagOf(a.country)} · ` : ''}{shortDate(a.added)}
          </span>
        </>
      )}
    />
  ));
  add('newGroups30', true, x.newGroups30.length > 0, ({ x }) => (
    <ListPanel
      label="New groups · 30 days"
      items={x.newGroups30}
      row={g => (
        <>
          <span className="tv-row-main">{g.group}</span>
          <span className="tv-row-meta">first {shortDate(g.firstSeen)} {'·'} {plural(g.victims, 'victim')}</span>
        </>
      )}
    />
  ));
  // A sector donut of nothing but "Unknown" says nothing
  add('sectorShare', true, c.sectors.some(s => !s.other && s.label !== 'Unknown'), ({ c }) => <DonutPanel label="Victims by sector · 30 days" data={c.sectors} />);
  add('groupShare', true, c.groups.length > 0, ({ c }) => <DonutPanel label="Group share · victims · 30 days" data={c.groups} />);
  add('groupsDaily', true, chartReady(dayTotals(c.groupsDaily).map(n => [n])), ({ c }) => (
    <StackedPanel label="Victims per day · top 5 groups · 30 days" buckets={c.groupsDaily} axis={dayLabel} />
  ));
  return out;
}
