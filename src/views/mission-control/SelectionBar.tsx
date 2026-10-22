// Mission Control — glass selection card over the map: selected mission and
// its top deployable candidates (mirrors the transit vectors drawn on the map).
import { useMemo } from 'react';
import { actions, useOpsState } from '../../store';
import { MISSION_HEALTH, MISSION_PROFILES, MISSION_STATUS, TRANSPORT_ICON } from '../../data/catalog';
import { missionHealth } from '../../engine/health';
import { detectConflicts } from '../../engine/conflicts';
import { Badge, Icon, cx } from '../../ui/kit';
import { fmtDur } from '../../lib/time';
import { TRANSPORT_COLOR, TRANSPORT_SHORT, slaText, topCandidates } from './util';

export function SelectionBar() {
  const S = useOpsState();
  const m = S.missions.find((x) => x.id === S.selectedMissionId);
  const minute = Math.floor(S.now / 60_000);
  const cands = useMemo(
    () => topCandidates(m, S),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m?.id, m?.status, m?.assignedUnitIds.join(), minute, S.weatherSeverity, S.kpIndex, S.masterVersion],
  );
  const health = useMemo(
    () => (m ? missionHealth(m, detectConflicts(S), S) : 'nominal'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m?.id, m?.status, minute, S.weatherSeverity],
  );
  if (!m) return null;
  const prof = MISSION_PROFILES[m.type];
  const st = MISSION_STATUS[m.status];
  const h = MISSION_HEALTH[health];
  const sla = slaText(m.slaDue, S.now);
  const unit = (id: string) => S.units.find((u) => u.id === id);
  return (
    <div className="glass pointer-events-auto min-w-[min(100%,420px)] flex-1 max-w-[680px] ml-auto">
      <div className="flex items-center gap-2 px-2.5 h-8 border-b border-line">
        <span className="w-[3px] h-4 shrink-0" style={{ background: h.color }} />
        <Icon name={prof.icon} size={12} style={{ color: prof.color }} className="shrink-0" />
        <span className="num text-[10.5px] text-muted shrink-0">{m.code}</span>
        <span className="text-[12px] font-semibold text-white truncate">{m.name}</span>
        <Badge tone={st.tone} className="h-[17px] px-1 text-[9px] shrink-0">
          {st.label}
        </Badge>
        <span className={cx('num text-[10.5px] shrink-0', sla.late ? 'text-alert' : sla.soon ? 'text-warn' : 'text-muted')}>SLA {sla.text}</span>
        <button onClick={() => actions.selectMission(undefined)} className="ml-auto -mr-1 w-6 h-6 flex items-center justify-center text-dim hover:text-white shrink-0" aria-label="Clear mission selection" title="Clear selection">
          <Icon name="x" size={13} />
        </button>
      </div>
      {cands.length > 0 ? (
        <div className="flex">
          {cands.map((c, i) => {
            const u = unit(c.unitId);
            if (!u) return null;
            const eta = c.deployEta - S.now;
            return (
              <button
                key={c.unitId}
                onClick={() => actions.selectUnit(u.id)}
                className={cx('basis-0 flex-col justify-center min-w-0', i === 0 ? 'flex-[1.4]' : 'flex-1', 'px-2.5 py-1 border-r border-line last:border-r-0 text-left transition-colors', i >= 3 ? 'hidden min-[1500px]:flex' : 'flex', i === 0 ? 'bg-white/[0.08] hover:bg-white/[0.12]' : 'hover:bg-white/[0.05]', S.selectedUnitId === u.id && 'outline outline-1 outline-white/60 -outline-offset-1')}
                title={`${u.callsign} — Deployment ETA ${fmtDur(eta)} · earliest completion ${fmtDur(c.completion - S.now)} (${c.completion <= m.slaDue ? 'within SLA' : 'past SLA'}) · ${TRANSPORT_SHORT[c.transit.mode]} ${Math.round(c.transit.distKm)} km`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {i === 0 ? <span className="text-[8.5px] font-bold tracking-[0.1em] px-1 bg-white text-ink shrink-0">REC</span> : <span className="num text-[9.5px] text-dim shrink-0">{i + 1}</span>}
                  <span className="text-[11px] font-bold text-white truncate">{u.callsign}</span>
                </span>
                <span className="flex items-center gap-1 num text-[10px] min-w-0">
                  <Icon name={TRANSPORT_ICON[c.transit.mode]} size={10} style={{ color: TRANSPORT_COLOR[c.transit.mode] }} className="shrink-0" />
                  <span className="text-live truncate">ETA {eta <= 60_000 ? 'now' : fmtDur(eta)}</span>
                  <span className={cx('ml-auto w-1.5 h-1.5 rounded-full shrink-0', c.completion <= m.slaDue ? 'bg-ok' : 'bg-warn')} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-1.5 text-[11px] text-dim">{m.status === 'completed' ? 'Mission completed — no deployment required.' : 'No feasible unit inside the 8-day planning horizon.'}</div>
      )}
    </div>
  );
}
