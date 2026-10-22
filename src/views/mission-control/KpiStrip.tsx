// Mission Control — live KPI strip.
import { useMemo } from 'react';
import { useOpsState } from '../../store';
import { missionEta } from '../../engine/eta';
import { Kpi, cx } from '../../ui/kit';
import { DAY, MIN, fmtDur, startOfDay } from '../../lib/time';
import { SERVICEABLE, type QueueState } from './util';

export function KpiStrip({ queue, setQueue }: { queue: QueueState; setQueue: (q: Partial<QueueState>) => void }) {
  const S = useOpsState();
  const minute = Math.floor(S.now / MIN);

  const inFlight = S.units.filter((u) => u.status === 'in-flight').length;
  const transit = S.units.filter((u) => u.status === 'in-transit').length;
  const serviceable = S.units.filter(SERVICEABLE).length;
  const total = S.units.length;
  const readiness = total ? serviceable / total : 0;

  const air = useMemo(() => {
    const timed = S.zones.filter((z) => z.activeFrom !== undefined && z.activeTo !== undefined);
    const active = timed.filter((z) => z.activeFrom! <= S.now && z.activeTo! >= S.now);
    const next = timed.filter((z) => z.activeFrom! > S.now).sort((a, b) => a.activeFrom! - b.activeFrom!)[0];
    const pending = S.permits.filter((p) => p.status === 'pending' && S.missions.find((m) => m.id === p.missionId)?.status !== 'completed');
    return { active: active.length, pending: pending.length, next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, S.zones, S.permits]);

  const holds = S.missions.filter((m) => m.status === 'hold-weather').length;
  const airHolds = S.missions.filter((m) => m.status === 'hold-airspace').length;

  const running = S.pipelines.filter((r) => r.steps.some((st) => st.status === 'running')).length;
  const quarantined = S.pipelines.filter((r) => r.quarantine).length;

  const sla = useMemo(() => {
    const ms = S.missions.filter((m) => m.status !== 'request' && m.status !== 'completed');
    let met = 0;
    for (const m of ms) {
      const e = missionEta(m, S);
      if (e && isFinite(e.completion) && e.completion <= m.slaDue) met++;
    }
    return { met, total: ms.length, pct: ms.length ? met / ms.length : 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, S.weatherSeverity, S.kpIndex, S.masterVersion, S.missions.map((m) => m.status + m.assignedUnitIds.join()).join()]);

  const hist = useMemo(() => {
    const today = startOfDay(S.now);
    let met = 0;
    let tot = 0;
    let met30 = 0;
    let tot30 = 0;
    for (const r of S.history) {
      if (r.day >= today || r.day < today - 30 * DAY) continue;
      met30 += r.slaMet;
      tot30 += r.slaTotal;
      if (r.day >= today - 7 * DAY) {
        met += r.slaMet;
        tot += r.slaTotal;
      }
    }
    return { pct7: tot ? met / tot : 1, pct30: tot30 ? met30 / tot30 : 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(S.now / DAY), S.history]);

  const slaTone = sla.pct >= 0.9 ? 'ok' : sla.pct >= 0.75 ? 'warn' : 'alert';
  const toggleTab = (tab: QueueState['tab'], status: QueueState['status'] = 'all') =>
    setQueue(queue.tab === tab && queue.status === status ? { tab: 'all', status: 'all' } : { tab, status });

  return (
    <div className="grid grid-cols-3 xl:grid-cols-6 border-b border-line bg-card shrink-0">
      <Kpi
        label="Active sorties"
        icon="plane"
        tone="live"
        value={inFlight}
        unit="airborne"
        sub={
          <span>
            <span className="num text-muted">{transit}</span> in transit · <span className="num text-muted">{S.missions.filter((m) => m.status === 'active').length}</span> missions live
          </span>
        }
        onClick={() => toggleTab('missions', 'active')}
        active={queue.tab === 'missions' && queue.status === 'active'}
      />
      <Kpi
        label="Fleet readiness"
        icon="shield-check"
        tone={readiness >= 0.85 ? 'ok' : readiness >= 0.7 ? 'warn' : 'alert'}
        value={Math.round(readiness * 100)}
        unit="%"
        sub={
          <span>
            <span className="num text-muted">
              {serviceable}/{total}
            </span>{' '}
            serviceable
          </span>
        }
        onClick={() => toggleTab('fleet')}
        active={queue.tab === 'fleet'}
      />
      <Kpi
        label="Airspace advisories"
        icon="tower-control"
        tone={air.active + air.pending > 0 ? 'warn' : 'ok'}
        value={air.active + air.pending}
        unit={`${air.active} NOTAM/TFR · ${air.pending} permit${air.pending === 1 ? '' : 's'}`}
        sub={air.next ? <span>Next: <span className="num text-muted">{air.next.ref}</span> in <span className="num text-muted">{fmtDur(air.next.activeFrom! - S.now)}</span></span> : 'No upcoming activations'}
        onClick={() => toggleTab('missions', 'hold')}
        active={queue.tab === 'missions' && queue.status === 'hold'}
      />
      <Kpi
        label="Weather-hold missions"
        icon="cloud-lightning"
        tone={holds ? 'warn' : 'ok'}
        value={holds}
        unit={holds === 1 ? 'mission' : 'missions'}
        sub={`+${airHolds} airspace · ${holds ? 'units RTL' : 'windows open'}`}
        onClick={() => toggleTab('flags')}
        active={queue.tab === 'flags'}
      />
      <Kpi
        label="Data pipelines running"
        icon="database"
        tone="live"
        value={running}
        unit={`of ${S.pipelines.length}`}
        sub={
          <span className={cx(quarantined > 0 && 'text-alert/90')}>
            <span className="num">{quarantined}</span> quarantined
          </span>
        }
        onClick={() => (location.hash = '#/telemetry')}
      />
      <div className="relative min-w-0">
        <Kpi
          label="On-time SLA"
          icon="timer"
          tone={slaTone}
          value={Math.round(sla.pct * 100)}
          unit={`% · ${sla.met}/${sla.total}`}
          sub={
            <span>
              7d <span className="num text-muted">{(hist.pct7 * 100).toFixed(1)}%</span> · 30d <span className="num text-muted">{(hist.pct30 * 100).toFixed(1)}%</span>
            </span>
          }
        />
      </div>
    </div>
  );
}
