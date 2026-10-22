// Mission Control — right column: AI briefing, fleet readiness, deployment
// calculator for the selected mission and live telemetry for the selected unit.
import { useMemo, useState } from 'react';
import { actions, useOps, useOpsState } from '../../store';
import { useBriefing } from '../../hooks';
import type { BriefCategory, BriefItem } from '../../engine/briefing';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, MISSION_PROFILES, PRIORITY, REGION, TONE_COLOR, UNIT_STATUS, UNIT_STATUSES } from '../../data/catalog';
import { DeploymentCalculator } from '../../components/DeploymentCalculator';
import { Badge, Icon, Idx, LinkArrow, Meter, StatusDot, cx, type IconName } from '../../ui/kit';
import { fmtClock, fmtDur, fmtRel } from '../../lib/time';
import { fmtLatLng } from '../../lib/geo';
import type { AirframeClass } from '../../types';
import { SERVICEABLE, SEV_TONE, UNIT_STATUS_COLOR, missionRank, slaText, unitTone } from './util';

const CAT_ICON: Record<BriefCategory, IconName> = {
  'Re-tasking': 'shuffle',
  Bottleneck: 'git-branch',
  Airspace: 'tower-control',
  Weather: 'cloud-lightning',
  Calibration: 'aperture',
  Fleet: 'drone',
};
const CAT_ORDER: BriefCategory[] = ['Re-tasking', 'Bottleneck', 'Airspace', 'Weather', 'Calibration', 'Fleet'];

function SectionHead({ n, icon, title, right, sub }: { n: number; icon: IconName; title: string; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-3 h-9 border-b border-line bg-card sticky top-0 z-[2]">
      <Idx n={n} />
      <Icon name={icon} size={13} className="text-muted" />
      <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] truncate">{title}</h3>
      {sub}
      <div className="ml-auto flex items-center gap-1.5">{right}</div>
    </header>
  );
}

