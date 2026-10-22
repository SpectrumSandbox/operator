// Mission Control — pure Leaflet layer builders (HTML strings, icons, zones, missions).
import * as L from 'leaflet';
import type { AirspaceZone, Base, Crew, LatLng, Mission, MissionHealth, Unit } from '../../types';
import { AIRFRAME, MISSION_HEALTH, MISSION_PROFILES, MISSION_STATUS, PRIORITY, REGION, TONE_COLOR, UNIT_STATUS, ZONE_META } from '../../data/catalog';
import { iconSvg } from '../../ui/icons';
import { bearingDeg, fmtLatLng, geometryCenter, lineLengthKm, alongLine } from '../../lib/geo';
import { fmtDur, fmtStamp, type Tz } from '../../lib/time';
import { fmtNum } from '../../lib/format';
import { zoneActive } from '../../engine/airspace';
import type { OpsState } from '../../store';
import { esc, slaText, unitColor } from './util';

/** Indonesia, Sabang to Merauke. */
export const INDONESIA_BOUNDS = L.latLngBounds([-11.2, 94.8], [6.2, 141.2]);

export type Tier = 'nat' | 'reg' | 'loc';
export const tierOf = (z: number): Tier => (z < 7.5 ? 'nat' : z < 9 ? 'reg' : 'loc');

// ── Tooltip HTML ─────────────────────────────────────────────────────────────
const row = (k: string, v: string) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
const chip = (text: string, color: string) => `<span class="chip" style="color:${color};border-color:${color}66">${esc(text)}</span>`;

export function missionTip(m: Mission, health: MissionHealth | undefined, S: OpsState): string {
  const prof = MISSION_PROFILES[m.type];
  const st = MISSION_STATUS[m.status];
  const h = MISSION_HEALTH[health ?? 'nominal'];
  const sla = slaText(m.slaDue, S.now);
  const units = m.assignedUnitIds.map((id) => S.units.find((u) => u.id === id)?.callsign).filter(Boolean).join(', ');
  return `<div class="mc-tt">
    <div class="h"><span>${esc(m.code)}</span>${chip(st.label, TONE_COLOR[st.tone])}${m.status !== 'completed' ? chip(h.label.replace('Weather / Airspace ', ''), h.color) : ''}</div>
    <div class="t">${esc(m.name)}</div>
    ${row('Type', `<span style="color:${prof.color}">${esc(prof.short)}</span> · ${esc(m.subtype)}`)}
    ${row('Priority', PRIORITY[m.priority].label)}
    ${row('Region', REGION[m.regionId].name)}
    ${row('Workload', `${fmtNum(m.workload, m.workload < 50 ? 1 : 0)} ${prof.unit}`)}
    ${row('Progress', `${Math.round(m.progress * 100)}%`)}
    <div class="bar"><i style="width:${Math.round(m.progress * 100)}%;background:${h.color}"></i></div>
    ${row('SLA due', `<span style="color:${sla.late ? TONE_COLOR.alert : sla.soon ? TONE_COLOR.warn : '#f2f2f2'}">${sla.text}</span> · ${fmtStamp(m.slaDue, S.tz)}`)}
    ${units ? row('Units', esc(units)) : ''}
    ${row('Max alt', `${m.maxAltFt} ft AGL${m.bvlos ? ' · BVLOS' : ''}`)}
  </div>`;
}

export function unitTip(u: Unit, S: OpsState): string {
  const af = AIRFRAME[u.modelId];
  const st = UNIT_STATUS[u.status];
  const m = u.missionId ? S.missions.find((x) => x.id === u.missionId) : undefined;
  const color = unitColor(u);
  return `<div class="mc-tt">
    <div class="h"><span>${esc(u.tail)}</span>${chip(u.contingency ? u.contingency.action : st.label, color)}</div>
    <div class="t">${esc(u.callsign)}</div>
    ${row('Airframe', esc(af.name))}
    ${m ? row('Mission', esc(m.code)) : ''}
    ${row(af.propulsion === 'electric' ? 'Battery' : 'Fuel', `<span style="color:${u.energyPct < 30 ? TONE_COLOR.alert : '#f2f2f2'}">${Math.round(u.energyPct)}%</span>`)}
    ${u.status === 'in-flight' || u.contingency ? row('Alt / Speed', `${Math.round(u.altM)} m · ${Math.round(u.speedKmh)} km/h`) : ''}
    ${u.status === 'in-flight' ? row('Heading', `${String(Math.round(u.headingDeg)).padStart(3, '0')}°`) : ''}
    ${row('Position', fmtLatLng(u.pos))}
    ${u.contingency ? `<div class="note" style="color:${TONE_COLOR.alert}">${esc(u.contingency.event.toUpperCase())} → ${esc(u.contingency.targetName)}</div>` : ''}
  </div>`;
}

