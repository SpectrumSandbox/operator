import { useMemo } from 'react';
import type { AirframeClass, Base, Mission, Unit, UnitStatus } from '../../types';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, REGIONS, UNIT_STATUS, UNIT_STATUSES, MISSION_PROFILES } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Empty, Icon, Meter, Panel, Select, TONE_TEXT, cx } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
import { EnergyIcon, FaultCount, StatusText, UNIT_STATUS_SHORT, energyKind, energyTone, goMission, serviceInfo, sohTone } from './shared';

export interface UnitFilters {
  status: UnitStatus | 'all';
  cls: AirframeClass | 'all';
  loc: string; // 'all' | 'r:<regionId>' | 'b:<baseId>'
  q: string;
}

export function filterUnits(units: Unit[], bases: Base[], f: UnitFilters): Unit[] {
  const q = f.q.trim().toLowerCase();
  const baseRegion = new Map(bases.map((b) => [b.id, b.regionId]));
  return units.filter((u) => {
    if (f.status !== 'all' && u.status !== f.status) return false;
    const af = AIRFRAME[u.modelId];
    if (f.cls !== 'all' && af?.cls !== f.cls) return false;
    if (f.loc.startsWith('r:') && baseRegion.get(u.baseId) !== f.loc.slice(2)) return false;
    if (f.loc.startsWith('b:') && u.baseId !== f.loc.slice(2)) return false;
    if (q && !`${u.callsign} ${u.tail} ${af?.name ?? ''} ${af?.maker ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const STATUS_ORDER: Record<UnitStatus, number> = { 'in-flight': 0, 'in-transit': 1, assigned: 2, charging: 3, available: 4, maintenance: 5, grounded: 6 };

export function UnitsTable({
  units,
  allCount,
  bases,
  missions,
  now,
  selectedId,
  filters,
  setFilters,
}: {
  units: Unit[];
  allCount: number;
  bases: Base[];
  missions: Mission[];
  now: number;
  selectedId?: string;
  filters: UnitFilters;
  setFilters: (f: UnitFilters) => void;
}) {
  const baseById = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);
  const missionById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions]);
  const sorted = useMemo(() => [...units].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.callsign.localeCompare(b.callsign)), [units]);

  const clsOptions = useMemo(
    () => [{ value: 'all' as const, label: 'All classes' }, ...(Object.keys(AIRFRAME_CLASS_LABEL) as AirframeClass[]).map((c) => ({ value: c, label: AIRFRAME_CLASS_LABEL[c] }))],
    [],
  );
  const locOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: 'all', label: 'All bases & regions' }];
    for (const r of REGIONS) {
      const bs = bases.filter((b) => b.regionId === r.id);
      if (!bs.length) continue;
      out.push({ value: `r:${r.id}`, label: `${r.name} (region)` });
      for (const b of bs) out.push({ value: `b:${b.id}`, label: `   ${b.name}` });
    }
    return out;
  }, [bases]);

  const filtered = filters.status !== 'all' || filters.cls !== 'all' || filters.loc !== 'all' || filters.q.trim() !== '';

  return (
    <Panel
      title="Asset Registry"
      index="A"
      className="h-full @container"
      bodyClassName="flex flex-col min-h-0"
      actions={
        <span className="num text-[10.5px] text-dim">
          {units.length === allCount ? allCount : `${units.length} / ${allCount}`}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line shrink-0">
        <label className="relative flex items-center">
          <Icon name="search" size={12} className="absolute left-2 text-dim pointer-events-none" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Callsign, tail, model…"
            className="field pl-7 w-[180px]"
            aria-label="Search units"
          />
        </label>
        <Select
          className="[&_select]:max-w-[150px]"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[{ value: 'all', label: 'All statuses' }, ...UNIT_STATUSES.map((s) => ({ value: s, label: UNIT_STATUS[s].label }))]}
        />
        <Select className="[&_select]:max-w-[170px]" value={filters.cls} onChange={(v) => setFilters({ ...filters, cls: v })} options={clsOptions} />
        <Select className="[&_select]:max-w-[190px]" value={filters.loc} onChange={(v) => setFilters({ ...filters, loc: v })} options={locOptions} />
        {filtered && (
          <button className="btn h-7 px-2 border-transparent text-muted" onClick={() => setFilters({ status: 'all', cls: 'all', loc: 'all', q: '' })}>
            <Icon name="x" size={11} /> Clear
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {sorted.length === 0 ? (
          <Empty icon="funnel" text="No units match the current filters" sub="Clear filters to show the full registry." />
        ) : (
          <table className="tbl text-[11.5px] [&_td]:py-[7px] [&_td]:whitespace-nowrap">
            <thead>
              <tr>
                <th>Unit</th>
                <th className="@max-[860px]:hidden">Airframe</th>
                <th>Status</th>
                <th>Mission</th>
                <th className="@max-[760px]:hidden">Base</th>
                <th>Energy</th>
                <th className="text-right @max-[640px]:hidden">SoH</th>
                <th className="text-right @max-[700px]:hidden">Service</th>
                <th className="@max-[1200px]:hidden">Firmware</th>
                <th className="text-right @max-[1080px]:hidden">Last flight</th>
                <th className="text-right">Faults</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const af = AIRFRAME[u.modelId];
                const st = UNIT_STATUS[u.status];
                const m = u.missionId ? missionById.get(u.missionId) : undefined;
                const b = baseById.get(u.baseId);
                const svc = serviceInfo(u);
                const fwOld = u.firmware !== u.firmwareLatest;
                const sel = u.id === selectedId;
                const kind = energyKind(u);
                const region = b ? REGIONS.find((r) => r.id === b.regionId)?.short : '';
                return (
                  <tr
                    key={u.id}
                    onClick={() => actions.selectUnit(sel ? undefined : u.id)}
                    className={cx('cursor-pointer', sel && 'bg-white/[0.06]')}
                    aria-selected={sel}
                  >
                    <td style={sel ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined} title={`${u.callsign} · ${u.tail}`}>
                      <span className="font-semibold text-white">{u.callsign}</span>
                      <span className="num text-[10.5px] text-dim ml-2 @max-[980px]:hidden">{u.tail}</span>
                    </td>
                    <td className="max-w-[170px] truncate text-muted @max-[860px]:hidden" title={af ? `${af.name} · ${AIRFRAME_CLASS_LABEL[af.cls]}` : ''}>
                      {af?.name}
                    </td>
                    <td>
                      <StatusText tone={st.tone} label={UNIT_STATUS_SHORT[u.status]} pulse={u.status === 'in-flight'} />
                      {u.contingency && (
                        <Badge tone="alert" className="blink ml-1">
                          {u.contingency.action}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {m ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goMission(m.id, actions.selectMission);
                          }}
                          className="inline-flex items-center gap-1.5 group"
                          title={`${m.name} · ${MISSION_PROFILES[m.type].short} · ${m.subtype} — open in Mission Control`}
                        >
                          <i className="w-1.5 h-1.5 shrink-0" style={{ background: MISSION_PROFILES[m.type].color }} />
                          <span className="num text-[11px] text-text group-hover:text-white group-hover:underline underline-offset-2">{m.code}</span>
                        </button>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="max-w-[170px] truncate @max-[760px]:hidden" title={`${b?.name} · ${b?.city}`}>
                      <span className="num text-[10.5px] text-dim mr-1.5">{region}</span>
                      <span className="text-muted">{b?.name}</span>
                    </td>
                    <td title={`${kind === 'fuel' ? 'Fuel' : 'Battery'} ${Math.round(u.energyPct)}%`}>
                      <div className="flex items-center gap-1.5">
                        <span className={TONE_TEXT[energyTone(u.energyPct)]}>
                          <EnergyIcon u={u} />
                        </span>
                        <span className="num text-text w-[30px] text-right">{Math.round(u.energyPct)}%</span>
                        <Meter value={u.energyPct} tone={energyTone(u.energyPct)} height={3} className="!w-[40px]" />
                      </div>
                    </td>
                    <td className={cx('num text-right @max-[640px]:hidden', sohTone(u.sohPct) === 'ok' ? 'text-muted' : TONE_TEXT[sohTone(u.sohPct)])}>{u.sohPct}%</td>
                    <td className="num text-right @max-[700px]:hidden" title={`${u.airframeHrs.toFixed(0)} h airframe · service every ${svc.interval} h`}>
                      <span className={svc.tone === 'ok' ? 'text-muted' : TONE_TEXT[svc.tone]}>{svc.remaining <= 0 ? 'DUE' : `${svc.remaining.toFixed(0)} h`}</span>
                    </td>
                    <td className="@max-[1200px]:hidden">
                      <span className={cx('num text-[11px]', fwOld ? 'text-warn' : 'text-dim')} title={fwOld ? `Update available: ${u.firmwareLatest}` : 'Latest release'}>
                        {u.firmware}
                        {fwOld && ' ↑'}
                      </span>
                    </td>
                    <td className="num text-[11px] text-right @max-[1080px]:hidden">{u.status === 'in-flight' ? <span className="text-live">airborne</span> : <span className="text-dim">{fmtRel(u.lastFlightTs, now)}</span>}</td>
                    <td className="text-right">
                      <FaultCount u={u} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
