// ─────────────────────────────────────────────────────────────────────────────
// Live Deployment ETA & Mission Completion Engine
//
//   Deployment ETA          = T_avail + T_transit + T_setup
//   Sorties                 = ⌈ Workload / Effective capacity per sortie ⌉
//   T_exec                  = Sorties × (Sortie flight time + Turnaround)
//   Earliest completion     = Deployment ETA + T_exec, executed only inside
//                             contiguous Weather + Airspace clearance windows.
// ─────────────────────────────────────────────────────────────────────────────
import type { AirframeModel, AirframeParams, LatLng, MasterParam, Mission, TransportMode, Unit, WeatherSample } from '../types';
import { AIRFRAME, MISSION_PROFILES, PAYLOAD_META } from '../data/catalog';
import { distKm, geometryCenter } from '../lib/geo';
import { HOUR, MIN, startOfHour } from '../lib/time';
import type { EngineState } from './ctx';
import { RAIN_LIMIT, sampleWeather } from './weather';
import { airspaceAt } from './airspace';

export interface TransitPlan {
  mode: TransportMode;
  distKm: number;
  ms: number;
  from: LatLng;
  options: { mode: TransportMode; ms: number; feasible: boolean; note?: string }[];
}

export interface EtaResult {
  unitId: string;
  missionId: string;
  feasible: boolean;
  infeasibleReason?: string;
  tAvail: number;
  tTransit: number;
  tSetup: number;
  sorties: number;
  sortieMin: number;
  turnaroundMin: number;
  capacity: number;
  tExec: number;
  deployEta: number;
  completion: number;
  /** Time lost waiting for weather/airspace windows (ms). */
  windowWait: number;
  firstWindowStart: number;
  transit: TransitPlan;
  indicative: boolean;
  unverified: string[];
  warnings: string[];
  payloadSwap: boolean;
  /** Blocking reasons found while scanning windows (most frequent first). */
  windowBlockers: string[];
}

const HORIZON_H = 24 * 8;

// ── Hourly suitability ───────────────────────────────────────────────────────
export interface HourSlot {
  t: number;
  wx: WeatherSample;
  airspaceOk: boolean;
  airspaceReasons: string[];
}

const slotCache = new Map<string, HourSlot[]>();

/** Hourly weather + airspace forecast for a mission over the planning horizon. */
export function missionSlots(m: Mission, S: EngineState, hours = HORIZON_H): HourSlot[] {
  const t0 = startOfHour(S.now);
  // Weather cells drift continuously; a 30-sim-minute bucket keeps forecasts fresh
  // without recomputing 192 hourly samples per mission every couple of seconds.
  const key = `${m.id}|${t0}|${Math.floor(S.now / (30 * MIN))}|${S.weatherSeverity}|${S.permits.map((p) => p.status[0] + p.windowEnd).join('')}|${hours}`;
  const hit = slotCache.get(key);
  if (hit) return hit;
  if (slotCache.size > 600) slotCache.clear();
  const c = geometryCenter(m.geometry);
  const wxCtx = { now: S.now, cells: S.weatherCells, severity: S.weatherSeverity };
  const out: HourSlot[] = [];
  for (let i = 0; i < hours; i++) {
    const t = t0 + i * HOUR;
    const mid = t + HOUR / 2;
    const air = airspaceAt(m, mid, S.zones, S.permits, S.now);
    out.push({ t, wx: sampleWeather(c, mid, wxCtx), airspaceOk: air.ok, airspaceReasons: air.reasons });
  }
  slotCache.set(key, out);
  return out;
}

export interface SlotVerdict {
  ok: boolean;
  /** Meteorological limits only (wind, gust, rain, visibility, ceiling). */
  weatherOk: boolean;
  /** Daylight requirement (optical sensors / VLOS). */
  lightOk: boolean;
  airspaceOk: boolean;
  reasons: string[];
}