export function baseTip(b: Base, units: Unit[]): string {
  const here = units.filter((u) => u.baseId === b.id);
  const ready = here.filter((u) => u.status === 'available').length;
  return `<div class="mc-tt">
    <div class="h"><span>${esc(b.id.toUpperCase())}</span>${chip(b.kind, '#b4b4b4')}</div>
    <div class="t">${esc(b.name)}</div>
    ${row('Location', esc(b.city.split('·')[0].trim()))}
    ${row('Units based', `${here.length} · ${ready} available`)}
    ${row('Chargers', String(b.chargers))}
    ${row('Alternates', String(b.alternates.length))}
  </div>`;
}

export function crewTip(c: Crew, S: OpsState): string {
  const m = S.missions.find((x) => x.crewIds.includes(c.id) && x.status === 'active');
  const dutyColor = c.dutyHrsToday >= c.maxDutyHrs * 0.9 ? TONE_COLOR.alert : c.dutyHrsToday >= c.maxDutyHrs * 0.75 ? TONE_COLOR.warn : '#f2f2f2';
  return `<div class="mc-tt">
    <div class="h"><span>${esc(c.id.toUpperCase())}</span>${chip(c.status.replace('-', ' '), c.status === 'in-field' ? TONE_COLOR.live : c.status === 'on-duty' ? TONE_COLOR.ok : TONE_COLOR.idle)}</div>
    <div class="t">${esc(c.name)}</div>
    ${row('Role', esc(c.role))}
    ${row('Duty today', `<span style="color:${dutyColor}">${c.dutyHrsToday.toFixed(1)} / ${c.maxDutyHrs} h</span>`)}
    ${row('Flight 28d', `${c.flightHrs28d} / ${c.maxFlightHrs28d} h`)}
    ${c.certs.length ? row('Ratings', esc(c.certs.join(' · '))) : ''}
    ${m ? row('Mission', esc(m.code)) : ''}
  </div>`;
}

export function zoneTip(z: AirspaceZone, now: number, tz: Tz): string {
  const meta = ZONE_META[z.kind];
  const active = zoneActive(z, now);
  const win =
    z.activeFrom === undefined
      ? 'Permanent'
      : active
        ? `Active · lifts in ${fmtDur(z.activeTo! - now)}`
        : z.activeFrom > now
          ? `Activates in ${fmtDur(z.activeFrom - now)}`
          : 'Expired';
  return `<div class="mc-tt">
    <div class="h"><span>${esc(z.ref ?? z.id.toUpperCase())}</span>${chip(meta.label.split('(')[0].trim(), meta.color)}</div>
    <div class="t">${esc(z.name)}</div>
    ${row('Authority', esc(z.authority))}
    ${z.airspaceClass ? row('Class', z.airspaceClass) : ''}
    ${row('UAS limit', z.maxUasFt === 0 ? `<span style="color:${TONE_COLOR.alert}">0 ft · PROHIBITED</span>` : `≤ ${z.maxUasFt} ft AGL`)}
    ${row('Window', win)}
    ${z.activeFrom !== undefined ? row('From / to', `${fmtStamp(z.activeFrom, tz).replace(/ (WIB|UTC)$/, '')} → ${fmtStamp(z.activeTo!, tz)}`) : ''}
    ${z.note ? `<div class="note">${esc(z.note)}</div>` : ''}
  </div>`;
}

// ── Icons ───────────────────────────────────────────────────────────────────
export function baseIcon(b: Base, tier: Tier, count: number): L.DivIcon {
  const size = tier === 'nat' ? 14 : 20;
  const label = tier !== 'nat' ? `<span class="mc-base-lbl">${esc(b.name)}<small>${count} UAS</small></span>` : '';
  const glyph = b.kind === 'maritime' ? 'anchor' : b.kind === 'hub' ? 'building' : 'warehouse';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="mc-base ${tier === 'nat' ? 'mc-base-sm' : ''}">${iconSvg(glyph, tier === 'nat' ? 9 : 12, '#f2f2f2', 2)}${label}</div>`,
  });
}

export function crewIcon(c: Crew): L.DivIcon {
  const color = c.status === 'in-field' ? TONE_COLOR.live : c.status === 'on-duty' ? TONE_COLOR.ok : c.status === 'rest' ? TONE_COLOR.warn : TONE_COLOR.idle;
  return L.divIcon({ className: '', iconSize: [8, 8], iconAnchor: [4, 4], html: `<div class="mc-crew" style="background:${color}"></div>` });
}

export function missionPinIcon(color: string, selected: boolean): L.DivIcon {
  const s = selected ? 15 : 11;
  return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<div class="mc-pin ${selected ? 'mc-pin-sel' : ''}" style="background:${color}"></div>` });
}

