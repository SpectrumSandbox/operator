// Mission Control — tactical map of Indonesia. The Leaflet map is created once;
// all layers are synchronised imperatively from the store (no React re-render
// per tick). Each layer group rebuilds only when its signature changes; live
// units are moved with setLatLng and rotated in place for smooth animation.
import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import './mc.css';
import type { LatLng, Mission, MissionHealth } from '../../types';
import { actions, ops, type OpsState } from '../../store';
import { AIRFRAME, MISSION_HEALTH, NATIONAL_VIEW, REGIONS, TONE_COLOR } from '../../data/catalog';
import type { EtaResult } from '../../engine/eta';
import { detectConflicts } from '../../engine/conflicts';
import { missionHealth } from '../../engine/health';
import { missionPath } from '../../engine/flightpath';
import { projectCell, sampleWeather, windToDeg } from '../../engine/weather';
import { distKm, geometryPoints } from '../../lib/geo';
import { MIN, fmtDur } from '../../lib/time';
import {
  INDONESIA_BOUNDS,
  baseIcon,
  baseTip,
  crewIcon,
  crewTip,
  drawMission,
  drawZone,
  missionCenter,
  missionPinIcon,
  missionTip,
  tierOf,
  uavIcon,
  uavLabel,
  unitTip,
  zoneTip,
  type Tier,
} from './mapLayers';
import { TRANSPORT_COLOR, TRANSPORT_SHORT, esc, isAirborne, slicePath, topCandidates, unitColor } from './util';
import { MapOverlays } from './MapOverlays';
import { NAV_ATTRIBUTION, NAV_LAYERS, buildNavLayer, ensureNav, navEntry, onNavEarthChange } from './navearth';
import { mapInsets, uiPrefs } from './uiState';

/** Unit callsign labels appear from this zoom; below it units are dots only. */
const LABEL_ZOOM = 8;

// Esri Canvas dark-gray basemap (keyless) with its label reference layer; Esri World Imagery for satellite.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTR = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community';
const TILES = {
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opts: { maxZoom: 19, maxNativeZoom: 16, attribution: ESRI_ATTR },
  },
  satellite: {
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    opts: { maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
  },
} as const;

const PANES: [string, number][] = [
  ['mc-nav', 402],
  ['mc-zone', 405],
  ['mc-wx', 410],
  ['mc-msn', 420],
  ['mc-path', 430],
  ['mc-transit', 440],
  ['mc-wxmk', 450],
  ['mc-msn-mk', 590],
  ['mc-base', 595],
  ['mc-zlbl', 445],
];

type GroupKey = 'zones' | 'radar' | 'wind' | 'ceil' | 'regions' | 'missions' | 'paths' | 'tracks' | 'transit' | 'bases' | 'crews' | 'units';

interface UnitRec {
  m: L.Marker;
  key: string;
  rot: number;
  track?: L.Polyline;
}

interface Ctx {
  map: L.Map;
  tiles: Record<'dark' | 'satellite', L.Layer>;
  g: Record<GroupKey, L.LayerGroup>;
  keys: Partial<Record<string, string>>;
  units: Map<string, UnitRec>;
  flown: Map<string, { line: L.Polyline; path: LatLng[] }>;
  health: { key: string; map: Record<string, MissionHealth> };
  cands: { key: string; list: EtaResult[] };
  boundsVer: number;
  lastSelM?: string;
  lastSelU?: string;
  basemap?: string;
  nav: Map<string, { ver: number; layer: L.Layer }>;
  navAttr?: boolean;
}

const TOOLTIP: L.TooltipOptions = { className: 'so-tip', direction: 'top', offset: [0, -8], opacity: 1 };

// ── derived data (cached in ctx) ─────────────────────────────────────────────
function healthOf(ctx: Ctx, S: OpsState): Record<string, MissionHealth> {
  const key = `${Math.floor(S.now / MIN)}|${S.weatherSeverity}|${S.masterVersion}|${S.missions.map((m) => m.status[0] + m.assignedUnitIds.length).join('')}`;
  if (ctx.health.key !== key) {
    const conflicts = detectConflicts(S);
    const map: Record<string, MissionHealth> = {};
    for (const m of S.missions) map[m.id] = missionHealth(m, conflicts, S);
    ctx.health = { key, map };
  }
  return ctx.health.map;
}

function candsOf(ctx: Ctx, S: OpsState): EtaResult[] {
  const m = S.missions.find((x) => x.id === S.selectedMissionId);
  const key = `${S.selectedMissionId}|${Math.floor(S.now / MIN)}|${S.weatherSeverity}|${S.kpIndex}|${S.masterVersion}|${m?.status}|${m?.assignedUnitIds.join()}|${S.units.map((u) => u.status[0] + (u.missionId ?? '')).join()}`;
  if (ctx.cands.key !== key) ctx.cands = { key, list: topCandidates(m, S) };
  return ctx.cands.list;
}

