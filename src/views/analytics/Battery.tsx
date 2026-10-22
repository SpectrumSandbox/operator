// Battery & Component Lifecycle Ledger — smart-battery serials, automated retirement alerts, airframe hours.
import { useMemo, useState } from 'react';
import { actions, useOps } from '../../store';
import { AIRFRAME, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { Badge, Empty, Icon, Meter, Panel, Select, Sparkline, cx, type Tone } from '../../ui/kit';
import { DAY, fmtRel } from '../../lib/time';
import type { Battery } from '../../types';
import { SortTh, StatTile, TileCell, TileGrid } from './parts';

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
  const ALERT_N = 6;

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
      <TileGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <TileCell>
          <StatTile label="Tracked packs" icon="battery-full" value={batteries.length} sub={`${models.length} pack models`} />
        </TileCell>
        <TileCell>
          <StatTile label="Active" icon="circle-check" value={counts.active} tone="ok" sub="in service" />
        </TileCell>
        <TileCell>
          <StatTile label="Watch" icon="eye" value={counts.watch} tone="warn" sub={`${irAnom} IR anomalies ≥ 1.4×`} />
        </TileCell>
        <TileCell>
          <StatTile label="Retire" icon="battery-warning" value={counts.retire} tone="alert" sub="remove from service" />
        </TileCell>
        <TileCell>
          <StatTile label="Fleet mean SoH" icon="activity" value={meanSoh.toFixed(1)} unit="%" tone={meanSoh >= 85 ? 'ok' : 'warn'} sub="state of health" />
        </TileCell>
        <TileCell>
          <StatTile label="Within 10% of cycle limit" icon="refresh-cw" value={nearLimit} tone={nearLimit ? 'warn' : undefined} sub="≥ 90% rated cycles" />
        </TileCell>
      </TileGrid>

      {retire.length > 0 && (
        <section className="border border-alert/40 bg-alert-bg">
          <header className="flex items-center gap-2 px-3 h-9 border-b border-alert/30">
            <Icon name="octagon-alert" size={14} className="text-alert" />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-alert">Automated retirement alerts</h3>
            <span className="num text-[11px] text-alert/80">{retire.length}</span>
            <span className="ml-auto text-[10.5px] text-muted hidden md:inline">Rules: SoH &lt; 75% · IR &gt; 1.7× baseline · cycles &gt; 95% of rated limit</span>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-px" style={{ background: 'rgba(255,77,85,0.25)' }}>
            {(showAllAlerts ? retire : retire.slice(0, ALERT_N)).map((b) => {
              const u = unitById.get(b.unitId ?? '');
              return (
                <div key={b.serial} className="bg-[#2a2223] px-3 py-2 flex items-center gap-3">
                  <Icon name="battery-warning" size={18} className="text-alert shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="num text-[12px] text-white">{b.serial}</span>
                      <span className="text-[10.5px] text-dim truncate">{b.model}</span>
                    </div>
                    <div className="text-[11px] text-alert/90 truncate">{retireReasons(b).join(' · ')}</div>
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
          {retire.length > ALERT_N && (
            <button className="w-full h-8 border-t border-alert/30 text-[11px] text-alert/90 hover:bg-alert/10 inline-flex items-center justify-center gap-1.5" onClick={() => setShowAllAlerts((v) => !v)}>
              <Icon name={showAllAlerts ? 'chevron-up' : 'chevron-down'} size={12} />
              {showAllAlerts ? 'Show fewer' : `Show all ${retire.length} retirement alerts`}
            </button>
          )}
        </section>
      )}

      <Panel
        index="01"
        title="Smart battery ledger"
        icon="battery-charging"
        subtitle={`${rows.length} of ${batteries.length} packs`}
        actions={
          <div className="flex items-center gap-2">
            <label className="relative hidden md:block">
              <Icon name="search" size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial or callsign" className="field h-7 pl-6 w-[170px] num text-[11px]" />
            </label>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b border-line">
          <div className="flex items-center gap-1">
            {(['all', 'active', 'watch', 'retire'] as const).map((s) => (
              <button key={s} className={cx('pill', status === s && 'pill-on')} onClick={() => setStatus(s)}>
                {s === 'all' ? 'All' : STATUS[s].label}
                <span className="num ml-1.5 opacity-70">{s === 'all' ? batteries.length : counts[s]}</span>
              </button>
            ))}
          </div>
          <Select<string> label="Model" value={model} onChange={setModel} options={[{ value: 'all', label: 'All models' }, ...models.map((m) => ({ value: m, label: m }))]} />
          <Select<string> label="Base" value={base} onChange={setBase} options={[{ value: 'all', label: 'All bases' }, ...usedBases.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {rows.length ? (
          <div className="overflow-auto max-h-[560px]">
            <table className="tbl text-[11.5px] min-w-[1060px]">
              <thead>
                <tr>
                  <SortTh k="serial" sort={sort} setSort={setSort}>Serial</SortTh>
                  <SortTh k="model" sort={sort} setSort={setSort}>Model</SortTh>
                  <SortTh k="unit" sort={sort} setSort={setSort}>Mounted unit</SortTh>
                  <th>Base</th>
                  <SortTh k="cycles" sort={sort} setSort={setSort} className="w-[170px]">Cycles / limit</SortTh>
                  <SortTh k="soh" sort={sort} setSort={setSort} right>SoH</SortTh>
                  <SortTh k="ir" sort={sort} setSort={setSort} right>IR mΩ · ratio</SortTh>
                  <th>IR trend</th>
                  <SortTh k="balanced" sort={sort} setSort={setSort} right>Last balanced</SortTh>
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
                  const why = b.status === 'retire' ? retireReasons(b) : b.status === 'watch' ? watchReasons(b) : [];
                  const stale = now - b.lastBalanced > 14 * DAY;
                  return (
                    <tr key={b.serial} className={b.status === 'retire' ? 'bg-alert-bg/40' : undefined}>
                      <td className="num text-white whitespace-nowrap">{b.serial}</td>
                      <td className="text-muted whitespace-nowrap">{b.model}</td>
                      <td className="whitespace-nowrap">
                        {u ? (
                          <span className="inline-flex items-center gap-1.5">
                            <i className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR[UNIT_STATUS[u.status].tone] }} title={UNIT_STATUS[u.status].label} />
                            <span className="num text-text">{u.callsign}</span>
                          </span>
                        ) : (
                          <span className="text-dim">Spare</span>
                        )}
                      </td>
                      <td className="text-muted whitespace-nowrap">{baseById.get(b.baseId)?.name.replace(/ (Ops |Industrial |Maritime |Coastal |Forward |Forestry |Highlands |Marina Launch |–IKN Corridor )?(Hub|Base|Pad|Site)$/, '') ?? b.baseId}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Meter value={b.cycles} max={b.cycleLimit} color={cyc > 0.95 ? TONE_COLOR.alert : cyc >= 0.9 ? TONE_COLOR.warn : '#8b93a3'} height={5} />
                          <span className="num text-[10.5px] text-muted whitespace-nowrap w-[74px] text-right">
                            <span className="text-text">{b.cycles}</span> / {b.cycleLimit}
                          </span>
                        </div>
                      </td>
                      <td className="num text-right" style={{ color: TONE_COLOR[sohTone] }}>
                        {b.sohPct}%
                      </td>
                      <td className="num text-right whitespace-nowrap">
                        <span className="text-text">{b.irMilliOhm.toFixed(1)}</span>
                        <span className="text-dim"> / {b.irBaselineMilliOhm}</span>
                        <span className={cx('ml-2 px-1 text-[10px]', ratio >= 1.4 && 'border', ratio > 1.7 ? 'text-alert border-alert/50 bg-alert-bg' : ratio >= 1.4 ? 'text-warn border-warn/50 bg-warn-bg' : 'text-dim')}>{ratio.toFixed(2)}×</span>
                      </td>
                      <td>
                        <Sparkline values={b.irHistory} color={TONE_COLOR[irTone]} width={78} height={20} />
                      </td>
                      <td className={cx('num text-right whitespace-nowrap', stale ? 'text-warn' : 'text-muted')}>{now - b.lastBalanced >= DAY ? `${Math.floor((now - b.lastBalanced) / DAY)} d ago` : fmtRel(b.lastBalanced, now)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge tone={STATUS[b.status].tone} dot>
                            {STATUS[b.status].label}
                          </Badge>
                          {why.length > 0 && <span className="text-[10px] text-dim truncate max-w-[150px]" title={why.join(' · ')}>{why[0]}</span>}
                        </div>
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

      <Panel index="02" title="Airframe & motor hours" icon="wrench" subtitle="time since new vs scheduled service interval · soonest due first">
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
