// Mission Control — right panel, one section at a time:
// Briefing (AI findings) · Mission (deployment calculator) · Fleet (readiness or
// the selected unit's live telemetry).
import { useMemo, useState, type ReactNode } from 'react';
import { actions, useOps, useOpsState } from '../../store';
import { useBriefing } from '../../hooks';
import type { BriefCategory, BriefItem } from '../../engine/briefing';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, MISSION_PROFILES, PRIORITY, REGION, TONE_COLOR, UNIT_STATUS, UNIT_STATUSES } from '../../data/catalog';
import { DeploymentCalculator } from '../../components/DeploymentCalculator';
import { Badge, Icon, LinkArrow, Meter, StatusDot, cx, type IconName } from '../../ui/kit';
import { fmtClock, fmtDur, fmtRel } from '../../lib/time';
import { fmtLatLng } from '../../lib/geo';
import type { AirframeClass } from '../../types';
import { SERVICEABLE, SEV_TONE, UNIT_STATUS_COLOR, missionRank, slaText, unitTone } from './util';
import { HeadButton } from './Dock';

export type SideTab = 'briefing' | 'mission' | 'fleet';

const CAT_ICON: Record<BriefCategory, IconName> = {
  'Re-tasking': 'shuffle',
  Bottleneck: 'git-branch',
  Airspace: 'tower-control',
  Weather: 'cloud-lightning',
  Calibration: 'aperture',
  Fleet: 'drone',
};

const TOP_N = 6;

/** Sub-header inside a tab: small title + right-aligned controls. */
function SubHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b border-line shrink-0 min-w-0">
      <div className="min-w-0 flex items-center gap-2 text-[11px] text-dim truncate">{children}</div>
      {right && <div className="ml-auto flex items-center gap-1 shrink-0">{right}</div>}
    </div>
  );
}