// ── sync functions ──────────────────────────────────────────────────────────
function syncNavEarth(ctx: Ctx, S: OpsState) {
  const ly = S.layers;
  let anyOn = false;
  for (const def of NAV_LAYERS) {
    const on = ly.navearth && ly[def.toggle] === true;
    const cur = ctx.nav.get(def.key);
    if (!on) {
      if (cur && ctx.map.hasLayer(cur.layer)) ctx.map.removeLayer(cur.layer);
      continue;
    }
    anyOn = true;
    ensureNav(def.key, def.refreshMs);
    if (def.extra) ensureNav(def.extra, def.refreshMs);
    const e = navEntry(def.key);
    const x = def.extra ? navEntry(def.extra) : undefined;
    if (e.status !== 'ok' || !e.data) continue;
    const ver = e.ver * 1000 + (x?.ver ?? 0);
    if (!cur || cur.ver !== ver) {
      if (cur) ctx.map.removeLayer(cur.layer);
      const layer = buildNavLayer(def, e.data, x?.status === 'ok' ? x.data : undefined);
      ctx.nav.set(def.key, { ver, layer });
      layer.addTo(ctx.map);
    } else if (!ctx.map.hasLayer(cur.layer)) cur.layer.addTo(ctx.map);
  }
  if (anyOn !== !!ctx.navAttr) {
    if (anyOn) ctx.map.attributionControl.addAttribution(NAV_ATTRIBUTION);
    else ctx.map.attributionControl.removeAttribution(NAV_ATTRIBUTION);
    ctx.navAttr = anyOn;
  }
}

function syncBasemap(ctx: Ctx, S: OpsState) {
  if (ctx.basemap === S.layers.basemap) return;
  ctx.basemap = S.layers.basemap;
  const on = ctx.tiles[S.layers.basemap];
  const off = ctx.tiles[S.layers.basemap === 'dark' ? 'satellite' : 'dark'];
  if (ctx.map.hasLayer(off)) ctx.map.removeLayer(off);
  if (!ctx.map.hasLayer(on)) on.addTo(ctx.map);
}

function syncZones(ctx: Ctx, S: OpsState, tier: Tier) {
  const ly = S.layers;
  const key = `${ly.airspace}${ly.ctr}${ly.kkop}${ly.tfr}${ly.military}${ly.population}${ly.bases}|${S.selectedMissionId}|${ctx.map.getZoom()}|${Math.floor(S.now / (5 * MIN))}|${S.zones.length}`;
  if (ctx.keys.zones === key) return;
  ctx.keys.zones = key;
  const g = ctx.g.zones;
  g.clearLayers();
  if (!ly.airspace) return;
  const on: Record<string, boolean> = { ctr: ly.ctr, kkop: ly.kkop, tfr: ly.tfr, notam: ly.tfr, military: ly.military, population: ly.population };
  const order = ['ctr', 'population', 'kkop', 'military', 'notam', 'tfr'];
  const zones = S.zones.filter((z) => on[z.kind]).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const zoom = ctx.map.getZoom();
  const placed: L.Point[] = [];
  // Reserve space for base name labels (drawn to the right of each base).
  if (ly.bases && tier !== 'nat') for (const b of S.bases) placed.push(ctx.map.project(L.latLng(b.pos[0], b.pos[1]), zoom).add(L.point(95, 0)));
  const selM = S.missions.find((m) => m.id === S.selectedMissionId);
  if (selM) {
    const lp = ctx.map.project(L.latLng(selM.launchPoint[0], selM.launchPoint[1]), zoom);
    for (let dy = -10; dy <= 60; dy += 14) for (const dx of [-160, 0, 160]) placed.push(lp.add(L.point(dx, dy)));
  }
  const free = (ll: LatLng) => {
    const p = ctx.map.project(L.latLng(ll[0], ll[1]), zoom);
    if (placed.some((q) => Math.abs(q.x - p.x) < 150 && Math.abs(q.y - p.y) < 18)) return false;
    placed.push(p);
    return true;
  };
  for (const z of [...zones].reverse()) {
    const d = drawZone(z, S.now);
    if (!d) continue;
    for (const l of d.layers) {
      if ((l as L.Path).options.interactive !== false) (l as L.Path).bindTooltip(() => zoneTip(z, ops.get().now, ops.get().tz), { ...TOOLTIP, sticky: true });
      g.addLayer(l);
    }
    if (tier !== 'nat' && d.labelAt && d.label) {
      const big = z.kind === 'ctr' || z.kind === 'population';
      if (tier === 'reg' && !big && z.kind !== 'tfr' && z.kind !== 'notam') continue;
      if (!free(d.labelAt)) continue;
      const color = z.kind === 'ctr' ? '#8384E2' : z.kind === 'population' ? '#d8d926' : z.kind === 'kkop' ? '#e8a33a' : z.kind === 'notam' ? '#d926d8' : '#ff4d55';
      g.addLayer(
        L.tooltip({ permanent: true, direction: 'top', className: 'mc-zlbl', offset: [0, -2], opacity: 1, interactive: false, pane: 'mc-zlbl' })
          .setLatLng(d.labelAt)
          .setContent(`<span class="mc-zl ${d.upcoming ? 'up' : ''}" style="border-color:${color}">${esc(d.label)}</span>`),
      );
    }
  }
}

