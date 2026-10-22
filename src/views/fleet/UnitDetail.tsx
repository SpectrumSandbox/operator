import type { ReactNode } from 'react';
import type { Base, Battery, Crew, FaultCode, Mission, Payload, Unit } from '../../types';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, CAL_STATUS, MISSION_PROFILES, MISSION_STATUS, PAYLOAD_META, TONE_COLOR, UNIT_STATUS, type Tone } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Icon, KV, Meter, Sparkline, Stamp, StatusDot, TONE_TEXT, cx } from '../../ui/kit';
import { fmtLatLng } from '../../lib/geo';
import { fmtRel } from '../../lib/time';
import { activeFaults, calCountdown, calStatus, energyKind, energyTone, gnssTone, goMission, linkTone, serviceInfo, sohTone, type TelSample } from './shared';

const SEV_TONE: Record<FaultCode['severity'], Tone> = { info: 'idle', warn: 'warn', critical: 'alert' };

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 py-2.5 border-b border-line">
      <div className="flex items-center gap-1.5 mb-1.5">
        <h4 className="text-[11px] font-semibold text-muted">{title}</h4>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

function TelCell({ label, value, unit, tone, series, color }: { label: string; value: ReactNode; unit?: string; tone?: Tone; series?: number[]; color?: string }) {
  return (
    <div className="px-2.5 py-2 bg-bg-deep/60 border border-line min-w-0">
      <div className="label text-[9px] truncate">{label}</div>
      <div className="flex items-end justify-between gap-1 mt-0.5">
        <div className="flex items-baseline gap-0.5 min-w-0">
          <span className={cx('num text-[15px] font-semibold leading-none', tone ? TONE_TEXT[tone] : 'text-white')}>{value}</span>
          {unit && <span className="text-[10px] text-dim">{unit}</span>}
        </div>
        {series && series.length > 1 && <Sparkline values={series} color={color ?? (tone ? TONE_COLOR[tone] : '#26d8d9')} width={56} height={18} />}
      </div>
    </div>
  );
}

