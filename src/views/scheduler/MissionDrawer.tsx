// Selected-mission detail drawer: schedule facts, conflicts with resolutions,
// ±1 h shift control and the compact Deployment ETA calculator.
import { useEffect, useRef } from 'react';
import type { OpsState } from '../../store';
import { actions } from '../../store';
import type { Conflict } from '../../engine/conflicts';
import { CONFLICT_LABEL } from '../../engine/conflicts';
import { permitFor, permitRequired, zonesForMission } from '../../engine/airspace';
import { DeploymentCalculator } from '../../components/DeploymentCalculator';
import { AIRFRAME, MISSION_PROFILES, MISSION_STATUS, PAYLOAD_META, PRIORITY } from '../../data/catalog';
import { CLIENTS } from '../../data/seed';
import { Badge, Icon, KV, Meter, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { HOUR, fmtDur, fmtRel } from '../../lib/time';
import { CONFLICT_ICON, PERMIT_TONE } from './shared';

export function MissionDrawer({ S, missionId, conflicts, openConflictId, onOpenConflict, onClose }: { S: OpsState; missionId: string; conflicts: Conflict[]; openConflictId?: string; onOpenConflict: (id?: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  // Bring the drawer header into view when a new mission is selected.
  useEffect(() => {
    const el = ref.current;
    const sc = el?.closest('.overflow-auto') as HTMLElement | null;
    if (!el || !sc) return;
    const top = el.getBoundingClientRect().top;
    const limit = window.innerHeight - 260;
    if (top > limit) sc.scrollBy({ top: top - limit, behavior: 'smooth' });
  }, [missionId]);
  const m = S.missions.find((x) => x.id === missionId);
  if (!m) return null;
  const prof = MISSION_PROFILES[m.type];
  const mine = conflicts.filter((c) => c.missionIds.includes(m.id)).sort((a, b) => Number(b.blocking) - Number(a.blocking));
  const permit = permitFor(m, S.permits);
  const needs = permitRequired(m, S.zones);
  const notams = zonesForMission(m, S.zones).filter((z) => z.activeFrom !== undefined && z.activeTo! > S.now);
  const units = m.assignedUnitIds.map((id) => S.units.find((u) => u.id === id)).filter(Boolean);
  const crews = m.crewIds.map((id) => S.crews.find((c) => c.id === id)).filter(Boolean);
  const payloads = m.payloadIds.map((id) => S.payloads.find((p) => p.id === id)).filter(Boolean);
  const canShift = m.status !== 'active' && m.status !== 'completed';
  const client = CLIENTS.find((c) => c.id === m.clientId);

  return (
    <section ref={ref} className="panel" style={{ borderTop: '2px solid var(--view-accent)' }}>
      <header className="flex items-center gap-2 px-3 h-10 border-b border-line">
        <span className="idx">03.3 ·</span>
        <i className="w-2.5 h-2.5" style={{ background: prof.color }} />
        <span className="num text-[11px] text-muted">{m.code}</span>
        <h3 className="text-[12.5px] font-bold text-white truncate">{m.name}</h3>
        <span className={cx('text-[11px] whitespace-nowrap hidden sm:inline', TONE_TEXT[MISSION_STATUS[m.status].tone])}>{MISSION_STATUS[m.status].label}</span>
        {m.priority !== 'routine' && <span className={cx('text-[11px] whitespace-nowrap hidden sm:inline', TONE_TEXT[PRIORITY[m.priority].tone])}>· {PRIORITY[m.priority].label}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10.5px] text-dim hidden md:inline">Shift</span>
          <button className="btn h-7 px-2" disabled={!canShift} onClick={() => actions.shiftMission(m.id, -HOUR)} title="Shift mission 1 h earlier">
            <Icon name="chevron-left" size={12} /> 1 h
          </button>
          <button className="btn h-7 px-2" disabled={!canShift} onClick={() => actions.shiftMission(m.id, HOUR)} title="Shift mission 1 h later">
            1 h <Icon name="chevron-right" size={12} />
          </button>
          <button className="text-dim hover:text-white ml-1" onClick={onClose} aria-label="Close detail">
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-[20fr_23fr_20fr]">
        {/* Facts */}
        <div className="p-3 border-b lg:border-b-0 lg:border-r border-line min-w-0">
          <div className="label mb-1">Schedule</div>
          <KV k="Start" v={<><Stamp ts={m.scheduledStart} /> <span className="text-dim">· {fmtRel(m.scheduledStart, S.now)}</span></>} />
          <KV k="End" v={<Stamp ts={m.scheduledEnd} />} />
          <KV k="Duration" v={fmtDur(m.scheduledEnd - m.scheduledStart)} />
          <KV k="SLA due" v={<span className={m.slaDue < m.scheduledEnd ? 'text-alert' : ''}><Stamp ts={m.slaDue} /></span>} />
          {m.cadenceDays && <KV k="SLA cadence" v={`every ${m.cadenceDays} d`} />}
          {m.status === 'active' && (
            <div className="mt-1.5">
              <div className="flex justify-between text-[10.5px] text-dim">
                <span>Progress</span>
                <span className="num text-white">{Math.round(m.progress * 100)}%</span>
              </div>
              <Meter value={m.progress} max={1} color={prof.color} />
            </div>
          )}
          <div className="label mt-3 mb-1">Resources</div>
          <KV k="Units" v={units.length ? units.map((u) => `${u!.callsign}`).join(', ') : <span className="text-warn">unassigned</span>} mono={false} />
          {units[0] && <KV k="Airframe" v={AIRFRAME[units[0]!.modelId].name} mono={false} />}
          <KV k="Crew" v={crews.length ? crews.map((c) => c!.name).join(', ') : <span className="text-warn">none rostered</span>} mono={false} />
          <KV k="Payloads" v={payloads.length ? payloads.map((p) => `${PAYLOAD_META[p!.type].short} ${p!.serial}`).join(', ') : m.requiredPayloads.map((t) => PAYLOAD_META[t].short).join(', ') || '—'} />
          <KV k="Client" v={client?.name ?? m.clientId} mono={false} />
          <div className="label mt-3 mb-1">Airspace</div>
          {permit ? (
            <div className="flex items-center gap-2 text-[11px]">
              <Badge tone={PERMIT_TONE[permit.status]}>{permit.status}</Badge>
              <span className="text-muted truncate">{permit.kind}</span>
              <span className="num text-text ml-auto truncate">{permit.ref}</span>
            </div>
          ) : needs ? (
            <div className="text-[11px] text-alert flex items-center gap-1.5">
              <Icon name="octagon-alert" size={12} /> Clearance required — none filed
            </div>
          ) : (
            <div className="text-[11px] text-dim">No clearance required (VLOS, uncontrolled ≤ 400 ft)</div>
          )}
          {notams.map((z) => (
            <div key={z.id} className="text-[10.5px] text-alert mt-1 flex items-center gap-1.5">
              <Icon name="ban" size={11} /> <span className="num">{z.ref}</span> <span className="truncate text-muted">{z.name}</span> <span className="ml-auto num shrink-0">{fmtRel(z.activeFrom!, S.now)}</span>
            </div>
          ))}
          {m.notes && <div className="mt-3 text-[11px] text-muted italic border-l border-line-2 pl-2 leading-snug">{m.notes}</div>}
        </div>

        {/* Conflicts */}
        <div className="border-b lg:border-b-0 lg:border-r border-line min-w-0">
          <div className="flex items-center gap-2 px-3 h-8 border-b border-line">
            <span className="label">Conflicts</span>
            <span className={cx('num text-[11px]', mine.some((c) => c.blocking) ? 'text-alert' : mine.length ? 'text-warn' : 'text-ok')}>{mine.length}</span>
            {mine.some((c) => c.blocking) && <span className="text-[10.5px] font-semibold text-alert">Dispatch blocked</span>}
          </div>
          {mine.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11.5px] text-ok flex flex-col items-center gap-1.5">
              <Icon name="circle-check" size={20} /> No conflicts — clear to dispatch at scheduled start.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {mine.map((c) => {
                const open = openConflictId === c.id;
                const tone = c.severity === 'critical' ? 'alert' : 'warn';
                return (
                  <button key={c.id} onClick={() => onOpenConflict(open ? undefined : c.id)} className={cx('w-full text-left px-3 py-2 border-b border-line block', open ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]')}>
                    <div className="flex items-center gap-1.5">
                      <Icon name={CONFLICT_ICON[c.kind]} size={12} className={tone === 'alert' ? 'text-alert' : 'text-warn'} />
                      <span className="label">{CONFLICT_LABEL[c.kind]}</span>
                      {c.blocking && <span className="text-[10px] font-semibold text-alert ml-auto">Blocking</span>}
                    </div>
                    <div className="text-[12px] font-semibold text-white mt-0.5 leading-snug">{c.title}</div>
                    <div className="text-[11px] text-dim leading-snug mt-0.5">{c.detail}</div>
                    <div className={cx('mt-1.5 text-[11px] leading-snug', open ? 'text-white' : 'text-muted')}>
                      <span className="text-live font-semibold">Resolution → </span>
                      {c.resolution}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ETA */}
        <div className="p-3 min-w-0">
          <DeploymentCalculator missionId={m.id} compact limit={4} />
        </div>
      </div>
    </section>
  );
}