const CELL_COLORS: Record<string, [string, string]> = {
  rain: ['#2f7fd9', '#26d8d9'],
  thunderstorm: ['#d926d8', '#ff4d55'],
  squall: ['#e8a33a', '#d97d26'],
};

function syncRadar(ctx: Ctx, S: OpsState) {
  const key = `${S.layers.radar}|${Math.floor(S.now / MIN)}|${S.weatherSeverity}|${S.weatherCells.length}`;
  if (ctx.keys.radar === key) return;
  ctx.keys.radar = key;
  const g = ctx.g.radar;
  g.clearLayers();
  if (!S.layers.radar) return;
  const sev = 0.6 + 0.4 * S.weatherSeverity;
  for (const c of S.weatherCells) {
    const p = projectCell(c, S.now, S.now);
    const k = Math.min(1, p.intensity * sev);
    if (k < 0.04) continue;
    const [outer, inner] = CELL_COLORS[c.kind];
    const rings = [1, 0.74, 0.5, 0.27];
    rings.forEach((f, i) => {
      const col = i < 2 ? outer : inner;
      const circle = L.circle(p.center, {
        pane: 'mc-wx',
        radius: p.radiusKm * 1000 * f,
        stroke: i === 0,
        color: outer,
        weight: 1,
        opacity: 0.5,
        dashArray: '2 3',
        fillColor: col,
        fillOpacity: Math.min(0.42, 0.06 + k * 0.1 * (i + 1)),
        interactive: i === 0,
      });
      if (i === 0) {
        circle.bindTooltip(
          () =>
            `<div class="mc-tt"><div class="h"><span>${esc(c.id.toUpperCase())}</span></div><div class="t">${c.kind === 'thunderstorm' ? 'Thunderstorm cell' : c.kind === 'squall' ? 'Squall line' : 'Rain cell'}</div>` +
            `<div class="r"><span>Intensity</span><b>${Math.round(k * 100)}%</b></div><div class="r"><span>Radius</span><b>${p.radiusKm.toFixed(0)} km</b></div><div class="r"><span>Drift</span><b>${String(Math.round(c.driftDeg)).padStart(3, '0')}° · ${c.driftKmh} km/h</b></div></div>`,
          { ...TOOLTIP, sticky: true },
        );
      }
      g.addLayer(circle);
    });
  }
}

function windColor(gust: number): string {
  if (gust >= 28) return TONE_COLOR.alert;
  if (gust >= 22) return TONE_COLOR.warn;
  if (gust >= 15) return '#c7c45d';
  return '#5ebfc0';
}

function syncWind(ctx: Ctx, S: OpsState) {
  const key = `${S.layers.wind}|${Math.floor(S.now / (10 * MIN))}|${S.weatherSeverity}|${ctx.boundsVer}`;
  if (ctx.keys.wind === key) return;
  ctx.keys.wind = key;
  const g = ctx.g.wind;
  g.clearLayers();
  if (!S.layers.wind) return;
  const size = ctx.map.getSize();
  if (!size.x || !size.y) return;
  const cols = Math.max(3, Math.round(size.x / 105));
  const rows = Math.max(3, Math.round(size.y / 95));
  const wx = { now: S.now, cells: S.weatherCells, severity: S.weatherSeverity };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pt = L.point(((c + 0.5) / cols) * size.x, ((r + 0.5) / rows) * size.y);
      const ll = ctx.map.containerPointToLatLng(pt);
      const s = sampleWeather([ll.lat, ll.lng], S.now, wx);
      const len = 10 + Math.min(28, s.windKts * 1.4);
      const col = windColor(s.gustKts);
      const rot = windToDeg(s.windDirDeg);
      const html = `<svg width="44" height="44" viewBox="-22 -22 44 44" style="transform:rotate(${rot}deg)"><line x1="0" y1="${len / 2}" x2="0" y2="${-len / 2}" stroke="${col}" stroke-width="1.6"/><path d="M-3.5,${-len / 2 + 5} L0,${-len / 2} L3.5,${-len / 2 + 5}" fill="none" stroke="${col}" stroke-width="1.6"/></svg><span>${Math.round(s.windKts)}G${Math.round(s.gustKts)}</span>`;
      g.addLayer(L.marker(ll, { pane: 'mc-wxmk', interactive: false, keyboard: false, icon: L.divIcon({ className: 'mc-wind', iconSize: [44, 44], iconAnchor: [22, 22], html }) }));
    }
  }
}