export function UnitDetail({
  unit: u,
  now,
  bases,
  crews,
  missions,
  payloads,
  batteries,
  calBooked,
  samples,
  onClose,
}: {
  unit: Unit;
  now: number;
  bases: Base[];
  crews: Crew[];
  missions: Mission[];
  payloads: Payload[];
  batteries: Battery[];
  calBooked: Set<string>;
  samples: TelSample[];
  onClose: () => void;
}) {
  const af = AIRFRAME[u.modelId];
  const st = UNIT_STATUS[u.status];
  const base = bases.find((b) => b.id === u.baseId);
  const m = u.missionId ? missions.find((x) => x.id === u.missionId) : undefined;
  const crewIds = [...new Set([...(u.crewId ? [u.crewId] : []), ...(m?.crewIds ?? [])])];
  const crew = crewIds.map((id) => crews.find((c) => c.id === id)).filter((c): c is Crew => !!c);
  const mounted = payloads.filter((p) => p.unitId === u.id);
  const packs = batteries.filter((b) => b.unitId === u.id);
  const svc = serviceInfo(u);
  const fwOld = u.firmware !== u.firmwareLatest;
  const active = activeFaults(u);
  const history = u.faults.filter((f) => !f.active);
  const kind = energyKind(u);
  const airborne = u.status === 'in-flight' || !!u.contingency;
  const canRestore = u.status === 'maintenance' || u.status === 'grounded';
  const canGround = u.status !== 'grounded';
  const s = (k: keyof TelSample) => samples.map((x) => x[k] as number);

  return (
    <aside className="panel flex flex-col min-h-0 h-full" aria-label={`${u.callsign} detail`}>
      <header className="shrink-0 border-b border-line">
        <div className="h-[2px]" style={{ background: TONE_COLOR[st.tone] }} />
        <div className="flex items-start gap-3 px-4 pt-3 pb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot tone={st.tone} pulse={u.status === 'in-flight'} />
              <h3 className="text-[17px] font-extrabold tracking-[-0.01em] text-white">{u.callsign}</h3>
              <span className="num text-[11px] text-dim">{u.tail}</span>
            </div>
            <div className="text-[11.5px] text-muted mt-0.5 truncate">
              {af.name} <span className="text-dim">· {af.maker}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            <button onClick={onClose} className="text-dim hover:text-white" aria-label="Close unit detail">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
          {canRestore && (
            <button className="btn btn-solid h-7" onClick={() => actions.setUnitStatus(u.id, 'available')}>
              <Icon name="circle-check" size={12} /> Return to service
            </button>
          )}
          {canGround && (
            <button className="btn h-7 hover:!border-alert hover:!text-alert" onClick={() => actions.setUnitStatus(u.id, 'grounded')}>
              <Icon name="octagon-x" size={12} /> Ground unit
            </button>
          )}
          <button
            className="btn h-7"
            onClick={() => {
              actions.selectUnit(u.id);
              location.hash = '#/mission-control';
            }}
          >
            <Icon name="locate-fixed" size={12} /> Locate
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {u.contingency && (
          <section className="px-4 py-3 border-b border-alert/40 bg-alert-bg">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon name="siren" size={13} className="text-alert" />
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-alert">Contingency · {u.contingency.action}</span>
              <span className="ml-auto num text-[10.5px] text-muted">→ {u.contingency.targetName}</span>
            </div>
            <ul className="space-y-0.5">
              {u.contingency.log.map((l, i) => (
                <li key={i} className="flex gap-2 text-[11px]">
                  <span className="num text-dim shrink-0">
                    <Stamp ts={l.ts} mode="clock" />
                  </span>
                  <span className="text-text">{l.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {airborne && (
          <Section
            title="Live telemetry"
            right={
              <span className="flex items-center gap-1.5 num text-[10px] text-live">
                <StatusDot tone="live" pulse size={6} /> {samples.length} samples
              </span>
            }
          >
            <div className="grid grid-cols-3 gap-1.5">
              <TelCell label={af.isVessel ? 'Draft / alt' : 'Altitude AGL'} value={u.altM.toFixed(0)} unit="m" series={s('alt')} color="#8384e2" />
              <TelCell label="Ground speed" value={u.speedKmh.toFixed(0)} unit="km/h" series={s('spd')} color="#26d8d9" />
              <TelCell label="Heading" value={`${String(Math.round(u.headingDeg)).padStart(3, '0')}°`} />
              <TelCell label="C2 link" value={Math.round(u.linkQuality)} unit="%" tone={linkTone(u.linkQuality)} series={s('link')} />
              <TelCell label={`GNSS · ${u.satellites} sats`} value={<span className="text-[12px]">{u.gnssFix}</span>} tone={gnssTone(u.gnssFix)} series={s('sats')} />
              <TelCell label={kind === 'fuel' ? 'Fuel' : 'Battery'} value={Math.round(u.energyPct)} unit="%" tone={energyTone(u.energyPct)} series={s('energy')} />
            </div>
            <div className="num text-[10.5px] text-dim mt-2 flex justify-between">
              <span>{fmtLatLng(u.pos)}</span>
              <span>Δt 1 tick · window {samples.length}/60</span>
            </div>
          </Section>
        )}

        <Section title="Current mission">
          {m ? (
            <div>
              <div className="flex items-center gap-2">
                <button onClick={() => goMission(m.id, actions.selectMission)} className="num text-[12px] text-white hover:underline underline-offset-2">
                  {m.code}
                </button>
                <Badge tone={MISSION_STATUS[m.status].tone}>{MISSION_STATUS[m.status].label}</Badge>
                <span className="ml-auto text-[10.5px]" style={{ color: MISSION_PROFILES[m.type].color }}>
                  {MISSION_PROFILES[m.type].short} · {m.subtype}
                </span>
              </div>
              <div className="text-[12px] text-text mt-1 leading-snug">{m.name}</div>
              <div className="flex items-center gap-2 mt-2">
                <Meter value={m.progress} max={1} color={MISSION_PROFILES[m.type].color} height={4} />
                <span className="num text-[11px] text-muted w-10 text-right">{Math.round(m.progress * 100)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 mt-1">
                <KV k="Window" v={<><Stamp ts={m.scheduledStart} mode="clock" />–<Stamp ts={m.scheduledEnd} mode="clock" /></>} />
                <KV k="Busy until" v={u.busyUntil ? fmtRel(u.busyUntil, now) : '—'} />
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-dim">Not assigned — {u.status === 'available' ? 'ready for tasking' : st.label.toLowerCase()}{u.busyUntil > now ? ` · free ${fmtRel(u.busyUntil, now)}` : ''}</div>
          )}
        </Section>

        <Section title="Identity & airframe">
          <KV k="Model" v={`${af.name} · ${af.maker}`} mono={false} />
          <KV k="Airframe class" v={AIRFRAME_CLASS_LABEL[af.cls]} mono={false} />
          <div className="grid grid-cols-2 gap-x-4">
            <KV k="Tail / reg." v={u.tail} />
            <KV k="Unit ID" v={u.id.toUpperCase()} />
            <KV k="Propulsion" v={af.propulsion === 'ice' ? 'ICE · heavy fuel' : af.propulsion === 'hybrid' ? 'Hybrid gas-elec.' : 'Electric'} mono={false} />
            <KV k="MTOW" v={`${af.mtowKg} kg`} />
            <KV k="Payload cap." v={`${af.maxPayloadKg} kg`} />
            <KV k="Endurance" v={af.enduranceMin >= 120 ? `${(af.enduranceMin / 60).toFixed(1)} h` : `${af.enduranceMin} min`} />
            <KV k="Cruise" v={`${af.cruiseKmh} km/h`} />
            <KV k="Ceiling" v={af.isVessel ? 'surface' : `${af.ceilingFtAgl.toLocaleString('en-US')} ft`} />
          </div>
        </Section>

        <Section title="Crew & location">
          {crew.length ? (
            <ul className="mb-2 space-y-1">
              {crew.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[12px]">
                  <Icon name={c.role === 'PIC' ? 'user-check' : 'user'} size={12} className="text-dim" />
                  <span className="text-text">{c.name}</span>
                  <span className="text-[10.5px] text-dim">{c.role}</span>
                  <span className="ml-auto num text-[10.5px] text-muted">{c.phone}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px] text-dim mb-2">No crew assigned</div>
          )}
          <KV k="Home base" v={base ? `${base.name}` : '—'} mono={false} />
          <KV k="Base position" v={base ? fmtLatLng(base.pos) : '—'} />
          <KV k="Current position" v={fmtLatLng(u.pos)} />
          {u.transitTo && <KV k="In transit to" v={`${fmtLatLng(u.transitTo)} · ${u.transitMode}`} />}
        </Section>

        <Section
          title={kind === 'fuel' ? 'Propulsion & fuel' : 'Battery health'}
          right={<span className={cx('num text-[11px]', TONE_TEXT[sohTone(u.sohPct)])}>SoH {u.sohPct}%</span>}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-dim w-[78px] shrink-0">{kind === 'fuel' ? 'Fuel state' : 'State of charge'}</span>
            <Meter value={u.energyPct} tone={energyTone(u.energyPct)} height={5} />
            <span className="num text-[12px] w-10 text-right">{Math.round(u.energyPct)}%</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-dim w-[78px] shrink-0">State of health</span>
            <Meter value={u.sohPct} tone={sohTone(u.sohPct)} height={5} />
            <span className="num text-[12px] w-10 text-right">{u.sohPct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            {kind === 'fuel' ? (
              <>
                <KV k="Fuel endurance" v={`${((af.enduranceMin * u.energyPct) / 100 / 60).toFixed(1)} h est.`} />
                <KV k={af.propulsion === 'hybrid' ? 'Buffer pack' : 'Avionics bus'} v={`${u.packVoltage.toFixed(1)} V`} />
                <KV k="Engine cycles" v={u.chargeCycles} />
                <KV k="Generator / ECU" v={<span className="text-ok">nominal</span>} />
              </>
            ) : (
              <>
                <KV k="Charge cycles" v={u.chargeCycles} />
                <KV k="Pack voltage" v={`${u.packVoltage.toFixed(1)} V`} />
                <KV
                  k="Cell balance Δ"
                  v={
                    <span className={u.cellDeltaMv > 30 ? 'text-warn' : 'text-text'}>
                      {u.cellDeltaMv > 30 && <Icon name="triangle-alert" size={10} className="inline -mt-0.5 mr-1" />}
                      {u.cellDeltaMv} mV
                    </span>
                  }
                />
                <KV k="Balance limit" v="30 mV" />
              </>
            )}
          </div>
          {packs.length > 0 && (
            <table className="tbl mt-2 text-[11px]">
              <thead>
                <tr>
                  <th className="!bg-transparent !px-1.5 !py-1">Pack</th>
                  <th className="!bg-transparent !px-1.5 !py-1 text-right">Cycles</th>
                  <th className="!bg-transparent !px-1.5 !py-1 text-right">SoH</th>
                  <th className="!bg-transparent !px-1.5 !py-1 text-right">IR mΩ</th>
                  <th className="!bg-transparent !px-1.5 !py-1 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((b) => (
                  <tr key={b.serial}>
                    <td className="!px-1.5 !py-1 num text-muted">{b.serial}</td>
                    <td className="!px-1.5 !py-1 num text-right">
                      {b.cycles}
                      <span className="text-dim">/{b.cycleLimit}</span>
                    </td>
                    <td className={cx('!px-1.5 !py-1 num text-right', TONE_TEXT[sohTone(b.sohPct)])}>{b.sohPct}%</td>
                    <td className={cx('!px-1.5 !py-1 num text-right', b.irMilliOhm / b.irBaselineMilliOhm > 1.4 ? 'text-warn' : 'text-text')}>{b.irMilliOhm.toFixed(1)}</td>
                    <td className="!px-1.5 !py-1 text-right">
                      <Badge tone={b.status === 'active' ? 'ok' : b.status === 'watch' ? 'warn' : 'alert'}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Flight hours & service" right={<Badge tone={svc.tone}>{svc.remaining <= 0 ? 'Service due' : svc.tone === 'warn' ? 'Service soon' : 'In interval'}</Badge>}>
          <div className="grid grid-cols-2 gap-x-4">
            <KV k="Airframe hours" v={`${u.airframeHrs.toFixed(1)} h`} />
            <KV k="Motor hours" v={`${u.motorHrs.toFixed(1)} h`} />
            <KV k="Next service at" v={`${u.nextServiceHrs} h`} />
            <KV k="Interval" v={`${svc.interval} h`} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Meter value={svc.used} max={svc.interval} tone={svc.tone} height={5} />
            <span className={cx('num text-[11px] w-[74px] text-right shrink-0', TONE_TEXT[svc.tone])}>{svc.remaining <= 0 ? `${(-svc.remaining).toFixed(1)} h over` : `${svc.remaining.toFixed(1)} h left`}</span>
          </div>
        </Section>

        <Section title="Firmware & last flight">
          <KV k="Installed" v={<span className={fwOld ? 'text-warn' : 'text-text'}>{u.firmware}</span>} />
          <KV k="Latest release" v={u.firmwareLatest} />
          <KV k="Update status" v={fwOld ? <Badge tone="warn">Update due</Badge> : <Badge tone="ok">Current</Badge>} />
          <KV k="Last flight" v={u.status === 'in-flight' ? <span className="text-live">Airborne now</span> : <><Stamp ts={u.lastFlightTs} /> <span className="text-dim">· {fmtRel(u.lastFlightTs, now)}</span></>} />
        </Section>

        <Section title="Fault codes" right={<span className="num text-[10.5px] text-dim">{active.length} active · {history.length} history</span>}>
          {u.faults.length === 0 ? (
            <div className="text-[12px] text-dim flex items-center gap-1.5">
              <Icon name="circle-check" size={12} className="text-ok" /> No fault codes recorded
            </div>
          ) : (
            <ul className="space-y-1.5">
              {[...active, ...history].map((f, i) => (
                <li key={f.code + i} className={cx('border-l-2 pl-2.5 py-0.5', !f.active && 'opacity-60')} style={{ borderColor: f.active ? TONE_COLOR[SEV_TONE[f.severity]] : 'rgba(255,255,255,.15)' }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="num text-[11px] text-white">{f.code}</span>
                    <span className="text-[10.5px] text-dim">{f.source}</span>
                    <span className={cx('text-[10.5px]', f.active ? TONE_TEXT[SEV_TONE[f.severity]] : 'text-dim')}>{f.active ? f.severity : 'cleared'}</span>
                    <span className="ml-auto num text-[10.5px] text-dim">
                      <Stamp ts={f.ts} />
                    </span>
                  </div>
                  <div className="text-[11.5px] text-muted mt-0.5">{f.text}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Mounted payloads">
          {mounted.length === 0 ? (
            <div className="text-[12px] text-dim">{af.maxPayloadKg === 0 ? 'Integrated sensor — no modular payload bay' : 'No modular payload mounted'}</div>
          ) : (
            <ul className="space-y-2">
              {mounted.map((p) => {
                const cs = calStatus(p, now);
                return (
                  <li key={p.id} className="flex items-start gap-2">
                    <Icon name={PAYLOAD_META[p.type].icon} size={13} className="text-muted mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-text truncate">{p.model}</span>
                        <span className="num text-[10.5px] text-dim">{p.serial}</span>
                      </div>
                      <div className="text-[10.5px] text-dim">
                        {p.calType} · due <Stamp ts={p.calDue} mode="date" /> ({calCountdown(p, now)})
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={CAL_STATUS[cs].tone}>{CAL_STATUS[cs].label}</Badge>
                      {calBooked.has(p.id) && <span className="text-[9.5px] uppercase tracking-wider text-live">cal booked</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
