// Battery & Component Lifecycle Ledger — smart-battery serials, automated retirement alerts, airframe hours.
import { useMemo, useState } from 'react';
import { actions, useOps } from '../../store';
import { AIRFRAME, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { Badge, Empty, Icon, Meter, Panel, Select, Sparkline, cx, type Tone } from '../../ui/kit';
import { StatusText } from '../fleet/shared';
import { DAY, fmtRel } from '../../lib/time';
import type { Battery } from '../../types';
import { InfoTip, KpiCell, KpiStrip, SortTh } from './parts';

const TONE_TEXT_: Record<Tone, string> = { ok: 'text-ok', live: 'text-live', warn: 'text-warn', alert: 'text-alert', idle: 'text-idle' };

const STATUS: Record<Battery['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  watch: { label: 'Watch', tone: 'warn' },
  retire: { label: 'Retire', tone: 'alert' },
};

function retireReasons(b: Battery): string[] {
  const r: string[] = [];
  if (b.sohPct < 75) r.push(`SoH ${b.sohPct}% < 75%`);
  const ratio = b.irMilliOhm / b.irBaselineMilliOhm;
  if (ratio > 1.7) r.push(`IR ${ratio.toFixed(2)}× baseline > 1.7×`);
  if (b.cycles > b.cycleLimit * 0.95) r.push(`${b.cycles} cycles > 95% of ${b.cycleLimit}`);
  return r;
}
function watchReasons(b: Battery): string[] {
  const r: string[] = [];
  if (b.sohPct < 82) r.push(`SoH ${b.sohPct}%`);
  const ratio = b.irMilliOhm / b.irBaselineMilliOhm;
  if (ratio > 1.4) r.push(`IR ${ratio.toFixed(2)}×`);
  if (b.cycles > b.cycleLimit * 0.9) r.push('near cycle limit');
  return r;
}

type BSort = 'serial' | 'model' | 'unit' | 'cycles' | 'soh' | 'ir' | 'balanced' | 'status';
const STATUS_RANK = { retire: 0, watch: 1, active: 2 };

export function BatteryTab() {
  const batteries = useOps((s) => s.batteries);
  const units = useOps((s) => s.units);
  const bases = useOps((s) => s.bases);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const [status, setStatus] = useState<'all' | Battery['status']>('all');
  const [model, setModel] = useState('all');
  const [base, setBase] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: BSort; dir: 1 | -1 }>({ k: 'status', dir: 1 });
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const baseById = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);
  const models = useMemo(() => [...new Set(batteries.map((b) => b.model))].sort(), [batteries]);
  const usedBases = useMemo(() => bases.filter((b) => batteries.some((x) => x.baseId === b.id)), [bases, batteries]);

  const counts = { active: 0, watch: 0, retire: 0 } as Record<Battery['status'], number>;
  for (const b of batteries) counts[b.status]++;
  const meanSoh = batteries.reduce((s, b) => s + b.sohPct, 0) / Math.max(1, batteries.length);
  const nearLimit = batteries.filter((b) => b.cycles >= b.cycleLimit * 0.9).length;
  const irAnom = batteries.filter((b) => b.irMilliOhm / b.irBaselineMilliOhm >= 1.4).length;
  const retire = batteries
    .filter((b) => b.status === 'retire')
    .sort((a, b) => retireReasons(b).length - retireReasons(a).length || a.sohPct - b.sohPct);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const val = (b: Battery): number | string => {
      switch (sort.k) {
        case 'serial':
          return b.serial;
        case 'model':
          return b.model;
        case 'unit':
          return unitById.get(b.unitId ?? '')?.callsign ?? '';
        case 'cycles':
          return b.cycles / b.cycleLimit;
        case 'soh':
          return b.sohPct;
        case 'ir':
          return b.irMilliOhm / b.irBaselineMilliOhm;
        case 'balanced':
          return b.lastBalanced;
        default:
          return STATUS_RANK[b.status] * 1000 + b.sohPct;
      }
    };
    return batteries
      .filter((b) => (status === 'all' || b.status === status) && (model === 'all' || b.model === model) && (base === 'all' || b.baseId === base))
      .filter((b) => !ql || b.serial.toLowerCase().includes(ql) || (unitById.get(b.unitId ?? '')?.callsign ?? '').toLowerCase().includes(ql))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
      });
  }, [batteries, status, model, base, q, sort, unitById]);

  const airframes = useMemo(
    () =>
      units
        .map((u) => {
          const af = AIRFRAME[u.modelId];
          const remaining = u.nextServiceHrs - u.airframeHrs;
          return { u, af, remaining, pct: 1 - remaining / af.serviceIntervalHrs };
        })
        .sort((a, b) => a.remaining - b.remaining),
    [units],
  );

  return (
    <div className="flex flex-col gap-3">
      <KpiStrip label="Filter packs by status">
        <KpiCell label="packs" value={batteries.length} onClick={() => setStatus('all')} active={status === 'all'} title={`${models.length} pack models`} />
        <KpiCell label="retire" value={counts.retire} tone={counts.retire ? 'alert' : undefined} onClick={() => setStatus(status === 'retire' ? 'all' : 'retire')} active={status === 'retire'} title="Automated retirement: SoH < 75% · IR > 1.7× baseline · cycles > 95% of rated limit" />
        <KpiCell label="watch" value={counts.watch} tone={counts.watch ? 'warn' : undefined} onClick={() => setStatus(status === 'watch' ? 'all' : 'watch')} active={status === 'watch'} title={`${irAnom} IR anomalies ≥ 1.4×`} />
        <KpiCell label="active" value={counts.active} dot="ok" onClick={() => setStatus(status === 'active' ? 'all' : 'active')} active={status === 'active'} title="In service" />
        <KpiCell label="mean SoH" value={meanSoh.toFixed(1)} unit="%" tone={meanSoh >= 85 ? undefined : 'warn'} title="Fleet mean state of health" hide="lg" />
        <KpiCell label="near cycle limit" value={nearLimit} tone={nearLimit ? 'warn' : undefined} title="≥ 90% of rated cycles" hide="xl" />
      </KpiStrip>

      {retire.length > 0 && (
        <section className="border border-alert/35 bg-alert-bg/50">
          <button className="w-full flex items-center gap-2 px-3 h-9 text-left hover:bg-alert/[0.06]" onClick={() => setShowAllAlerts((v) => !v)} aria-expanded={showAllAlerts}>
            <Icon name={showAllAlerts ? 'chevron-down' : 'chevron-right'} size={12} className="text-alert" />
            <span className="text-[12px] font-semibold text-alert">
              <span className="num">{retire.length}</span> packs should be retired
            </span>
            <span className="text-[11px] text-muted truncate hidden md:inline">
              worst: <span className="num text-text">{retire[0].serial}</span> · {retireReasons(retire[0]).join(' · ')}
            </span>
            <span className="ml-auto shrink-0">
              <InfoTip text="Rules: SoH < 75% · IR > 1.7× baseline · cycles > 95% of rated limit" />
            </span>
          </button>
          {showAllAlerts && (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-px border-t border-alert/25" style={{ background: 'rgba(255,77,85,0.18)' }}>
              {retire.map((b) => {
                const u = unitById.get(b.unitId ?? '');
                return (
                  <div key={b.serial} className="bg-[#2a2223] px-3 py-1.5 flex items-center gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="num text-[11.5px] text-white">{b.serial}</span>
                        <span className="text-[10.5px] text-dim truncate">{b.model}</span>
                      </div>
                      <div className="text-[10.5px] text-alert/90 truncate">{retireReasons(b).join(' · ')}</div>
                    </div>
                    {u && (
                      <button
                        className="text-[10.5px] text-muted hover:text-white shrink-0 num"
                        onClick={() => {
                          actions.selectUnit(u.id);
                          location.hash = '#/fleet';
                        }}
                        title="Open unit in Fleet & Assets"
                      >
                        {u.callsign} →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Panel
        index="01"
        title="Battery ledger"
        className="@container"
        actions={<span className="num text-[10.5px] text-dim">{rows.length === batteries.length ? batteries.length : `${rows.length} / ${batteries.length}`}</span>}
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
          <label className="relative flex items-center">
            <Icon name="search" size={12} className="absolute left-2 text-dim pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial or callsign" className="field pl-7 w-[170px]" aria-label="Search packs" />
          </label>
          <Select<string> className="[&_select]:max-w-[180px]" value={model} onChange={setModel} options={[{ value: 'all', label: 'All models' }, ...models.map((m) => ({ value: m, label: m }))]} />
          <Select<string> className="[&_select]:max-w-[180px]" value={base} onChange={setBase} options={[{ value: 'all', label: 'All bases' }, ...usedBases.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {rows.length ? (
          <div className="overflow-auto max-h-[520px]">
            <table className="tbl text-[11.5px] [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <SortTh k="serial" sort={sort} setSort={setSort}>Serial</SortTh>
                  <SortTh k="model" sort={sort} setSort={setSort} className="@max-[900px]:hidden">Model</SortTh>
                  <SortTh k="unit" sort={sort} setSort={setSort}>Unit</SortTh>
                  <th className="@max-[1100px]:hidden">Base</th>
                  <SortTh k="cycles" sort={sort} setSort={setSort} right>Cycles</SortTh>
                  <SortTh k="soh" sort={sort} setSort={setSort} right>SoH</SortTh>
                  <SortTh k="ir" sort={sort} setSort={setSort} right>IR ratio</SortTh>
                  <th className="@max-[760px]:hidden">IR trend</th>
                  <SortTh k="balanced" sort={sort} setSort={setSort} right className="@max-[1000px]:hidden">Balanced</SortTh>
                  <SortTh k="status" sort={sort} setSort={setSort}>Status</SortTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const u = unitById.get(b.unitId ?? '');
                  const ratio = b.irMilliOhm / b.irBaselineMilliOhm;
                  const cyc = b.cycles / b.cycleLimit;
                  const irTone: Tone = ratio > 1.7 ? 'alert' : ratio >= 1.4 ? 'warn' : 'ok';
                  const sohTone: Tone = b.sohPct < 75 ? 'alert' : b.sohPct < 82 ? 'warn' : 'ok';
                  const cycTone: Tone = cyc > 0.95 ? 'alert' : cyc >= 0.9 ? 'warn' : 'ok';
                  const why = b.status === 'retire' ? retireReasons(b) : b.status === 'watch' ? watchReasons(b) : [];
                  const stale = now - b.lastBalanced > 14 * DAY;
                  const baseName = baseById.get(b.baseId)?.name ?? b.baseId;
                  return (
                    <tr key={b.serial}>
                      <td className="num text-white" style={b.status === 'retire' ? { boxShadow: 'inset 2px 0 0 #ff4d55' } : undefined} title={b.model}>
                        {b.serial}
                      </td>
                      <td className="text-muted max-w-[180px] truncate @max-[900px]:hidden" title={b.model}>
                        {b.model}
                      </td>
                      <td>
                        {u ? (
                          <span className="inline-flex items-center gap-1.5" title={UNIT_STATUS[u.status].label}>
                            <i className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR[UNIT_STATUS[u.status].tone] }} />
                            <span className="num text-text">{u.callsign}</span>
                          </span>
                        ) : (
                          <span className="text-dim">Spare</span>
                        )}
                      </td>
                      <td className="text-muted max-w-[170px] truncate @max-[1100px]:hidden" title={baseName}>
                        {baseName}
                      </td>
                      <td className="num text-right" title={`${b.cycles} of ${b.cycleLimit} rated cycles`}>
                        <span className={cycTone === 'ok' ? 'text-text' : TONE_TEXT_[cycTone]}>{b.cycles}</span>
                        <span className="text-dim">/{b.cycleLimit}</span>
                      </td>
                      <td className={cx('num text-right', sohTone === 'ok' ? 'text-text' : TONE_TEXT_[sohTone])}>{b.sohPct}%</td>
                      <td className={cx('num text-right', irTone === 'ok' ? 'text-muted' : TONE_TEXT_[irTone])} title={`${b.irMilliOhm.toFixed(1)} mΩ vs ${b.irBaselineMilliOhm} mΩ baseline`}>
                        {ratio.toFixed(2)}×
                      </td>
                      <td className="@max-[760px]:hidden">
                        <Sparkline values={b.irHistory} color={irTone === 'ok' ? '#7a7a7a' : TONE_COLOR[irTone]} width={64} height={16} />
                      </td>
                      <td className={cx('num text-right @max-[1000px]:hidden', stale ? 'text-warn' : 'text-dim')}>{now - b.lastBalanced >= DAY ? `${Math.floor((now - b.lastBalanced) / DAY)} d ago` : fmtRel(b.lastBalanced, now)}</td>
                      <td title={why.join(' · ') || undefined}>
                        <StatusText tone={STATUS[b.status].tone} label={STATUS[b.status].label} />
                        {why.length > 0 && <span className="text-[10.5px] text-dim ml-2 @max-[1200px]:hidden">{why[0]}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="funnel" text="No packs match these filters" />
        )}
      </Panel>

      <Panel index="02" title="Airframe & motor hours" subtitle="soonest service first">
        <div className="overflow-auto max-h-[420px]">
          <table className="tbl text-[11.5px] min-w-[860px]">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Airframe</th>
                <th>Status</th>
                <th className="text-right">Airframe h</th>
                <th className="text-right">Motor h</th>
                <th className="text-right">Interval</th>
                <th className="w-[220px]">Service window</th>
                <th className="text-right">Next service</th>
              </tr>
            </thead>
            <tbody>
              {airframes.map(({ u, af, remaining, pct }) => {
                const tone: Tone = remaining <= 0 ? 'alert' : remaining < af.serviceIntervalHrs * 0.1 ? 'warn' : 'ok';
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="num text-white">{u.callsign}</div>
                      <div className="num text-[10px] text-dim">{u.tail}</div>
                    </td>
                    <td className="text-muted whitespace-nowrap">{af.name}</td>
                    <td>
                      <Badge tone={UNIT_STATUS[u.status].tone}>{UNIT_STATUS[u.status].label}</Badge>
                    </td>
                    <td className="num text-right">{u.airframeHrs.toFixed(1)}</td>
                    <td className="num text-right text-muted">{u.motorHrs.toFixed(1)}</td>
                    <td className="num text-right text-muted">{af.serviceIntervalHrs} h</td>
                    <td>
                      <Meter value={Math.max(0, Math.min(1, pct)) * 100} color={TONE_COLOR[tone]} height={5} />
                    </td>
                    <td className="num text-right whitespace-nowrap" style={{ color: TONE_COLOR[tone] }}>
                      {remaining <= 0 ? `OVERDUE ${Math.abs(remaining).toFixed(1)} h` : `in ${remaining.toFixed(1)} h`}
                      <span className="text-dim"> @ {u.nextServiceHrs}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