function syncCeil(ctx: Ctx, S: OpsState, tier: Tier) {
  const key = `${S.layers.ceilingVis}|${Math.floor(S.now / (10 * MIN))}|${S.weatherSeverity}|${ctx.map.getZoom()}|${tier}|${S.selectedMissionId}|${S.missions.map((m) => m.status[0]).join('')}`;
  if (ctx.keys.ceil === key) return;
  ctx.keys.ceil = key;
  const g = ctx.g.ceil;
  g.clearLayers();
  if (!S.layers.ceilingVis) return;
  const wx = { now: S.now, cells: S.weatherCells, severity: S.weatherSeverity };
  const zoom = ctx.map.getZoom();
  const placed: L.Point[] = S.bases.map((b) => ctx.map.project(L.latLng(b.pos[0], b.pos[1]), zoom).add(L.point(80, 22)));
  const ordered = [...S.missions].sort((a, b) => (b.id === S.selectedMissionId ? 1 : 0) - (a.id === S.selectedMissionId ? 1 : 0));
  for (const m of ordered) {
    if (m.status === 'completed') continue;
    if (tier === 'nat' && m.id !== S.selectedMissionId && m.status !== 'hold-weather' && m.status !== 'active') continue;
    const c = missionCenter(m);
    const px = ctx.map.project(L.latLng(c[0], c[1]), zoom);
    if (placed.some((q) => Math.abs(q.x - px.x) < 175 && Math.abs(q.y - px.y) < 24)) continue;
    placed.push(px);
    const s = sampleWeather(c, S.now, wx);
    const cig = s.ceilingFt < 1000 ? 'alert' : s.ceilingFt < 1500 ? 'warn' : 'ok';
    const vis = s.visKm < 1.5 ? 'alert' : s.visKm < 3 ? 'warn' : 'ok';
    const html = `<div class="mc-wx">CIG <b class="${cig}">${s.ceilingFt.toLocaleString('en-US')}</b> · VIS <b class="${vis}">${s.visKm}</b> km${s.rainMmH > 0.3 ? ` · <b class="${s.rainMmH > 6 ? 'alert' : 'warn'}">${s.rainMmH}</b> mm/h` : ''}</div>`;
    g.addLayer(L.marker(c, { pane: 'mc-wxmk', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html }) }));
  }
}

function syncMissions(ctx: Ctx, S: OpsState, tier: Tier) {
  const health = healthOf(ctx, S);
  const sig = S.missions.map((m) => m.id + m.status[0] + health[m.id][0] + m.assignedUnitIds.length).join(',');
  const key = `${S.layers.missions}|${tier}|${S.selectedMissionId}|${sig}`;
  if (ctx.keys.missions === key) return;
  ctx.keys.missions = key;
  const g = ctx.g.missions;
  g.clearLayers();
  const ordered = [...S.missions].sort((a, b) => (a.id === S.selectedMissionId ? 1 : 0) - (b.id === S.selectedMissionId ? 1 : 0) || (a.status === 'completed' ? -1 : 0) - (b.status === 'completed' ? -1 : 0));
  for (const m of ordered) {
    const sel = m.id === S.selectedMissionId;
    if (!S.layers.missions && !sel) continue;
    const done = m.status === 'completed';
    const color = done ? '#8a8a8a' : MISSION_HEALTH[health[m.id]].color;
    const tip = () => {
      const s = ops.get();
      const mm = s.missions.find((x) => x.id === m.id) ?? m;
      return missionTip(mm, ctx.health.map[m.id], s);
    };
    const click = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      actions.selectMission(m.id);
    };
    const d = drawMission(m, color, sel, tier);
    for (const l of d.layers) g.addLayer(l);
    for (const l of d.hit) {
      (l as L.Path).bindTooltip(tip, { ...TOOLTIP, sticky: true });
      l.on('click', click);
    }
    // Diamond pins keep small missions visible at national zoom.
    if (tier === 'nat' && !done) {
      const pin = L.marker(missionCenter(m), { pane: 'mc-msn-mk', keyboard: false, icon: missionPinIcon(color, sel), zIndexOffset: sel ? 1000 : 0 });
      pin.bindTooltip(tip, TOOLTIP);
      pin.on('click', click);
      g.addLayer(pin);
    }
  }
}