/** Chevron pointing to bearing 0 (north); rotated by the parent element. */
function uavGlyph(color: string, vessel: boolean, vecPx: number): string {
  const body = vessel
    ? `<path d="M0,-9 L6,-3 L6,8 L-6,8 L-6,-3 Z" fill="${color}" stroke="#101010" stroke-width="1.3"/>`
    : `<path d="M0,-10 L7.5,8 L0,4 L-7.5,8 Z" fill="${color}" stroke="#101010" stroke-width="1.3" stroke-linejoin="round"/>`;
  return `<svg width="28" height="28" viewBox="-14 -14 28 28"><line class="mc-vec" x1="0" y1="-10" x2="0" y2="${-10 - vecPx}" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.9"/>${body}</svg>`;
}

export interface UavIconOpts {
  tier: Tier;
  airborne: boolean;
  inFlight: boolean;
  selected: boolean;
  candidate: boolean;
  showLabel: boolean;
  vessel: boolean;
  color: string;
  rot: number;
  vecPx: number;
}

export function uavIcon(o: UavIconOpts): L.DivIcon {
  const ring = o.selected ? `<span class="mc-ring"></span>` : o.candidate ? `<span class="mc-ring" style="border-color:${o.color};border-style:dashed"></span>` : '';
  const pulse = o.inFlight ? `<span class="mc-pulse" style="background:${o.color}"></span>` : '';
  let core: string;
  if (o.tier === 'nat' && !o.selected) core = `<span class="mc-uav-dot" style="background:${o.color}"></span>`;
  else if (!o.airborne) core = `<span class="mc-uav-parked" style="border-color:${o.color}"></span>`;
  else core = `<div class="mc-rot" style="transform:rotate(${o.rot}deg)">${uavGlyph(o.color, o.vessel, o.vecPx)}</div>`;
  const label = o.showLabel ? `<div class="mc-uav-lbl" style="border-color:${o.color}"></div>` : '';
  return L.divIcon({ className: 'uav-icon', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="mc-uav">${pulse}${ring}${core}${label}</div>` });
}

export function uavLabel(u: Unit, full: boolean): string {
  const lo = u.energyPct < 30;
  if (!full) return `<b>${esc(u.callsign)}</b>${u.contingency ? ` <span class="mc-lo">${u.contingency.action}</span>` : ''}`;
  const alt = AIRFRAME[u.modelId].isVessel ? 'SURF' : `${Math.round(u.altM)}m`;
  return `<b>${esc(u.callsign)}</b> <i>·</i> ${alt} <i>·</i> ${Math.round(u.speedKmh)}<i>km/h</i> <i>·</i> <span class="${lo ? 'mc-lo' : ''}">${Math.round(u.energyPct)}%</span>`;
}

// ── Missions ────────────────────────────────────────────────────────────────
export interface MissionDraw {
  layers: L.Layer[];
  /** Layers that receive click/tooltip. */
  hit: L.Layer[];
}

export function drawMission(m: Mission, color: string, selected: boolean, tier: Tier): MissionDraw {
  const done = m.status === 'completed';
  const g = m.geometry;
  const layers: L.Layer[] = [];
  const hit: L.Layer[] = [];
  const w = selected ? 3 : 1.6;
  const base: L.PathOptions = { color, weight: w, opacity: done ? 0.3 : 0.95, pane: 'mc-msn' };
  if (g.kind === 'aoi') {
    const p = L.polygon(g.polygon, { ...base, fillColor: color, fillOpacity: done ? 0.03 : selected ? 0.24 : 0.13, dashArray: done ? '3 4' : undefined });
    layers.push(p);
    hit.push(p);
  } else if (g.kind === 'loiter') {
    const c = L.circle(g.center, { ...base, radius: g.radiusKm * 1000, fillColor: color, fillOpacity: done ? 0.02 : selected ? 0.18 : 0.08, dashArray: done ? '3 4' : '5 4' });
    layers.push(c);
    hit.push(c);
  } else if (g.kind === 'corridor') {
    // Buffer look: wide translucent band + centreline.
    const band = L.polyline(g.line, { color, weight: tier === 'loc' ? (selected ? 16 : 11) : 7, opacity: done ? 0.06 : selected ? 0.3 : 0.18, lineCap: 'butt', lineJoin: 'round', pane: 'mc-msn' });
    const center = L.polyline(g.line, { ...base, weight: selected ? 2.5 : 1.6, dashArray: done ? '3 4' : undefined });
    layers.push(band, center);
    hit.push(band, center);
  } else {
    const line = L.polyline(g.line, { ...base, weight: selected ? 3 : 2, dashArray: '7 5' });
    layers.push(line);
    hit.push(line);
    if (!done && tier !== 'nat') {
      // direction chevrons at segment midpoints
      const len = lineLengthKm(g.line);
      for (const f of [0.3, 0.7]) {
        const a = alongLine(g.line, len * f);
        layers.push(
          L.marker(a.pos, {
            interactive: false,
            pane: 'mc-msn-mk',
            icon: L.divIcon({
              className: 'mc-chev',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<svg width="14" height="14" viewBox="-7 -7 14 14" style="transform:rotate(${a.heading}deg)"><path d="M-4.5,2.5 L0,-3 L4.5,2.5" fill="none" stroke="${color}" stroke-width="2"/></svg>`,
            }),
          }),
        );
      }
      // destination marker
      const end = g.line[g.line.length - 1];
      layers.push(L.circleMarker(end, { radius: 3.5, color, weight: 1.5, fillColor: '#161616', fillOpacity: 1, pane: 'mc-msn', interactive: false }));
    }
  }
  return { layers, hit };
}