function Briefing({ n }: { n: number }) {
  const items = useBriefing();
  const now = useOps((s) => s.now);
  const tz = useOps((s) => s.tz);
  const [showAll, setShowAll] = useState(false);
  const generated = Math.floor(now / 600_000) * 600_000;
  const shown = showAll ? items : items.slice(0, 8);
  const groups = CAT_ORDER.map((c) => ({ c, list: shown.filter((i) => i.category === c) })).filter((g) => g.list.length);
  const crit = items.filter((i) => i.severity === 'critical').length;
  const act = (i: BriefItem) => {
    if (!i.action) return;
    if (i.action.kind === 'mission') actions.selectMission(i.action.id);
    else if (i.action.kind === 'unit') actions.selectUnit(i.action.id);
    else location.hash = '#/' + i.action.id;
  };
  return (
    <section className="border-b border-line">
      <SectionHead n={n} icon="sparkles" title="AI operational briefing" right={crit > 0 ? <Badge tone="alert">{crit} critical</Badge> : <Badge tone="ok">Clear</Badge>} />
      <div className="px-3 pt-2 pb-1 flex items-start gap-2">
        <span className="w-6 h-6 shrink-0 flex items-center justify-center border border-accent/40 bg-accent/10 text-accent">
          <Icon name="sparkles" size={13} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-[11.5px] text-text font-semibold">
            Generated <span className="num">{fmtClock(generated, tz, false)}</span> <span className="num text-muted">{tz}</span>
            <span className="text-dim font-normal"> · {items.length} findings</span>
          </div>
          <div className="text-[10.5px] text-dim mt-0.5">Synthesised from live fleet, weather, airspace and schedule state</div>
        </div>
      </div>
      <div className="pb-1">
        {groups.map((g) => (
          <div key={g.c}>
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 label text-[9px]">
              <Icon name={CAT_ICON[g.c]} size={10} />
              {g.c}
              <span className="flex-1 h-px bg-line ml-1" />
            </div>
            {g.list.map((i) => (
              <div key={i.id} className="group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.025]">
                <span className="mt-[5px]">
                  <StatusDot tone={SEV_TONE[i.severity]} pulse={i.severity === 'critical'} size={6} />
                </span>
                <p className="flex-1 text-[11.5px] leading-[1.45] text-text/90 min-w-0">{i.text}</p>
                {i.action && (
                  <button onClick={() => act(i)} className="shrink-0 mt-[1px] h-[20px] px-1.5 border border-line-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-white hover:border-white/50 transition-colors">
                    {i.action.label} <span className="font-mono">→</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {items.length > 8 && (
          <button onClick={() => setShowAll(!showAll)} className="px-3 py-1.5 text-[11px] text-dim hover:text-white">
            {showAll ? 'Show top 8' : `Show all ${items.length}`} <span className="font-mono">→</span>
          </button>
        )}
      </div>
    </section>
  );
}

function Readiness({ n }: { n: number }) {
  const units = useOps((s) => s.units);
  const counts = useMemo(() => {
    const c = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const u of units) c[u.status]++;
    return c;
  }, [units]);
  const byClass = useMemo(() => {
    const m = new Map<AirframeClass, { total: number; ok: number; flying: number }>();
    for (const u of units) {
      const cls = AIRFRAME[u.modelId].cls;
      const r = m.get(cls) ?? { total: 0, ok: 0, flying: 0 };
      r.total++;
      if (SERVICEABLE(u)) r.ok++;
      if (u.status === 'in-flight') r.flying++;
      m.set(cls, r);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [units]);
  const total = units.length;
  const ok = units.filter(SERVICEABLE).length;
  return (
    <section className="border-b border-line">
      <SectionHead n={n} icon="gauge" title="Fleet readiness" right={<LinkArrow onClick={() => (location.hash = '#/fleet')}>Fleet</LinkArrow>} />
      <div className="px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="num text-[22px] font-semibold leading-none text-white">{Math.round((ok / total) * 100)}%</span>
          <span className="text-[11px] text-dim">
            <span className="num text-muted">
              {ok}/{total}
            </span>{' '}
            serviceable
          </span>
          <span className="ml-auto text-[10.5px] text-dim num">{counts['in-flight']} airborne</span>
        </div>
        <div className="flex h-[10px] mt-2 bg-white/5" role="img" aria-label="Fleet status breakdown">
          {UNIT_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <div key={s} title={`${UNIT_STATUS[s].label}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: UNIT_STATUS_COLOR[s] }} className="border-r border-card last:border-r-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
          {UNIT_STATUSES.map((s) => (
            <span key={s} className={cx('flex items-center gap-1.5 text-[10.5px]', counts[s] ? 'text-muted' : 'text-dim/60')}>
              <i className="w-2 h-2 shrink-0" style={{ background: UNIT_STATUS_COLOR[s] }} />
              <span className="truncate">{UNIT_STATUS[s].label}</span>
              <span className="ml-auto num text-text">{counts[s]}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex label text-[9px] mb-1">
            <span>Airframe class</span>
            <span className="ml-auto">Serviceable</span>
          </div>
          {byClass.map(([cls, r]) => (
            <div key={cls} className="grid grid-cols-[1fr_76px_36px] items-center gap-2 py-[3px]">
              <span className="text-[11px] text-muted truncate">{AIRFRAME_CLASS_LABEL[cls]}</span>
              <Meter value={r.ok} max={r.total} tone={r.ok === r.total ? 'ok' : r.ok / r.total >= 0.7 ? 'warn' : 'alert'} height={4} />
              <span className="num text-[10.5px] text-right text-text">
                {r.ok}/{r.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalculatorSection({ n }: { n: number }) {
  const selId = useOps((s) => s.selectedMissionId);
  const missions = useOps((s) => s.missions);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const m = missions.find((x) => x.id === selId);
  const urgent = useMemo(() => missions.filter((x) => x.status === 'request').sort(missionRank).slice(0, 3), [missions]);
  return (
    <section className="border-b border-line">
      <SectionHead
        n={n}
        icon="target"
        title="Deployment calculator"
        right={
          m && (
            <button onClick={() => actions.selectMission(undefined)} className="w-6 h-6 flex items-center justify-center text-dim hover:text-white border border-transparent hover:border-line-2" aria-label="Clear mission selection" title="Clear selection">
              <Icon name="x" size={13} />
            </button>
          )
        }
      />
      <div className="p-3">
        {m ? (
          <DeploymentCalculator key={m.id} missionId={m.id} compact limit={5} />
        ) : (
          <div>
            <div className="flex items-start gap-2.5 border border-dashed border-line-2 px-3 py-3">
              <Icon name="crosshair" size={16} className="text-dim mt-0.5 shrink-0" />
              <div>
                <div className="text-[12px] text-text font-semibold">Select a mission to compute Deployment ETA</div>
                <div className="text-[11px] text-dim mt-0.5 leading-snug">Click a mission on the map or in the work queue. The fleet is ranked by earliest valid completion, with transit vectors drawn on the map.</div>
              </div>
            </div>
            {urgent.length > 0 && (
              <div className="mt-3">
                <div className="label text-[9px] mb-1">Most urgent open requests</div>
                <div className="border border-line">
                  {urgent.map((r) => {
                    const sla = slaText(r.slaDue, now);
                    const prof = MISSION_PROFILES[r.type];
                    return (
                      <button key={r.id} onClick={() => actions.selectMission(r.id)} className="w-full grid grid-cols-[3px_1fr_auto] text-left border-b border-line last:border-b-0 hover:bg-white/[0.04]">
                        <span style={{ background: TONE_COLOR[PRIORITY[r.priority].tone] }} />
                        <span className="px-2.5 py-1.5 min-w-0">
                          <span className="flex items-center gap-1.5">
                            <Icon name={prof.icon} size={11} style={{ color: prof.color }} />
                            <span className="num text-[10px] text-dim">{r.code}</span>
                          </span>
                          <span className="block text-[11.5px] text-text font-semibold truncate">{r.name}</span>
                          <span className="block text-[10px] text-dim">{REGION[r.regionId].name}</span>
                        </span>
                        <span className="pr-2.5 py-1.5 flex flex-col items-end justify-center gap-0.5">
                          <span className={cx('num text-[10.5px]', sla.late ? 'text-alert' : sla.soon ? 'text-warn' : 'text-muted')}>{sla.text}</span>
                          <span className="text-[10px] text-muted">
                            Compute <span className="font-mono">→</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TelemetryCard({ n }: { n: number }) {
  const S = useOpsState();
  const u = S.units.find((x) => x.id === S.selectedUnitId);
  if (!u) return null;
  const af = AIRFRAME[u.modelId];
  const m = S.missions.find((x) => x.id === u.missionId);
  const crew = S.crews.find((c) => c.id === u.crewId);
  const base = S.bases.find((b) => b.id === u.baseId);
  const tone = unitTone(u);
  const st = UNIT_STATUS[u.status];
  const airborne = u.status === 'in-flight' || u.status === 'in-transit' || !!u.contingency;
  const energyTone = u.energyPct < 20 ? 'alert' : u.energyPct < 30 ? 'warn' : 'ok';
  const linkTone = u.linkQuality < 50 ? 'alert' : u.linkQuality < 70 ? 'warn' : 'ok';
  const gnssTone = u.gnssFix === 'RTK Fixed' ? 'ok' : u.gnssFix === 'No Fix' ? 'alert' : 'warn';
  const cell = (k: string, v: React.ReactNode, sub?: React.ReactNode, color?: string) => (
    <div className="px-2.5 py-1.5 border-r border-b border-line min-w-0">
      <div className="label text-[9px]">{k}</div>
      <div className="num text-[14px] font-semibold leading-tight truncate" style={{ color: color ?? '#f2f2f2' }}>
        {v}
      </div>
      {sub && <div className="text-[10px] text-dim truncate">{sub}</div>}
    </div>
  );
  return (
    <section className="border-b border-line">
      <SectionHead
        n={n}
        icon="radio"
        title="Live telemetry"
        right={
          <button onClick={() => actions.selectUnit(undefined)} className="w-6 h-6 flex items-center justify-center text-dim hover:text-white border border-transparent hover:border-line-2" aria-label="Clear unit selection" title="Clear selection">
            <Icon name="x" size={13} />
          </button>
        }
      />
      <div className="p-3">
        <div className="flex items-start gap-2">
          <StatusDot tone={tone} pulse={u.status === 'in-flight'} size={8} />
          <div className="min-w-0 -mt-[3px]">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-extrabold text-white tracking-[-0.01em]">{u.callsign}</span>
              <span className="num text-[10.5px] text-dim">{u.tail}</span>
            </div>
            <div className="text-[11px] text-muted truncate">
              {af.name} · {AIRFRAME_CLASS_LABEL[af.cls]}
            </div>
          </div>
          <Badge tone={tone} className="ml-auto shrink-0">
            {u.contingency ? `${u.contingency.action} · ${u.contingency.event}` : st.label.split(' / ')[0]}
          </Badge>
        </div>
        <div className="mt-2 text-[11px] text-dim flex items-center gap-1.5 min-w-0">
          <Icon name="target" size={11} className="shrink-0" />
          {m ? (
            <button className="truncate text-left hover:text-white" onClick={() => actions.selectMission(m.id)}>
              <span className="num text-muted">{m.code}</span> · {m.name}
            </button>
          ) : (
            <span>Not tasked · {base?.name}</span>
          )}
        </div>
        <div className="grid grid-cols-3 mt-2.5 border-t border-l border-line">
          {cell('Altitude', af.isVessel ? 'SURF' : `${Math.round(u.altM)} m`, af.isVessel ? 'surface vessel' : `${Math.round(u.altM * 3.281)} ft AGL`)}
          {cell('Speed', `${Math.round(u.speedKmh)}`, `km/h · ${Math.round(u.speedKmh / 1.852)} kt`)}
          {cell('Heading', airborne ? `${String(Math.round(u.headingDeg)).padStart(3, '0')}°` : '—', airborne ? 'true' : 'parked')}
          {cell(af.propulsion === 'electric' ? 'Battery' : 'Fuel', `${Math.round(u.energyPct)}%`, af.propulsion === 'electric' ? `${u.packVoltage.toFixed(1)} V · SoH ${u.sohPct}%` : `${af.propulsion} · SoH ${u.sohPct}%`, TONE_COLOR[energyTone])}
          {cell('C2 link', `${Math.round(u.linkQuality)}%`, u.linkQuality < 50 ? 'degraded' : 'nominal', TONE_COLOR[linkTone])}
          {cell('GNSS', u.gnssFix, `${u.satellites} sats · KP ${S.kpIndex}`, TONE_COLOR[gnssTone])}
        </div>
        <div className="mt-1.5">
          <Meter value={u.energyPct} tone={energyTone} height={3} />
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          <span className="text-dim">Position</span>
          <span className="num text-text text-right">{fmtLatLng(u.pos)}</span>
          <span className="text-dim">Crew</span>
          <span className="text-text text-right truncate">{crew ? `${crew.name} · ${crew.role}` : '—'}</span>
          <span className="text-dim">Airframe hrs</span>
          <span className="num text-text text-right">
            {u.airframeHrs.toFixed(1)} h · svc in {Math.max(0, u.nextServiceHrs - u.airframeHrs).toFixed(0)} h
          </span>
          {u.busyUntil > S.now && (
            <>
              <span className="text-dim">Busy until</span>
              <span className="num text-text text-right">
                {fmtClock(u.busyUntil, S.tz, false)} {S.tz} · {fmtRel(u.busyUntil, S.now)}
              </span>
            </>
          )}
        </div>
        {u.faults.some((f) => f.active) && (
          <ul className="mt-2 space-y-0.5">
            {u.faults
              .filter((f) => f.active)
              .slice(0, 3)
              .map((f) => (
                <li key={f.code + f.ts} className="flex items-start gap-1.5 text-[10.5px]" style={{ color: f.severity === 'critical' ? TONE_COLOR.alert : f.severity === 'warn' ? TONE_COLOR.warn : '#b4b4b4' }}>
                  <Icon name="triangle-alert" size={11} className="mt-[1px] shrink-0" />
                  <span>
                    <span className="num">{f.code}</span> · {f.text}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <div className="flex items-center mt-2.5 pt-2 border-t border-line">
          <span className="text-[10px] text-dim num">Last flight {u.lastFlightTs >= S.now - 2000 ? 'now' : fmtDur(S.now - u.lastFlightTs) + ' ago'}</span>
          <span className="ml-auto">
            <LinkArrow
              onClick={() => {
                actions.selectUnit(u.id);
                location.hash = '#/fleet';
              }}
            >
              Open in Fleet
            </LinkArrow>
          </span>
        </div>
      </div>
    </section>
  );
}

export function SidePanel() {
  const selU = useOps((s) => s.selectedUnitId);
  const selM = useOps((s) => s.selectedMissionId);
  // Selection-driven cards rise to the top; the briefing leads otherwise.
  const order: ('tele' | 'calc' | 'brief' | 'ready')[] = [];
  if (selU) order.push('tele');
  if (selM) order.push('calc');
  order.push('brief', 'ready');
  if (!selM) order.push('calc');
  return (
    <aside className="panel h-full min-h-0 overflow-y-auto border-t-0 border-r-0" aria-label="Briefing and fleet summary">
      {order.map((k, i) => {
        const n = i + 2;
        if (k === 'tele') return <TelemetryCard key={k} n={n} />;
        if (k === 'calc') return <CalculatorSection key={k} n={n} />;
        if (k === 'brief') return <Briefing key={k} n={n} />;
        return <Readiness key={k} n={n} />;
      })}
    </aside>
  );
}
