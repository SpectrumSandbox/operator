import { useMemo, useState } from 'react';
import type { Base, Crew, CrewCert, Mission } from '../../types';
import { MISSION_STATUS, type Tone } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Empty, Icon, Kpi, Meter, Panel, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { goMission } from './shared';

const CERTS: CrewCert[] = ['BVLOS', 'HeavyLift', 'Night', 'Maritime', 'Thermal', 'Agri-Spray', 'VTOL'];
const CREW_STATUS: Record<Crew['status'], { label: string; tone: Tone }> = {
  'in-field': { label: 'In Field', tone: 'live' },
  'on-duty': { label: 'On Duty', tone: 'ok' },
  rest: { label: 'Mandatory Rest', tone: 'warn' },
  'off-duty': { label: 'Off Duty', tone: 'idle' },
};
const dutyTone = (r: number): Tone => (r >= 1 ? 'alert' : r >= 0.8 ? 'warn' : 'ok');

export function CrewTab({ crews, bases, missions }: { crews: Crew[]; bases: Base[]; missions: Mission[] }) {
  const [cert, setCert] = useState<CrewCert | 'all'>('all');
  const [q, setQ] = useState('');
  const baseById = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);
  const byCrew = useMemo(() => {
    const out = new Map<string, Mission[]>();
    for (const m of missions) {
      if (m.status === 'completed') continue;
      for (const id of m.crewIds) out.set(id, [...(out.get(id) ?? []), m]);
    }
    for (const arr of out.values()) arr.sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || a.scheduledStart - b.scheduledStart);
    return out;
  }, [missions]);

  const query = q.trim().toLowerCase();
  const rows = crews.filter((c) => (cert === 'all' || c.certs.includes(cert)) && (!query || `${c.name} ${c.role} ${baseById.get(c.baseId)?.name ?? ''}`.toLowerCase().includes(query)));
  const stats = useMemo(() => {
    const inField = crews.filter((c) => c.status === 'in-field').length;
    const pics = crews.filter((c) => c.role === 'PIC').length;
    const nearDuty = crews.filter((c) => c.dutyHrsToday / c.maxDutyHrs >= 0.8).length;
    const over = crews.filter((c) => c.dutyHrsToday >= c.maxDutyHrs).length;
    const near28 = crews.filter((c) => c.flightHrs28d / c.maxFlightHrs28d >= 0.8).length;
    return { inField, pics, nearDuty, over, near28 };
  }, [crews]);

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 shrink-0">
        <Kpi label="Crew roster" value={crews.length} icon="users" sub={`${stats.pics} pilots-in-command`} />
        <Kpi label="In field" value={stats.inField} tone="live" icon="map-pin" sub="on active missions" />
        <Kpi label="Duty ≥ 80%" value={stats.nearDuty} tone={stats.nearDuty ? 'warn' : 'ok'} icon="timer" sub="of daily duty limit" />
        <Kpi label="Duty limit reached" value={stats.over} tone={stats.over ? 'alert' : 'ok'} icon="octagon-alert" sub="must stand down" />
        <Kpi label="28-day ≥ 80%" value={stats.near28} tone={stats.near28 ? 'warn' : 'ok'} icon="calendar-days" sub="rolling flight-hour cap" />
      </div>
      <Panel title="Crew Roster & Duty Limits" index="C" icon="user-cog" subtitle={`${rows.length} of ${crews.length}`} className="flex-1 min-h-[420px]" bodyClassName="flex flex-col min-h-0">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-line shrink-0">
          <label className="relative flex items-center mr-2">
            <Icon name="search" size={12} className="absolute left-2 text-dim pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role, base…" className="field pl-7 w-[180px]" aria-label="Search crew" />
          </label>
          <span className="label mr-1">Cert</span>
          <button className={cx('pill', cert === 'all' && 'pill-on')} onClick={() => setCert('all')}>
            All
          </button>
          {CERTS.map((c) => (
            <button key={c} className={cx('pill', cert === c && 'pill-on')} onClick={() => setCert(cert === c ? 'all' : c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {rows.length === 0 ? (
            <Empty icon="users" text="No crew match these filters" />
          ) : (
            <table className="tbl text-[11.5px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Certifications</th>
                  <th>Base</th>
                  <th>Status</th>
                  <th className="min-w-[130px]">Duty today</th>
                  <th className="min-w-[130px]">Flight hrs · 28 d</th>
                  <th>Current / next mission</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = CREW_STATUS[c.status];
                  const dr = c.dutyHrsToday / c.maxDutyHrs;
                  const fr = c.flightHrs28d / c.maxFlightHrs28d;
                  const ms = byCrew.get(c.id) ?? [];
                  const b = baseById.get(c.baseId);
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold text-white whitespace-nowrap">{c.name}</td>
                      <td className="text-muted whitespace-nowrap">{c.role}</td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[230px]">
                          {c.certs.length ? (
                            c.certs.map((x) => (
                              <span key={x} className={cx('h-[18px] inline-flex items-center px-1.5 border text-[10px] font-semibold tracking-wide', cert === x ? 'border-white text-white' : 'border-line-2 text-muted')}>
                                {x}
                              </span>
                            ))
                          ) : (
                            <span className="text-dim text-[10.5px]">Basic RPL only</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="text-text leading-tight">{b?.name}</div>
                      </td>
                      <td>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-baseline justify-between num">
                          <span className={TONE_TEXT[dutyTone(dr)]}>{c.dutyHrsToday.toFixed(1)} h</span>
                          <span className="text-[10.5px] text-dim">/ {c.maxDutyHrs} h</span>
                        </div>
                        <Meter value={c.dutyHrsToday} max={c.maxDutyHrs} tone={dutyTone(dr)} height={3} className="mt-1" />
                      </td>
                      <td>
                        {c.role === 'Field Technician' ? (
                          <span className="text-[10.5px] text-dim">non-flying</span>
                        ) : (
                          <>
                            <div className="flex items-baseline justify-between num">
                              <span className={TONE_TEXT[dutyTone(fr)]}>{c.flightHrs28d.toFixed(0)} h</span>
                              <span className="text-[10.5px] text-dim">/ {c.maxFlightHrs28d} h</span>
                            </div>
                            <Meter value={c.flightHrs28d} max={c.maxFlightHrs28d} tone={dutyTone(fr)} height={3} className="mt-1" />
                          </>
                        )}
                      </td>
                      <td>
                        {ms.length ? (
                          <div className="space-y-0.5">
                            {ms.slice(0, 2).map((m) => (
                              <button key={m.id} onClick={() => goMission(m.id, actions.selectMission)} className="flex items-center gap-1.5 group text-left" title={m.name}>
                                <span className="num text-[11px] text-text group-hover:underline underline-offset-2">{m.code}</span>
                                <span className={cx('text-[10px] uppercase tracking-wider', TONE_TEXT[MISSION_STATUS[m.status].tone])}>{MISSION_STATUS[m.status].label}</span>
                                {m.status !== 'active' && (
                                  <span className="text-[10.5px] text-dim">
                                    <Stamp ts={m.scheduledStart} />
                                  </span>
                                )}
                              </button>
                            ))}
                            {ms.length > 2 && <div className="num text-[10px] text-dim">+{ms.length - 2} more</div>}
                          </div>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="num text-[11px] text-muted whitespace-nowrap">{c.phone}</td>
                    </tr>
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