function syncPaths(ctx: Ctx, S: OpsState, tier: Tier) {
  const flying = S.units.filter((u) => u.status === 'in-flight' && u.missionId && !u.contingency);
  const show = (m: Mission) => m.id === S.selectedMissionId || (S.layers.tracks && tier !== 'nat' && m.status === 'active');
  const missions = S.missions.filter((m) => m.status !== 'completed' && show(m));
  const key = `${tier}|${S.layers.tracks}|${S.selectedMissionId}|${missions.map((m) => m.id).join()}|${flying.map((u) => u.id + u.missionId).join()}`;
  if (ctx.keys.paths !== key) {
    ctx.keys.paths = key;
    const g = ctx.g.paths;
    g.clearLayers();
    ctx.flown.clear();
    const health = ctx.health.map;
    for (const m of missions) {
      const fp = missionPath(m);
      const sel = m.id === S.selectedMissionId;
      const color = MISSION_HEALTH[health[m.id] ?? 'nominal'].color;
      g.addLayer(L.polyline(fp.path, { pane: 'mc-path', color: '#ffffff', weight: 1, opacity: sel ? 0.35 : 0.18, dashArray: '2 4', interactive: false }));
      for (const u of flying.filter((x) => x.missionId === m.id)) {
        const line = L.polyline(slicePath(fp.path, u.pathKm), { pane: 'mc-path', color, weight: sel ? 2.4 : 1.8, opacity: 0.85, interactive: false });
        g.addLayer(line);
        ctx.flown.set(u.id, { line, path: fp.path });
      }
    }
  }
  for (const u of flying) {
    const f = ctx.flown.get(u.id);
    if (f) f.line.setLatLngs(slicePath(f.path, u.pathKm));
  }
}

function syncTransit(ctx: Ctx, S: OpsState) {
  const m = S.missions.find((x) => x.id === S.selectedMissionId);
  const cands = candsOf(ctx, S);
  const key = `${S.selectedMissionId}|${Math.floor(S.now / MIN)}|${cands.map((c) => c.unitId + c.transit.mode + Math.round(c.deployEta / MIN)).join()}`;
  if (ctx.keys.transit === key) return;
  ctx.keys.transit = key;
  const g = ctx.g.transit;
  g.clearLayers();
  if (!m) return;
  // Launch point marker
  g.addLayer(
    L.marker(m.launchPoint, {
      pane: 'mc-msn-mk',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<svg width="16" height="16" viewBox="-8 -8 16 16"><circle r="5" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M0,-8V-3M0,3V8M-8,0H-3M3,0H8" stroke="#fff" stroke-width="1.5"/></svg>` }),
    }),
  );
  const stack = new Map<string, number>();
  cands.forEach((c, i) => {
    const u = S.units.find((x) => x.id === c.unitId);
    if (!u) return;
    const rec = i === 0;
    const color = TRANSPORT_COLOR[c.transit.mode];
    const from = c.transit.from;
    const local = c.tTransit === 0 || distKm(from, m.launchPoint) < 0.6;
    if (!local) {
      g.addLayer(L.polyline([from, m.launchPoint], { pane: 'mc-transit', color: '#000', weight: rec ? 6 : 4, opacity: 0.35, interactive: false }));
      g.addLayer(L.polyline([from, m.launchPoint], { pane: 'mc-transit', color, weight: rec ? 2.6 : 1.6, opacity: rec ? 1 : 0.8, dashArray: rec ? '8 5' : '4 5', interactive: false }));
      g.addLayer(
        L.marker(from, {
          pane: 'mc-msn-mk',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: '', iconSize: [9, 9], iconAnchor: [4.5, 4.5], html: `<div class="mc-origin" style="border-color:${color}"></div>` }),
        }),
      );
    }
    const anchor = local ? m.launchPoint : from;
    const sk = `${anchor[0].toFixed(2)},${anchor[1].toFixed(2)}`;
    const n = stack.get(sk) ?? 0;
    stack.set(sk, n + 1);
    const eta = c.deployEta - S.now;
    const mode = local ? 'on site' : TRANSPORT_SHORT[c.transit.mode];
    const html = `<div class="mc-et ${rec ? 'rec' : ''}"><i style="background:${color}"></i>${rec ? '<span class="tag">REC</span>' : `<em>${i + 1}</em>`}<b>${esc(u.callsign)}</b><em>·</em>ETA ${eta <= 60_000 ? 'now' : fmtDur(eta)}<em>·</em>${mode}</div>`;
    g.addLayer(L.tooltip({ permanent: true, direction: local ? 'left' : 'bottom', className: 'mc-eta', offset: local ? [-14, n * 21 + 12] : [0, 10 + n * 21], interactive: false, opacity: 1 }).setLatLng(anchor).setContent(html));
  });
}

/** National zoom: per-region operational summary tags (opt-in via the layers panel). */
/** Screen-space offsets (px) so tags sit over open sea, clear of markers. */
const REGION_TAG_OFFSET: Record<string, [number, number]> = {
  jabodetabek: [-40, -46],
  'west-java': [-50, 48],
  'east-java-bali': [60, 50],
  kalimantan: [-20, -44],
  sulawesi: [62, -30],
  papua: [10, -36],
  sumatra: [-30, -42],
};

