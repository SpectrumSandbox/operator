// 02 · Fleet & Assets — asset registry, health monitor, payload calibration, crew roster.
import { useEffect, useMemo, useState } from 'react';
import type { UnitStatus } from '../types';
import { UNIT_STATUS, UNIT_STATUSES } from '../data/catalog';
import { actions, useOps } from '../store';
import { SectionTitle, Tabs, cx } from '../ui/kit';
import { UnitsTable, filterUnits, type UnitFilters } from './fleet/UnitsTable';
import { UnitDetail } from './fleet/UnitDetail';
import { PayloadsTab } from './fleet/PayloadsTab';
import { CrewTab } from './fleet/CrewTab';
import { UNIT_STATUS_SHORT, calStatus, useTelemetryRing } from './fleet/shared';
import { KpiCell, KpiStrip } from './analytics/parts';

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

  // Arriving with a unit selected (alert ticker / map) → show it in the registry.
  useEffect(() => {
    if (selectedId) setTab('units');
  }, [selectedId]);
  // Esc closes the detail drawer.
  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) actions.selectUnit(undefined);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
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
  const faultUnits = units.filter((u) => u.faults.some((f) => f.active)).length;

  const setStatus = (s: UnitStatus | 'all') => setFilters({ ...filters, status: filters.status === s ? 'all' : s });

  return (
    <div className="h-full overflow-auto p-4 md:p-5 flex flex-col">
      <SectionTitle index="02" title="Fleet, Payload & Crew" subtitle="Asset registry, health, payload calibration and crew duty limits" />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="shrink-0 mb-3"
        tabs={[
          { id: 'units', label: 'Units', icon: 'drone' },
          { id: 'payloads', label: 'Payloads & Calibration', icon: 'aperture', count: calAttention || undefined },
          { id: 'crew', label: 'Crew', icon: 'users' },
        ]}
      />

      {tab === 'units' && (
        <>
          <KpiStrip className="mb-3" label="Filter by unit status">
            <KpiCell label="units" value={units.length} active={filters.status === 'all'} onClick={() => setStatus('all')} title="Show all units" />
            {UNIT_STATUSES.map((s) => {
              const tone = UNIT_STATUS[s].tone;
              const n = counts[s];
              return (
                <KpiCell
                  key={s}
                  label={UNIT_STATUS_SHORT[s].toLowerCase()}
                  value={n}
                  tone={n > 0 && (s === 'grounded' || s === 'maintenance') ? tone : undefined}
                  dot={tone}
                  pulse={s === 'in-flight' && n > 0}
                  active={filters.status === s}
                  onClick={() => setStatus(s)}
                  title={`Filter registry: ${UNIT_STATUS[s].label}`}
                  hide={s === 'charging' || s === 'in-transit' ? 'lg' : undefined}
                />
              );
            })}
            <KpiCell label="active faults" value={activeFaults} tone={activeFaults ? 'warn' : undefined} title={`${activeFaults} active fault codes across ${faultUnits} units`} hide="lg" />
          </KpiStrip>

          <div className={cx('flex-1 min-h-[480px] grid gap-3', selected ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1')}>
            <div className="min-h-0 min-w-0">
              <UnitsTable units={visible} allCount={units.length} bases={bases} missions={missions} now={now} selectedId={selectedId} filters={filters} setFilters={setFilters} />
            </div>
            {selected && (
              <>
                {/* Narrow widths: detail overlays as a drawer instead of squeezing the registry. */}
                <div className="xl:hidden fixed inset-0 top-12 z-[1400] bg-black/45" onClick={() => actions.selectUnit(undefined)} aria-hidden />
                <div className="min-h-0 min-w-0 max-xl:fixed max-xl:right-0 max-xl:top-12 max-xl:bottom-0 max-xl:z-[1500] max-xl:w-[min(420px,100vw)] max-xl:shadow-2xl xl:h-full">
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
              </>
            )}
          </div>
        </>
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
  );
}
