// Performance sub-tab — filters, KPI row, service levels, unit economics, utilisation, AI adoption, clients.
import { useMemo, useState } from 'react';
import { useOps } from '../../store';
import { MISSION_PROFILES, MISSION_TYPES, REGIONS, TONE_COLOR } from '../../data/catalog';
import { CLIENTS } from '../../data/seed';
import { BarChart, LineChart, Ring, type Series } from '../../ui/charts';
import { Badge, Icon, Meter, Panel, Segmented, Select, StatusDot, Toggle, cx, useTz } from '../../ui/kit';
import { fmtDateShort, fmtRel, DAY } from '../../lib/time';
import { downloadText, fmtIdr, fmtNum, toCsv } from '../../lib/format';
import type { MissionType, RegionId } from '../../types';
import {
  adoption,
  AIRFRAME_DAY_H,
  CREW_DAY_H,
  DEFAULT_FILTERS,
  filterLabel,
  meanSignoff,
  meanTat,
  pctDelta,
  PERIODS,
  SLA_TARGET,
  slaPct,
  slaMetEffective,
  DELIVERY_WINDOW_H,
  aggregate,
  type ClientRow,
  type Filters,
  type Period,
} from './metrics';
import { usePerf, type PerfData } from './usePerf';
import { Delta, DeltaPts, InfoTip, SortTh, StatTile, TileCell, TileGrid } from './parts';

const ACCENT = '#c560c8';