function syncRegions(ctx: Ctx, S: OpsState, tier: Tier) {
  const sig = S.missions.map((m) => m.status[0]).join('') + S.units.map((u) => u.status[1] + (u.missionId ?? '')).join('');
  const on = uiPrefs.regionTags;
  const key = `${tier}|${on}|${sig}`;
  if (ctx.keys.regions === key) return;
  ctx.keys.regions = key;
  const g = ctx.g.regions;
  g.clearLayers();
  if (tier !== 'nat' || !on) return;
  const baseRegion = new Map(S.bases.map((b) => [b.id, b.regionId]));
  for (const r of REGIONS) {
    const ms = S.missions.filter((m) => m.regionId === r.id && m.status !== 'completed');
    const active = ms.filter((m) => m.status === 'active').length;
    const holds = ms.filter((m) => m.status === 'hold-weather' || m.status === 'hold-airspace' || m.status === 'delayed').length;
    const reqs = ms.filter((m) => m.status === 'request').length;
    const air = S.units.filter((u) => u.status === 'in-flight' && baseRegion.get(u.baseId) === r.id).length;
    const off = REGION_TAG_OFFSET[r.id] ?? [0, 0];
    const n = (v: number, c: string) => `<i style="color:${v ? c : '#6a6a6a'}">${v}</i>`;
    const html = `<div class="mc-reg" style="margin-left:${off[0]}px;margin-top:${off[1]}px"><b>${esc(r.name.toUpperCase())}</b><span>${n(active, TONE_COLOR.live)} active · ${n(air, TONE_COLOR.live)} airborne${holds ? ` · ${n(holds, TONE_COLOR.warn)} hold` : ''}${reqs ? ` · ${n(reqs, TONE_COLOR.alert)} req` : ''}</span></div>`;
    const mk = L.marker(r.center, { pane: 'mc-wxmk', keyboard: false, interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html }) });
    g.addLayer(mk);
  }
}

function syncBases(ctx: Ctx, S: OpsState, tier: Tier) {
  const key = `${S.layers.bases}|${tier}|${S.bases.length}`;
  if (ctx.keys.bases === key) return;
  ctx.keys.bases = key;
  const g = ctx.g.bases;
  g.clearLayers();
  if (!S.layers.bases) return;
  for (const b of S.bases) {
    const count = S.units.filter((u) => u.baseId === b.id).length;
    const mk = L.marker(b.pos, { pane: 'mc-base', keyboard: false, icon: baseIcon(b, tier, count) });
    mk.bindTooltip(() => baseTip(b, ops.get().units), { ...TOOLTIP, offset: [0, -12] });
    mk.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      ctx.map.flyTo(b.pos, Math.max(ctx.map.getZoom(), 11), { duration: 0.8 });
    });
    g.addLayer(mk);
  }
}

function syncCrews(ctx: Ctx, S: OpsState, tier: Tier) {
  const key = `${S.layers.crews}|${tier}|${S.crews.map((c) => c.status[0] + c.pos[0].toFixed(3)).join()}`;
  if (ctx.keys.crews === key) return;
  ctx.keys.crews = key;
  const g = ctx.g.crews;
  g.clearLayers();
  if (!S.layers.crews || tier === 'nat') return;
  for (const c of S.crews) {
    const mk = L.marker(c.pos, { keyboard: false, icon: crewIcon(c), zIndexOffset: -200 });
    mk.bindTooltip(() => crewTip(ops.get().crews.find((x) => x.id === c.id) ?? c, ops.get()), TOOLTIP);
    g.addLayer(mk);
  }
}