export function judgeSlot(slot: HourSlot, m: Mission, af: AirframeModel, p: AirframeParams): SlotVerdict {
  const r: string[] = [];
  const w = slot.wx;
  if (w.windKts > p.maxWindKts.value) r.push(`Wind ${w.windKts.toFixed(0)} kt > ${p.maxWindKts.value}`);
  if (w.gustKts > p.maxGustKts.value) r.push(`Gust ${w.gustKts.toFixed(0)} kt > ${p.maxGustKts.value}`);
  if (w.rainMmH > RAIN_LIMIT[af.rainTolerance]) r.push(`Rain ${w.rainMmH.toFixed(1)} mm/h`);
  if (w.visKm < p.minVisKm.value) r.push(`Vis ${w.visKm} km`);
  if (!af.isVessel && w.ceilingFt < Math.min(m.maxAltFt + 300, 1500)) r.push(`Ceiling ${w.ceilingFt} ft`);
  const weatherOk = r.length === 0;
  const lightOk = !m.daylightOnly || w.light >= 0.2;
  if (!lightOk) r.push('No daylight (optical/VLOS)');
  if (!slot.airspaceOk) r.push(...slot.airspaceReasons);
  return { ok: r.length === 0, weatherOk, lightOk, airspaceOk: slot.airspaceOk, reasons: r };
}

