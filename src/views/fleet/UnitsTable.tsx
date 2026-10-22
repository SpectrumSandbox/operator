import { useMemo } from 'react';
import type { AirframeClass, Base, Mission, Unit, UnitStatus } from '../../types';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, REGIONS, UNIT_STATUS, UNIT_STATUSES, MISSION_PROFILES } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Empty, Icon, Meter, Panel, Select, TONE_TEXT, cx } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
import { EnergyIcon, FaultCount, energyKind, energyTone, goMission, serviceInfo, sohTone } from './shared';

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
      icon="drone"
      subtitle={`${units.length} of ${allCount} units`}
      className="h-full"
      bodyClassName="flex flex-col min-h-0"
      actions={
        filtered && (
          <button className="btn h-6 px-2 text-[10px]" onClick={() => setFilters({ status: 'all', cls: 'all', loc: 'all', q: '' })}>
            <Icon name="x" size={11} /> Clear
          </button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line shrink-0">
        <label className="relative flex items-center">
          <Icon name="search" size={12} className="absolute left-2 text-dim pointer-events-none" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Callsign, tail, model…"
            className="field pl-7 w-[200px]"
            aria-label="Search units"
          />
        </label>
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[{ value: 'all', label: 'All statuses' }, ...UNIT_STATUSES.map((s) => ({ value: s, label: UNIT_STATUS[s].label }))]}
        />
        <Select label="Class" value={filters.cls} onChange={(v) => setFilters({ ...filters, cls: v })} options={clsOptions} />
        <Select label="Base" value={filters.loc} onChange={(v) => setFilters({ ...filters, loc: v })} options={locOptions} />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {sorted.length === 0 ? (
          <Empty icon="funnel" text="No units match the current filters" sub="Clear filters to show the full registry." />
        ) : (
          <table className="tbl text-[11.5px] min-w-[1180px]">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Airframe</th>
                <th>Status</th>
                <th>Mission</th>
                <th>Base</th>
                <th className="min-w-[104px]">Energy</th>
                <th className="text-right">SoH</th>
                <th className="min-w-[120px]">Airframe hrs · service</th>
                <th>Firmware</th>
                <th>Last flight</th>
                <th className="text-center">Faults</th>
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
                return (
                  <tr
                    key={u.id}
                    onClick={() => actions.selectUnit(sel ? undefined : u.id)}
                    className={cx('cursor-pointer', sel && 'bg-white/[0.06]')}
                    aria-selected={sel}
                  >
                    <td className="relative" style={sel ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined}>
                      <div className="font-semibold text-white leading-tight whitespace-nowrap">{u.callsign}</div>
                      <div className="num text-[10.5px] text-dim leading-tight">{u.tail}</div>
                    </td>
                    <td className="max-w-[180px]">
                      <div className="truncate text-text leading-tight">{af?.name}</div>
                      <div className="truncate text-[10.5px] text-dim leading-tight">{af ? AIRFRAME_CLASS_LABEL[af.cls] : ''}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      {u.contingency && (
                        <div className="mt-0.5">
                          <Badge tone="alert" className="blink">
                            {u.contingency.action}
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {m ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goMission(m.id, actions.selectMission);
                          }}
                          className="text-left group"
                          title={`${m.name} — open in Mission Control`}
                        >
                          <span className="num text-[11px] text-text group-hover:text-white group-hover:underline underline-offset-2">{m.code}</span>
                          <span className="block text-[10.5px] leading-tight" style={{ color: MISSION_PROFILES[m.type].color }}>
                            {MISSION_PROFILES[m.type].short} · {m.subtype}
                          </span>
                        </button>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="max-w-[150px]">
                      <div className="truncate text-text leading-tight" title={`${b?.name} · ${b?.city}`}>
                        {b?.name}
                      </div>
                      <div className="num text-[10.5px] text-dim leading-tight">{b ? REGIONS.find((r) => r.id === b.regionId)?.short : ''}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={TONE_TEXT[energyTone(u.energyPct)]}>
                          <EnergyIcon u={u} />
                        </span>
                        <span className="num text-text w-[34px] text-right">{Math.round(u.energyPct)}%</span>
                        <span className="text-[9.5px] uppercase tracking-wider text-dim">{kind === 'fuel' ? 'Fuel' : 'Batt'}</span>
                      </div>
                      <Meter value={u.energyPct} tone={energyTone(u.energyPct)} height={3} className="mt-1" />
                    </td>
                    <td className={cx('num text-right', TONE_TEXT[sohTone(u.sohPct)])}>{u.sohPct}%</td>
                    <td>
                      <div className="flex items-baseline justify-between gap-2 num">
                        <span className="text-text">{u.airframeHrs.toFixed(0)} h</span>
                        <span className={cx('text-[10.5px]', svc.tone === 'ok' ? 'text-dim' : TONE_TEXT[svc.tone])}>{svc.remaining <= 0 ? 'DUE' : `${svc.remaining.toFixed(0)} h left`}</span>
                      </div>
                      <Meter value={svc.used} max={svc.interval} tone={svc.tone} height={3} className="mt-1" />
                    </td>
                    <td>
                      <div className={cx('num text-[11px] whitespace-nowrap', fwOld ? 'text-warn' : 'text-muted')} title={fwOld ? `Update available: ${u.firmwareLatest}` : 'Latest release'}>
                        {fwOld && <Icon name="circle-alert" size={10} className="inline -mt-0.5 mr-1" />}
                        {u.firmware}
                      </div>
                    </td>
                    <td className="num text-[11px] whitespace-nowrap">{u.status === 'in-flight' ? <span className="text-live">airborne</span> : <span className="text-muted">{fmtRel(u.lastFlightTs, now)}</span>}</td>
                    <td className="text-center">
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
