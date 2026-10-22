// 02 · Fleet & Assets — asset registry, health monitor, payload calibration, crew roster.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UnitStatus } from '../types';
import { UNIT_STATUS, UNIT_STATUSES } from '../data/catalog';
import { actions, useOps } from '../store';
import { Icon, SectionTitle, StatusDot, Tabs, TONE_TEXT, cx } from '../ui/kit';
import { UnitsTable, filterUnits, type UnitFilters } from './fleet/UnitsTable';
import { UnitDetail } from './fleet/UnitDetail';
import { PayloadsTab } from './fleet/PayloadsTab';
import { CrewTab } from './fleet/CrewTab';
import { calStatus, useTelemetryRing } from './fleet/shared';

type Tab = 'units' | 'payloads' | 'crew';

export function FleetView() {
  const now = useOps((s) => s.now);
  const units = useOps((s) => s.units);
  const bases = useOps((s) => s.bases);
  const missions = useOps((s) => s.missions);
  const payloads = useOps((s) => s.payloads);
  const crews = useOps((s) => s.crews);
  const batteries = useOps((s) => s.batteries);
  const calBookings = useOps((s) => s.calBookings);
  const selectedId = useOps((s) => s.selectedUnitId);

  const [tab, setTab] = useState<Tab>('units');
  const [filters, setFilters] = useState<UnitFilters>({ status: 'all', cls: 'all', loc: 'all', q: '' });
  const ring = useTelemetryRing(units, now);
  const detailRef = useRef<HTMLDivElement>(null);

  // Arriving with a unit selected (alert ticker / map) → show it in the registry.
  useEffect(() => {
    if (selectedId) setTab('units');
  }, [selectedId]);
  useEffect(() => {
    if (selectedId && window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Record<UnitStatus, number>;
    for (const u of units) c[u.status]++;
    return c;
  }, [units]);
  const visible = useMemo(() => filterUnits(units, bases, filters), [units, bases, filters]);
  const selected = selectedId ? units.find((u) => u.id === selectedId) : undefined;
  const calBooked = useMemo(() => new Set(calBookings.map((b) => b.payloadId)), [calBookings]);
  const calAttention = useMemo(() => payloads.filter((p) => calStatus(p, now) !== 'calibrated').length, [payloads, Math.floor(now / 600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeFaults = units.reduce((n, u) => n + u.faults.filter((f) => f.active).length, 0);

  const setStatus = (s: UnitStatus | 'all') => {
    setTab('units');
    setFilters({ ...filters, status: filters.status === s ? 'all' : s });
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-5 flex flex-col">
      <SectionTitle
        index="02"
        title="Fleet, Payload & Crew Status"
        subtitle="Asset registry and health monitor for every unmanned unit — propulsion, airframe hours, firmware, fault codes, payload calibration and crew duty limits."
        right={
          <div className="flex items-center gap-4 text-[11px] text-dim">
            <span className="flex items-center gap-1.5">
              <Icon name="triangle-alert" size={12} className={activeFaults ? 'text-warn' : 'text-dim'} />
              <span className="num text-text">{activeFaults}</span> active faults
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="aperture" size={12} className={calAttention ? 'text-warn' : 'text-dim'} />
              <span className="num text-text">{calAttention}</span> calibrations due / expired
            </span>
          </div>
        }
      />

      <div className="panel grid grid-cols-4 md:grid-cols-8 shrink-0 mb-3" role="toolbar" aria-label="Filter by unit status">
        <StatusChip label="All units" count={units.length} active={filters.status === 'all'} onClick={() => setStatus('all')} />
        {UNIT_STATUSES.map((s) => (
          <StatusChip key={s} status={s} label={UNIT_STATUS[s].label} count={counts[s]} active={filters.status === s} onClick={() => setStatus(s)} />
        ))}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="shrink-0 mb-3"
        tabs={[
          { id: 'units', label: 'Units', count: units.length, icon: 'drone' },
          { id: 'payloads', label: 'Payloads & Calibration', count: payloads.length, icon: 'aperture' },
          { id: 'crew', label: 'Crew', count: crews.length, icon: 'users' },
        ]}
      />

      <div className="flex-1 min-h-[520px]">
        {tab === 'units' && (
          <div className={cx('h-full grid gap-3', selected ? 'lg:grid-cols-[1fr_420px]' : 'grid-cols-1')}>
            <div className="min-h-0 min-w-0">
              <UnitsTable units={visible} allCount={units.length} bases={bases} missions={missions} now={now} selectedId={selectedId} filters={filters} setFilters={setFilters} />
            </div>
            {selected && (
              <div ref={detailRef} className="min-h-0 min-w-0 lg:h-full max-lg:max-h-[860px]">
                <UnitDetail
                  key={selected.id}
                  unit={selected}
                  now={now}
                  bases={bases}
                  crews={crews}
                  missions={missions}
                  payloads={payloads}
                  batteries={batteries}
                  calBooked={calBooked}
                  samples={ring.get(selected.id) ?? []}
                  onClose={() => actions.selectUnit(undefined)}
                />
              </div>
            )}
          </div>
        )}
        {tab === 'payloads' && (
          <PayloadsTab
            payloads={payloads}
            units={units}
            bases={bases}
            missions={missions}
            calBookings={calBookings}
            now={now}
            onOpenUnit={(id) => {
              actions.selectUnit(id);
              setTab('units');
            }}
          />
        )}
        {tab === 'crew' && <CrewTab crews={crews} bases={bases} missions={missions} />}
      </div>
    </div>
  );
}

function StatusChip({ status, label, count, active, onClick }: { status?: UnitStatus; label: string; count: number; active: boolean; onClick: () => void }) {
  const tone = status ? UNIT_STATUS[status].tone : undefined;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'relative text-left px-3 py-2 min-w-0 border-r border-b md:border-b-0 border-line last:border-r-0 transition-colors hover:bg-white/[0.03]',
        active && 'bg-white/[0.06]',
        count === 0 && !active && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-1.5 label truncate">
        {tone ? <StatusDot tone={tone} size={6} pulse={status === 'in-flight' && count > 0} /> : <Icon name="layout-grid" size={10} />}
        <span className="truncate">{label}</span>
      </div>
      <div className={cx('num text-[20px] font-semibold leading-tight mt-0.5', tone && count > 0 ? TONE_TEXT[tone] : 'text-white')}>{count}</div>
      {active && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: 'var(--view-accent)' }} />}
    </button>
  );
}