function syncUnits(ctx: Ctx, S: OpsState, tier: Tier) {
  const labelled = ctx.map.getZoom() >= LABEL_ZOOM;
  const cands = new Set(candsOf(ctx, S).map((c) => c.unitId));
  for (const u of S.units) {
    let rec = ctx.units.get(u.id);
    const airborne = isAirborne(u);
    const sel = u.id === S.selectedUnitId;
    const cand = cands.has(u.id);
    const visible = sel || cand || airborne || tier === 'loc';
    const vessel = !!AIRFRAME[u.modelId].isVessel;
    const color = unitColor(u);
    const showLabel = sel || (!cand && airborne && labelled);
    const full = airborne && (sel || tier === 'loc');
    const inFlight = u.status === 'in-flight';
    const vecPx = airborne ? Math.min(20, 4 + u.speedKmh / 6) : 0;
    const key = `${tier}|${airborne}|${inFlight}|${sel}|${cand}|${showLabel}|${color}|${vessel}`;
    if (!visible) {
      if (rec) ctx.g.units.removeLayer(rec.m);
      if (rec?.track) ctx.g.tracks.removeLayer(rec.track);
      if (rec) ctx.units.delete(u.id);
      continue;
    }
    if (!rec) {
      const m = L.marker(u.pos, { keyboard: false, riseOnHover: true, icon: uavIcon({ tier, airborne, inFlight, selected: sel, candidate: cand, showLabel, vessel, color, rot: u.headingDeg, vecPx }) });
      m.bindTooltip(() => unitTip(ops.get().units.find((x) => x.id === u.id) ?? u, ops.get()), { ...TOOLTIP, offset: [0, -12] });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        actions.selectUnit(u.id);
      });
      rec = { m, key: '', rot: u.headingDeg };
      ctx.units.set(u.id, rec);
      ctx.g.units.addLayer(m);
    } else {
      rec.m.setLatLng(u.pos);
    }
    // continuous rotation (avoid spinning the long way round at 359→0)
    const delta = ((((u.headingDeg - rec.rot) % 360) + 540) % 360) - 180;
    rec.rot += delta;
    if (rec.key !== key) {
      rec.key = key;
      rec.m.setIcon(uavIcon({ tier, airborne, inFlight, selected: sel, candidate: cand, showLabel, vessel, color, rot: rec.rot, vecPx }));
      rec.m.setZIndexOffset(sel ? 1200 : cand ? 800 : airborne ? 300 : 0);
    }
    const el = rec.m.getElement();
    if (el) {
      const r = el.querySelector<HTMLElement>('.mc-rot');
      if (r) r.style.transform = `rotate(${rec.rot}deg)`;
      const v = el.querySelector('.mc-vec');
      if (v) v.setAttribute('y2', String(-10 - vecPx));
      const lbl = el.querySelector<HTMLElement>('.mc-uav-lbl');
      if (lbl) {
        const html = uavLabel(u, full);
        if (lbl.innerHTML !== html) lbl.innerHTML = html;
      }
    }
    // breadcrumb
    const wantTrack = S.layers.tracks && airborne && u.track.length > 1 && (tier !== 'nat' || sel);
    if (wantTrack) {
      if (!rec.track) {
        rec.track = L.polyline(u.track, { pane: 'mc-path', color, weight: 1.5, opacity: 0.75, dashArray: '1 3', interactive: false });
        ctx.g.tracks.addLayer(rec.track);
      } else {
        rec.track.setLatLngs(u.track);
        rec.track.setStyle({ color });
      }
    } else if (rec.track) {
      ctx.g.tracks.removeLayer(rec.track);
      rec.track = undefined;
    }
  }
}

/** Stack overlapping UAV labels vertically (screen-space declutter, runs per tick). */
function declutterLabels(ctx: Ctx, S: OpsState) {
  const map = ctx.map;
  const zoom = map.getZoom();
  // Occupied rectangles in layer-point space: [x0, y0, x1, y1]
  const boxes: [number, number, number, number][] = [];
  if (S.layers.bases && tierOf(zoom) !== 'nat') {
    for (const b of S.bases) {
      const p = map.latLngToLayerPoint(L.latLng(b.pos[0], b.pos[1]));
      boxes.push([p.x - 10, p.y - 10, p.x + 24 + b.name.length * 7.2 + 40, p.y + 10]);
    }
  }
  const recs = [...ctx.units.entries()]
    .map(([id, r]) => ({ id, r, lbl: r.m.getElement()?.querySelector<HTMLElement>('.mc-uav-lbl') }))
    .filter((x) => x.lbl)
    .sort((a, b) => (a.id === S.selectedUnitId ? -1 : b.id === S.selectedUnitId ? 1 : 0));
  const H = 17;
  for (const { r, lbl } of recs) {
    const p = map.latLngToLayerPoint(r.m.getLatLng());
    const w = lbl!.offsetWidth || 120;
    // label box relative to icon top-left (icon 28×28 anchored at its centre)
    const x0 = p.x - 14 + 20;
    let top = -2;
    for (let k = 0; k < 8; k++) {
      const y0 = p.y - 14 + top;
      const hit = boxes.some((b) => x0 < b[2] && b[0] < x0 + w && y0 < b[3] && b[1] < y0 + H);
      if (!hit) break;
      top += H + 1;
    }
    boxes.push([x0, p.y - 14 + top, x0 + w, p.y - 14 + top + H]);
    const t = `${top}px`;
    if (lbl!.style.top !== t) lbl!.style.top = t;
  }
}

/** Pixels of the map's right edge a side panel covers (ignored when too little map would remain). */
function coveredRight(map: L.Map): number {
  const w = map.getSize().x;
  return w - mapInsets.right >= 400 ? mapInsets.right : 0;
}