// ── Briefing ────────────────────────────────────────────────────────────────
function Briefing() {
  const items = useBriefing();
  const now = useOps((s) => s.now);
  const tz = useOps((s) => s.tz);
  const [showAll, setShowAll] = useState(false);
  const generated = Math.floor(now / 600_000) * 600_000;
  const shown = showAll ? items : items.slice(0, TOP_N);
  const act = (i: BriefItem) => {
    if (!i.action) return;
    if (i.action.kind === 'mission') actions.selectMission(i.action.id);
    else if (i.action.kind === 'unit') actions.selectUnit(i.action.id);
    else location.hash = '#/' + i.action.id;
  };
  const counts = { critical: 0, warn: 0, info: 0 };
  for (const i of items) counts[i.severity]++;
  return (
    <>
      <SubHead
        right={
          <span className="flex items-center gap-2 num text-[10px]">
            {counts.critical > 0 && (
              <span className="flex items-center gap-1 text-alert" title="Critical findings">
                <StatusDot tone="alert" size={6} />
                {counts.critical}
              </span>
            )}
            {counts.warn > 0 && (
              <span className="flex items-center gap-1 text-warn" title="Warnings">
                <StatusDot tone="warn" size={6} />
                {counts.warn}
              </span>
            )}
            {counts.info > 0 && (
              <span className="flex items-center gap-1 text-live" title="Advisories">
                <StatusDot tone="live" size={6} />
                {counts.info}
              </span>
            )}
          </span>
        }
      >
        <Icon name="sparkles" size={12} className="text-accent shrink-0" />
        <span className="truncate" title="Synthesised from live fleet, weather, airspace and schedule state">
          Generated <span className="num text-muted">{fmtClock(generated, tz, false)}</span> <span className="num">{tz}</span> · <span className="num">{items.length}</span> findings
        </span>
      </SubHead>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {shown.map((i, idx) => {
          const prev = shown[idx - 1];
          const newCat = !prev || prev.category !== i.category;
          return (
            <div key={i.id}>
              {newCat && (
                <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 label text-[9px]">
                  <Icon name={CAT_ICON[i.category]} size={10} />
                  {i.category}
                </div>
              )}
              <div className="group grid grid-cols-[6px_1fr_24px] items-start gap-2.5 pl-3 pr-2 py-[5px] hover:bg-white/[0.03] transition-colors">
                <span className="mt-[6px]">
                  <StatusDot tone={SEV_TONE[i.severity]} pulse={i.severity === 'critical'} size={6} />
                </span>
                <p className="text-[11.5px] leading-[1.4] text-text/90 line-clamp-2 min-w-0" title={i.text}>
                  {i.text}
                </p>
                {i.action ? (
                  <button
                    onClick={() => act(i)}
                    className="w-6 h-6 -mt-[1px] flex items-center justify-center text-dim border border-transparent group-hover:border-line-2 hover:!border-white/60 hover:text-white transition-colors"
                    title={`${i.action.label} →`}
                    aria-label={i.action.label}
                  >
                    <Icon name="arrow-right" size={12} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </div>
          );
        })}
        {items.length > TOP_N && (
          <button onClick={() => setShowAll(!showAll)} className="w-full text-left px-3 py-2 mt-1 text-[11px] text-dim hover:text-white border-t border-line">
            {showAll ? `Show top ${TOP_N}` : `Show all ${items.length}`} <span className="font-mono">→</span>
          </button>
        )}
      </div>
    </>
  );
}

// ── Mission ─────────────────────────────────────────────────────────────────
function MissionTab() {
  const selId = useOps((s) => s.selectedMissionId);
  const missions = useOps((s) => s.missions);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const m = missions.find((x) => x.id === selId);
  const urgent = useMemo(() => missions.filter((x) => x.status === 'request').sort(missionRank).slice(0, 4), [missions]);
  if (m) {
    return (
      <>
        <SubHead
          right={
            <button onClick={() => actions.selectMission(undefined)} className="h-6 px-1.5 flex items-center gap-1 text-[10.5px] text-dim hover:text-white" title="Clear mission selection">
              Clear
            </button>
          }
        >
          <Icon name="target" size={12} className="shrink-0" />
          <span className="truncate">Deployment calculator</span>
        </SubHead>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <DeploymentCalculator key={m.id} missionId={m.id} compact limit={5} />
        </div>
      </>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-start gap-2.5 mx-3 mt-3 border border-dashed border-line-2 px-3 py-3">
        <Icon name="crosshair" size={16} className="text-dim mt-0.5 shrink-0" />
        <div>
          <div className="text-[12px] text-text font-semibold">No mission selected</div>
          <div className="text-[11px] text-dim mt-0.5 leading-snug">Pick a mission on the map or in the work queue to rank the fleet by earliest valid completion and draw transit vectors.</div>
        </div>
      </div>
      {urgent.length > 0 && (
        <div className="mt-4">
          <div className="label text-[9px] px-3 mb-1">Most urgent open requests</div>
          <div className="border-t border-line">
            {urgent.map((r) => {
              const sla = slaText(r.slaDue, now);
              const prof = MISSION_PROFILES[r.type];
              return (
                <button key={r.id} onClick={() => actions.selectMission(r.id)} className="group relative w-full text-left pl-3 pr-3 py-[7px] border-b border-line hover:bg-white/[0.035]">
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: TONE_COLOR[PRIORITY[r.priority].tone] }} />
                  <span className="flex items-center gap-1.5 h-4">
                    <Icon name={prof.icon} size={12} style={{ color: prof.color }} />
                    <span className="num text-[10.5px] text-muted">{r.code}</span>
                    <span className={cx('ml-auto num text-[10.5px]', sla.late ? 'text-alert' : sla.soon ? 'text-warn' : 'text-dim')}>{sla.text}</span>
                  </span>
                  <span className="flex items-baseline gap-1.5 mt-[3px] min-w-0">
                    <span className="text-[12px] text-text font-semibold truncate">{r.name}</span>
                    <span className="text-[10.5px] text-dim shrink-0">{REGION[r.regionId].name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fleet ───────────────────────────────────────────────────────────────────
function Readiness() {
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
    <>
      <SubHead right={<LinkArrow onClick={() => (location.hash = '#/fleet')}>Open Fleet</LinkArrow>}>
        <Icon name="gauge" size={12} className="shrink-0" />
        <span>Fleet readiness</span>
      </SubHead>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
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
        <div className="flex h-[8px] mt-2.5 bg-white/5" role="img" aria-label="Fleet status breakdown">
          {UNIT_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <div key={s} title={`${UNIT_STATUS[s].label}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: UNIT_STATUS_COLOR[s] }} className="border-r border-card last:border-r-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2.5">
          {UNIT_STATUSES.map((s) => (
            <span key={s} className={cx('flex items-center gap-1.5 text-[10.5px]', counts[s] ? 'text-muted' : 'text-dim/60')}>
              <i className="w-2 h-2 shrink-0" style={{ background: UNIT_STATUS_COLOR[s] }} />
              <span className="truncate">{UNIT_STATUS[s].label}</span>
              <span className="ml-auto num text-text">{counts[s]}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 border-t border-line pt-2.5">
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
        <p className="mt-4 text-[10.5px] text-dim leading-snug">Click a unit on the map for live telemetry.</p>
      </div>
    </>
  );
}

function TelemetryCard() {
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
  const cell = (k: string, v: ReactNode, sub?: ReactNode, color?: string) => (
    <div className="px-2.5 py-1.5 border-r border-b border-line min-w-0">
      <div className="label text-[9px]">{k}</div>
      <div className="num text-[14px] font-semibold leading-tight truncate" style={{ color: color ?? '#f2f2f2' }}>
        {v}
      </div>
      {sub && <div className="text-[10px] text-dim truncate">{sub}</div>}
    </div>
  );
  return (
    <>
      <SubHead
        right={
          <>
            <button onClick={() => actions.selectUnit(undefined)} className="h-6 px-1.5 flex items-center gap-1 text-[10.5px] text-dim hover:text-white" title="Back to fleet readiness">
              <Icon name="chevron-left" size={12} />
              Readiness
            </button>
          </>
        }
      >
        <Icon name="radio" size={12} className="shrink-0" />
        <span>Live telemetry</span>
      </SubHead>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="flex items-start gap-2">
          <span className="mt-[5px]">
            <StatusDot tone={tone} pulse={u.status === 'in-flight'} size={8} />
          </span>
          <div className="min-w-0">
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
        <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
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
          <ul className="mt-2.5 space-y-0.5">
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
        <div className="flex items-center mt-3 pt-2 border-t border-line">
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
    </>
  );
}

// ── Panel shell ─────────────────────────────────────────────────────────────
export function SidePanel({ tab, setTab, critical, onCollapse, overlay }: { tab: SideTab; setTab: (t: SideTab) => void; critical: number; onCollapse: () => void; overlay: boolean }) {
  const selU = useOps((s) => s.selectedUnitId);
  const selM = useOps((s) => s.selectedMissionId);
  const tabs: { id: SideTab; label: string; extra?: ReactNode }[] = [
    { id: 'briefing', label: 'Briefing', extra: critical > 0 ? <span className="num text-[9.5px] min-w-[15px] h-[14px] px-[3px] flex items-center justify-center bg-alert text-ink leading-none">{critical}</span> : undefined },
    { id: 'mission', label: 'Mission', extra: selM ? <span className="w-1.5 h-1.5 rounded-full bg-live" aria-label="mission selected" /> : undefined },
    { id: 'fleet', label: selU ? 'Unit' : 'Fleet', extra: selU ? <span className="w-1.5 h-1.5 rounded-full bg-live" aria-label="unit selected" /> : undefined },
  ];
  return (
    <aside className="h-full min-h-0 flex flex-col bg-card" aria-label="Briefing, mission and fleet">
      <header className="flex items-stretch h-10 border-b border-line shrink-0 pr-1.5">
        <div className="flex items-stretch flex-1 min-w-0" role="tablist" aria-label="Side panel">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={cx('relative flex items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.1em] whitespace-nowrap transition-colors', on ? 'text-white' : 'text-dim hover:text-muted')}
              >
                {t.label}
                {t.extra}
                {on && <span className="absolute left-2 right-2 bottom-[-1px] h-[2px]" style={{ background: 'var(--view-accent, #5cc3ba)' }} />}
              </button>
            );
          })}
        </div>
        <span className="self-center">
          <HeadButton icon={overlay ? 'x' : 'chevron-right'} label={overlay ? 'Close panel (Esc)' : 'Collapse panel'} onClick={onCollapse} />
        </span>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'briefing' && <Briefing />}
        {tab === 'mission' && <MissionTab />}
        {tab === 'fleet' && (selU ? <TelemetryCard /> : <Readiness />)}
      </div>
    </aside>
  );
}
