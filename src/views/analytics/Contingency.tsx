// Contingency Simulator — inject in-flight events and watch the automated protocol execute live.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { actions, ops, useOps } from '../../store';
import { AIRFRAME, MISSION_PROFILES, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { Badge, Empty, Icon, Meter, Panel, StatusDot, cx, useTz, type IconName, type Tone } from '../../ui/kit';
import { iconSvg } from '../../ui/icons';
import { distKm, fmtLatLng } from '../../lib/geo';
import { fmtClock, fmtDur } from '../../lib/time';
import type { ContingencyEvent, ContingencyState, LatLng, Unit } from '../../types';

interface EventDef {
  id: ContingencyEvent;
  label: string;
  icon: IconName;
  tone: Tone;
  action: ContingencyState['action'];
  summary: string;
  steps: string[];
}

const EVENTS: EventDef[] = [
  {
    id: 'c2-loss',
    label: 'C2 Link Loss',
    icon: 'wifi-off',
    tone: 'alert',
    action: 'RTL',
    summary: 'Command & control datalink drops below sensitivity.',
    steps: ['Lost-link timer (3 s) expires → failsafe', 'Cellular 4G/5G failover attempted', 'RTL: climb to RTL altitude, track home', 'Auto-land at launch point, disarm'],
  },
  {
    id: 'high-wind',
    label: 'High Wind Warning',
    icon: 'wind',
    tone: 'warn',
    action: 'DIVERT',
    summary: 'Gusts exceed the airframe limit from Master Data.',
    steps: ['Gust > configured max-gust limit', 'Into-wind ground speed check — return not assured', 'Divert downwind to nearest alternate LZ', 'Land at ALZ, recovery crew dispatched'],
  },
  {
    id: 'adsb-intrusion',
    label: 'Airspace Intrusion · ADS-B',
    icon: 'radar',
    tone: 'warn',
    action: 'DESCEND',
    summary: 'Manned traffic detected on ADS-B IN, well-clear predicted.',
    steps: ['ADS-B IN traffic advisory to PIC', 'DAA predicts well-clear violation', 'Auto-descend to 45 m AGL and hold', 'Traffic clear → resume mission profile'],
  },
  {
    id: 'cell-sag',
    label: 'Battery Cell Sag',
    icon: 'battery-warning',
    tone: 'alert',
    action: 'LAND',
    summary: 'BMS reports a cell voltage sag under load.',
    steps: ['BMS cell under-voltage under load', 'Remaining-energy model re-computed', 'Precautionary land at nearest ALZ', 'Pack quarantined → battery ledger review'],
  },
];
const EVENT: Record<ContingencyEvent, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<ContingencyEvent, EventDef>;
const ACTION_TONE: Record<ContingencyState['action'], Tone> = { RTL: 'alert', DIVERT: 'warn', HOLD: 'warn', DESCEND: 'warn', LAND: 'alert' };

export function ContingencyTab() {
  const units = useOps((s) => s.units);
  const missions = useOps((s) => s.missions);
  const now = useOps((s) => s.now);
  const simSpeed = useOps((s) => s.simSpeed);
  const tz = useTz();

  const list = useMemo(() => units.filter((u) => u.status === 'in-flight' || u.contingency), [units]);
  const [uid, setUid] = useState<string | undefined>(() => list.find((u) => u.contingency)?.id ?? list[0]?.id);
  const u = list.find((x) => x.id === uid) ?? list[0];
  const idle = useMemo(() => units.filter((x) => x.status === 'available' && !x.contingency && !AIRFRAME[x.modelId].isVessel), [units]);

  useEffect(() => {
    if (!uid && list[0]) setUid(list[0].id);
  }, [uid, list]);

  const m = u ? missions.find((x) => x.id === u.missionId) : undefined;
  const c = u?.contingency;
  const def = c ? EVENT[c.event] : undefined;
  // Collapse repeated identical entries (the sim re-logs touchdown on every tick after landing).
  const log = c ? c.log.filter((l, i, a) => l.ts <= now && !(i > 0 && a[i - 1].text === l.text)) : [];
  const pending = c ? c.log.filter((l) => l.ts > now).length : 0;
  const landed = !!c && u?.status === 'available' && u.altM === 0;
  const dist = u && c ? distKm(u.pos, c.target) : 0;
  const af = u ? AIRFRAME[u.modelId] : undefined;
  const etaMs = af && c && !landed && c.action !== 'DESCEND' ? (dist / af.cruiseKmh) * 3_600_000 : NaN;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Unit list */}
        <Panel index="01" title="Airborne units" icon="plane" subtitle={`${list.length}`} className="xl:col-span-3" bodyClassName="flex flex-col">
          {list.length ? (
            <div className="divide-y divide-line overflow-auto max-h-[520px]">
              {list.map((x) => {
                const mm = missions.find((y) => y.id === x.missionId);
                const on = x.id === u?.id;
                return (
                  <button key={x.id} onClick={() => setUid(x.id)} className={cx('w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors relative', on ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]')}>
                    {on && <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: '#c560c8' }} />}
                    <span className="mt-[5px]">
                      <StatusDot tone={x.contingency ? (x.status === 'available' && x.altM === 0 ? 'ok' : ACTION_TONE[x.contingency.action]) : 'live'} pulse={x.status === 'in-flight' || (!!x.contingency && x.altM > 0)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="num text-[12px] text-white">{x.callsign}</span>
                        {x.contingency ? (
                          x.status === 'available' && x.altM === 0 ? (
                            <Badge tone="ok">Landed</Badge>
                          ) : (
                            <Badge tone={ACTION_TONE[x.contingency.action]}>{x.contingency.action}</Badge>
                          )
                        ) : (
                          <span className="text-[10px] text-dim">{AIRFRAME[x.modelId].name}</span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-muted truncate">{mm ? `${mm.code} · ${MISSION_PROFILES[mm.type].short}` : x.contingency ? 'Contingency recovery' : 'Drill pattern'}</div>
                      <div className="num text-[10px] text-dim">
                        {fmtLatLng(x.pos)} · {Math.round(x.altM)} m · {Math.round(x.energyPct)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty icon="plane-landing" text="No units airborne" sub="Launch a drill flight below to rehearse a contingency." />
          )}
          {idle.length > 0 && (
            <div className="mt-auto border-t border-line px-3 py-2.5">
              <div className="label mb-1.5">Drill flight</div>
              <DrillLauncher idle={idle} onLaunched={setUid} />
            </div>
          )}
        </Panel>

        {/* Map + status */}
        <Panel
          index="02"
          title={u ? `${u.callsign} · live track` : 'Live track'}
          icon="crosshair"
          className="xl:col-span-6"
          bodyClassName="flex flex-col"
          actions={
            c ? (
              <Badge tone={landed ? 'ok' : ACTION_TONE[c.action]} dot>
                {landed ? 'Landed · safe' : `${c.action} active`}
              </Badge>
            ) : u ? (
              <Badge tone="live" dot>
                Nominal
              </Badge>
            ) : null
          }
        >
          <div className="relative h-[380px] xl:h-[420px] shrink-0">
            <ContingencyMap unit={u} />
            {u && (
              <div className="absolute left-2 top-2 glass px-2.5 py-1.5 z-[500] text-[10.5px] min-w-[180px]">
                <div className="num text-white text-[11px]">{u.callsign}</div>
                <div className="text-dim truncate max-w-[240px]">{m ? m.name : u.contingency ? 'Contingency recovery' : 'Drill pattern'}</div>
              </div>
            )}
            {c && (
              <div className="absolute right-2 top-2 glass px-2.5 py-1.5 z-[500] text-[10.5px]">
                <div className="flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 inline-block rotate-45 border" style={{ borderColor: TONE_COLOR[ACTION_TONE[c.action]] }} />
                  <span className="text-muted">Target</span>
                  <span className="text-white">{c.targetName}</span>
                </div>
              </div>
            )}
          </div>
          {u && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px border-t border-line" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <Cell label="Action" value={c ? (landed ? 'LANDED' : c.action) : 'MISSION'} tone={c ? (landed ? 'ok' : ACTION_TONE[c.action]) : 'live'} />
              <Cell label="Dist. to target" value={c ? `${dist.toFixed(2)} km` : '—'} />
              <Cell label="Time to target" value={isFinite(etaMs) ? fmtDur(etaMs) : c?.action === 'DESCEND' ? 'Holding' : '—'} />
              <Cell label="Altitude · speed" value={`${Math.round(u.altM)} m · ${Math.round(u.speedKmh)}`} />
              <div className="bg-card px-3 py-2">
                <div className="label">Energy</div>
                <div className="num text-[15px]" style={{ color: u.energyPct < 25 ? TONE_COLOR.alert : u.energyPct < 40 ? TONE_COLOR.warn : '#fff' }}>
                  {u.energyPct.toFixed(0)}%
                </div>
                <Meter value={u.energyPct} color={u.energyPct < 25 ? TONE_COLOR.alert : u.energyPct < 40 ? TONE_COLOR.warn : TONE_COLOR.ok} height={3} />
              </div>
            </div>
          )}
        </Panel>

        {/* Event log */}
        <Panel
          index="03"
          title="Event log"
          icon="list"
          className="xl:col-span-3"
          bodyClassName="flex flex-col"
          actions={
            c ? (
              <button className="btn h-6 px-2 text-[10px]" onClick={() => u && actions.clearContingency(u.id)}>
                <Icon name="rotate-ccw" size={11} /> Clear / reset
              </button>
            ) : null
          }
        >
          {c && u ? (
            <>
              <div className="px-3 py-2 border-b border-line flex items-center gap-2">
                <Icon name={def!.icon} size={16} style={{ color: TONE_COLOR[def!.tone] }} />
                <div className="min-w-0">
                  <div className="text-[12px] text-white font-semibold">{def!.label}</div>
                  <div className="num text-[10.5px] text-dim">
                    T+{fmtDur(now - c.startedAt)} · started {fmtClock(c.startedAt, tz)} {tz}
                  </div>
                </div>
              </div>
              <ol className="p-3 flex flex-col gap-0 overflow-auto max-h-[360px]">
                {log.map((l, i) => (
                  <li key={i} className="grid grid-cols-[62px_10px_1fr] gap-2 text-[11px]">
                    <span className="num text-dim pt-[1px]">{fmtClock(l.ts, tz)}</span>
                    <span className="relative flex justify-center">
                      <span className="w-[7px] h-[7px] mt-[4px] rounded-full" style={{ background: i === log.length - 1 ? TONE_COLOR[landed ? 'ok' : def!.tone] : '#7a7a7a' }} />
                      {i < log.length - 1 && <span className="absolute top-[12px] bottom-[-4px] w-px bg-line-2" />}
                    </span>
                    <span className={cx('pb-2.5 leading-snug', i === log.length - 1 ? 'text-white' : 'text-muted')}>{l.text}</span>
                  </li>
                ))}
                {pending > 0 && (
                  <li className="grid grid-cols-[62px_10px_1fr] gap-2 text-[11px]">
                    <span className="num text-dim">··:··:··</span>
                    <span className="flex justify-center">
                      <span className="w-[7px] h-[7px] mt-[4px] rounded-full border border-dim blink" />
                    </span>
                    <span className="text-dim">Awaiting next protocol step…</span>
                  </li>
                )}
              </ol>
              <div className="mt-auto px-3 py-2 border-t border-line text-[10.5px] text-dim flex items-center gap-1.5">
                <Icon name="file-text" size={11} /> Logged to audit trail · alert raised · fault code active
              </div>
            </>
          ) : (
            <Empty icon="shield-check" text={u ? 'No active contingency' : 'Select a unit'} sub={u ? 'Inject an event below to run the automated protocol.' : undefined} />
          )}
        </Panel>
      </div>

      {/* Event injectors / protocols */}
      <Panel index="04" title="Inject in-flight event" icon="siren" subtitle={u ? `target: ${u.callsign} · sim ${simSpeed}× real time — the unit flies the protocol live` : 'select an airborne unit'}>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-px" style={{ background: 'rgba(255,255,255,0.10)' }}>
          {EVENTS.map((e) => {
            const active = c?.event === e.id;
            return (
              <div key={e.id} className={cx('bg-card p-3 flex flex-col gap-2 relative', active && 'bg-[#2c262c]')}>
                {active && <span className="absolute left-0 right-0 top-0 h-[2px]" style={{ background: TONE_COLOR[e.tone] }} />}
                <div className="flex items-center gap-2">
                  <span className={cx('w-8 h-8 flex items-center justify-center border', e.tone === 'alert' ? 'border-alert/40 bg-alert-bg' : 'border-warn/40 bg-warn-bg')}>
                    <Icon name={e.icon} size={16} style={{ color: TONE_COLOR[e.tone] }} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-white">{e.label}</div>
                    <div className="text-[10.5px] text-dim">
                      Protocol <span className="num text-muted">{e.action}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted leading-snug">{e.summary}</p>
                <ol className="flex flex-col gap-1">
                  {e.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px]">
                      <span className="num text-[10px] text-dim w-4 shrink-0 pt-[1px]">{i + 1}.</span>
                      <span className="text-text leading-snug">{s}</span>
                    </li>
                  ))}
                </ol>
                <button className={cx('btn mt-auto justify-center', !active && 'btn-solid')} disabled={!u || !!c} onClick={() => u && actions.simulateContingency(u.id, e.id)}>
                  <Icon name={active ? 'activity' : 'zap'} size={12} />
                  {active ? 'Running' : 'Simulate'}
                </button>
              </div>
            );
          })}
        </div>
        {c && (
          <div className="px-3 py-2 border-t border-line text-[11px] text-muted flex items-center gap-2">
            <Icon name="info" size={12} className="text-dim" /> One contingency at a time per unit — clear / reset the current event to inject another.
          </div>
        )}
      </Panel>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="bg-card px-3 py-2 min-w-0">
      <div className="label">{label}</div>
      <div className="num text-[15px] truncate" style={{ color: tone ? TONE_COLOR[tone] : '#fff' }}>
        {value}
      </div>
    </div>
  );
}

function DrillLauncher({ idle, onLaunched }: { idle: Unit[]; onLaunched: (id: string) => void }) {
  const [id, setId] = useState(idle[0]?.id ?? '');
  const sel = idle.find((x) => x.id === id) ?? idle[0];
  return (
    <div className="flex items-center gap-2">
      <select value={sel?.id} onChange={(e) => setId(e.target.value)} className="field flex-1 min-w-0 num text-[11px]">
        {idle.map((x) => (
          <option key={x.id} value={x.id} className="bg-card">
            {x.callsign} · {AIRFRAME[x.modelId].name}
          </option>
        ))}
      </select>
      <button
        className="btn"
        onClick={() => {
          if (!sel) return;
          actions.launchDrill(sel.id);
          onLaunched(sel.id);
        }}
        title={`Launch ${sel?.callsign} on a hover drill (${UNIT_STATUS.available.label} units only)`}
      >
        <Icon name="plane-takeoff" size={12} /> Launch
      </button>
    </div>
  );
}

// ── Leaflet mini-map (created once, imperative updates) ─────────────────────
function ContingencyMap({ unit }: { unit?: Unit }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ static: L.LayerGroup; track: L.Polyline; path: L.Polyline; unit: L.Marker; target: L.Marker } | null>(null);
  const fitKey = useRef('');

  useEffect(() => {
    if (!el.current) return;
    const mp = L.map(el.current, { zoomControl: false, attributionControl: true, center: [-2.4, 118], zoom: 5 });
    L.control.zoom({ position: 'bottomright' }).addTo(mp);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(mp);
    const st = L.layerGroup().addTo(mp);
    const track = L.polyline([], { color: '#26d8d9', weight: 2, opacity: 0.85 }).addTo(mp);
    const path = L.polyline([], { color: '#ff4d55', weight: 2, dashArray: '6 5', opacity: 0.95 }).addTo(mp);
    const blank = L.divIcon({ className: '', html: '', iconSize: [1, 1] });
    const target = L.marker([0, 0], { interactive: true, opacity: 0, icon: blank }).addTo(mp);
    const um = L.marker([0, 0], { opacity: 0, zIndexOffset: 1000, icon: blank }).addTo(mp);
    map.current = mp;
    layers.current = { static: st, track, path, unit: um, target };
    const ro = new ResizeObserver(() => mp.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      mp.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  // Static context: base, launch point, alternate landing zones (recomputed when unit / contingency changes)
  const staticKey = unit ? `${unit.id}|${unit.missionId ?? ''}|${unit.contingency?.startedAt ?? 0}` : '';
  useEffect(() => {
    const lg = layers.current;
    if (!lg) return;
    lg.static.clearLayers();
    if (!unit) return;
    const S = ops.get();
    const base = S.bases.find((b) => b.id === unit.baseId);
    const m = S.missions.find((x) => x.id === unit.missionId);
    const pin = (p: LatLng, name: string, color: string, icon: 'house' | 'flag' | 'plane-landing') =>
      L.marker(p, {
        icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:#1a1a1a;border:1px solid ${color}">${iconSvg(icon, 12, color)}</div>` }),
      })
        .bindTooltip(name, { className: 'so-tip', direction: 'top', offset: [0, -10] })
        .addTo(lg.static);
    if (base) {
      pin(base.pos, `${base.name} (home base)`, '#8b93a3', 'house');
      for (const a of base.alternates) {
        pin(a.pos, `ALZ · ${a.name}`, '#e8a33a', 'plane-landing');
        L.tooltip({ permanent: true, direction: 'right', offset: [12, 0], className: 'so-label' }).setLatLng(a.pos).setContent(a.name).addTo(lg.static);
      }
    }
    if (m) pin(m.launchPoint, `Launch point · ${m.code}`, '#3ccf6e', 'flag');
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic: unit marker, track, path to target
  useEffect(() => {
    const lg = layers.current;
    const mp = map.current;
    if (!lg || !mp) return;
    if (!unit) {
      lg.unit.setOpacity(0);
      lg.target.setOpacity(0);
      lg.track.setLatLngs([]);
      lg.path.setLatLngs([]);
      return;
    }
    const c = unit.contingency;
    const tone = c ? (unit.status === 'available' && unit.altM === 0 ? 'ok' : ACTION_TONE[c.action]) : 'live';
    const col = TONE_COLOR[tone];
    lg.unit
      .setLatLng(unit.pos)
      .setIcon(
        L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="position:relative;width:30px;height:30px">${c && tone !== 'ok' ? `<span class="pulse-ring" style="position:absolute;inset:3px;border-radius:50%;background:${col}"></span>` : ''}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${unit.headingDeg - 45}deg)">${iconSvg('navigation-2', 18, col, 2).replace('<svg', `<svg style="transform:rotate(45deg)" fill="${col}"`)}</div></div>`,
        }),
      )
      .setOpacity(1);
    lg.unit.unbindTooltip().bindTooltip(`${unit.callsign} · ${Math.round(unit.altM)} m · ${Math.round(unit.energyPct)}%`, { className: 'so-label', permanent: true, direction: 'right', offset: [14, 0] });
    lg.track.setLatLngs(unit.track.length ? unit.track : [unit.pos]);
    lg.track.setStyle({ color: c ? '#b4b4b4' : '#26d8d9' });
    if (c) {
      lg.path.setLatLngs([unit.pos, c.target]);
      lg.path.setStyle({ color: TONE_COLOR[ACTION_TONE[c.action]] });
      lg.target
        .setLatLng(c.target)
        .setIcon(
          L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;transform:rotate(45deg);border:2px solid ${TONE_COLOR[ACTION_TONE[c.action]]};background:rgba(22,22,22,.8)"></div></div>`,
          }),
        )
        .setOpacity(1);
      lg.target.unbindTooltip().bindTooltip(`${c.action} → ${c.targetName}`, { className: 'so-tip', direction: 'top', offset: [0, -10] });
    } else {
      lg.path.setLatLngs([]);
      lg.target.setOpacity(0);
    }
    // Fit when unit or contingency changes
    const key = `${unit.id}|${c?.startedAt ?? 0}`;
    if (fitKey.current !== key) {
      fitKey.current = key;
      const S = ops.get();
      const base = S.bases.find((b) => b.id === unit.baseId);
      const pts: LatLng[] = [unit.pos, ...unit.track.slice(-40)];
      if (c) pts.push(c.target);
      if (base) pts.push(...base.alternates.map((a) => a.pos));
      const b = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
      mp.fitBounds(b.pad(0.25), { maxZoom: 14, animate: false });
    }
  }, [unit]);

  return <div ref={el} className="absolute inset-0" />;
}