function syncSelection(ctx: Ctx, S: OpsState) {
  const map = ctx.map;
  if (S.selectedMissionId !== ctx.lastSelM) {
    ctx.lastSelM = S.selectedMissionId;
    const m = S.missions.find((x) => x.id === S.selectedMissionId);
    if (m) {
      const pts: LatLng[] = [...geometryPoints(m.geometry), m.launchPoint];
      const cands = candsOf(ctx, S);
      cands.forEach((c, i) => {
        if (i === 0 || distKm(c.transit.from, m.launchPoint) < 350) pts.push(c.transit.from);
      });
      const b = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
      // Reserve the top-left control cluster, the selection card / ETA labels at the
      // bottom, and whatever part of the map a side panel is about to cover.
      const right = coveredRight(map);
      map.flyToBounds(b, { paddingTopLeft: [120, 80], paddingBottomRight: [(right ? 90 : 150) + right, 130], maxZoom: 12, duration: 0.9 });
    }
  }
  if (S.selectedUnitId !== ctx.lastSelU) {
    ctx.lastSelU = S.selectedUnitId;
    const u = S.units.find((x) => x.id === S.selectedUnitId);
    if (u) {
      // Visible area excludes the part a side drawer / panel is about to cover.
      const size = map.getSize();
      const right = coveredRight(map);
      const vis = L.latLngBounds(map.containerPointToLatLng(L.point(40, 50)), map.containerPointToLatLng(L.point(Math.max(80, size.x - right - 50), size.y - 60)));
      const p = L.latLng(u.pos[0], u.pos[1]);
      if (!vis.contains(p)) {
        const z = Math.max(map.getZoom(), 10);
        // Offset the target so it lands in the centre of the visible area.
        const c = map.project(p, z).add(L.point(right / 2, 0));
        map.flyTo(map.unproject(c, z), z, { duration: 0.9 });
      }
    }
  }
}

function syncAll(ctx: Ctx) {
  const S = ops.get();
  const tier = tierOf(ctx.map.getZoom());
  syncBasemap(ctx, S);
  syncNavEarth(ctx, S);
  syncZones(ctx, S, tier);
  syncRadar(ctx, S);
  syncWind(ctx, S);
  syncCeil(ctx, S, tier);
  syncRegions(ctx, S, tier);
  syncMissions(ctx, S, tier);
  syncPaths(ctx, S, tier);
  syncTransit(ctx, S);
  syncBases(ctx, S, tier);
  syncCrews(ctx, S, tier);
  syncUnits(ctx, S, tier);
  declutterLabels(ctx, S);
  syncSelection(ctx, S);
}

// ── component ───────────────────────────────────────────────────────────────
export function OpsMap({ showSelection }: { showSelection: boolean }) {
  const elRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || ctxRef.current) return;
    const map = L.map(el, {
      center: NATIONAL_VIEW.center,
      zoom: NATIONAL_VIEW.zoom,
      minZoom: 4,
      maxZoom: 17,
      zoomControl: false,
      worldCopyJump: false,
      preferCanvas: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: L.latLngBounds([-16, 88], [12, 148]),
      maxBoundsViscosity: 0.6,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 80 }).addTo(map);
    map.attributionControl.setPrefix(false);
    for (const [name, z] of PANES) {
      const p = map.createPane(name);
      p.style.zIndex = String(z);
      if (name === 'mc-wxmk' || name === 'mc-zlbl') p.style.pointerEvents = 'none';
    }
    const tiles = {
      dark: L.layerGroup([L.tileLayer(TILES.dark.url, TILES.dark.opts), L.tileLayer(TILES.dark.labels, { ...TILES.dark.opts, attribution: '' })]),
      satellite: L.tileLayer(TILES.satellite.url, TILES.satellite.opts),
    };
    const order: GroupKey[] = ['zones', 'radar', 'wind', 'ceil', 'regions', 'missions', 'paths', 'tracks', 'transit', 'bases', 'crews', 'units'];
    const g = Object.fromEntries(order.map((k) => [k, L.layerGroup().addTo(map)])) as Record<GroupKey, L.LayerGroup>;
    const ctx: Ctx = { map, tiles, g, keys: {}, nav: new Map(), units: new Map(), flown: new Map(), health: { key: '', map: {} }, cands: { key: '', list: [] }, boundsVer: 0 };
    // Don't fly to a selection that pre-dates this map instance; keep current view centred instead.
    ctxRef.current = ctx;

    const container = map.getContainer();
    container.classList.add('mc-map');
    const nofx = () => container.classList.add('mc-nofx');
    const fx = () => requestAnimationFrame(() => container.classList.remove('mc-nofx'));
    map.on('zoomstart', nofx);
    map.on('zoomend', () => {
      fx();
      syncAll(ctx);
    });
    map.on('moveend', () => {
      ctx.boundsVer++;
      syncAll(ctx);
    });

    map.fitBounds(INDONESIA_BOUNDS, { animate: false, padding: [10, 10] });
    syncAll(ctx);
    const unsub = ops.subscribe(() => syncAll(ctx));
    const unsubNav = onNavEarthChange(() => syncAll(ctx));
    const unsubUi = uiPrefs.subscribe(() => syncAll(ctx));
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);
    const t = setTimeout(() => {
      map.invalidateSize();
      if (!ops.get().selectedMissionId) map.fitBounds(INDONESIA_BOUNDS, { animate: false, padding: [10, 10] });
    }, 60);
    setMap(map);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      unsub();
      unsubNav();
      unsubUi();
      map.remove();
      ctxRef.current = null;
      setMap(null);
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden bg-[#141414]">
      <div ref={elRef} className="absolute inset-0 z-0" aria-label="Operational map of Indonesia" />
      {map && <MapOverlays map={map} showSelection={showSelection} />}
    </div>
  );
}
