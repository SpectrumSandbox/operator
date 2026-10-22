import { Fragment, useMemo, useState } from 'react';
import type { Base, CalStatus, Mission, Payload, PayloadType, Unit } from '../../types';
import { CAL_DUE_SOON_DAYS, CAL_STATUS, MISSION_STATUS, PAYLOAD_META, PAYLOAD_TYPES, type Tone } from '../../data/catalog';
import { actions } from '../../store';
import { Empty, Icon, Meter, Panel, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { KpiCell, KpiStrip } from '../analytics/parts';
import { DAY } from '../../lib/time';
import { StatusText, calCountdown, calStatus } from './shared';

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
      <KpiStrip label="Filter payloads by calibration state">
        <KpiCell label="payloads" value={payloads.length} onClick={() => setFilter('all')} active={filter === 'all'} title={`${PAYLOAD_TYPES.length} sensor / module families`} />
        <KpiCell label="calibrated" value={counts.calibrated} dot="ok" onClick={() => toggle('calibrated')} active={filter === 'calibrated'} title="Within calibration interval" />
        <KpiCell label="due soon" value={counts['due-soon']} tone={counts['due-soon'] ? 'warn' : undefined} dot="warn" onClick={() => toggle('due-soon')} active={filter === 'due-soon'} title={`≤ ${CAL_DUE_SOON_DAYS} days to due date`} />
        <KpiCell label="expired" value={counts.expired} tone={counts.expired ? 'alert' : undefined} dot="alert" onClick={() => toggle('expired')} active={filter === 'expired'} title="Not fit for data capture" />
        <KpiCell
          label="needed by missions"
          value={counts.needed}
          extra={counts.neededRisk ? <span className="num text-[10.5px] text-warn">{counts.neededRisk} at risk</span> : undefined}
          onClick={() => toggle('needed')}
          active={filter === 'needed'}
          title={counts.neededRisk ? `${counts.neededRisk} needed payloads are not calibrated` : 'All needed payloads calibrated'}
        />
        <KpiCell label="cal. booked" value={counts.booked} onClick={() => toggle('booked')} active={filter === 'booked'} title="Calibration slots booked via the AI schedule proposal" hide="lg" />
      </KpiStrip>

      <Panel
        title="Payload & Sensor Calibration"
        index="B"
        className="flex-1 min-h-[420px] @container"
        bodyClassName="flex flex-col min-h-0"
        actions={<span className="num text-[10.5px] text-dim">{visible.length === payloads.length ? payloads.length : `${visible.length} / ${payloads.length}`}</span>}
      >
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-line shrink-0">
          <button className={cx('pill', type === 'all' && 'pill-on')} onClick={() => setType('all')}>
            All types
          </button>
          {PAYLOAD_TYPES.map((t) => (
            <button key={t} className={cx('pill gap-1.5', type === t && 'pill-on')} onClick={() => setType(type === t ? 'all' : t)} title={PAYLOAD_META[t].label}>
              {PAYLOAD_META[t].short}
              <span className="num text-[10px] opacity-60">{payloads.filter((p) => p.type === t).length}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {groups.length === 0 ? (
            <Empty icon="funnel" text="No payloads match this filter" />
          ) : (
            <table className="tbl text-[11.5px] [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th className="@max-[900px]:hidden">Model</th>
                  <th>Mounted</th>
                  <th className="@max-[1240px]:hidden">Last cal.</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="min-w-[150px] @max-[1320px]:hidden">Lifecycle / link</th>
                  <th className="@max-[720px]:hidden">Needed by</th>
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
                        <td colSpan={9} className="!bg-bg-deep/60 !py-1.5">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-semibold text-text">{meta.label}</span>
                            <span className="text-dim truncate">
                              {meta.calType} · <span className="num">{meta.intervalDays} d</span>
                            </span>
                            <span className="ml-auto flex items-center gap-3 num text-[10.5px]">
                              {soon > 0 && <span className="text-warn">{soon} due soon</span>}
                              {exp > 0 && <span className="text-alert">{exp} expired</span>}
                              <span className="text-dim">{g.items.length}</span>
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
                        return (
                          <tr key={p.id} className={cx(risk && 'bg-alert/[0.05]')}>
                            <td className={cx('num text-text', risk && 'shadow-[inset_2px_0_0_#ff4d55]')} title={p.model}>
                              {p.serial}
                            </td>
                            <td className="max-w-[200px] truncate text-muted @max-[900px]:hidden" title={p.model}>
                              {p.model}
                            </td>
                            <td className="max-w-[160px] truncate" title={b?.name}>
                              {u ? (
                                <button className="font-semibold text-text hover:underline underline-offset-2" onClick={() => onOpenUnit(u.id)} title={`${u.callsign} · ${b?.name ?? ''} — show in registry`}>
                                  {u.callsign}
                                </button>
                              ) : (
                                <span className="text-dim">In store · {b?.name}</span>
                              )}
                            </td>
                            <td className="text-muted @max-[1240px]:hidden" title={`${Math.floor((now - p.lastCal) / DAY)} d ago`}>
                              <Stamp ts={p.lastCal} mode="date" />
                            </td>
                            <td>
                              <span className="text-muted">
                                <Stamp ts={p.calDue} mode="date" />
                              </span>
                              <span className={cx('num text-[10.5px] ml-2', tone === 'ok' ? 'text-dim' : TONE_TEXT[tone])}>{calCountdown(p, now)}</span>
                            </td>
                            <td>
                              <StatusText tone={tone} label={CAL_STATUS[cs].label} />
                            </td>
                            <td className="@max-[1320px]:hidden">
                              {p.lifecycle ? (
                                <LifeMeter label={p.lifecycle.label} value={p.lifecycle.value} limit={p.lifecycle.limit} />
                              ) : p.health ? (
                                <HealthLine items={p.health} />
                              ) : (
                                <span className="text-[10.5px] text-dim">—</span>
                              )}
                            </td>
                            <td className="@max-[720px]:hidden">
                              {need ? (
                                <span title={need.map((m) => `${m.code} · ${m.name}`).join('\n')}>
                                  <span className={cx('num text-[11px]', risk ? 'text-alert' : 'text-text')}>{need[0].code}</span>
                                  {need.length > 1 && <span className="num text-[10px] text-dim"> +{need.length - 1}</span>}
                                  <span className="text-[10.5px] text-dim ml-1.5">{need[0].status === 'active' ? <span className="text-live">{MISSION_STATUS.active.label.toLowerCase()}</span> : <Stamp ts={need[0].scheduledStart} />}</span>
                                </span>
                              ) : (
                                <span className="text-dim">—</span>
                              )}
                            </td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {bk && (
                                  <span className="text-live" title={`Calibration slot booked by the AI schedule proposal`}>
                                    <Icon name="calendar-days" size={12} />
                                  </span>
                                )}
                                <button className={cx('btn h-6 px-2 text-[10px]', cs !== 'calibrated' ? 'btn-solid' : 'border-transparent text-dim hover:text-text')} onClick={() => actions.recalibrate(p.id)} title={`Record ${p.calType.toLowerCase()} as completed now`}>
                                  Record cal.
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
    <div className="flex items-center gap-2 text-[10.5px]" title={`${label}: ${value.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`}>
      <Meter value={value} max={limit} tone={tone} height={3} className="!w-[56px] shrink-0" />
      <span className={cx('num', tone === 'ok' ? 'text-muted' : TONE_TEXT[tone])}>{Math.round(r * 100)}%</span>
      <span className="text-dim truncate">{label}</span>
    </div>
  );
}

function HealthLine({ items }: { items: { label: string; value: string; ok: boolean }[] }) {
  const bad = items.filter((h) => !h.ok);
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[10.5px]', bad.length ? 'text-alert' : 'text-muted')} title={items.map((h) => `${h.ok ? '✓' : '✗'} ${h.label}: ${h.value}`).join('\n')}>
      <Icon name={bad.length ? 'circle-x' : 'circle-check'} size={11} className={bad.length ? 'text-alert' : 'text-ok'} />
      {bad.length ? `${bad[0].label} ${bad[0].value}${bad.length > 1 ? ` +${bad.length - 1}` : ''}` : `${items.length} link checks OK`}
    </span>
  );
}
