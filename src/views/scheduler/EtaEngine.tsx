// Deployment ETA Engine tab — formulas, per-mission candidate matrix,
// operator override workflow (shared calculator) + audit trail, and a
// fleet-wide recommended-unit matrix.
import { memo, useMemo, useState } from 'react';
import type { OpsState } from '../../store';
import type { Mission } from '../../types';
import { candidatesFor, recommended, type EtaResult } from '../../engine/eta';
import { AIRFRAME, MISSION_PROFILES, MISSION_STATUS, PRIORITY, TONE_COLOR, TRANSPORT_ICON, TRANSPORT_LABEL, UNIT_STATUS } from '../../data/catalog';
import { DeploymentCalculator } from '../../components/DeploymentCalculator';
import { Badge, DataBadge, Empty, Icon, Panel, Stamp, cx } from '../../ui/kit';
import { HOUR, MIN, fmtDur, fmtRel } from '../../lib/time';
import { fmtNum } from '../../lib/format';
import { TipCard, tipProps } from './shared';

const ETA_STATUSES: Mission['status'][] = ['active', 'scheduled', 'request', 'planned', 'delayed', 'hold-weather', 'hold-airspace'];

export function EtaEngineTab({ S, selectedId, onSelect }: { S: OpsState; selectedId?: string; onSelect: (id: string) => void }) {
  const minute = Math.floor(S.now / MIN);
  const open = useMemo(
    () => S.missions.filter((m) => ETA_STATUSES.includes(m.status)).sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.slaDue - b.slaDue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S.missions.map((m) => m.id + m.status + m.priority).join()],
  );
  const sel = open.find((m) => m.id === selectedId) ?? open[0];
  // Fleet-wide recommendation per mission (engine caches per sim-minute).
  const recs = useMemo(() => new Map(open.map((m) => [m.id, recommended(m, S)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, minute, S.masterVersion, S.weatherSeverity, S.kpIndex, S.units.map((u) => u.status + (u.missionId ?? '')).join()]);

  return (
    <div className="flex flex-col gap-3">
      <FormulaSpec />
      <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-3 items-start">
        <Panel title="Open missions" index="E1" actions={<span className="num text-[10.5px] text-dim">{open.length}</span>} className="min-w-0 lg:sticky lg:top-0" bodyClassName="max-h-[82vh] overflow-auto">
          {open.map((m) => {
            const r = recs.get(m.id);
            const prof = MISSION_PROFILES[m.type];
            const on = sel?.id === m.id;
            const slaOk = r ? r.completion <= m.slaDue : false;
            return (
              <button key={m.id} onClick={() => onSelect(m.id)} className={cx('w-full text-left px-3 py-2 border-b border-line relative transition-colors', on ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]')}>
                {on && <span className="absolute left-0 inset-y-0 w-[2px]" style={{ background: 'var(--view-accent)' }} />}
                <div className="flex items-center gap-1.5">
                  <i className="w-2 h-2 shrink-0" style={{ background: prof.color }} />
                  <span className="num text-[10.5px] text-muted">{m.code}</span>
                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider" style={{ color: TONE_COLOR[MISSION_STATUS[m.status].tone] }}>
                    {MISSION_STATUS[m.status].label}
                  </span>
                </div>
                <div className="text-[11.5px] font-semibold text-white truncate mt-0.5">{m.name}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10.5px]">
                  <span className="text-dim truncate">{r ? S.units.find((u) => u.id === r.unitId)?.callsign : 'no feasible unit'}</span>
                  <span className={cx('num ml-auto', !r ? 'text-alert' : slaOk ? 'text-ok' : 'text-warn')}>{r ? fmtDur(r.completion - S.now) : '—'}</span>
                </div>
              </button>
            );
          })}
        </Panel>
        <div className="flex flex-col gap-3 min-w-0">
          {sel ? <CandidateMatrix S={S} m={sel} minute={minute} /> : <Panel title="Candidate matrix"><Empty text="No open missions" /></Panel>}
          {sel && (
            <div className="grid grid-cols-1 2xl:grid-cols-[3fr_2fr] gap-3 items-start">
              <Panel title="Deployment calculator" index="E3" className="min-w-0" bodyClassName="p-3">
                <DeploymentCalculator missionId={sel.id} limit={5} />
              </Panel>
              <AuditTrail S={S} m={sel} />
            </div>
          )}
        </div>
      </div>
      <FleetMatrix S={S} open={open} recs={recs} selectedId={sel?.id} onSelect={onSelect} />
    </div>
  );
}

function FormulaSpec() {
  const rows: [string, string, string][] = [
    ['Deployment ETA', '= T_avail + T_transit + T_setup', 'unit free → transit by road / ferry / air / self-ferry → set-up, payload mount & pre-flight'],
    ['Sorties', '= ⌈ Workload / Effective capacity per sortie ⌉', 'remaining ha · km · hrs · km² · kg ÷ master-data coverage per sortie'],
    ['T_exec', '= Sorties × (Sortie flight time + Battery/payload swap & turnaround)', 'cargo sorties = round-trip route ÷ cruise + 8 min handling'],
    ['Earliest completion', '= Deployment ETA + T_exec  ⟶ shifted to next contiguous Weather + Airspace clearance window', 'hourly wind · gust · rain · vis · ceiling · daylight · NOTAM/TFR · permit window'],
  ];
  return (
    <div className="border border-line-2 bg-bg-deep">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-line">
        <span className="idx">E0 ·</span>
        <span className="label text-text">Engine specification · deterministic</span>
        <span className="ml-auto text-[10.5px] text-dim">Recommended unit = earliest valid completion · INDICATIVE when any input parameter is unverified in Master Data</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {rows.map(([k, f, n], i) => (
          <div key={k} className={cx('px-3 py-2 font-mono text-[11.5px] border-line', i % 2 === 0 && 'lg:border-r', i < 2 && 'border-b')}>
            <div>
              <span style={{ color: 'var(--view-accent)' }}>{k}</span> <span className="text-white">{f}</span>
            </div>
            <div className="text-[10.5px] text-dim mt-0.5 font-sans">{n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CandidateMatrix = memo(function CandidateMatrix({ S, m, minute }: { S: OpsState; m: Mission; minute: number }) {
  const [showInf, setShowInf] = useState(false);
  const cands = useMemo(
    () => candidatesFor(m, S),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m, minute, S.masterVersion, S.weatherSeverity, S.kpIndex, S.units.map((u) => u.status + (u.missionId ?? '')).join()],
  );
  const pool = cands.filter((c) => {
    const u = S.units.find((x) => x.id === c.unitId)!;
    return u.status !== 'grounded' && u.status !== 'maintenance';
  });
  const feasible = pool.filter((c) => c.feasible);
  const infeasible = pool.filter((c) => !c.feasible);
  const excluded = cands.length - pool.length;
  const rec = feasible[0];
  const prof = MISSION_PROFILES[m.type];
  const remaining = m.workload * (1 - m.progress);
  const unit = (id: string) => S.units.find((u) => u.id === id)!;

  return (
    <Panel
      title={<span>Candidate matrix · <span className="num text-muted normal-case tracking-normal">{m.code}</span></span>}
      index="E2"
      className="min-w-0"
      bodyClassName="flex flex-col min-h-0"
      actions={
        <span className="text-[10.5px] text-dim">
          <span className="num text-ok">{feasible.length}</span> feasible · <span className="num">{infeasible.length}</span> infeasible · <span className="num">{excluded}</span> excluded
        </span>
      }
    >
      <div className="px-3 py-2 border-b border-line flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
        <span className="text-white font-semibold truncate max-w-[340px]">{m.name}</span>
        <span className="text-muted">
          {prof.workloadLabel} <b className="num text-white">{fmtNum(remaining, remaining < 50 ? 1 : 0)}</b> {prof.unit}
        </span>
        {m.routeKm && <span className="text-muted">Route <b className="num text-white">{m.routeKm}</b> km</span>}
        <span className="text-muted">
          SLA due <b className="text-white"><Stamp ts={m.slaDue} /></b> <span className={cx('num', m.slaDue < S.now ? 'text-alert' : 'text-dim')}>({fmtRel(m.slaDue, S.now)})</span>
        </span>
        <span className="text-muted">{m.daylightOnly ? 'Daylight only' : '24 h ops'} · {m.bvlos ? 'BVLOS' : 'VLOS'}</span>
      </div>
      <div className="overflow-auto">
        <table className="tbl text-[11px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Unit</th>
              <th>Status</th>
              <th className="text-right">T_avail</th>
              <th>Transit</th>
              <th className="text-right">T_setup</th>
              <th>Sorties × (fly + turn)</th>
              <th className="text-right">T_exec</th>
              <th>Deployment ETA</th>
              <th className="text-right">Window wait</th>
              <th>Earliest completion</th>
              <th>SLA</th>
              <th>Data</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {feasible.map((c, i) => (
              <MatrixRow key={c.unitId} c={c} i={i} rec={c.unitId === rec?.unitId} m={m} S={S} unit={unit(c.unitId)} />
            ))}
            {feasible.length === 0 && (
              <tr>
                <td colSpan={14} className="text-alert text-center py-4">No feasible unit within the 8-day planning horizon.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {infeasible.length > 0 && (
        <div className="border-t border-line">
          <button className="w-full flex items-center gap-2 px-3 h-8 text-left text-[11px] text-dim hover:text-muted" onClick={() => setShowInf(!showInf)}>
            <Icon name={showInf ? 'chevron-down' : 'chevron-right'} size={12} />
            {infeasible.length} infeasible unit(s) · reasons
          </button>
          {showInf && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 px-3 pb-2.5">
              {infeasible.map((c) => {
                const u = unit(c.unitId);
                return (
                  <div key={c.unitId} className="flex items-center gap-2 py-[3px] text-[11px] border-b border-line/60">
                    <span className="text-muted w-24 shrink-0 truncate">{u.callsign}</span>
                    <span className="text-dim w-28 shrink-0 truncate">{AIRFRAME[u.modelId].name}</span>
                    <span className="text-text truncate">{c.infeasibleReason}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
});

function MatrixRow({ c, i, rec, m, S, unit: u }: { c: EtaResult; i: number; rec: boolean; m: Mission; S: OpsState; unit: OpsState['units'][number] }) {
  const slaOk = c.completion <= m.slaDue;
  const assigned = m.assignedUnitIds.includes(u.id);
  const st = UNIT_STATUS[u.status];
  return (
    <tr className={cx(rec && 'bg-live-bg')} style={rec ? { boxShadow: 'inset 2px 0 0 #26d8d9' } : undefined}>
      <td className="num text-dim">{rec ? <Icon name="sparkles" size={12} className="text-live" /> : i + 1}</td>
      <td className="whitespace-nowrap">
        <div className="font-semibold text-white">
          {u.callsign}
          {assigned && <span className="ml-1.5 text-[9.5px] text-live">● assigned</span>}
        </div>
        <div className="text-[10px] text-dim">{AIRFRAME[u.modelId].name}</div>
      </td>
      <td>
        <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: TONE_COLOR[st.tone] }}>
          {st.label}
        </span>
      </td>
      <td className="num text-right">{fmtDur(c.tAvail)}</td>
      <td className="whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1.5"
          {...tipProps(() => (
            <TipCard
              title={`${TRANSPORT_LABEL[c.transit.mode]} · ${fmtNum(c.transit.distKm)} km`}
              rows={c.transit.options.map((o) => [TRANSPORT_LABEL[o.mode], o.feasible ? fmtDur(o.ms) : o.note ?? 'n/a'] as [string, string])}
              foot="Fastest feasible mode is selected unless the mission specifies a transport preference."
            />
          ))}
        >
          <Icon name={TRANSPORT_ICON[c.transit.mode]} size={12} className="text-muted" />
          <span className="num">{fmtNum(c.transit.distKm)} km</span>
          <span className="num text-text">{fmtDur(c.tTransit)}</span>
        </span>
      </td>
      <td className="num text-right">
        {fmtDur(c.tSetup)}
        {c.payloadSwap && <span className="text-warn" title="Includes +30 min payload swap"> *</span>}
      </td>
      <td className="num whitespace-nowrap text-muted">
        <span className="text-white">{c.sorties}</span> × ({c.sortieMin}m + {c.turnaroundMin}m)
      </td>
      <td className="num text-right text-white">{fmtDur(c.tExec)}</td>
      <td className="whitespace-nowrap">
        <div className="num text-live">{fmtDur(c.deployEta - S.now)}</div>
        <div className="text-[10px] text-dim"><Stamp ts={c.deployEta} /></div>
      </td>
      <td className={cx('num text-right', c.windowWait > HOUR ? 'text-warn' : 'text-dim')} title={c.windowBlockers.slice(0, 3).join(' · ').replace(/#/g, '…')}>
        {c.windowWait > MIN ? fmtDur(c.windowWait) : '—'}
      </td>
      <td className="whitespace-nowrap">
        <div className={cx('num', slaOk ? 'text-ok' : 'text-warn')}>{fmtDur(c.completion - S.now)}</div>
        <div className="text-[10px] text-dim"><Stamp ts={c.completion} /></div>
      </td>
      <td>
        <Badge tone={slaOk ? 'ok' : 'alert'} className="h-[17px] text-[9px] px-1">{slaOk ? 'OK' : 'Miss'}</Badge>
      </td>
      <td>
        <DataBadge indicative={c.indicative} unverified={c.unverified} />
      </td>
      <td>
        {c.warnings.length > 0 && (
          <span className="text-warn inline-flex items-center gap-0.5" {...tipProps(() => <TipCard title={`${c.warnings.length} warning(s)`} tone="warn" foot={<ul className="space-y-0.5">{c.warnings.map((w) => <li key={w}>› {w}</li>)}</ul>} />)}>
            <Icon name="triangle-alert" size={12} />
            <span className="num text-[10px]">{c.warnings.length}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

function AuditTrail({ S, m }: { S: OpsState; m: Mission }) {
  const entries = S.audit.filter((a) => (a.kind === 'override' || a.kind === 'accept-ai') && (a.missionId === m.id || (!a.missionId && a.kind === 'accept-ai'))).slice(0, 8);
  const unit = (id?: string) => S.units.find((u) => u.id === id)?.callsign;
  return (
    <Panel title="Assignment audit trail" index="E4" subtitle={<span className="num">{m.code}</span>} className="min-w-0">
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-[11px] text-dim">No AI accept / override decisions recorded for this mission yet. Overrides require a structured reason and are logged here.</div>
      ) : (
        <ul>
          {entries.map((a) => (
            <li key={a.id} className="px-3 py-2 border-b border-line last:border-b-0">
              <div className="flex items-center gap-2">
                <Badge tone={a.kind === 'override' ? 'warn' : 'ok'} className="h-[16px] text-[9px] px-1">{a.kind === 'override' ? 'Override' : 'AI accepted'}</Badge>
                <span className="text-[10.5px] text-muted">{a.actor}</span>
                <span className="ml-auto text-[10px] text-dim"><Stamp ts={a.ts} /></span>
              </div>
              <div className="text-[11.5px] text-text mt-1 leading-snug">{a.text}</div>
              {a.kind === 'override' && (
                <div className="text-[10.5px] text-dim mt-0.5">
                  Recommended <span className="text-muted">{unit(a.recommendedUnitId) ?? '—'}</span> → chosen <span className="text-warn">{unit(a.chosenUnitId) ?? '—'}</span>
                  {a.reason && <> · reason <span className="text-white">{a.reason}</span></>}
                  {a.note && <div className="italic mt-0.5">“{a.note}”</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FleetMatrix({ S, open, recs, selectedId, onSelect }: { S: OpsState; open: Mission[]; recs: Map<string, EtaResult | undefined>; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <Panel title="Fleet-wide ETA matrix" index="E5" bodyClassName="overflow-auto max-h-[460px]">
      <table className="tbl text-[11px]">
        <thead>
          <tr>
            <th>Mission</th>
            <th>Type</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>Recommended unit</th>
            <th>Transit</th>
            <th>Deployment ETA</th>
            <th>Earliest completion</th>
            <th>SLA due</th>
            <th>SLA</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {open.map((m) => {
            const r = recs.get(m.id);
            const u = r && S.units.find((x) => x.id === r.unitId);
            const prof = MISSION_PROFILES[m.type];
            const slaOk = r ? r.completion <= m.slaDue : false;
            const assigned = m.assignedUnitIds.map((id) => S.units.find((x) => x.id === id)?.callsign).filter(Boolean);
            const matches = r && m.assignedUnitIds.includes(r.unitId);
            return (
              <tr key={m.id} onClick={() => onSelect(m.id)} className={cx('cursor-pointer', selectedId === m.id && 'bg-white/[0.05]')}>
                <td className="whitespace-nowrap">
                  <span className="num text-muted">{m.code}</span>
                  <div className="text-[11px] text-white truncate max-w-[260px]">{m.name}</div>
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: prof.color }}>
                    <Icon name={prof.icon} size={11} /> {prof.short}
                  </span>
                </td>
                <td>
                  <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: TONE_COLOR[MISSION_STATUS[m.status].tone] }}>
                    {MISSION_STATUS[m.status].label}
                  </span>
                </td>
                <td className="text-muted whitespace-nowrap">{assigned.length ? assigned.join(', ') : <span className="text-dim">—</span>}</td>
                <td className="whitespace-nowrap">
                  {u ? (
                    <>
                      <span className="font-semibold text-white">{u.callsign}</span>
                      {matches ? <span className="ml-1.5 text-[9.5px] text-ok">✓ matches</span> : assigned.length ? <span className="ml-1.5 text-[9.5px] text-warn">differs</span> : null}
                      <div className="text-[10px] text-dim">{AIRFRAME[u.modelId].name}</div>
                    </>
                  ) : (
                    <span className="text-alert">No feasible unit</span>
                  )}
                </td>
                <td className="whitespace-nowrap">{r && <span className="inline-flex items-center gap-1 text-muted"><Icon name={TRANSPORT_ICON[r.transit.mode]} size={11} /><span className="num">{fmtNum(r.transit.distKm)} km</span></span>}</td>
                <td className="whitespace-nowrap">{r && <><div className="num text-live">{fmtDur(r.deployEta - S.now)}</div><div className="text-[10px] text-dim"><Stamp ts={r.deployEta} /></div></>}</td>
                <td className="whitespace-nowrap">{r && <><div className={cx('num', slaOk ? 'text-ok' : 'text-warn')}>{fmtDur(r.completion - S.now)}</div><div className="text-[10px] text-dim"><Stamp ts={r.completion} /></div></>}</td>
                <td className="whitespace-nowrap text-dim"><Stamp ts={m.slaDue} /></td>
                <td>{r ? <Badge tone={slaOk ? 'ok' : 'alert'} className="h-[17px] text-[9px] px-1">{slaOk ? 'OK' : 'Miss'}</Badge> : <Badge tone="alert" className="h-[17px] text-[9px] px-1">—</Badge>}</td>
                <td>{r && <DataBadge indicative={r.indicative} unverified={r.unverified} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
