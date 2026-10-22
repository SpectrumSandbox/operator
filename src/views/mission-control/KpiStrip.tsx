// Mission Control — live KPI strip: one quiet 40 px row. Each KPI is a label and
// a mono value; secondary detail lives in the tooltip. Clicking a KPI filters the
// work queue. Lower-priority KPIs drop out on narrow screens instead of wrapping.
import { useMemo } from 'react';
import { useOpsState } from '../../store';
import { missionEta } from '../../engine/eta';
import { Icon, TONE_TEXT, cx, type IconName, type Tone } from '../../ui/kit';
import { DAY, MIN, fmtDur, startOfDay } from '../../lib/time';
import { SERVICEABLE, type QueueState } from './util';

function Cell({
  label,
  icon,
  value,
  unit,
  tone,
  title,
  onClick,
  active,
  className,
  unitClass,
}: {
  unitClass?: string;
  label: string;
  icon: IconName;
  value: string | number;
  unit?: string;
  tone: Tone;
  title: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!active : undefined}
      className={cx(
        'relative flex-[1_0_auto] items-center gap-2 h-10 px-2.5 min-[1100px]:px-3 min-w-0 border-r border-line last:border-r-0 text-left transition-colors whitespace-nowrap',
        onClick ? 'hover:bg-white/[0.035] cursor-pointer' : 'cursor-default',
        active && 'bg-white/[0.05]',
        className ?? 'flex',
      )}
    >
      <Icon name={icon} size={12} className="text-dim shrink-0" />
      <span className="label">{label}</span>
      <span className="flex items-baseline gap-1 ml-0.5">
        <span className={cx('num text-[15px] font-semibold leading-none', TONE_TEXT[tone])}>{value}</span>
        {unit && <span className={cx('num text-[10.5px] text-dim', unitClass)}>{unit}</span>}
      </span>
      {active && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: 'var(--view-accent, #5cc3ba)' }} />}
    </Tag>
  );
}

export function KpiStrip({ queue, onFilter }: { queue: QueueState; onFilter: (q: Partial<QueueState>) => void }) {
  const S = useOpsState();
  const minute = Math.floor(S.now / MIN);

  const inFlight = S.units.filter((u) => u.status === 'in-flight').length;
  const transit = S.units.filter((u) => u.status === 'in-transit').length;
  const liveMissions = S.missions.filter((m) => m.status === 'active').length;
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

  const slaTone: Tone = sla.pct >= 0.9 ? 'ok' : sla.pct >= 0.75 ? 'warn' : 'alert';
  const toggleTab = (tab: QueueState['tab'], status: QueueState['status'] = 'all') =>
    onFilter(queue.tab === tab && queue.status === status ? { tab: 'all', status: 'all' } : { tab, status });

  return (
    <div className="mc-kpis flex items-stretch border-b border-line bg-card shrink-0 overflow-x-auto overflow-y-hidden" role="toolbar" aria-label="Operational KPIs">
      <Cell
        label="Active sorties"
        icon="plane"
        tone="live"
        value={inFlight}
        unit="airborne"
        unitClass="hidden min-[1100px]:inline"
        title={`${inFlight} airborne · ${transit} in transit · ${liveMissions} missions live — click to filter active missions`}
        onClick={() => toggleTab('missions', 'active')}
        active={queue.tab === 'missions' && queue.status === 'active'}
      />
      <Cell
        label="Readiness"
        icon="shield-check"
        tone={readiness >= 0.85 ? 'ok' : readiness >= 0.7 ? 'warn' : 'alert'}
        value={`${Math.round(readiness * 100)}%`}
        unit={`${serviceable}/${total}`}
        title={`Fleet readiness — ${serviceable} of ${total} units serviceable · click for units needing attention`}
        onClick={() => toggleTab('fleet')}
        active={queue.tab === 'fleet'}
      />
      <Cell
        className="hidden min-[1000px]:flex"
        label="Airspace"
        icon="tower-control"
        tone={air.active + air.pending > 0 ? 'warn' : 'ok'}
        value={air.active + air.pending}
        unit="advisories"
        title={`${air.active} active NOTAM/TFR · ${air.pending} permit${air.pending === 1 ? '' : 's'} pending · ${air.next ? `next ${air.next.ref ?? air.next.name} activates in ${fmtDur(air.next.activeFrom! - S.now)}` : 'no upcoming activations'} — click to filter holds & delays`}
        onClick={() => toggleTab('missions', 'hold')}
        active={queue.tab === 'missions' && queue.status === 'hold'}
      />
      <Cell
        label="Weather holds"
        icon="cloud-lightning"
        tone={holds ? 'warn' : 'ok'}
        value={holds}
        unit={airHolds ? `+${airHolds} airspace` : undefined}
        unitClass="hidden min-[1100px]:inline"
        title={`${holds} mission${holds === 1 ? '' : 's'} on weather hold${holds ? ' (units RTL)' : ' · windows open'} · ${airHolds} on airspace hold — click for flags`}
        onClick={() => toggleTab('flags')}
        active={queue.tab === 'flags'}
      />
      <Cell
        className="hidden min-[1180px]:flex"
        label="Pipelines"
        icon="database"
        tone={quarantined ? 'warn' : 'live'}
        value={running}
        unit={`/${S.pipelines.length}${quarantined ? ` · ${quarantined} quar.` : ''}`}
        title={`${running} of ${S.pipelines.length} data pipelines running · ${quarantined} quarantined — open Telemetry & QA`}
        onClick={() => (location.hash = '#/telemetry')}
      />
      <Cell
        label="On-time SLA"
        icon="timer"
        tone={slaTone}
        value={`${Math.round(sla.pct * 100)}%`}
        unit={`${sla.met}/${sla.total}`}
        title={`${sla.met} of ${sla.total} open missions forecast inside SLA · trailing 7d ${(hist.pct7 * 100).toFixed(1)}% · 30d ${(hist.pct30 * 100).toFixed(1)}%`}
      />
    </div>
  );
}
