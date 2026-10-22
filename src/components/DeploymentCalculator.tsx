// Selected-mission Deployment ETA calculator with operator override workflow.
import { useMemo, useState } from 'react';
import { actions, useOps, useOpsState } from '../store';
import { candidatesFor, type EtaResult } from '../engine/eta';
import { AIRFRAME, MISSION_PROFILES, OVERRIDE_REASONS, PRIORITY, TRANSPORT_ICON, TRANSPORT_LABEL, UNIT_STATUS } from '../data/catalog';
import { Badge, DataBadge, Icon, Modal, cx, Stamp } from '../ui/kit';
import { fmtDur, fmtRel, HOUR } from '../lib/time';
import { fmtNum } from '../lib/format';
import type { OverrideReason } from '../types';

export function EtaBreakdown({ r, compact }: { r: EtaResult; compact?: boolean }) {
  const parts = [
    { k: 'T avail', v: r.tAvail, c: '#8b93a3' },
    { k: 'T transit', v: r.tTransit, c: '#8384E2' },
    { k: 'T setup', v: r.tSetup, c: '#c7c45d' },
    { k: 'Window wait', v: isFinite(r.windowWait) ? r.windowWait : 0, c: '#e8a33a' },
    { k: 'T exec', v: r.tExec, c: '#3ccf6e' },
  ];
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div>
      <div className="flex h-[8px] w-full overflow-hidden bg-white/5">
        {parts.map((p) => (
          <div key={p.k} title={`${p.k}: ${fmtDur(p.v)}`} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />
        ))}
      </div>
      <div className={cx('grid gap-x-3 gap-y-1 mt-2', compact ? 'grid-cols-2' : 'grid-cols-5')}>
        {parts.map((p) => (
          <div key={p.k} className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] text-dim uppercase tracking-wider">
              <i className="w-1.5 h-1.5 inline-block" style={{ background: p.c }} />
              {p.k}
            </div>
            <div className="num text-[12px] text-white">{fmtDur(p.v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverrideModal({ open, onClose, missionId, unitId, recommendedUnitId }: { open: boolean; onClose: () => void; missionId: string; unitId?: string; recommendedUnitId?: string }) {
  const [reason, setReason] = useState<OverrideReason | ''>('');
  const [note, setNote] = useState('');
  const units = useOps((s) => s.units);
  const missions = useOps((s) => s.missions);
  const u = units.find((x) => x.id === unitId);
  const rec = units.find((x) => x.id === recommendedUnitId);
  const m = missions.find((x) => x.id === missionId);
  const submit = () => {
    if (!reason || !unitId) return;
    actions.assignUnit(missionId, unitId, { recommendedUnitId, reason, note });
    setReason('');
    setNote('');
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Operator override" index="ETA">
      <div className="text-[12px] text-muted mb-3">
        System recommends <b className="text-white">{rec?.callsign}</b> for <span className="num text-white">{m?.code}</span>. You are assigning <b className="text-warn">{u?.callsign}</b>. A structured reason is required and is written to the audit trail.
      </div>
      <div className="label mb-1.5">Override reason</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
        {OVERRIDE_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={cx('text-left px-3 py-2 border text-[12px] transition-colors', reason === r ? 'border-white bg-white text-ink font-semibold' : 'border-line-2 hover:border-white/50')}>
            {r}
          </button>
        ))}
      </div>
      <div className="label mb-1.5">Note {reason === 'Other' && <span className="text-warn">(required)</span>}</div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="field w-full h-auto py-2" placeholder="e.g. Client contract specifies EO/IR coverage from this airframe" />
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-solid" disabled={!reason || (reason === 'Other' && !note.trim())} onClick={submit}>
          Log override & assign
        </button>
      </div>
    </Modal>
  );
}

export function DeploymentCalculator({ missionId, compact, limit = 6 }: { missionId: string; compact?: boolean; limit?: number }) {
  const S = useOpsState();
  const m = S.missions.find((x) => x.id === missionId);
  const minute = Math.floor(S.now / 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cands = useMemo(() => (m ? candidatesFor(m, S) : []), [m, minute, S.masterVersion, S.weatherSeverity, S.kpIndex, S.units.map((u) => u.status).join()]);
  const [sel, setSel] = useState<string | undefined>();
  const [showOverride, setShowOverride] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (!m) return null;
  const prof = MISSION_PROFILES[m.type];
  const rec = cands.find((c) => c.feasible);
  const chosen = cands.find((c) => c.unitId === (sel ?? rec?.unitId));
  const feasible = cands.filter((c) => c.feasible);
  const infeasible = cands.filter((c) => !c.feasible && AIRFRAME[S.units.find((u) => u.id === c.unitId)!.modelId].roles.includes(m.type));
  const list = showAll ? feasible : feasible.slice(0, limit);
  const unit = (id: string) => S.units.find((u) => u.id === id)!;
  const assigned = new Set(m.assignedUnitIds);
  const slaOk = chosen ? chosen.completion <= m.slaDue : false;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="num text-[11px] text-dim">{m.code}</span>
          <Badge tone={PRIORITY[m.priority].tone}>{PRIORITY[m.priority].label}</Badge>
          <span className="text-[10.5px] px-1.5 h-[20px] inline-flex items-center border border-line-2" style={{ color: prof.color }}>
            <Icon name={prof.icon} size={11} className="mr-1" />
            {prof.short} · {m.subtype}
          </span>
        </div>
        <div className="text-[13px] font-bold text-white mt-1 leading-snug">{m.name}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-muted">
          <span>
            {prof.workloadLabel}: <b className="num text-white">{fmtNum(m.workload * (1 - m.progress), m.workload < 50 ? 1 : 0)}</b> {prof.unit}
            {m.progress > 0 && <span className="text-dim"> of {fmtNum(m.workload, m.workload < 50 ? 1 : 0)}</span>}
          </span>
          {m.routeKm && (
            <span>
              Route <b className="num text-white">{m.routeKm}</b> km
            </span>
          )}
          <span>
            SLA <b className={cx('num', m.slaDue < S.now ? 'text-alert' : 'text-white')}>{fmtRel(m.slaDue, S.now)}</b>
          </span>
        </div>
      </div>

      {chosen ? (
        <div className="border border-line-2 bg-bg-deep/60">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
            <Icon name={chosen.unitId === rec?.unitId ? 'sparkles' : 'user-cog'} size={13} className={chosen.unitId === rec?.unitId ? 'text-live' : 'text-warn'} />
            <span className="label" style={{ color: chosen.unitId === rec?.unitId ? '#26d8d9' : '#e8a33a' }}>
              {chosen.unitId === rec?.unitId ? 'System recommended · earliest valid completion' : 'Operator selection'}
            </span>
            <span className="ml-auto">
              <DataBadge indicative={chosen.indicative} unverified={chosen.unverified} />
            </span>
          </div>
          <div className="px-3 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-extrabold text-white">{unit(chosen.unitId).callsign}</span>
              <span className="text-[11px] text-dim">{AIRFRAME[unit(chosen.unitId).modelId].name}</span>
              <span className="ml-auto text-[10.5px]">{UNIT_STATUS[unit(chosen.unitId).status].label}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2.5">
              <div>
                <div className="label">Deployment ETA</div>
                <div className="num text-[18px] font-semibold text-live leading-tight">{chosen.deployEta - S.now < 60_000 ? 'On site' : fmtDur(chosen.deployEta - S.now)}</div>
                <div className="text-[10.5px] text-dim">
                  <Stamp ts={chosen.deployEta} />
                </div>
              </div>
              <div>
                <div className="label">Earliest completion</div>
                <div className={cx('num text-[18px] font-semibold leading-tight', slaOk ? 'text-ok' : 'text-warn')}>{fmtDur(chosen.completion - S.now)}</div>
                <div className="text-[10.5px] text-dim">
                  <Stamp ts={chosen.completion} /> · {slaOk ? 'within SLA' : `${fmtDur(chosen.completion - m.slaDue)} past SLA`}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <EtaBreakdown r={chosen} compact={compact} />
            </div>
            <div className="mt-2.5 text-[10.5px] text-dim font-mono leading-relaxed">
              Sorties ⌈{fmtNum(m.workload * (1 - m.progress), 1)} / {fmtNum(chosen.capacity, 1)} {prof.unit}⌉ = <span className="text-text">{chosen.sorties}</span> × ({chosen.sortieMin}m + {chosen.turnaroundMin}m)
              <br />
              <Icon name={TRANSPORT_ICON[chosen.transit.mode]} size={10} className="inline -mt-0.5 mr-1" />
              {TRANSPORT_LABEL[chosen.transit.mode]} · {fmtNum(chosen.transit.distKm, 0)} km{chosen.payloadSwap && ' · payload swap +30m'}
              {chosen.windowWait > HOUR / 2 && isFinite(chosen.windowWait) && (
                <>
                  <br />
                  <span className="text-warn">Shifted {fmtDur(chosen.windowWait)} to weather + airspace window</span>
                  {chosen.windowBlockers[0] && <span> ({chosen.windowBlockers.slice(0, 2).join(', ').replace(/#/g, '…')})</span>}
                </>
              )}
            </div>
            {chosen.warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {chosen.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 text-[11px] text-warn">
                    <Icon name="triangle-alert" size={11} className="mt-[2px]" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 px-3 pb-3">
            {chosen.unitId === rec?.unitId ? (
              <button className="btn btn-solid flex-1 justify-center" disabled={assigned.has(chosen.unitId) && m.status !== 'request'} onClick={() => actions.assignUnit(m.id, chosen.unitId, { recommendedUnitId: rec.unitId })}>
                <Icon name="check" size={12} /> {assigned.has(chosen.unitId) ? 'Assigned' : 'Assign recommended'}
              </button>
            ) : (
              <button className="btn flex-1 justify-center border-warn text-warn" onClick={() => setShowOverride(true)}>
                <Icon name="user-cog" size={12} /> Override → {unit(chosen.unitId).callsign}
              </button>
            )}
            {(m.status === 'scheduled' || m.status === 'request' || m.status === 'delayed' || m.status === 'planned') && (
              <button className="btn" title="Dispatch now" onClick={() => actions.dispatchMission(m.id)}>
                <Icon name="plane-takeoff" size={12} /> Dispatch
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-alert/40 bg-alert-bg px-3 py-3 text-[12px] text-alert">No feasible unit within the 8-day planning horizon. {cands[0]?.infeasibleReason}</div>
      )}

      <div>
        <div className="flex items-center mb-1">
          <span className="label">Candidate units · ranked by valid completion</span>
          <span className="ml-auto num text-[10px] text-dim">{feasible.length} feasible</span>
        </div>
        <div className="border border-line">
          {list.map((c, i) => {
            const u = unit(c.unitId);
            const on = c.unitId === chosen?.unitId;
            return (
              <button key={c.unitId} onClick={() => setSel(c.unitId)} className={cx('w-full grid items-center gap-2 px-2.5 py-1.5 text-left border-b border-line last:border-b-0 transition-colors', compact ? 'grid-cols-[16px_1fr_auto_auto]' : 'grid-cols-[16px_1.2fr_1fr_auto_auto_auto]', on ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]')}>
                <span className="num text-[10px] text-dim">{i + 1}</span>
                <span className="min-w-0">
                  <span className="text-[12px] font-semibold text-white">{u.callsign}</span>
                  {assigned.has(u.id) && <span className="ml-1.5 text-[9.5px] text-live">● assigned</span>}
                  <span className="block text-[10px] text-dim truncate">
                    {AIRFRAME[u.modelId].name} · {S.bases.find((b) => b.id === u.baseId)?.city.split(',')[0]}
                  </span>
                </span>
                {!compact && (
                  <span className="text-[10.5px] text-muted flex items-center gap-1 truncate">
                    <Icon name={TRANSPORT_ICON[c.transit.mode]} size={11} />
                    {fmtNum(c.transit.distKm, 0)} km
                  </span>
                )}
                <span className="num text-[11px] text-live text-right" title="Deployment ETA">
                  {c.deployEta - S.now < 60_000 ? 'on site' : fmtDur(c.deployEta - S.now)}
                </span>
                <span className={cx('num text-[11px] text-right', c.completion <= m.slaDue ? 'text-ok' : 'text-warn')} title="Earliest completion">
                  {fmtDur(c.completion - S.now)}
                </span>
                {!compact && <span className="text-right">{c.indicative ? <Icon name="triangle-alert" size={12} className="text-warn inline" /> : <Icon name="shield-check" size={12} className="text-ok inline" />}</span>}
              </button>
            );
          })}
          {feasible.length > limit && (
            <button onClick={() => setShowAll(!showAll)} className="w-full px-2.5 py-1.5 text-[11px] text-dim hover:text-white text-left">
              {showAll ? 'Show fewer' : `Show all ${feasible.length} feasible`} <span className="font-mono">→</span>
            </button>
          )}
        </div>
        {infeasible.length > 0 && (
          <details className="mt-1.5 text-[11px]">
            <summary className="text-dim cursor-pointer hover:text-muted">{infeasible.length} role-capable unit(s) excluded</summary>
            <ul className="mt-1 space-y-0.5">
              {infeasible.map((c) => (
                <li key={c.unitId} className="flex gap-2 text-dim">
                  <span className="text-muted w-28 shrink-0">{unit(c.unitId).callsign}</span>
                  <span>{c.infeasibleReason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <OverrideModal open={showOverride} onClose={() => setShowOverride(false)} missionId={m.id} unitId={chosen?.unitId} recommendedUnitId={rec?.unitId} />
    </div>
  );
}
