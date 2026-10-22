// AI Schedule Optimizer — proposal review (stats, clusters, per-item cards, accept).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { actions } from '../../store';
import type { OpsState } from '../../store';
import type { ProposalItem } from '../../engine/optimizer';
import { AIRFRAME, MISSION_PROFILES, PAYLOAD_META, PRIORITY, TRANSPORT_ICON } from '../../data/catalog';
import { Badge, DataBadge, Icon, Modal, Stamp, cx } from '../../ui/kit';
import { fmtNum } from '../../lib/format';

const PERMIT_ACTION: Record<NonNullable<ProposalItem['permitAction']>, string> = {
  file: 'File SINKAP / NOTAM request',
  'file-emergency': 'Expedited emergency clearance',
  resubmit: 'Re-submit expired clearance',
  extend: 'Request window extension',
};

export function ProposalReview({ open, onClose, S }: { open: boolean; onClose: () => void; S: OpsState }) {
  const p = S.proposal;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(false);
  useEffect(() => {
    if (p) setSel(new Set(p.items.filter((i) => i.changed).map((i) => i.missionId)));
  }, [p]);
  const clusterOf = useMemo(() => new Map((p?.clusters ?? []).map((c) => [c.id, c])), [p]);
  if (!p) return null;
  const ms = (id: string) => S.missions.find((m) => m.id === id);
  const items = onlyChanged ? p.items.filter((i) => i.changed) : p.items;
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const st = p.stats;
  const kmSaved = st.transitKmNaive - st.transitKmPlanned;

  return (
    <Modal open={open} onClose={onClose} title="AI Schedule Optimizer · Proposal review" index="03.4" width={1180}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 border border-line">
          <Big label="Blocking conflicts" value={<><span className="text-alert">{st.conflictsBefore}</span><span className="text-dim mx-1.5">→</span><span className={st.conflictsAfter ? 'text-warn' : 'text-ok'}>{st.conflictsAfter}</span></>} sub={st.conflictsBefore > st.conflictsAfter ? `${st.conflictsBefore - st.conflictsAfter} resolved` : 'no change'} />
          <Big label="SLA met" value={<span className={st.slaMet === st.slaTotal ? 'text-ok' : 'text-warn'}>{st.slaMet}<span className="text-dim">/{st.slaTotal}</span></span>} sub="proposed completions ≤ SLA due" />
          <Big label="Missions re-planned" value={p.items.filter((i) => i.changed).length} sub={`of ${st.missions} plannable`} />
          <Big label="Transit planned" value={<>{fmtNum(st.transitKmPlanned)}<span className="text-[11px] text-dim ml-1">km</span></>} sub={kmSaved > 0 ? `−${fmtNum(kmSaved)} km vs. base-direct` : `base-direct ${fmtNum(st.transitKmNaive)} km`} />
          <Big label="Clearance filings" value={st.permitFilings} sub="SINKAP / NOTAM / FA actions" />
          <Big label="Calibration bookings" value={st.calBookings} sub="before launch" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="text-[11.5px] text-muted leading-relaxed border-l-2 pl-3" style={{ borderColor: 'var(--view-accent)' }}>
            <span className="text-white font-semibold">How this plan was built.</span> Missions are ordered by priority then SLA due date and <b className="text-text">clustered geographically</b> (≤ 70 km launch-point radius) so a single team chains nearby jobs and the next transit starts from the previous job site. For each mission the optimizer evaluates every unit through the Deployment ETA engine against resources already committed in this plan, <b className="text-text">aligning payloads to mission profiles</b> (with valid calibration or a booked re-cal), rostering a rated, rested PIC, <b className="text-text">respecting recurring SLA cadence commitments</b>, and <b className="text-text">routing execution around weather and NOTAM/TFR blocks</b> into the next contiguous clearance window. Clearance filings and calibration bookings the plan depends on are applied on accept.
          </div>
          <div className="border border-line">
            <div className="px-2.5 h-7 flex items-center border-b border-line label">Geographic clusters · {p.clusters.length}</div>
            <div className="max-h-[132px] overflow-auto">
              {p.clusters.map((c) => (
                <div key={c.id} className="px-2.5 py-1.5 border-b border-line last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="num text-[10px] text-ink bg-[#c7c45d] px-1 leading-[14px] font-bold">C{c.id}</span>
                    <span className="text-[11.5px] font-semibold text-white truncate">{c.label}</span>
                    <span className="num text-[10px] text-dim ml-auto">{c.missionIds.length}</span>
                  </div>
                  <div className="num text-[10px] text-muted mt-0.5 leading-snug">{c.missionIds.map((id) => ms(id)?.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·')).join('  ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="label">Proposed assignments</span>
          <span className="num text-[10.5px] text-dim">{sel.size} selected</span>
          <button className="pill" onClick={() => setSel(new Set(items.map((i) => i.missionId)))}>Select all</button>
          <button className="pill" onClick={() => setSel(new Set())}>Clear</button>
          <button className={cx('pill', onlyChanged && 'pill-on')} onClick={() => setOnlyChanged(!onlyChanged)}>Changed only</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {items.map((it) => {
            const m = ms(it.missionId);
            if (!m) return null;
            const u = S.units.find((x) => x.id === it.unitId)!;
            const prof = MISSION_PROFILES[m.type];
            const on = sel.has(it.missionId);
            const cl = clusterOf.get(it.cluster);
            return (
              <div key={it.missionId} className={cx('border flex flex-col transition-colors', on ? 'border-white/50 bg-white/[0.035]' : 'border-line')}>
                <label className="flex items-start gap-2 px-2.5 pt-2 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggle(it.missionId)} className="mt-[3px] accent-[#c7c45d]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <i className="w-2 h-2" style={{ background: prof.color }} />
                      <span className="num text-[10.5px] text-muted">{m.code}</span>
                      {m.priority !== 'routine' && <Badge tone={PRIORITY[m.priority].tone} className="h-[16px] text-[9px] px-1">{PRIORITY[m.priority].label}</Badge>}
                      <span className="ml-auto flex items-center gap-1">
                        {it.changed ? <Badge tone="live" className="h-[16px] text-[9px] px-1">Changed</Badge> : <Badge tone="idle" className="h-[16px] text-[9px] px-1">Kept</Badge>}
                        <Badge tone={it.slaMet ? 'ok' : 'alert'} className="h-[16px] text-[9px] px-1">{it.slaMet ? 'SLA met' : 'SLA miss'}</Badge>
                      </span>
                    </div>
                    <div className="text-[12px] font-semibold text-white leading-snug mt-0.5 truncate" title={m.name}>{m.name}</div>
                  </div>
                </label>
                <div className="px-2.5 pl-[30px] mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="min-w-0">
                    <div className="label">Unit</div>
                    <div className="text-white font-semibold truncate">{u.callsign}</div>
                    <div className="text-[10px] text-dim truncate">{AIRFRAME[u.modelId].name}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="label">Crew</div>
                    {it.crewIds.length ? it.crewIds.map((id) => <div key={id} className="text-text truncate">{S.crews.find((c) => c.id === id)?.name}</div>) : <div className="text-warn">No rated PIC free</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="label">Start</div>
                    <div className="text-text"><Stamp ts={it.start} /></div>
                  </div>
                  <div className="min-w-0">
                    <div className="label">End</div>
                    <div className="text-text"><Stamp ts={it.end} /></div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2 flex-wrap">
                    {it.payloadIds.map((pid) => {
                      const pl = S.payloads.find((x) => x.id === pid);
                      return pl ? (
                        <span key={pid} className="inline-flex items-center gap-1 text-[10px] border border-line-2 px-1 h-[17px] text-muted">
                          <Icon name={PAYLOAD_META[pl.type].icon} size={10} />
                          {PAYLOAD_META[pl.type].short} <span className="num">{pl.serial}</span>
                        </span>
                      ) : null;
                    })}
                    <span className="inline-flex items-center gap-1 text-[10px] text-dim">
                      <Icon name={TRANSPORT_ICON[it.eta.transit.mode]} size={10} /> <span className="num">{fmtNum(it.eta.transit.distKm)} km</span>
                    </span>
                    {cl && <span className="num text-[10px] text-ink bg-[#c7c45d] px-1 leading-[14px] font-bold" title={cl.label}>C{cl.id}</span>}
                    <span className="ml-auto"><DataBadge indicative={it.eta.indicative} unverified={it.eta.unverified} /></span>
                  </div>
                </div>
                <ul className="px-2.5 pl-[30px] mt-2 space-y-0.5 text-[10.5px] text-muted flex-1">
                  {it.rationale.map((r) => (
                    <li key={r} className={cx('flex gap-1.5 leading-snug', r.startsWith('⚠') && 'text-warn')}>
                      <span className="text-dim font-mono">›</span>
                      <span>{r.replace(/^⚠\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
                {(it.permitAction || it.calBookings.length > 0) && (
                  <div className="mx-2.5 ml-[30px] mt-2 mb-2.5 border-t border-line pt-1.5 flex flex-col gap-1">
                    {it.permitAction && (
                      <div className="flex items-center gap-1.5 text-[10.5px] text-warn">
                        <Icon name="file-check" size={11} /> {PERMIT_ACTION[it.permitAction]}
                      </div>
                    )}
                    {it.calBookings.map((b) => (
                      <div key={b.payloadId} className="flex items-center gap-1.5 text-[10.5px] text-live">
                        <Icon name="calendar" size={11} /> Book cal · {b.label} · <Stamp ts={b.at} />
                      </div>
                    ))}
                  </div>
                )}
                {!it.permitAction && !it.calBookings.length && <div className="h-2.5" />}
              </div>
            );
          })}
        </div>

        {p.unplaced.length > 0 && (
          <div className="border border-alert/40 bg-alert-bg">
            <div className="px-3 h-7 flex items-center gap-2 border-b border-alert/30">
              <Icon name="octagon-alert" size={12} className="text-alert" />
              <span className="label text-alert">Unplaced · {p.unplaced.length}</span>
            </div>
            {p.unplaced.map((u) => (
              <div key={u.missionId} className="px-3 py-1.5 flex gap-3 text-[11.5px] border-b border-alert/20 last:border-b-0">
                <span className="num text-muted w-32 shrink-0">{ms(u.missionId)?.code}</span>
                <span className="text-white truncate">{ms(u.missionId)?.name}</span>
                <span className="text-alert ml-auto shrink-0">{u.reason}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap sticky -bottom-4 -mx-4 -mb-4 px-4 pb-3 bg-card pt-3 border-t border-line-2 z-[2]">
          <span className="text-[11px] text-dim">
            Generated <Stamp ts={p.createdAt} /> · accepting writes to the audit trail and applies follow-up filings.
          </span>
          <button className="btn ml-auto" onClick={() => { actions.dismissProposal(); onClose(); }}>
            <Icon name="x" size={12} /> Dismiss
          </button>
          <button className="btn" disabled={!sel.size} onClick={() => { actions.acceptProposal([...sel]); onClose(); }}>
            <Icon name="check" size={12} /> Accept selected ({sel.size})
          </button>
          <button className="btn btn-solid" onClick={() => { actions.acceptProposal(); onClose(); }}>
            <Icon name="sparkles" size={12} /> Accept all ({p.items.length})
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Big({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="px-3 py-2 border-r border-b xl:border-b-0 border-line last:border-r-0">
      <div className="label">{label}</div>
      <div className="num text-[22px] font-semibold text-white leading-tight mt-0.5">{value}</div>
      <div className="text-[10.5px] text-dim truncate">{sub}</div>
    </div>
  );
}
