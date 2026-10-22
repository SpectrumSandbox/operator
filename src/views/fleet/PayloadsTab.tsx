import { Fragment, useMemo, useState } from 'react';
import type { Base, CalStatus, Mission, Payload, PayloadType, Unit } from '../../types';
import { CAL_DUE_SOON_DAYS, CAL_STATUS, MISSION_STATUS, PAYLOAD_META, PAYLOAD_TYPES, type Tone } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Empty, Icon, Kpi, Meter, Panel, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { DAY } from '../../lib/time';
import { calCountdown, calStatus } from './shared';

type Filter = CalStatus | 'all' | 'needed' | 'booked';

export function PayloadsTab({
  payloads,
  units,
  bases,
  missions,
  calBookings,
  now,
  onOpenUnit,
}: {
  onOpenUnit: (id: string) => void;
  payloads: Payload[];
  units: Unit[];
  bases: Base[];
  missions: Mission[];
  calBookings: { payloadId: string; at: number; missionId?: string }[];
  now: number;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [type, setType] = useState<PayloadType | 'all'>('all');
  const dayKey = Math.floor(now / (10 * 60_000));

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const baseById = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);
  const booking = useMemo(() => new Map(calBookings.map((b) => [b.payloadId, b])), [calBookings]);

  /** Upcoming (non-completed) missions on the mounted unit that require this payload type. */
  const neededBy = useMemo(() => {
    const out = new Map<string, Mission[]>();
    const open = missions.filter((m) => m.status !== 'completed');
    for (const p of payloads) {
      if (!p.unitId) continue;
      const ms = open.filter((m) => m.requiredPayloads.includes(p.type) && (m.assignedUnitIds.includes(p.unitId!) || m.payloadIds.includes(p.id))).sort((a, b) => a.scheduledStart - b.scheduledStart);
      if (ms.length) out.set(p.id, ms);
    }
    return out;
  }, [payloads, missions]);

  const rows = useMemo(
    () =>
      payloads.map((p) => ({ p, cs: calStatus(p, now) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payloads, dayKey],
  );
  const counts = useMemo(() => {
    const c = { calibrated: 0, 'due-soon': 0, expired: 0, needed: 0, neededRisk: 0, booked: 0 };
    for (const r of rows) {
      c[r.cs]++;
      if (neededBy.has(r.p.id)) {
        c.needed++;
        if (r.cs !== 'calibrated') c.neededRisk++;
      }
      if (booking.has(r.p.id)) c.booked++;
    }
    return c;
  }, [rows, neededBy, booking]);

  const visible = rows.filter((r) => {
    if (type !== 'all' && r.p.type !== type) return false;
    if (filter === 'all') return true;
    if (filter === 'needed') return neededBy.has(r.p.id);
    if (filter === 'booked') return booking.has(r.p.id);
    return r.cs === filter;
  });
  const order: Record<CalStatus, number> = { expired: 0, 'due-soon': 1, calibrated: 2 };
  const groups = PAYLOAD_TYPES.map((t) => ({ t, items: visible.filter((r) => r.p.type === t).sort((a, b) => order[a.cs] - order[b.cs] || a.p.calDue - b.p.calDue) })).filter((g) => g.items.length);
  const toggle = (f: Filter) => setFilter(filter === f ? 'all' : f);

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 shrink-0">
        <Kpi label="Payloads tracked" value={payloads.length} icon="boxes" onClick={() => setFilter('all')} active={filter === 'all'} sub={`${PAYLOAD_TYPES.length} sensor / module families`} />
        <Kpi label="Calibrated" value={counts.calibrated} tone="ok" icon="circle-check" onClick={() => toggle('calibrated')} active={filter === 'calibrated'} sub="within interval" />
        <Kpi label="Due soon" value={counts['due-soon']} tone="warn" icon="clock" onClick={() => toggle('due-soon')} active={filter === 'due-soon'} sub={`≤ ${CAL_DUE_SOON_DAYS} days to due date`} />
        <Kpi label="Expired" value={counts.expired} tone="alert" icon="circle-x" onClick={() => toggle('expired')} active={filter === 'expired'} sub="not fit for data capture" />
        <Kpi label="Needed by missions" value={counts.needed} tone={counts.neededRisk ? 'warn' : 'live'} icon="target" onClick={() => toggle('needed')} active={filter === 'needed'} sub={counts.neededRisk ? `${counts.neededRisk} not calibrated` : 'all calibrated'} />
        <Kpi label="Calibration booked" value={counts.booked} tone="live" icon="calendar-days" onClick={() => toggle('booked')} active={filter === 'booked'} sub="via AI schedule proposal" />
      </div>

      <Panel
        title="Modular Payload & Sensor Calibration Tracker"
        index="B"
        icon="aperture"
        subtitle={`${visible.length} shown`}
        className="flex-1 min-h-[420px]"
        bodyClassName="flex flex-col min-h-0"
      >
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-line shrink-0">
          <button className={cx('pill', type === 'all' && 'pill-on')} onClick={() => setType('all')}>
            All types
          </button>
          {PAYLOAD_TYPES.map((t) => (
            <button key={t} className={cx('pill gap-1.5', type === t && 'pill-on')} onClick={() => setType(type === t ? 'all' : t)}>
              <Icon name={PAYLOAD_META[t].icon} size={11} />
              {PAYLOAD_META[t].short}
              <span className="num text-[10px] opacity-70">{payloads.filter((p) => p.type === t).length}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {groups.length === 0 ? (
            <Empty icon="funnel" text="No payloads match this filter" />
          ) : (
            <table className="tbl text-[11.5px]">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Model</th>
                  <th>Mounted / base</th>
                  <th>Last calibration</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="min-w-[170px]">Lifecycle / link health</th>
                  <th>Upcoming need</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const meta = PAYLOAD_META[g.t];
                  const exp = g.items.filter((r) => r.cs === 'expired').length;
                  const soon = g.items.filter((r) => r.cs === 'due-soon').length;
                  return (
                    <Fragment key={g.t}>
                      <tr>
                        <td colSpan={9} className="!bg-bg-deep/70 !py-2 border-t border-line-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon name={meta.icon} size={13} className="text-muted" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white">{meta.label}</span>
                            <span className="text-[11px] text-muted">· {meta.calType}</span>
                            <span className="num text-[10.5px] text-dim">· interval {meta.intervalDays} d</span>
                            <span className="ml-auto flex items-center gap-1.5">
                              <span className="num text-[10.5px] text-dim">{g.items.length} units</span>
                              {soon > 0 && <Badge tone="warn">{soon} due soon</Badge>}
                              {exp > 0 && <Badge tone="alert">{exp} expired</Badge>}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {g.items.map(({ p, cs }) => {
                        const u = p.unitId ? unitById.get(p.unitId) : undefined;
                        const b = baseById.get(p.baseId);
                        const need = neededBy.get(p.id);
                        const bk = booking.get(p.id);
                        const risk = need && cs !== 'calibrated';
                        const tone: Tone = CAL_STATUS[cs].tone;
                        const intervalMs = p.calDue - p.lastCal;
                        const elapsed = Math.max(0, Math.min(1, (now - p.lastCal) / intervalMs));
                        return (
                          <tr key={p.id} className={cx(risk && 'bg-alert/[0.05]')}>
                            <td className={cx('num text-text whitespace-nowrap', risk && 'shadow-[inset_2px_0_0_#ff4d55]')}>{p.serial}</td>
                            <td className="max-w-[200px] truncate text-text" title={p.model}>
                              {p.model}
                            </td>
                            <td className="whitespace-nowrap">
                              {u ? (
                                <button
                                  className="text-left hover:underline underline-offset-2"
                                  onClick={() => onOpenUnit(u.id)}
                                  title="Show unit in registry"
                                >
                                  <span className="font-semibold text-text">{u.callsign}</span>
                                </button>
                              ) : (
                                <span className="text-idle text-[10.5px] uppercase tracking-wider">In store</span>
                              )}
                              <div className="text-[10.5px] text-dim leading-tight">{b?.name}</div>
                            </td>
                            <td className="whitespace-nowrap">
                              <Stamp ts={p.lastCal} mode="date" />
                              <div className="num text-[10.5px] text-dim leading-tight">{Math.floor((now - p.lastCal) / DAY)} d ago</div>
                            </td>
                            <td className="whitespace-nowrap min-w-[110px]">
                              <div className="flex items-baseline gap-2">
                                <Stamp ts={p.calDue} mode="date" />
                                <span className={cx('num text-[10.5px]', TONE_TEXT[tone])}>{calCountdown(p, now)}</span>
                              </div>
                              <Meter value={elapsed} max={1} tone={tone} height={2} className="mt-1" />
                            </td>
                            <td>
                              <Badge tone={tone} dot>
                                {CAL_STATUS[cs].label}
                              </Badge>
                            </td>
                            <td>
                              {p.lifecycle ? (
                                <LifeMeter label={p.lifecycle.label} value={p.lifecycle.value} limit={p.lifecycle.limit} />
                              ) : p.health ? (
                                <ul className="space-y-0.5">
                                  {p.health.map((h) => (
                                    <li key={h.label} className="flex items-center gap-1.5 text-[10.5px]">
                                      <Icon name={h.ok ? 'circle-check' : 'circle-x'} size={10} className={h.ok ? 'text-ok' : 'text-alert'} />
                                      <span className="text-dim">{h.label}</span>
                                      <span className={cx('num ml-auto', h.ok ? 'text-muted' : 'text-alert')}>{h.value}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-[10.5px] text-dim">{p.calType}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap">
                              {need ? (
                                <div>
                                  <span className={cx('num text-[11px]', risk ? 'text-alert' : 'text-live')}>{need[0].code}</span>
                                  {need.length > 1 && <span className="num text-[10px] text-dim"> +{need.length - 1}</span>}
                                  <div className="text-[10.5px] text-dim leading-tight">
                                    {need[0].status === 'active' ? <span className="text-live">{MISSION_STATUS.active.label} now</span> : <>starts <Stamp ts={need[0].scheduledStart} /></>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-dim">—</span>
                              )}
                            </td>
                            <td className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                {bk && (
                                  <span className="flex items-center gap-1 text-[10px] text-live uppercase tracking-wider" title="Calibration slot booked by the AI schedule proposal">
                                    <Icon name="calendar-days" size={11} /> <Stamp ts={bk.at} />
                                  </span>
                                )}
                                <button className={cx('btn h-6 px-2 text-[10px]', cs !== 'calibrated' && 'btn-solid')} onClick={() => actions.recalibrate(p.id)} title={`Record ${p.calType.toLowerCase()} as completed now`}>
                                  <Icon name="clipboard-check" size={11} /> Record cal.
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}

function LifeMeter({ label, value, limit }: { label: string; value: number; limit: number }) {
  const r = value / limit;
  const tone: Tone = r >= 0.9 ? 'alert' : r >= 0.75 ? 'warn' : 'ok';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
        <span className="text-dim">{label}</span>
        <span className="num text-muted">
          <span className={TONE_TEXT[tone]}>{value.toLocaleString('en-US')}</span>
          <span className="text-dim"> / {limit.toLocaleString('en-US')}</span>
        </span>
      </div>
      <Meter value={value} max={limit} tone={tone} height={3} className="mt-1" />
    </div>
  );
}
