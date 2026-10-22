import { useMemo, useState } from 'react';
import type { Base, Crew, CrewCert, Mission } from '../../types';
import { MISSION_STATUS, type Tone } from '../../data/catalog';
import { actions } from '../../store';
import { Empty, Icon, Meter, Panel, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { KpiCell, KpiStrip } from '../analytics/parts';
import { StatusText, goMission } from './shared';

const CERTS: CrewCert[] = ['BVLOS', 'HeavyLift', 'Night', 'Maritime', 'Thermal', 'Agri-Spray', 'VTOL'];
const CREW_STATUS: Record<Crew['status'], { label: string; tone: Tone }> = {
  'in-field': { label: 'In field', tone: 'live' },
  'on-duty': { label: 'On duty', tone: 'ok' },
  rest: { label: 'Mandatory rest', tone: 'warn' },
  'off-duty': { label: 'Off duty', tone: 'idle' },
};
const ROLE_SHORT: Record<string, string> = { PIC: 'PIC', 'Visual Observer': 'Observer', 'Payload Operator': 'Payload op.', 'Field Technician': 'Technician' };
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
      <KpiStrip>
        <KpiCell label="crew" value={crews.length} title={`${stats.pics} pilots-in-command`} />
        <KpiCell label="in field" value={stats.inField} dot="live" title="On active missions" />
        <KpiCell label="duty ≥ 80%" value={stats.nearDuty} tone={stats.nearDuty ? 'warn' : undefined} title="At or above 80% of the daily duty limit" />
        <KpiCell label="at duty limit" value={stats.over} tone={stats.over ? 'alert' : undefined} title="Daily duty limit reached — must stand down" />
        <KpiCell label="28-day ≥ 80%" value={stats.near28} tone={stats.near28 ? 'warn' : undefined} title="Rolling 28-day flight-hour cap" hide="lg" />
      </KpiStrip>
      <Panel
        title="Crew Roster & Duty Limits"
        index="C"
        className="flex-1 min-h-[420px] @container"
        bodyClassName="flex flex-col min-h-0"
        actions={<span className="num text-[10.5px] text-dim">{rows.length === crews.length ? crews.length : `${rows.length} / ${crews.length}`}</span>}
      >
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-line shrink-0">
          <label className="relative flex items-center mr-2">
            <Icon name="search" size={12} className="absolute left-2 text-dim pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role, base…" className="field pl-7 w-[180px]" aria-label="Search crew" />
          </label>
          <button className={cx('pill', cert === 'all' && 'pill-on')} onClick={() => setCert('all')}>
            All certs
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
            <table className="tbl text-[11.5px] [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="@max-[1000px]:hidden">Certifications</th>
                  <th className="@max-[860px]:hidden">Base</th>
                  <th>Status</th>
                  <th className="text-right">Duty today</th>
                  <th className="text-right @max-[640px]:hidden">28 d flight</th>
                  <th className="@max-[720px]:hidden">Mission</th>
                  <th className="@max-[1150px]:hidden">Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = CREW_STATUS[c.status];
                  const dr = c.dutyHrsToday / c.maxDutyHrs;
                  const fr = c.flightHrs28d / c.maxFlightHrs28d;
                  const ms = byCrew.get(c.id) ?? [];
                  const b = baseById.get(c.baseId);
                  const m0 = ms[0];
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold text-white">{c.name}</td>
                      <td className="text-muted">{ROLE_SHORT[c.role] ?? c.role}</td>
                      <td className="@max-[1000px]:hidden max-w-[220px] truncate text-[10.5px] text-dim" title={c.certs.join(', ') || 'Basic RPL only'}>
                        {c.certs.length ? c.certs.map((x, i) => (
                          <span key={x}>
                            {i > 0 && ' · '}
                            <span className={cert === x ? 'text-white' : 'text-muted'}>{x}</span>
                          </span>
                        )) : 'Basic RPL only'}
                      </td>
                      <td className="@max-[860px]:hidden max-w-[160px] truncate text-muted" title={b?.name}>{b?.name}</td>
                      <td>
                        <StatusText tone={st.tone} label={st.label} />
                      </td>
                      <td className="text-right" title={`${c.dutyHrsToday.toFixed(1)} of ${c.maxDutyHrs} h daily duty`}>
                        <span className="inline-flex items-center gap-2 num">
                          <Meter value={c.dutyHrsToday} max={c.maxDutyHrs} tone={dutyTone(dr)} height={3} className="!w-[44px]" />
                          <span className={cx('w-[64px]', dr >= 0.8 ? TONE_TEXT[dutyTone(dr)] : 'text-text')}>
                            {c.dutyHrsToday.toFixed(1)}<span className="text-dim">/{c.maxDutyHrs} h</span>
                          </span>
                        </span>
                      </td>
                      <td className="text-right num @max-[640px]:hidden" title={c.role === 'Field Technician' ? 'Non-flying role' : `${c.flightHrs28d.toFixed(0)} of ${c.maxFlightHrs28d} h rolling 28 days`}>
                        {c.role === 'Field Technician' ? (
                          <span className="text-dim">—</span>
                        ) : (
                          <span className={fr >= 0.8 ? TONE_TEXT[dutyTone(fr)] : 'text-text'}>
                            {c.flightHrs28d.toFixed(0)}<span className="text-dim">/{c.maxFlightHrs28d} h</span>
                          </span>
                        )}
                      </td>
                      <td className="@max-[720px]:hidden">
                        {m0 ? (
                          <button onClick={() => goMission(m0.id, actions.selectMission)} className="inline-flex items-center gap-1.5 group text-left" title={ms.map((m) => `${m.code} · ${MISSION_STATUS[m.status].label} · ${m.name}`).join('\n')}>
                            <span className="num text-[11px] text-text group-hover:underline underline-offset-2">{m0.code}</span>
                            {m0.status === 'active' ? <span className="text-[10.5px] text-live">active</span> : <span className="text-[10.5px] text-dim"><Stamp ts={m0.scheduledStart} /></span>}
                            {ms.length > 1 && <span className="num text-[10px] text-dim">+{ms.length - 1}</span>}
                          </button>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="num text-[11px] text-dim @max-[1150px]:hidden">{c.phone}</td>
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