/** Walk forward from `start`, consuming `execMs` only during suitable hours. */
export function scheduleInWindows(
  m: Mission,
  af: AirframeModel,
  p: AirframeParams,
  S: EngineState,
  start: number,
  execMs: number,
): { completion: number; firstStart: number; wait: number; blockers: string[]; feasible: boolean } {
  const slots = missionSlots(m, S);
  const blockerCount = new Map<string, number>();
  let remaining = execMs;
  let t = start;
  let firstStart = -1;
  let wait = 0;
  for (const s of slots) {
    const sEnd = s.t + HOUR;
    if (sEnd <= t) continue;
    const from = Math.max(t, s.t);
    const v = judgeSlot(s, m, af, p);
    if (!v.ok) {
      for (const reason of v.reasons) {
        const k = reason.replace(/\d+(\.\d+)?/g, '#');
        blockerCount.set(k, (blockerCount.get(k) ?? 0) + 1);
      }
      if (firstStart < 0 || remaining > 0) wait += sEnd - from;
      t = sEnd;
      continue;
    }
    if (firstStart < 0) firstStart = from;
    const use = Math.min(remaining, sEnd - from);
    remaining -= use;
    t = from + use;
    if (remaining <= 0) {
      const blockers = [...blockerCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      return { completion: t, firstStart, wait: Math.max(0, t - start - execMs), blockers, feasible: true };
    }
  }
  const blockers = [...blockerCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { completion: Infinity, firstStart: firstStart < 0 ? Infinity : firstStart, wait, blockers, feasible: false };
}

// ── Transit ─────────────────────────────────────────────────────────────────
function islandOf(pos: LatLng, S: EngineState, unit: Unit): string {
  // Unit at/near its base → base island; otherwise nearest mission launch island.
  const base = S.bases.find((b) => b.id === unit.baseId)!;
  if (distKm(pos, base.pos) < 60) return base.island;
  let best = base.island;
  let bd = Infinity;
  for (const m of S.missions) {
    const d = distKm(pos, m.launchPoint);
    if (d < bd) {
      bd = d;
      best = m.island;
    }
  }
  return best;
}

export function planTransit(unit: Unit, m: Mission, S: EngineState, from: LatLng, used: Set<string>): TransitPlan {
  const af = AIRFRAME[unit.modelId];
  const p = S.master.airframes[unit.modelId];
  const speeds = S.master.regionalSpeeds[m.regionId];
  const oh = S.master.modeOverheadMin;
  const d = distKm(from, m.launchPoint);
  if (d < 0.6) return { mode: 'road', distKm: d, ms: 0, from, options: [] };
  const sameIsland = islandOf(from, S, unit) === m.island;
  const rangeKm = (af.enduranceMin / 60) * af.cruiseKmh;
  const opts: TransitPlan['options'] = [];
  const add = (mode: TransportMode, hours: number, feasible: boolean, note?: string) => opts.push({ mode, ms: hours * HOUR, feasible, note });
  // Road (same landmass)
  add('road', (d * 1.35) / speeds.road.value + oh.road.value / 60, sameIsland, sameIsland ? undefined : 'Different island');
  // Ferry / speedboat
  add('ferry', (d * 1.15) / speeds.ferry.value + oh.ferry.value / 60 + 25 / speeds.road.value, !sameIsland || d < 120, undefined);
  // Air freight
  add('air', d / speeds.air.value + oh.air.value / 60 + 30 / speeds.road.value, d > 150 && !af.isVessel, d <= 150 ? 'Not economic < 150 km' : undefined);
  // Self-ferry flight / sail
  const sfOk = af.isVessel ? d < 40 : d <= rangeKm * 0.4 && af.propulsion !== 'ice' ? true : af.propulsion === 'ice' && d <= rangeKm * 0.3;
  add('self-ferry', d / p.selfFerryKmh.value + oh['self-ferry'].value / 60, sfOk, sfOk ? undefined : 'Beyond 40% range reserve');

  let pick = opts.filter((o) => o.feasible).sort((a, b) => a.ms - b.ms)[0];
  if (m.transportPref !== 'auto') {
    const pref = opts.find((o) => o.mode === m.transportPref && o.feasible);
    if (pref) pick = pref;
  }
  if (!pick) pick = opts.sort((a, b) => a.ms - b.ms)[0];
  used.add(`speed:${m.regionId}:${pick.mode}`);
  return { mode: pick.mode, distKm: d, ms: pick.ms, from, options: opts };
}

// ── Core ETA ────────────────────────────────────────────────────────────────
function paramName(key: string): string {
  return key
    .replace(/^cap:/, 'Coverage/sortie · ')
    .replace(/^speed:([^:]+):(.+)$/, 'Regional speed · $1 · $2')
    .replace(/^overhead:/, 'Mode overhead · ')
    .replace(/^af:([^:]+):/, '$1 · ')
    .replace(/^setup:/, 'Mission set-up · ');
}

export function computeEta(unit: Unit, m: Mission, S: EngineState, opts?: { availableAt?: number; from?: LatLng }): EtaResult {
  const af = AIRFRAME[unit.modelId];
  const p = S.master.airframes[unit.modelId];
  const used = new Set<string>();
  const unverified: string[] = [];
  const warnings: string[] = [];
  const base = S.bases.find((b) => b.id === unit.baseId)!;
  const fail = (reason: string): EtaResult => ({
    unitId: unit.id,
    missionId: m.id,
    feasible: false,
    infeasibleReason: reason,
    tAvail: 0,
    tTransit: 0,
    tSetup: 0,
    sorties: 0,
    sortieMin: 0,
    turnaroundMin: 0,
    capacity: 0,
    tExec: 0,
    deployEta: Infinity,
    completion: Infinity,
    windowWait: 0,
    firstWindowStart: Infinity,
    transit: { mode: 'road', distKm: 0, ms: 0, from: unit.pos, options: [] },
    indicative: false,
    unverified,
    warnings,
    payloadSwap: false,
    windowBlockers: [],
  });

  if (unit.status === 'grounded') return fail('Unit grounded');
  if (unit.status === 'maintenance' && !opts?.availableAt) return fail('In maintenance');
  if (!af.roles.includes(m.type)) return fail(`${af.name} not rated for ${MISSION_PROFILES[m.type].short}`);
  const capP: MasterParam | undefined = p.capacity[m.type];
  if (!capP) return fail('No coverage rate configured');
  if (af.isVessel && m.type !== 'survey' && m.type !== 'isr') return fail('Surface vessel only');
  if (af.isVessel && !/Bathymetric|Coast|Maritime/i.test(m.subtype + m.name)) return fail('Mission is not maritime');
  if (!af.isVessel && /Bathymetric/i.test(m.subtype)) return fail('Bathymetry requires a surface vessel');
  if (m.type === 'cargo') {
    const rangeKm = (af.enduranceMin / 60) * af.cruiseKmh * 0.8;
    if ((m.routeKm ?? 0) * 2 > rangeKm) return fail(`Round trip ${(2 * (m.routeKm ?? 0)).toFixed(0)} km > ${rangeKm.toFixed(0)} km range (20% reserve)`);
  }
  if (m.requiredCerts.includes('Agri-Spray') && af.cls !== 'multirotor-octo') return fail('Spraying requires spray airframe');
  if (m.subtype === 'Crop Spraying' && af.id !== 'agras-t50') return fail('Spraying requires spray airframe');

  // Payload alignment
  let payloadSwap = false;
  for (const pt of m.requiredPayloads) {
    if (pt === 'comms') continue;
    const onboard = unit.payloadIds.some((pid) => S.payloads.find((x) => x.id === pid)?.type === pt);
    if (onboard) continue;
    const spare = S.payloads.find((x) => x.type === pt && x.baseId === unit.baseId && (!x.unitId || x.unitId === unit.id));
    if (spare) {
      payloadSwap = true;
      continue;
    }
    return fail(`No ${PAYLOAD_META[pt].short} payload at ${base.name}`);
  }

  // T_avail
  const assignedHere = m.assignedUnitIds.includes(unit.id);
  let availAt = opts?.availableAt ?? S.now;
  if (!opts?.availableAt) {
    if (assignedHere && (unit.status === 'in-flight' || unit.status === 'charging')) availAt = S.now;
    else if (unit.status === 'available') availAt = S.now;
    else availAt = Math.max(S.now, unit.busyUntil || S.now);
  }
  const tAvail = availAt - S.now;

  // Where does the unit start transit from?
  let from: LatLng = opts?.from ?? unit.pos;
  if (!opts?.from && !assignedHere && unit.missionId && unit.missionId !== m.id) {
    const cur = S.missions.find((x) => x.id === unit.missionId);
    if (cur) from = cur.launchPoint;
  }
  if (!opts?.from && unit.status === 'charging' && !unit.missionId) from = base.pos;
  const transit = assignedHere && unit.status === 'in-flight' ? { mode: 'road' as TransportMode, distKm: 0, ms: 0, from, options: [] } : planTransit(unit, m, S, from, used);
  if (transit.ms > 0) used.add(`overhead:${transit.mode}`);

  // T_setup
  const alreadyOnSite = assignedHere && (unit.status === 'in-flight' || unit.status === 'charging');
  const tSetup = alreadyOnSite ? 0 : (p.setupMin.value + S.master.missionSetupMin[m.type].value + (payloadSwap ? 30 : 0)) * MIN;
  if (!alreadyOnSite) {
    used.add(`af:${unit.modelId}:setupMin`);
    used.add(`setup:${m.type}`);
  }

  // T_exec
  const capacity = m.type === 'cargo' ? Math.min(capP.value, af.maxPayloadKg) : capP.value;
  used.add(`cap:${unit.modelId}:${m.type}`);
  const remaining = Math.max(0, m.workload * (1 - m.progress));
  const sorties = Math.max(remaining > 0 ? 1 : 0, Math.ceil(remaining / capacity - 1e-9));
  // Average sortie flight time: full sorties at the configured duration, the last one pro-rated.
  const sortieMin =
    m.type === 'cargo'
      ? Math.round(((m.routeKm ?? 0) * 2) / af.cruiseKmh * 60 + 8)
      : sorties > 0
        ? Math.round((p.sortieMin.value * (remaining / capacity)) / sorties)
        : 0;
  if (m.type !== 'cargo') used.add(`af:${unit.modelId}:sortieMin`);
  const turnaroundMin = p.turnaroundMin.value;
  used.add(`af:${unit.modelId}:turnaroundMin`);
  const tExec = sorties * (sortieMin + turnaroundMin) * MIN;

  const deployEta = S.now + tAvail + transit.ms + tSetup;
  const win = scheduleInWindows(m, af, p, S, deployEta, tExec);
  used.add(`af:${unit.modelId}:maxWindKts`);

  // Verification status of every parameter used
  for (const key of used) {
    let mp: MasterParam | undefined;
    if (key.startsWith('cap:')) mp = p.capacity[m.type];
    else if (key.startsWith('speed:')) {
      const mode = key.split(':')[2] as TransportMode;
      mp = mode === 'self-ferry' ? p.selfFerryKmh : S.master.regionalSpeeds[m.regionId][mode as 'road' | 'ferry' | 'air'];
    } else if (key.startsWith('overhead:')) mp = S.master.modeOverheadMin[key.split(':')[1] as TransportMode];
    else if (key.startsWith('setup:')) mp = S.master.missionSetupMin[m.type];
    else if (key.startsWith('af:')) {
      const f = key.split(':')[2] as keyof AirframeParams;
      mp = p[f] as MasterParam;
      if (f === 'maxWindKts' && (!p.maxGustKts.verified || !p.minVisKm.verified)) unverified.push(paramName(`af:${unit.modelId}:weatherLimits`));
    }
    if (mp && !mp.verified) unverified.push(paramName(key));
  }

  // Warnings
  for (const pt of m.requiredPayloads) {
    const pl = S.payloads.find((x) => x.type === pt && (unit.payloadIds.includes(x.id) || (x.baseId === unit.baseId && !x.unitId)));
    if (pl && win.completion !== Infinity && pl.calDue < win.completion) warnings.push(`${PAYLOAD_META[pt].short} calibration ${pl.calDue < S.now ? 'expired' : 'expires before completion'}`);
  }
  const flightHrs = (sorties * sortieMin) / 60;
  if (unit.airframeHrs + flightHrs > unit.nextServiceHrs) warnings.push(`Service interval reached after ${(unit.nextServiceHrs - unit.airframeHrs).toFixed(0)} h`);
  if (unit.firmware !== unit.firmwareLatest) warnings.push(`Firmware ${unit.firmware} → ${unit.firmwareLatest}`);
  if (unit.faults.some((f) => f.active && f.severity === 'critical')) warnings.push('Active critical fault');
  if (S.kpIndex >= 5 && m.type === 'survey') warnings.push(`KP ${S.kpIndex} — RTK reliability reduced`);
  if (af.heavyLift) warnings.push('Requires heavy-lift rated PIC');

  return {
    unitId: unit.id,
    missionId: m.id,
    feasible: win.feasible,
    infeasibleReason: win.feasible ? undefined : `No ${(tExec / HOUR).toFixed(1)} h window in 8 days`,
    tAvail,
    tTransit: transit.ms,
    tSetup,
    sorties,
    sortieMin,
    turnaroundMin,
    capacity,
    tExec,
    deployEta,
    completion: win.completion,
    windowWait: win.feasible ? Math.max(0, win.completion - deployEta - tExec) : Infinity,
    firstWindowStart: win.firstStart,
    transit,
    indicative: unverified.length > 0,
    unverified: [...new Set(unverified)],
    warnings,
    payloadSwap,
    windowBlockers: win.blockers,
  };
}

// ── Candidates (memoised) ───────────────────────────────────────────────────
const candCache = new Map<string, EtaResult[]>();

function unitsSig(S: EngineState): string {
  let s = '';
  for (const u of S.units) s += u.id + u.status[1] + (u.missionId ?? '') + Math.round((u.busyUntil || 0) / MIN) + ';';
  return s;
}

/** All units ranked for a mission — feasible first, by earliest valid completion. */
export function candidatesFor(m: Mission, S: EngineState): EtaResult[] {
  const key = `${m.id}|${Math.floor(S.now / MIN)}|${S.masterVersion}|${S.weatherSeverity}|${S.kpIndex}|${m.status}|${m.progress.toFixed(2)}|${unitsSig(S).length}|${hashStr(unitsSig(S))}`;
  const hit = candCache.get(key);
  if (hit) return hit;
  if (candCache.size > 400) candCache.clear();
  const res = S.units.map((u) => computeEta(u, m, S)).sort(rank);
  candCache.set(key, res);
  return res;
}

export function rank(a: EtaResult, b: EtaResult): number {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.completion !== b.completion) return a.completion - b.completion;
  return a.deployEta - b.deployEta;
}

export function recommended(m: Mission, S: EngineState): EtaResult | undefined {
  return candidatesFor(m, S).find((c) => c.feasible);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Mission-level live ETA for the units currently assigned (or the best candidate). */
export function missionEta(m: Mission, S: EngineState): EtaResult | undefined {
  if (m.assignedUnitIds.length) {
    const rs = m.assignedUnitIds
      .map((id) => S.units.find((u) => u.id === id))
      .filter((u): u is Unit => !!u)
      .map((u) => computeEta(u, m, S));
    const ok = rs.filter((r) => r.feasible);
    if (ok.length) {
      // Multiple units share the workload: scale execution.
      const best = ok.sort(rank)[0];
      if (ok.length > 1) {
        const n = ok.length;
        const execShare = best.tExec / n;
        const af = AIRFRAME[S.units.find((u) => u.id === best.unitId)!.modelId];
        const win = scheduleInWindows(m, af, S.master.airframes[af.id], S, best.deployEta, execShare);
        return { ...best, tExec: execShare, completion: win.completion, sorties: Math.ceil(best.sorties / n) };
      }
      return best;
    }
    return rs.sort(rank)[0];
  }
  return recommended(m, S);
}

export const UNIT_SUFFIX = (m: Mission) => MISSION_PROFILES[m.type].unit;