export function missionCenter(m: Mission): LatLng {
  return geometryCenter(m.geometry);
}

// ── Zones ───────────────────────────────────────────────────────────────────
export interface ZoneDraw {
  layers: L.Layer[];
  labelAt?: LatLng;
  label?: string;
  upcoming: boolean;
}

export function zoneLabelText(z: AirspaceZone, now: number): string {
  if (z.kind === 'ctr') return `CTR · CLASS ${z.airspaceClass ?? 'C'} · ≤ ${z.maxUasFt} ft AGL`;
  if (z.kind === 'population') return `POP · ≤ ${z.maxUasFt} ft AGL`;
  const pre = z.kind === 'kkop' ? 'KKOP' : z.kind === 'military' ? 'MIL' : z.kind === 'tfr' ? 'TFR' : 'NOTAM';
  if (z.activeFrom !== undefined && z.activeFrom > now) return `${pre} · 0 ft · in ${fmtDur(z.activeFrom - now)}`;
  return `${pre} · 0 ft · PROHIBITED`;
}

export function drawZone(z: AirspaceZone, now: number): ZoneDraw | undefined {
  const meta = ZONE_META[z.kind];
  const timed = z.activeFrom !== undefined && z.activeTo !== undefined;
  const active = zoneActive(z, now);
  if (timed && z.activeTo! < now) return undefined;
  if (timed && !active && z.activeFrom! - now > 48 * 3_600_000) return undefined;
  const upcoming = timed && !active;
  const fillOpacity = upcoming ? 0 : meta.fill;
  const style: L.PathOptions = { pane: 'mc-zone', color: meta.color, weight: z.kind === 'ctr' ? 1 : 1.3, opacity: upcoming ? 0.75 : 0.85, dashArray: upcoming ? '5 5' : meta.dash, fillColor: meta.color, fillOpacity };
  const small = z.kind !== 'ctr' && z.kind !== 'population';
  const layers: L.Layer[] = [];
  let labelAt: LatLng;
  if (z.shape.type === 'circle') {
    const fill = L.circle(z.shape.center, { ...style, radius: z.shape.radiusKm * 1000, interactive: small && !upcoming, stroke: !small || upcoming ? false : true });
    layers.push(fill);
    if (!small || upcoming) layers.push(L.circle(z.shape.center, { ...style, radius: z.shape.radiusKm * 1000, fill: false, interactive: true }));
    const c = z.shape.center;
    labelAt = [c[0] + z.shape.radiusKm / 111, c[1]];
  } else {
    const fill = L.polygon(z.shape.points, { ...style, interactive: small && !upcoming, stroke: !small || upcoming ? false : true });
    layers.push(fill);
    if (!small || upcoming) layers.push(L.polygon(z.shape.points, { ...style, fill: false, interactive: true }));
    labelAt = z.shape.points.reduce((a, p) => (p[0] > a[0] ? p : a), z.shape.points[0]);
  }
  return { layers, labelAt, label: zoneLabelText(z, now), upcoming };
}

export function bearing(a: LatLng, b: LatLng) {
  return bearingDeg(a, b);
}
