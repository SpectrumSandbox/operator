// ─────────────────────────────────────────────────────────────────────────────
// Ops store — a tiny external store (useSyncExternalStore) + live simulation.
// Select *slices* (stable references) in components; derive with useMemo.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';
import type {
  Alert,
  AuditEntry,
  ContingencyEvent,
  ContingencyState,
  LatLng,
  MasterData,
  Mission,
  OverrideReason,
  PipelineRun,
  Unit,
  UnitStatus,
  ViewId,
} from './types';
import { createSeed, type SeedState } from './data/seed';
import { AIRFRAME } from './data/catalog';
import type { EngineState } from './engine/ctx';
import { missionPath } from './engine/flightpath';
import { alongLine, bearingDeg, destination, distKm, lerp } from './lib/geo';
import { HOUR, MIN, type Tz } from './lib/time';
import { clamp, uid } from './lib/format';
import { candidatesFor, computeEta, judgeSlot, missionSlots } from './engine/eta';
import { applyProposal, autoPropose, type Proposal } from './engine/optimizer';
import { detectConflicts } from './engine/conflicts';

export interface MapLayers {
  basemap: 'dark' | 'satellite';
  wind: boolean;
  radar: boolean;
  ceilingVis: boolean;
  airspace: boolean;
  kkop: boolean;
  tfr: boolean;
  military: boolean;
  population: boolean;
  ctr: boolean;
  bases: boolean;
  crews: boolean;
  tracks: boolean;
  missions: boolean;
}

export interface Toast {
  id: string;
  text: string;
  tone: 'ok' | 'warn' | 'alert' | 'info';
}

export interface OpsState extends SeedState, EngineState {
  t0: number;
  simRunning: boolean;
  simSpeed: number;
  tz: Tz;
  view: ViewId;
  selectedMissionId?: string;
  selectedUnitId?: string;
  proposal?: Proposal;
  layers: MapLayers;
  toasts: Toast[];
  /** Live counters for today's AI-vs-manual decisions. */
  aiToday: { accepted: number; overridden: number };
}

const now0 = Date.now();
const seed = createSeed(now0);

let state: OpsState = {
  ...seed,
  now: now0,
  t0: now0,
  simRunning: true,
  simSpeed: 10,
  tz: 'WIB',
  view: 'mission-control',
  weatherSeverity: 1,
  kpIndex: 4,
  masterVersion: 1,
  calBookings: [],
  layers: {
    basemap: 'dark',
    wind: false,
    radar: true,
    ceilingVis: false,
    airspace: true,
    kkop: true,
    tfr: true,
    military: true,
    population: false,
    ctr: false,
    bases: true,
    crews: true,
    tracks: true,
    missions: true,
  },
  toasts: [],
  aiToday: { accepted: 7, overridden: 2 },
};

const listeners = new Set<() => void>();