export function PerformanceTab({ f, setF, onPreview, onPrint }: { f: Filters; setF: (f: Filters) => void; onPreview: () => void; onPrint: () => void }) {
  const d = usePerf(f);
  const tz = useTz();
  const dirty = f.region !== 'all' || f.type !== 'all' || f.client !== 'all' || f.period !== DEFAULT_FILTERS.period;

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['date', 'region', 'mission_type', 'client', 'sorties', 'flight_hrs', 'workload', 'workload_unit', 'cost_idr', 'cost_per_workload_unit_idr', 'cost_per_flight_hr_idr', 'turnaround_hrs', 'deliverables', 'sla_met_flight', 'sla_met_effective', 'sla_total', 'delivery_window_hrs', 'ai_accepted', 'ai_overridden', 'signoff_hrs', 'crew_hrs'],
    ];
    for (const r of [...d.recs].sort((a, b) => a.day - b.day || a.regionId.localeCompare(b.regionId))) {
      rows.push([
        fmtDateIso(r.day),
        REGIONS.find((x) => x.id === r.regionId)!.name,
        MISSION_PROFILES[r.type].short,
        CLIENTS.find((c) => c.id === r.clientId)?.name ?? r.clientId,
        r.sorties,
        r.flightHrs,
        r.workload,
        MISSION_PROFILES[r.type].unit,
        r.costIdr,
        r.workload ? Math.round(r.costIdr / r.workload) : '',
        r.flightHrs ? Math.round(r.costIdr / r.flightHrs) : '',
        r.turnaroundHrs,
        r.deliverables,
        r.slaMet,
        slaMetEffective(r),
        r.slaTotal,
        DELIVERY_WINDOW_H[r.type],
        r.aiAccepted,
        r.aiOverridden,
        r.signoffHrs,
        r.crewHrs,
      ]);
    }
    rows.push([]);
    rows.push(['# summary', filterLabel(f)]);
    rows.push(['metric', 'current_period', 'previous_period']);
    rows.push(['sorties', d.cur.sorties, d.prev.sorties]);
    rows.push(['flight_hours', d.cur.flightHrs.toFixed(1), d.prev.flightHrs.toFixed(1)]);
    rows.push(['deliverables', d.cur.deliverables, d.prev.deliverables]);
    rows.push(['sla_adherence_pct', fx(slaPct(d.cur), 1), fx(slaPct(d.prev), 1)]);
    rows.push(['mean_turnaround_hrs', fx(meanTat(d.cur), 1), fx(meanTat(d.prev), 1)]);
    rows.push(['ai_adoption_pct', fx(adoption(d.cur.aiAccepted, d.cur.aiOverridden), 1), fx(adoption(d.prev.aiAccepted, d.prev.aiOverridden), 1)]);
    for (const e of d.econ) rows.push([`cost_${e.def.id === 'fh' ? 'per_flight_hr' : 'per_' + e.def.id}_idr`, fx(e.cur, 0), fx(e.prev, 0)]);
    for (const u of d.util) rows.push([`utilisation_${u.id}`, `fleet ${u.fleetPct.toFixed(1)}%`, `crew ${u.crewPct.toFixed(1)}%`]);
    downloadText(`spectrum-operator-analytics-${f.period}d.csv`, toCsv(rows), 'text/csv');
  };

  const adoptCur = adoption(d.cur.aiAccepted, d.cur.aiOverridden);
  const adoptPrev = adoption(d.prev.aiAccepted, d.prev.aiOverridden);

  return (
    <div className="flex flex-col gap-3">
      {/* Filters — one row at ≥1440, wraps cleanly below */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented<Period> value={f.period} onChange={(period) => setF({ ...f, period })} options={PERIODS.map((p) => ({ value: p, label: `${p} d`, title: `Last ${p} days` }))} />
        <span className="w-px h-4 bg-line hidden sm:block" />
        <Select<string> className="[&_select]:max-w-[160px]" value={f.region} onChange={(v) => setF({ ...f, region: v as RegionId | 'all' })} options={[{ value: 'all', label: 'All regions' }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]} />
        <Select<string> className="[&_select]:max-w-[170px]" value={f.type} onChange={(v) => setF({ ...f, type: v as MissionType | 'all' })} options={[{ value: 'all', label: 'All mission types' }, ...MISSION_TYPES.map((t) => ({ value: t, label: MISSION_PROFILES[t].label }))]} />
        <Select<string> className="[&_select]:max-w-[170px]" value={f.client} onChange={(v) => setF({ ...f, client: v })} options={[{ value: 'all', label: 'All clients' }, ...CLIENTS.map((c) => ({ value: c.id, label: c.name }))]} />
        {dirty && (
          <button className="btn h-7 px-2 border-transparent text-muted" onClick={() => setF(DEFAULT_FILTERS)}>
            <Icon name="rotate-ccw" size={12} /> Reset
          </button>
        )}
        <span className="num text-[10.5px] text-dim hidden 2xl:inline" title={`${fmtNum(d.recs.length)} flight records`}>
          {fmtDateShort(d.start, tz)} – {fmtDateShort(d.today - DAY, tz)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn h-7 px-2 border-transparent text-muted" onClick={exportCsv} disabled={!d.recs.length} title="Export filtered records as CSV">
            <Icon name="sheet" size={12} /> CSV
          </button>
          <button className="btn h-7 px-2 border-transparent text-muted" onClick={onPreview} title="Preview the spec report">
            <Icon name="eye" size={12} /> Preview
          </button>
          <button className="btn btn-solid h-7" onClick={onPrint} title="Print / save the A4 spec report as PDF">
            <Icon name="printer" size={12} /> PDF report
          </button>
        </div>
      </div>

      {!d.recs.length ? (
        <div className="panel py-16 text-center">
          <Icon name="chart-column" size={22} className="text-dim mx-auto mb-2" />
          <div className="text-muted text-[12px]">No flight records match these filters in the last {f.period} days.</div>
          <button className="btn mt-3" onClick={() => setF(DEFAULT_FILTERS)}>
            <Icon name="rotate-ccw" size={12} /> Reset filters
          </button>
        </div>
      ) : (
        <>
          <KpiRow d={d} adoptCur={adoptCur} adoptPrev={adoptPrev} />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <TurnaroundPanel d={d} f={f} className="xl:col-span-7" />
            <SlaPanel d={d} f={f} className="xl:col-span-5" />
          </div>
          <EconPanel d={d} f={f} />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <UtilPanel d={d} f={f} className="xl:col-span-5" />
            <AiPanel d={d} f={f} adoptCur={adoptCur} className="xl:col-span-7" />
          </div>
          <ClientPanel d={d} />
        </>
      )}
    </div>
  );
}

const fx = (v: number, digits: number) => (isFinite(v) ? v.toFixed(digits) : '');
function fmtDateIso(ts: number) {
  // records are WIB start-of-day
  const dt = new Date(ts + 7 * 3_600_000);
  return dt.toISOString().slice(0, 10);
}

function KpiRow({ d, adoptCur, adoptPrev }: { d: PerfData; adoptCur: number; adoptPrev: number }) {
  const aiToday = useOps((s) => s.aiToday);
  const todayPct = adoption(aiToday.accepted, aiToday.overridden);
  const sla = slaPct(d.cur);
  const tat = meanTat(d.cur);
  return (
    <TileGrid className="grid-cols-2 md:grid-cols-3 2xl:grid-cols-6" >
      <TileCell>
        <StatTile label="Sorties flown" value={fmtNum(d.cur.sorties)} delta={<Delta pct={pctDelta(d.cur.sorties, d.prev.sorties)} />} spark={d.spark.sorties} />
      </TileCell>
      <TileCell>
        <StatTile label="Flight hours" value={fmtNum(d.cur.flightHrs, 0)} unit="FH" delta={<Delta pct={pctDelta(d.cur.flightHrs, d.prev.flightHrs)} />} spark={d.spark.hrs} />
      </TileCell>
      <TileCell>
        <StatTile label="Deliverables" value={fmtNum(d.cur.deliverables)} delta={<Delta pct={pctDelta(d.cur.deliverables, d.prev.deliverables)} />} spark={d.spark.deliv} />
      </TileCell>
      <TileCell>
        <StatTile label="SLA adherence" value={isFinite(sla) ? sla.toFixed(1) : '—'} unit="%" tone={sla >= SLA_TARGET ? 'ok' : sla >= 90 ? 'warn' : 'alert'} delta={<DeltaPts pts={sla - slaPct(d.prev)} />} spark={d.spark.sla} sparkColor={TONE_COLOR.ok} />
      </TileCell>
      <TileCell>
        <StatTile label="Turnaround (flight → publish)" value={isFinite(tat) ? tat.toFixed(1) : '—'} unit="h mean" delta={<Delta pct={pctDelta(tat, meanTat(d.prev))} goodWhen="down" />} spark={d.spark.tat} sparkColor={TONE_COLOR.live} />
      </TileCell>
      <TileCell>
        <StatTile
          label="AI adoption"
          value={isFinite(adoptCur) ? adoptCur.toFixed(1) : '—'}
          unit="%"
          delta={<DeltaPts pts={adoptCur - adoptPrev} />}
          spark={d.spark.ai}
          sparkColor="#8384e2"
          sub={isFinite(todayPct) ? `· today ${todayPct.toFixed(0)}%` : undefined}
        />
      </TileCell>
    </TileGrid>
  );
}

function TurnaroundPanel({ d, f, className }: { d: PerfData; f: Filters; className?: string }) {
  const tz = useTz();
  const [byType, setByType] = useState(false);
  const series: Series[] = useMemo(() => {
    if (byType) return d.tatByType.filter((t) => t.values.length > 1).map((t) => ({ name: MISSION_PROFILES[t.type].short, color: MISSION_PROFILES[t.type].color, values: t.values }));
    const vals = d.buckets.map((b) => ({ x: b.t, y: meanTat(aggregate(b.recs)) })).filter((p) => isFinite(p.y));
    const out: Series[] = [{ name: d.bucketSize === 1 ? 'Daily mean' : 'Weekly mean', color: ACCENT, values: vals, area: true }];
    if (d.bucketSize === 1 && vals.length > 7) {
      out.push({
        name: '7-day rolling',
        color: '#f2f2f2',
        dashed: true,
        values: vals.map((p, i) => {
          const w = vals.slice(Math.max(0, i - 6), i + 1);
          return { x: p.x, y: w.reduce((s, q) => s + q.y, 0) / w.length };
        }),
      });
    }
    return out;
  }, [d, byType]);
  const mean = meanTat(d.cur);
  return (
    <Panel
      index="01"
      title="Turnaround"
      subtitle={`${d.bucketSize === 1 ? 'daily' : 'weekly'} mean`}
      className={className}
      actions={f.type === 'all' ? <Toggle checked={byType} onChange={setByType} label="By type" color={ACCENT} /> : null}
    >
      <div className="p-3">
        <div className="flex items-baseline gap-4 mb-2 flex-wrap">
          <div>
            <span className="num text-[18px] text-white font-semibold">{isFinite(mean) ? mean.toFixed(1) : '—'}</span>
            <span className="text-dim text-[11px] ml-1">h period mean</span>
          </div>
          <Delta pct={pctDelta(mean, meanTat(d.prev))} goodWhen="down" />
          <div className="flex flex-wrap gap-x-3 gap-y-1 ml-auto">
            {d.tatByType.map((t) => (
              <span key={t.type} className="inline-flex items-center gap-1 text-[10.5px] text-dim">
                <i className="w-1.5 h-1.5 inline-block" style={{ background: MISSION_PROFILES[t.type].color }} />
                {MISSION_PROFILES[t.type].short}
                <span className="num text-text">{isFinite(t.mean) ? t.mean.toFixed(1) : '—'}h</span>
              </span>
            ))}
          </div>
        </div>
        <LineChart series={series} height={210} yFormat={(v) => `${v.toFixed(0)}h`} xFormat={(t) => fmtDateShort(t, tz)} />
      </div>
    </Panel>
  );
}

function SlaPanel({ d, className }: { d: PerfData; f: Filters; className?: string }) {
  const tz = useTz();
  const vals = d.buckets.map((b) => ({ x: b.t, y: slaPct(aggregate(b.recs)) })).filter((p) => isFinite(p.y));
  const minY = Math.min(90, ...vals.map((v) => v.y - 2));
  const sla = slaPct(d.cur);
  const byType = MISSION_TYPES.map((t) => ({ t, v: slaPct(aggregate(d.recs.filter((r) => r.type === t))) })).filter((x) => isFinite(x.v));
  const breaches = d.cur.slaTotal - d.cur.slaMet;
  return (
    <Panel
      index="02"
      title="SLA adherence"
      subtitle={`target ${SLA_TARGET}%`}
      className={className}
      actions={<InfoTip text={`Met = flown on schedule and deliverable published within the contracted window (${Object.entries(DELIVERY_WINDOW_H).map(([t, h]) => `${MISSION_PROFILES[t as MissionType].short} ${h} h`).join(' · ')})`} />}
    >
      <div className="p-3">
        <div className="flex items-baseline gap-4 mb-2 flex-wrap">
          <div>
            <span className="num text-[18px] font-semibold" style={{ color: sla >= SLA_TARGET ? TONE_COLOR.ok : TONE_COLOR.warn }}>
              {isFinite(sla) ? sla.toFixed(1) : '—'}%
            </span>
            <span className="text-dim text-[11px] ml-1">
              {fmtNum(d.cur.slaMet)} / {fmtNum(d.cur.slaTotal)} commitments met
            </span>
          </div>
          <span className="num text-[10.5px] text-alert ml-auto">{breaches} breaches</span>
        </div>
        <LineChart
          series={[{ name: 'SLA adherence', color: TONE_COLOR.ok, values: vals, area: true }]}
          height={170}
          yDomain={[Math.floor(minY / 5) * 5, 101]}
          yFormat={(v) => `${v.toFixed(0)}%`}
          xFormat={(t) => fmtDateShort(t, tz)}
          target={{ y: SLA_TARGET, label: `Target ${SLA_TARGET}%` }}
        />
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2">
          {byType.map(({ t, v }) => (
            <div key={t} className="flex items-baseline justify-between gap-2 border-b border-line py-0.5">
              <div className="flex items-center gap-1 text-[10.5px] text-dim">
                <i className="w-1.5 h-1.5 inline-block" style={{ background: MISSION_PROFILES[t].color }} />
                {MISSION_PROFILES[t].short}
              </div>
              <div className="num text-[12.5px]" style={{ color: v >= SLA_TARGET ? TONE_COLOR.ok : v >= 90 ? TONE_COLOR.warn : TONE_COLOR.alert }}>
                {v.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function EconPanel({ d, f }: { d: PerfData; f: Filters }) {
  return (
    <Panel index="03" title="Unit economics" subtitle={`vs previous ${f.period} d`} actions={<InfoTip text="Fully-loaded direct cost: crew, energy, depreciation and transit. Sparklines show the weekly trend." />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-px" style={{ background: 'rgba(255,255,255,0.10)' }}>
        {d.econ.map((e) => (
          <div key={e.def.id} className={cx('bg-card', !e.applicable && 'opacity-45')}>
            <StatTile
              label={e.def.label}
              value={isFinite(e.cur) ? fmtIdr(e.cur) : '—'}
              unit={e.def.unit}
              delta={<Delta pct={pctDelta(e.cur, e.prev)} goodWhen="down" />}
              spark={e.spark}
              sparkColor={e.def.id === 'fh' ? '#8384e2' : e.def.id === 'ha' ? '#5ec060' : e.def.id === 'km' ? '#c08d5e' : '#5ebfc0'}
              sub={!e.applicable ? 'not in filter' : undefined}
              title={e.def.basis}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UtilPanel({ d, f, className }: { d: PerfData; f: Filters; className?: string }) {
  const fleetHrs = d.util.reduce((s, u) => s + u.flightHrs, 0);
  const fleetAvail = d.util.reduce((s, u) => s + u.airframes * f.period * AIRFRAME_DAY_H, 0);
  const crewHrs = d.util.reduce((s, u) => s + u.crewHrs, 0);
  const crewAvail = d.util.reduce((s, u) => s + u.crews * f.period * CREW_DAY_H, 0);
  const fleetPct = fleetAvail ? (fleetHrs / fleetAvail) * 100 : 0;
  const crewPct = crewAvail ? (crewHrs / crewAvail) * 100 : 0;
  const tone = (p: number) => (p > 90 ? TONE_COLOR.alert : p > 75 ? TONE_COLOR.warn : p < 15 ? TONE_COLOR.idle : TONE_COLOR.ok);
  return (
    <Panel
      index="04"
      title="Utilisation"
      subtitle="by region"
      className={className}
      actions={<InfoTip text={`Fleet = flight hours ÷ (airframes based in region × days × ${AIRFRAME_DAY_H} FH mission-capable window). Crew = logged duty hours ÷ (crew based in region × days × ${CREW_DAY_H} h shift). Amber > 75%, red > 90% — above 100% means overtime or crew borrowed from other bases.`} />}
    >
      <div className="p-3">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Ring value={fleetPct / 100} size={58} color={ACCENT} />
            <div className="min-w-0">
              <div className="text-[11px] text-muted">Fleet</div>
              <div className="num text-[11px] text-muted">
                {fmtNum(fleetHrs, 0)} / {fmtNum(fleetAvail, 0)} FH
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Ring value={crewPct / 100} size={58} color="#5ebfc0" />
            <div className="min-w-0">
              <div className="text-[11px] text-muted">Crew</div>
              <div className="num text-[11px] text-muted">
                {fmtNum(crewHrs, 0)} / {fmtNum(crewAvail, 0)} h
              </div>
            </div>
          </div>
        </div>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-dim">
              <th className="label text-left font-semibold pb-1">Region</th>
              <th className="label text-right font-semibold pb-1 w-[56px]">A/F · Crew</th>
              <th className="label text-left font-semibold pb-1 pl-3">Fleet</th>
              <th className="label text-left font-semibold pb-1 pl-3">Crew</th>
            </tr>
          </thead>
          <tbody>
            {d.util.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  <span className="num text-dim mr-1.5">{u.short}</span>
                  <span className="text-text">{u.label}</span>
                </td>
                <td className="num text-right text-muted whitespace-nowrap">
                  {u.airframes} · {u.crews}
                </td>
                <td className="pl-3 w-[30%]">
                  <div className="flex items-center gap-2">
                    <Meter value={u.fleetPct} color={tone(u.fleetPct)} height={5} />
                    <span className="num w-[38px] text-right text-text">{u.airframes ? `${u.fleetPct.toFixed(0)}%` : '—'}</span>
                  </div>
                </td>
                <td className="pl-3 w-[30%]">
                  <div className="flex items-center gap-2">
                    <Meter value={u.crewPct} color={tone(u.crewPct)} height={5} />
                    <span className={cx('num w-[38px] text-right', u.crewPct > 100 ? 'text-alert' : 'text-text')} title={u.crewPct > 100 ? 'Over roster — overtime / borrowed crew' : undefined}>
                      {u.crews ? `${u.crewPct.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AiPanel({ d, adoptCur, className }: { d: PerfData; f: Filters; adoptCur: number; className?: string }) {
  const tz = useTz();
  const now = useOps((s) => s.now);
  const aiToday = useOps((s) => s.aiToday);
  const todayPct = adoption(aiToday.accepted, aiToday.overridden);
  const data = d.aiBuckets.map((b) => {
    const a = aggregate(b.recs);
    return { label: fmtDateShort(b.t, tz), values: { accepted: a.aiAccepted, overridden: a.aiOverridden } };
  });
  const totalOv = d.overrides.reduce((s, o) => s + o.count, 0);
  const maxOv = Math.max(1, ...d.overrides.map((o) => o.count));
  return (
    <Panel index="05" title="AI recommendation adoption" subtitle={d.aiBucketSize === 1 ? 'daily' : 'weekly'} className={className}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px]">
        <div className="p-3 min-w-0">
          <BarChart data={data} keys={['accepted', 'overridden']} colors={{ accepted: '#8384e2', overridden: TONE_COLOR.warn }} legendLabels={{ accepted: 'AI accepted', overridden: 'Manual override' }} height={196} />
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-line p-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Ring value={(isFinite(adoptCur) ? adoptCur : 0) / 100} size={62} color="#8384e2" />
            <div>
              <div className="text-[11px] text-muted">Period</div>
              <div className="num text-[11px] text-muted">
                {fmtNum(d.cur.aiAccepted)} accepted · {fmtNum(d.cur.aiOverridden)} overridden
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line pt-3">
            <Ring value={(isFinite(todayPct) ? todayPct : 0) / 100} size={44} color={TONE_COLOR.live} />
            <div>
              <div className="text-[11px] text-muted flex items-center gap-1.5">
                Today <StatusDot tone="live" pulse size={6} />
              </div>
              <div className="num text-[11px] text-muted">
                {aiToday.accepted} accepted · {aiToday.overridden} overridden
              </div>
            </div>
          </div>
          <div className="border-t border-line pt-2">
            <div className="text-[11px] text-muted mb-1.5 flex items-center justify-between">
              <span>Override reasons</span>
              <span className="num normal-case tracking-normal">{totalOv} logged</span>
            </div>
            <div className="flex flex-col gap-1">
              {d.overrides.map((o) => (
                <div key={o.reason} className="grid grid-cols-[1fr_60px_18px] items-center gap-2 text-[11px]">
                  <span className={o.count ? 'text-text' : 'text-dim'}>{o.reason}</span>
                  <Meter value={o.count} max={maxOv} color={TONE_COLOR.warn} height={4} />
                  <span className="num text-right text-muted">{o.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {d.overrideLog.length > 0 && (
        <div className="border-t border-line">
          {d.overrideLog.slice(0, 3).map((o, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-1.5 border-b border-line last:border-b-0 text-[11px]">
              <span className="num text-dim shrink-0 w-[64px]">{fmtRel(o.ts, now)}</span>
              <span className="text-text min-w-0 flex-1 truncate" title={o.note}>
                {o.text}
                {o.note && <span className="text-dim"> — “{o.note}”</span>}
              </span>
              {o.reason && <Badge tone="warn">{o.reason}</Badge>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

type CSort = 'name' | 'sorties' | 'hrs' | 'deliv' | 'sla' | 'signoff' | 'tat' | 'last';

function ClientPanel({ d }: { d: PerfData }) {
  const tz = useTz();
  const [sort, setSort] = useState<{ k: CSort; dir: 1 | -1 }>({ k: 'sorties', dir: -1 });
  const val = (c: ClientRow): number | string =>
    sort.k === 'name' ? c.name : sort.k === 'sorties' ? c.agg.sorties : sort.k === 'hrs' ? c.agg.flightHrs : sort.k === 'deliv' ? c.agg.deliverables : sort.k === 'sla' ? c.sla : sort.k === 'signoff' ? c.signoff : sort.k === 'tat' ? meanTat(c.agg) : c.agg.lastDay;
  const rows = [...d.clients].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
  });
  const totalSignoff = meanSignoff(d.cur);
  return (
    <Panel index="06" title="Clients" subtitle={`${rows.length} active · mean sign-off ${isFinite(totalSignoff) ? totalSignoff.toFixed(1) : '—'} h`}>
      <div className="overflow-x-auto">
        <table className="tbl text-[11.5px] min-w-[900px]">
          <thead>
            <tr>
              <SortTh k="name" sort={sort} setSort={setSort}>Client</SortTh>
              <th>Profiles</th>
              <SortTh k="sorties" sort={sort} setSort={setSort} right>Sorties</SortTh>
              <SortTh k="hrs" sort={sort} setSort={setSort} right>Flight h</SortTh>
              <SortTh k="deliv" sort={sort} setSort={setSort} right>Deliverables</SortTh>
              <SortTh k="sla" sort={sort} setSort={setSort} className="w-[190px]">SLA vs target</SortTh>
              <SortTh k="tat" sort={sort} setSort={setSort} right>Turnaround</SortTh>
              <SortTh k="signoff" sort={sort} setSort={setSort} right>Mean sign-off</SortTh>
              <SortTh k="last" sort={sort} setSort={setSort} right>Last activity</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const ok = c.sla >= c.target;
              const tat = meanTat(c.agg);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="text-text font-medium">{c.name}</div>
                    <div className="text-[10px] text-dim">{c.sector}</div>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {c.types.map((t) => (
                        <span key={t} className="text-[10px] px-1 border border-line text-muted inline-flex items-center gap-1">
                          <i className="w-1.5 h-1.5 inline-block" style={{ background: MISSION_PROFILES[t].color }} />
                          {MISSION_PROFILES[t].short}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num text-right">{fmtNum(c.agg.sorties)}</td>
                  <td className="num text-right">{fmtNum(c.agg.flightHrs, 1)}</td>
                  <td className="num text-right">{fmtNum(c.agg.deliverables)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="num w-[44px] text-right" style={{ color: ok ? TONE_COLOR.ok : c.sla >= c.target - 5 ? TONE_COLOR.warn : TONE_COLOR.alert }}>
                        {c.sla.toFixed(1)}%
                      </span>
                      <div className="relative flex-1">
                        <Meter value={c.sla} max={100} color={ok ? TONE_COLOR.ok : TONE_COLOR.warn} height={5} />
                        <i className="absolute top-[-2px] w-px h-[9px] bg-white" style={{ left: `${c.target}%` }} title={`Target ${c.target}%`} />
                      </div>
                      <span className="num text-dim text-[10px] w-[28px]">{c.target}%</span>
                    </div>
                  </td>
                  <td className="num text-right">{isFinite(tat) ? `${tat.toFixed(1)} h` : '—'}</td>
                  <td className="num text-right" style={{ color: c.signoff > 14 ? TONE_COLOR.warn : undefined }}>
                    {isFinite(c.signoff) ? `${c.signoff.toFixed(1)} h` : '—'}
                  </td>
                  <td className="num text-right text-muted">{fmtDateShort(c.agg.lastDay, tz)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