export const ops = {
  get: (): OpsState => state,
  set(patch: Partial<OpsState> | ((s: OpsState) => Partial<OpsState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Subscribe to a slice. The selector must return a stable reference or a primitive. */
export function useOps<T>(selector: (s: OpsState) => T): T {
  return useSyncExternalStore(ops.subscribe, () => selector(state), () => selector(state));
}

/** Whole state (re-renders on every tick — use sparingly, e.g. for engine calls). */
export function useOpsState(): OpsState {
  return useSyncExternalStore(ops.subscribe, () => state, () => state);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const replace = <T extends { id: string }>(arr: T[], id: string, fn: (t: T) => T): T[] => arr.map((x) => (x.id === id ? fn(x) : x));

function addAlert(s: OpsState, a: Omit<Alert, 'id' | 'ts'>): Alert[] {
  if (s.alerts.slice(0, 6).some((x) => x.text === a.text)) return s.alerts;
  return [{ ...a, id: uid('al'), ts: s.now }, ...s.alerts].slice(0, 60);
}
function addAudit(s: OpsState, e: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry[] {
  return [{ ...e, id: uid('a'), ts: s.now }, ...s.audit].slice(0, 300);
}

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const t = { id: uid('t'), text, tone };
  ops.set((s) => ({ toasts: [...s.toasts, t].slice(-4) }));
  setTimeout(() => ops.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4200);
}

// ── simulation ──────────────────────────────────────────────────────────────
const STEP_MIN: Record<string, number> = { ingest: 25, validate: 15, process: 70, qa: 20, publish: 6 };

function advance(s: OpsState, dt: number): Partial<OpsState> {
  const now = s.now + dt;
  const dtH = dt / HOUR;
  let alerts = s.alerts;
  let audit = s.audit;
  let pipelines = s.pipelines;
  const S = { ...s, now };
  const missionById = new Map(s.missions.map((m) => [m.id, m]));
  const missionPatch = new Map<string, Partial<Mission>>();
  const patchM = (id: string, p: Partial<Mission>) => missionPatch.set(id, { ...(missionPatch.get(id) ?? {}), ...p });
  const minuteTick = Math.floor(now / (5 * MIN)) !== Math.floor(s.now / (5 * MIN));

  // ── Mission state transitions (every 5 sim-minutes) ──
  if (minuteTick) {
    const conflicts = detectConflicts(S);
    for (const m of s.missions) {
      const lead = s.units.find((u) => m.assignedUnitIds.includes(u.id));
      if (!lead) continue;
      const af = AIRFRAME[lead.modelId];
      const slot = missionSlots(m, S, 2)[0];
      const v = judgeSlot(slot, m, af, s.master.airframes[lead.modelId]);
      if (m.status === 'active' && !v.ok) {
        const st = v.weatherOk ? 'hold-airspace' : 'hold-weather';
        patchM(m.id, { status: st });
        alerts = addAlert({ ...s, alerts }, { severity: 'warn', text: `${m.code} → ${st === 'hold-weather' ? 'WEATHER HOLD' : 'AIRSPACE HOLD'}: ${v.reasons.slice(0, 2).join(', ')} — units RTL`, ref: { kind: 'mission', id: m.id } });
      } else if ((m.status === 'hold-weather' || m.status === 'hold-airspace') && v.ok && now >= m.scheduledStart) {
        patchM(m.id, { status: 'active' });
        alerts = addAlert({ ...s, alerts }, { severity: 'info', text: `${m.code} window open — operations resumed`, ref: { kind: 'mission', id: m.id } });
      } else if ((m.status === 'scheduled' || m.status === 'delayed') && now >= m.scheduledStart) {
        const blocking = conflicts.filter((c) => c.blocking && c.missionIds.includes(m.id) && c.kind !== 'weather');
        if (!blocking.length && v.ok) {
          patchM(m.id, { status: 'active' });
          alerts = addAlert({ ...s, alerts }, { severity: 'info', text: `${m.code} dispatched — ${m.assignedUnitIds.length} unit(s) launching`, ref: { kind: 'mission', id: m.id } });
          audit = addAudit({ ...s, audit }, { actor: 'System', kind: 'dispatch', text: `Auto-dispatch ${m.code} at scheduled start`, missionId: m.id });
        } else if (m.status === 'scheduled') {
          patchM(m.id, { status: 'delayed' });
          alerts = addAlert({ ...s, alerts }, { severity: 'warn', text: `${m.code} delayed — ${blocking[0]?.title ?? v.reasons[0] ?? 'window closed'}`, ref: { kind: 'mission', id: m.id } });
        }
      }
    }
  }
  const curMission = (id: string) => ({ ...missionById.get(id)!, ...(missionPatch.get(id) ?? {}) });

  // ── Units ──
  const units: Unit[] = s.units.map((u) => {
    const af = AIRFRAME[u.modelId];
    const p = s.master.airframes[u.modelId];
    const m = u.missionId ? curMission(u.missionId) : undefined;
    let nu: Unit = u;

    // Contingency in progress
    if (u.contingency) {
      const c = u.contingency;
      const d = distKm(u.pos, c.target);
      const step = (af.cruiseKmh * (c.action === 'DESCEND' ? 0.5 : 1)) * dtH;
      if (c.action === 'DESCEND' && now - c.startedAt > 4 * MIN) {
        return { ...u, contingency: undefined, altM: Math.min(120, (m?.maxAltFt ?? 300) * 0.3048), track: u.track, faults: u.faults.map((f) => (f.code === 'ADSB_TRAFFIC' ? { ...f, active: false } : f)) };
      }
      if (d <= step || c.action === 'DESCEND') {
        if (c.action === 'DESCEND') return { ...u, altM: Math.max(45, u.altM - 25 * (dt / MIN)) };
        const log = [...c.log, { ts: now, text: `Touchdown at ${c.targetName}. Motors disarmed.` }];
        return { ...u, pos: c.target, altM: 0, speedKmh: 0, status: 'available', missionId: undefined, contingency: { ...c, log, action: c.action }, busyUntil: 0, energyPct: u.energyPct };
      }
      const pos = destination(u.pos, bearingDeg(u.pos, c.target), step);
      return { ...u, pos, headingDeg: bearingDeg(u.pos, c.target), speedKmh: af.cruiseKmh, altM: c.action === 'LAND' ? Math.max(20, u.altM - 10) : u.altM, energyPct: Math.max(3, u.energyPct - (dtH * 60 * 78) / p.sortieMin.value), track: [...u.track, pos].slice(-160) };
    }

    if (u.status === 'in-flight' && m) {
      if (m.status !== 'active') {
        // Hold → RTL to launch
        return { ...u, status: 'assigned', pos: m.launchPoint, altM: 0, speedKmh: 0, track: [] };
      }
      const fp = missionPath(m);
      const spd = af.cruiseKmh * (0.82 + Math.random() * 0.08);
      let pathKm = u.pathKm + spd * dtH;
      if (pathKm > fp.lengthKm) pathKm = fp.loop ? pathKm % fp.lengthKm : pathKm % fp.lengthKm;
      const a = alongLine(fp.path, pathKm);
      const energy = u.energyPct - (dtH * 60 * 78) / p.sortieMin.value;
      const altTarget = af.isVessel ? 0 : Math.min(af.ceilingFtAgl, m.maxAltFt) * 0.3048;
      nu = {
        ...u,
        pos: a.pos,
        headingDeg: a.heading,
        pathKm,
        speedKmh: +spd.toFixed(1),
        altM: af.isVessel ? 0 : +(altTarget + (Math.random() - 0.5) * 4).toFixed(1),
        energyPct: energy,
        airframeHrs: u.airframeHrs + dtH,
        motorHrs: u.motorHrs + dtH,
        lastFlightTs: now,
        linkQuality: clamp(u.linkQuality + (Math.random() - 0.5) * 6, 35, 100),
        satellites: clamp(Math.round(u.satellites + (Math.random() - 0.5) * 2), 12, 34),
        track: [...u.track, a.pos].slice(-160),
      };
      if (energy <= 22) {
        nu = { ...nu, status: 'charging', pos: m.launchPoint, altM: 0, speedKmh: 0, busyUntil: now + p.turnaroundMin.value * MIN, track: [] };
      }
      // Mission progress contribution
      const cap = p.capacity[m.type]?.value ?? 1;
      const rate = m.type === 'cargo' ? Math.min(cap, af.maxPayloadKg) / ((((m.routeKm ?? 1) * 2) / af.cruiseKmh) + 0.13) : cap / (p.sortieMin.value / 60);
      const prog = Math.min(1, (missionPatch.get(m.id)?.progress ?? m.progress) + (rate * dtH) / Math.max(m.workload, 0.001));
      patchM(m.id, { progress: prog });
      return nu;
    }

    if (u.status === 'charging' && now >= u.busyUntil) {
      if (m && m.status === 'active') return { ...u, status: 'in-flight', energyPct: 100, busyUntil: m.scheduledEnd, chargeCycles: u.chargeCycles + 1 };
      return { ...u, status: m ? 'assigned' : 'available', energyPct: 100, busyUntil: m ? m.scheduledEnd : 0, chargeCycles: u.chargeCycles + 1 };
    }
    if (u.status === 'charging') return { ...u, energyPct: Math.min(100, u.energyPct + (dt / MIN) * 2.2) };

    if (u.status === 'in-transit' && u.transitTo) {
      const spd = u.transitMode === 'air' ? 250 : u.transitMode === 'ferry' ? 25 : u.transitMode === 'self-ferry' ? af.cruiseKmh : 38;
      const d = distKm(u.pos, u.transitTo);
      const step = spd * dtH;
      if (d <= step) {
        const arrived: Unit = { ...u, pos: u.transitTo, transitTo: undefined, transitMode: undefined, status: m && m.status === 'active' ? 'in-flight' : 'assigned', speedKmh: 0, track: [] };
        return arrived;
      }
      const pos = destination(u.pos, bearingDeg(u.pos, u.transitTo), step);
      return { ...u, pos, headingDeg: bearingDeg(u.pos, u.transitTo), speedKmh: spd, track: [...u.track, pos].slice(-60) };
    }

    if (u.status === 'assigned' && m && m.status === 'active') {
      const d = distKm(u.pos, m.launchPoint);
      if (d < 1.5) return { ...u, status: 'in-flight', pos: m.launchPoint, busyUntil: m.scheduledEnd, pathKm: 0, energyPct: Math.max(u.energyPct, 95) };
      const eta = computeEta(u, m, S);
      return { ...u, status: 'in-transit', transitTo: m.launchPoint, transitMode: eta.transit.mode === 'air' && d < 150 ? 'road' : eta.transit.mode };
    }
    return nu;
  });

  // ── Mission completion ──
  const missions = s.missions.map((m) => (missionPatch.has(m.id) ? { ...m, ...missionPatch.get(m.id)! } : m));
  let finalUnits = units;
  for (let k = 0; k < missions.length; k++) {
    const m0 = missions[k];
    if (m0.status === 'active' && m0.progress >= 1) {
      const m = (missions[k] = { ...m0, status: 'completed' as const, scheduledEnd: now });
      finalUnits = finalUnits.map((u) => (m.assignedUnitIds.includes(u.id) ? { ...u, status: 'available' as UnitStatus, missionId: undefined, busyUntil: 0, speedKmh: 0, altM: 0, pos: m.launchPoint, track: [] } : u));
      alerts = addAlert({ ...s, alerts }, { severity: 'info', text: `${m.code} completed — dataset ingest started`, ref: { kind: 'mission', id: m.id } });
      pipelines = [newPipeline(m, m.assignedUnitIds[0], now), ...pipelines];
    }
  }

  // ── Pipelines ──
  pipelines = pipelines.map((r) => {
    const i = r.steps.findIndex((st) => st.status === 'running');
    if (i < 0) {
      const pub = r.steps[4];
      if (pub.status === 'blocked' && !r.quarantine && (!r.signoff.required || (r.signoff.first && r.signoff.second))) {
        return { ...r, steps: r.steps.map((st, k) => (k === 4 ? { ...st, status: 'running' as const, startedAt: now } : st)) };
      }
      return r;
    }
    const st = r.steps[i];
    const prog = st.progress + dt / (STEP_MIN[st.key] * MIN * (1 + r.sizeGb / 200));
    if (prog < 1) return { ...r, steps: r.steps.map((x, k) => (k === i ? { ...x, progress: prog } : x)) };
    const steps = r.steps.map((x, k) => (k === i ? { ...x, status: 'done' as const, progress: 1, endedAt: now } : x));
    let qaScore = r.qaScore;
    if (st.key === 'qa') qaScore = +(r.grid.scores.reduce((a, b) => a + b, 0) / r.grid.scores.length).toFixed(1);
    if (i + 1 < steps.length) {
      const next = steps[i + 1];
      const gated = next.key === 'publish' && r.signoff.required && !(r.signoff.first && r.signoff.second);
      steps[i + 1] = { ...next, status: gated ? 'blocked' : 'running', startedAt: gated ? undefined : now };
    }
    return { ...r, steps, qaScore };
  });

  // ── Booked calibrations complete ──
  let payloads = s.payloads;
  let calBookings = s.calBookings;
  if (calBookings.some((b) => b.at <= now)) {
    const due = calBookings.filter((b) => b.at <= now);
    calBookings = calBookings.filter((b) => b.at > now);
    payloads = payloads.map((pl) => {
      const b = due.find((x) => x.payloadId === pl.id);
      if (!b) return pl;
      const interval = pl.calDue - pl.lastCal;
      return { ...pl, lastCal: b.at, calDue: b.at + interval };
    });
    for (const b of due) alerts = addAlert({ ...s, alerts }, { severity: 'info', text: `Calibration completed — ${payloads.find((x) => x.id === b.payloadId)?.serial}`, ref: { kind: 'payload', id: b.payloadId } });
  }

  // ── Weather cells drift ──
  const weatherCells = s.weatherCells.map((c) => ({ ...c, center: destination(c.center, c.driftDeg, c.driftKmh * dtH) }));

  // ── Crew duty clocks ──
  const fieldCrew = new Set(missions.filter((m) => m.status === 'active').flatMap((m) => m.crewIds));
  const crews = s.crews.map((c) => (fieldCrew.has(c.id) ? { ...c, status: 'in-field' as const, dutyHrsToday: +(c.dutyHrsToday + dtH).toFixed(3) } : c));

  return { now, units: finalUnits, missions, pipelines, weatherCells, crews, alerts, audit, payloads, calBookings };
}

function newPipeline(m: Mission, unitId: string, now: number): PipelineRun {
  const label = m.type === 'survey' ? (m.subtype === 'LiDAR' ? 'Point Cloud Classification' : m.subtype === 'Bathymetric' ? 'Bathymetric Surface (CUBE)' : 'Orthomosaic + DSM') : m.type === 'corridor' ? 'Structural Defect AI' : m.type === 'isr' || m.type === 'sar' ? 'Thermal Anomaly Detection' : m.type === 'cargo' ? 'Delivery Proof (PoD)' : 'NDVI / NDRE Canopy Indices';
  const rows = m.type === 'corridor' ? 3 : 6;
  const cols = m.type === 'corridor' ? 20 : 8;
  return {
    id: uid('pl'),
    missionId: m.id,
    unitId,
    dataset: `${m.code.replace('MSN-', '').replace('REQ-', '')}-${label.split(' ')[0].toUpperCase()}`,
    sizeGb: m.type === 'cargo' ? 0.3 : +(20 + Math.random() * 120).toFixed(0),
    processingLabel: label,
    steps: (['ingest', 'validate', 'process', 'qa', 'publish'] as const).map((key, i) => ({ key, status: i === 0 ? 'running' : 'queued', progress: 0, startedAt: i === 0 ? now : undefined })),
    grid: { rows, cols, scores: Array.from({ length: rows * cols }, () => Math.round(84 + Math.random() * 16)), layout: m.type === 'corridor' ? 'corridor' : 'grid' },
    signoff: { required: m.priority !== 'routine' || m.type === 'survey' },
    createdAt: now,
    critical: m.priority !== 'routine',
  };
}

let timer: ReturnType<typeof setInterval> | undefined;
export function startSimulation() {
  if (timer) return;
  timer = setInterval(() => {
    const s = state;
    if (!s.simRunning) return;
    ops.set(advance(s, 1000 * s.simSpeed));
  }, 1000);
}

// ── actions ─────────────────────────────────────────────────────────────────
export const actions = {
  setView(view: ViewId) {
    ops.set({ view });
  },
  selectMission(id?: string) {
    ops.set({ selectedMissionId: id });
  },
  selectUnit(id?: string) {
    ops.set({ selectedUnitId: id });
  },
  setTz(tz: Tz) {
    ops.set({ tz });
  },
  toggleSim() {
    ops.set((s) => ({ simRunning: !s.simRunning }));
  },
  setSimSpeed(simSpeed: number) {
    ops.set({ simSpeed });
  },
  setLayer<K extends keyof MapLayers>(k: K, v: MapLayers[K]) {
    ops.set((s) => ({ layers: { ...s.layers, [k]: v } }));
  },
  setWeatherSeverity(v: number) {
    ops.set({ weatherSeverity: +v.toFixed(2) });
  },
  setKp(v: number) {
    ops.set({ kpIndex: v });
  },

  /** Edit master data; `verified` flips the INDICATIVE/VERIFIED badge. */
  updateMaster(fn: (draft: MasterData) => void, auditText: string) {
    ops.set((s) => {
      const draft = structuredClone(s.master);
      fn(draft);
      return { master: draft, masterVersion: s.masterVersion + 1, audit: addAudit(s, { actor: 'Rizky A.', kind: 'master-data', text: auditText }) };
    });
  },

  /** Assign a unit to a mission (AI recommendation or operator override). */
  assignUnit(missionId: string, unitId: string, opts: { recommendedUnitId?: string; reason?: OverrideReason; note?: string } = {}) {
    const s = state;
    const m = s.missions.find((x) => x.id === missionId);
    const u = s.units.find((x) => x.id === unitId);
    if (!m || !u) return;
    const eta = computeEta(u, m, s);
    const isOverride = !!opts.recommendedUnitId && opts.recommendedUnitId !== unitId;
    const rec = s.units.find((x) => x.id === opts.recommendedUnitId);
    const start = isFinite(eta.firstWindowStart) ? eta.firstWindowStart : eta.deployEta;
    const end = isFinite(eta.completion) ? eta.completion : start + eta.tExec;
    ops.set((st) => ({
      missions: replace(st.missions, missionId, (x) => ({
        ...x,
        assignedUnitIds: x.status === 'active' ? [...new Set([...x.assignedUnitIds, unitId])] : [unitId],
        status: x.status === 'request' || x.status === 'planned' || x.status === 'delayed' ? 'scheduled' : x.status,
        scheduledStart: x.status === 'active' ? x.scheduledStart : start,
        scheduledEnd: x.status === 'active' ? Math.max(x.scheduledEnd, end) : end,
        payloadIds: [...new Set([...x.payloadIds, ...u.payloadIds.filter((pid) => x.requiredPayloads.includes(st.payloads.find((p) => p.id === pid)?.type as never))])],
      })),
      units: st.units.map((x) => {
        if (x.id === unitId) return { ...x, status: x.status === 'available' ? 'assigned' : x.status, missionId, busyUntil: end };
        // previously assigned (non-active) units are released
        if (m.status !== 'active' && m.assignedUnitIds.includes(x.id) && x.id !== unitId && x.missionId === missionId) return { ...x, status: x.status === 'assigned' ? 'available' : x.status, missionId: undefined, busyUntil: 0 };
        return x;
      }),
      audit: addAudit(st, isOverride
        ? { actor: 'Rizky A.', kind: 'override', text: `Override: ${u.callsign} instead of ${rec?.callsign} for ${m.code}`, missionId, recommendedUnitId: opts.recommendedUnitId, chosenUnitId: unitId, reason: opts.reason, note: opts.note }
        : { actor: 'Rizky A.', kind: 'accept-ai', text: `Accepted AI recommendation ${u.callsign} for ${m.code}`, missionId, recommendedUnitId: unitId, chosenUnitId: unitId }),
      aiToday: isOverride ? { ...st.aiToday, overridden: st.aiToday.overridden + 1 } : { ...st.aiToday, accepted: st.aiToday.accepted + 1 },
    }));
    toast(isOverride ? `Override logged — ${u.callsign} → ${m.code} (${opts.reason})` : `${u.callsign} assigned to ${m.code}`, isOverride ? 'warn' : 'ok');
  },

  /** Dispatch immediately (operator action). */
  dispatchMission(missionId: string) {
    const m = state.missions.find((x) => x.id === missionId);
    if (!m) return;
    if (!m.assignedUnitIds.length) {
      const best = candidatesFor(m, state).find((c) => c.feasible);
      if (best) actions.assignUnit(missionId, best.unitId, { recommendedUnitId: best.unitId });
    }
    ops.set((s) => ({
      missions: replace(s.missions, missionId, (x) => ({ ...x, status: 'active', scheduledStart: Math.min(x.scheduledStart, s.now) })),
      audit: addAudit(s, { actor: 'Rizky A.', kind: 'dispatch', text: `Manual dispatch ${m.code}`, missionId }),
    }));
    toast(`${m.code} dispatched`, 'ok');
  },

  shiftMission(missionId: string, deltaMs: number) {
    ops.set((s) => ({
      missions: replace(s.missions, missionId, (x) => ({ ...x, scheduledStart: x.scheduledStart + deltaMs, scheduledEnd: x.scheduledEnd + deltaMs })),
      audit: addAudit(s, { actor: 'Rizky A.', kind: 'schedule', text: `Shifted ${s.missions.find((x) => x.id === missionId)?.code} by ${Math.round(deltaMs / MIN)} min`, missionId }),
    }));
  },

  runAutoPropose() {
    const p = autoPropose(state);
    ops.set({ proposal: p });
    return p;
  },
  dismissProposal() {
    ops.set({ proposal: undefined });
  },
  acceptProposal(missionIds?: string[]) {
    const p = state.proposal;
    if (!p) return;
    const items = p.items.filter((i) => !missionIds || missionIds.includes(i.missionId));
    ops.set((s) => {
      const applied = applyProposal(s, items);
      let units = s.units;
      for (const it of items) {
        const m = s.missions.find((x) => x.id === it.missionId)!;
        // release previously assigned, idle units
        units = units.map((u) => (m.assignedUnitIds.includes(u.id) && u.id !== it.unitId && u.missionId === m.id && u.status === 'assigned' ? { ...u, status: 'available', missionId: undefined, busyUntil: 0 } : u));
        units = units.map((u) =>
          u.id === it.unitId
            ? { ...u, status: u.status === 'available' ? 'assigned' : u.status, missionId: u.missionId && u.missionId !== m.id && (u.status === 'in-flight' || u.status === 'in-transit') ? u.missionId : m.id, busyUntil: Math.max(u.busyUntil, it.end) }
            : u,
        );
      }
      return {
        missions: applied.missions,
        permits: applied.permits,
        calBookings: applied.calBookings,
        units,
        proposal: undefined,
        audit: addAudit(s, { actor: 'Rizky A.', kind: 'accept-ai', text: `Accepted AI schedule proposal (${items.length} missions, ${p.stats.conflictsBefore}→${p.stats.conflictsAfter} blocking conflicts, ${p.stats.permitFilings} clearance filings, ${p.stats.calBookings} calibration bookings)` }),
        aiToday: { ...s.aiToday, accepted: s.aiToday.accepted + items.length },
      };
    });
    toast(`AI schedule applied — ${items.length} missions re-planned`, 'ok');
  },

  approvePermit(permitId: string) {
    ops.set((s) => ({ permits: replace(s.permits, permitId, (p) => ({ ...p, status: 'approved' })), audit: addAudit(s, { actor: 'Rizky A.', kind: 'schedule', text: `Clearance ${s.permits.find((p) => p.id === permitId)?.ref} marked approved` }) }));
    toast('Clearance recorded as approved', 'ok');
  },

  recalibrate(payloadId: string) {
    ops.set((s) => ({
      payloads: replace(s.payloads, payloadId, (p) => {
        const days = Math.round((p.calDue - p.lastCal) / (24 * HOUR));
        return { ...p, lastCal: s.now, calDue: s.now + days * 24 * HOUR };
      }),
    }));
    toast('Calibration recorded', 'ok');
  },

  setUnitStatus(unitId: string, status: UnitStatus) {
    ops.set((s) => ({
      units: replace(s.units, unitId, (u) => ({
        ...u,
        status,
        faults: status === 'available' ? u.faults.map((f) => ({ ...f, active: false })) : u.faults,
        nextServiceHrs: status === 'available' && u.airframeHrs >= u.nextServiceHrs - 5 ? u.nextServiceHrs + AIRFRAME[u.modelId].serviceIntervalHrs : u.nextServiceHrs,
        busyUntil: status === 'available' ? 0 : u.busyUntil,
      })),
    }));
  },

  signoff(runId: string, approver: string) {
    const r = state.pipelines.find((x) => x.id === runId);
    if (!r) return;
    if (r.signoff.first?.by === approver) {
      toast('Second approver must be a different person', 'alert');
      return;
    }
    ops.set((s) => ({
      pipelines: replace(s.pipelines, runId, (x) => ({ ...x, signoff: x.signoff.first ? { ...x.signoff, second: { by: approver, at: s.now } } : { ...x.signoff, first: { by: approver, at: s.now } } })),
      audit: addAudit(s, { actor: approver, kind: 'signoff', text: `${r.signoff.first ? 'Second' : 'First'} approval — ${r.dataset}`, missionId: r.missionId }),
    }));
    toast(r.signoff.first ? `Dual sign-off complete — ${r.dataset} publishing` : `First approval recorded — awaiting second approver`, 'ok');
  },

  resolveQuarantine(runId: string, how: 'reprocess' | 'reflight' | 'accept') {
    const r = state.pipelines.find((x) => x.id === runId);
    if (!r?.quarantine) return;
    ops.set((s) => {
      const failedIdx = r.steps.findIndex((st) => st.status === 'failed');
      let missions = s.missions;
      if (how === 'reflight') {
        const m = s.missions.find((x) => x.id === r.missionId)!;
        const bad = r.grid.scores.filter((x) => x < 70).length / r.grid.scores.length;
        missions = [
          ...s.missions,
          { ...m, id: uid('m'), code: m.code.replace(/^(MSN|REQ)/, 'RFL'), name: `Re-flight · ${m.name}`, status: 'request', assignedUnitIds: [], crewIds: [], progress: 0, workload: +(m.workload * Math.max(0.08, bad)).toFixed(1), scheduledStart: s.now + 6 * HOUR, scheduledEnd: s.now + 9 * HOUR, priority: 'high', notes: `Re-flight of flagged cells from ${r.dataset} (${r.quarantine!.reason}).` },
        ];
      }
      return {
        missions,
        pipelines: replace(s.pipelines, runId, (x) => ({
          ...x,
          quarantine: how === 'reflight' ? x.quarantine : undefined,
          steps: x.steps.map((st, k) => (how === 'reflight' ? st : k === failedIdx ? { ...st, status: how === 'accept' ? 'done' : 'running', progress: how === 'accept' ? 1 : 0, startedAt: s.now } : st.status === 'blocked' && how === 'accept' && k === failedIdx + 1 ? { ...st, status: 'running', startedAt: s.now } : st)),
        })),
        audit: addAudit(s, { actor: 'Rizky A.', kind: 'quarantine', text: `${r.dataset}: ${how === 'reprocess' ? 're-processing with corrected parameters' : how === 'reflight' ? 're-flight request created' : 'accepted with documented exception'}`, missionId: r.missionId }),
      };
    });
    toast(how === 'reflight' ? 'Re-flight request added to work queue' : how === 'reprocess' ? 'Dataset re-queued for processing' : 'Exception accepted', 'ok');
  },

  simulateContingency(unitId: string, event: ContingencyEvent) {
    const s = state;
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return;
    const m = s.missions.find((x) => x.id === u.missionId);
    const base = s.bases.find((b) => b.id === u.baseId)!;
    const home: LatLng = m?.launchPoint ?? base.pos;
    const alts = [...base.alternates, { name: 'Launch point', pos: home }];
    const nearestAlt = alts.sort((a, b) => distKm(u.pos, a.pos) - distKm(u.pos, b.pos))[0];
    const t = s.now;
    let c: ContingencyState;
    const fault = (code: string, text: string, sev: 'warn' | 'critical', src: Unit['faults'][number]['source']) => ({ code, text, severity: sev, ts: t, active: true, source: src });
    let newFault;
    switch (event) {
      case 'c2-loss':
        c = { event, startedAt: t, action: 'RTL', target: home, targetName: m ? 'Launch point' : base.name, log: [
          { ts: t, text: 'C2 link RSSI < −105 dBm · packet loss 100%' },
          { ts: t + 3000, text: 'Lost-link timer 3 s expired → FAILSAFE' },
          { ts: t + 3500, text: `Cellular 4G failover attempted — ${u.payloadIds.length > 1 ? 'no coverage' : 'not fitted'}` },
          { ts: t + 4000, text: `RTL engaged: climb to ${Math.max(120, Math.round(u.altM))} m, heading ${Math.round(bearingDeg(u.pos, home))}° → ${distKm(u.pos, home).toFixed(1)} km` },
        ] };
        newFault = fault('C2_LINK_LOST', 'Command & control link lost — RTL failsafe active', 'critical', 'C2');
        break;
      case 'high-wind':
        c = { event, startedAt: t, action: 'DIVERT', target: nearestAlt.pos, targetName: nearestAlt.name, log: [
          { ts: t, text: `Gust ${Math.round(s.master.airframes[u.modelId].maxGustKts.value + 6)} kt > ${s.master.airframes[u.modelId].maxGustKts.value} kt limit (airframe)` },
          { ts: t + 2000, text: 'Ground speed into wind < 20% cruise — return not assured' },
          { ts: t + 3000, text: `DIVERT to alternate landing zone: ${nearestAlt.name} (${distKm(u.pos, nearestAlt.pos).toFixed(1)} km downwind)` },
        ] };
        newFault = fault('WIND_LIMIT', 'Wind/gust above airframe limit — divert to ALZ', 'warn', 'MAVLink');
        break;
      case 'adsb-intrusion':
        c = { event, startedAt: t, action: 'DESCEND', target: u.pos, targetName: 'Hold position', log: [
          { ts: t, text: 'ADS-B IN: PK-WHT (ATR 72) 2.1 NM, +800 ft, closing 210 kt' },
          { ts: t + 1500, text: 'Well-clear violation predicted in 34 s (DAA)' },
          { ts: t + 2500, text: 'Auto-descend to 45 m AGL & hold — traffic advisory to PIC' },
          { ts: t + 4 * MIN, text: 'Traffic clear → resume mission profile' },
        ] };
        newFault = fault('ADSB_TRAFFIC', 'Manned traffic conflict — DAA descend & hold', 'warn', 'MAVLink');
        break;
      case 'cell-sag':
        c = { event, startedAt: t, action: 'LAND', target: nearestAlt.pos, targetName: nearestAlt.name, log: [
          { ts: t, text: `BMS: cell 7 sag 3.31 V under load (pack Δ ${u.cellDeltaMv + 180} mV)` },
          { ts: t + 1000, text: 'Remaining energy model: 6 min to critical' },
          { ts: t + 2000, text: `Precautionary LAND at nearest ALZ: ${nearestAlt.name} (${distKm(u.pos, nearestAlt.pos).toFixed(1)} km)` },
        ] };
        newFault = fault('BAT_CELL_SAG', 'Battery cell voltage sag — precautionary landing', 'critical', 'BMS');
        break;
    }
    ops.set((st) => ({
      units: replace(st.units, unitId, (x) => ({ ...x, contingency: c, faults: [newFault!, ...x.faults], energyPct: event === 'cell-sag' ? Math.min(x.energyPct, 18) : x.energyPct, linkQuality: event === 'c2-loss' ? 0 : x.linkQuality })),
      alerts: addAlert(st, { severity: 'critical', text: `${u.callsign}: ${newFault!.text}`, ref: { kind: 'unit', id: unitId } }),
      audit: addAudit(st, { actor: 'Simulator', kind: 'contingency', text: `${u.callsign} contingency ${event} → ${c.action} (${c.targetName})`, missionId: m?.id }),
    }));
  },

  clearContingency(unitId: string) {
    ops.set((s) => ({ units: replace(s.units, unitId, (u) => ({ ...u, contingency: undefined, linkQuality: 90, faults: u.faults.map((f) => ({ ...f, active: f.severity === 'info' ? f.active : false })) })) }));
  },

  /** Put an available unit into flight on a looping test pattern (for contingency drills). */
  launchDrill(unitId: string) {
    const s = state;
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return;
    const m = s.missions.find((x) => x.status === 'active' && x.assignedUnitIds.includes(unitId));
    if (m) return;
    ops.set((st) => ({ units: replace(st.units, unitId, (x) => ({ ...x, status: 'in-flight', altM: 90, speedKmh: AIRFRAME[x.modelId].cruiseKmh, pos: lerp(x.pos, destination(x.pos, 45, 3), 1) })) }));
  },

  dismissAlert(id: string) {
    ops.set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
  },
};

export type { Proposal };
