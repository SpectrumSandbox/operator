// Derived scheduling models: weather suitability runs per mission, Gantt rows
// for missions / drones / payloads / crews, and calendar day aggregates.
// Everything here is pure and is memoised by the caller per sim-minute.
import type { AirframeModel, AirframeParams, AirspaceZone, Crew, Mission, Payload, Permit, Unit } from '../../types';
import type { OpsState } from '../../store';
import type { Conflict } from '../../engine/conflicts';
import type { ProposalItem } from '../../engine/optimizer';
import { judgeSlot, missionSlots, recommended, type HourSlot } from '../../engine/eta';
import { permitFor, permitRequired, zonesForMission } from '../../engine/airspace';
import { RAIN_LIMIT } from '../../engine/weather';
import { AIRFRAME, MISSION_PROFILES } from '../../data/catalog';
import { DAY, HOUR } from '../../lib/time';
import type { WxClass } from './shared';

export const isOpen = (m: Mission) => m.status !== 'completed';

// ── Weather runs ────────────────────────────────────────────────────────────
export interface Lead {
  unitId: string;
  af: AirframeModel;
  p: AirframeParams;
  recommended: boolean;
}

export function leadAirframe(m: Mission, S: OpsState): Lead | undefined {
  const id = m.assignedUnitIds[0];
  const u = id ? S.units.find((x) => x.id === id) : undefined;
  if (u) return { unitId: u.id, af: AIRFRAME[u.modelId], p: S.master.airframes[u.modelId], recommended: false };
  const r = recommended(m, S);
  const ru = r && S.units.find((x) => x.id === r.unitId);
  if (ru) return { unitId: ru.id, af: AIRFRAME[ru.modelId], p: S.master.airframes[ru.modelId], recommended: true };
  return undefined;
}

export function classifySlot(s: HourSlot, m: Mission, lead: Lead): { cls: WxClass; reasons: string[] } {
  const v = judgeSlot(s, m, lead.af, lead.p);
  const wxReasons = v.reasons.filter((r) => /^(Wind|Gust|Rain|Vis|Ceiling)/.test(r));
  if (!v.weatherOk) return { cls: 'nogo', reasons: wxReasons };
  if (!v.lightOk) return { cls: 'dark', reasons: ['No daylight — optical / VLOS mission'] };
  const w = s.wx;
  const p = lead.p;
  const marg: string[] = [];
  if (w.windKts > 0.8 * p.maxWindKts.value) marg.push(`Wind ${w.windKts.toFixed(0)} kt (limit ${p.maxWindKts.value})`);
  if (w.gustKts > 0.8 * p.maxGustKts.value) marg.push(`Gust ${w.gustKts.toFixed(0)} kt (limit ${p.maxGustKts.value})`);
  const rl = RAIN_LIMIT[lead.af.rainTolerance];
  if (w.rainMmH > 0 && w.rainMmH > 0.4 * rl) marg.push(`Rain ${w.rainMmH.toFixed(1)} mm/h (limit ${rl})`);
  if (w.visKm < 1.5 * p.minVisKm.value) marg.push(`Vis ${w.visKm} km`);
  return marg.length ? { cls: 'marginal', reasons: marg } : { cls: 'ok', reasons: [] };
}

export interface WxRun {
  from: number;
  to: number;
  cls: WxClass;
  reasons: string[];
  maxWind: number;
  maxGust: number;
  maxRain: number;
}

export function weatherRuns(m: Mission, S: OpsState, lead: Lead, until: number): WxRun[] {
  const slots = missionSlots(m, S);
  const out: WxRun[] = [];
  for (const s of slots) {
    if (s.t >= until) break;
    const c = classifySlot(s, m, lead);
    const last = out[out.length - 1];
    if (last && last.cls === c.cls && last.to === s.t) {
      last.to = s.t + HOUR;
      for (const r of c.reasons) if (!last.reasons.some((x) => x.split(' ')[0] === r.split(' ')[0])) last.reasons.push(r);
      last.maxWind = Math.max(last.maxWind, s.wx.windKts);
      last.maxGust = Math.max(last.maxGust, s.wx.gustKts);
      last.maxRain = Math.max(last.maxRain, s.wx.rainMmH);
    } else {
      out.push({ from: s.t, to: s.t + HOUR, cls: c.cls, reasons: [...c.reasons], maxWind: s.wx.windKts, maxGust: s.wx.gustKts, maxRain: s.wx.rainMmH });
    }
  }
  return out;
}

// ── Gantt model ─────────────────────────────────────────────────────────────
export type GroupId = 'missions' | 'units' | 'payloads' | 'crews';

export interface GBar {
  missionId: string;
  code: string;
  name: string;
  from: number;
  to: number;
  color: string;
  status: Mission['status'];
  progress: number;
}

export interface GMarker {
  t: number;
  tone: 'ok' | 'warn' | 'alert' | 'live';
  label: string;
  detail: string;
}

export interface GRow {
  id: string;
  group: GroupId;
  height: number;
  missionId?: string;
  bars: GBar[];
  conflicts: Conflict[];
  // mission rows only
  mission?: Mission;
  permit?: Permit;
  permitNeeded?: boolean;
  notams?: AirspaceZone[];
  wx?: WxRun[];
  lead?: { callsign: string; model: string; recommended: boolean };
  proposed?: ProposalItem;
  // resource rows
  unit?: Unit;
  payload?: Payload;
  crew?: Crew;
  markers?: GMarker[];
  unavailable?: { from: number; to: number; label: string };
}

export interface GanttModel {
  rows: Record<GroupId, GRow[]>;
}

const barOf = (m: Mission): GBar => ({
  missionId: m.id,
  code: m.code,
  name: m.name,
  from: m.scheduledStart,
  to: m.scheduledEnd,
  color: MISSION_PROFILES[m.type].color,
  status: m.status,
  progress: m.progress,
});

export function buildGantt(S: OpsState, conflicts: Conflict[], t1: number): GanttModel {
  const open = S.missions.filter(isOpen).sort((a, b) => a.scheduledStart - b.scheduledStart);
  const unitById = new Map(S.units.map((u) => [u.id, u]));
  const proposalBy = new Map((S.proposal?.items ?? []).map((i) => [i.missionId, i]));

  const missions: GRow[] = open.map((m) => {
    const lead = leadAirframe(m, S);
    const leadUnit = lead ? unitById.get(lead.unitId) : undefined;
    return {
      id: `m:${m.id}`,
      group: 'missions',
      height: 36,
      missionId: m.id,
      mission: m,
      bars: [barOf(m)],
      conflicts: conflicts.filter((c) => c.missionIds.includes(m.id)),
      permit: permitFor(m, S.permits),
      permitNeeded: permitRequired(m, S.zones),
      notams: zonesForMission(m, S.zones).filter((z) => z.activeFrom !== undefined && z.activeTo !== undefined && z.maxUasFt === 0),
      wx: lead ? weatherRuns(m, S, lead, t1) : [],
      lead: lead && leadUnit ? { callsign: leadUnit.callsign, model: lead.af.name, recommended: lead.recommended } : undefined,
      proposed: proposalBy.get(m.id),
    };
  });

  // Drones with assignments
  const unitMissions = new Map<string, Mission[]>();
  for (const m of open) for (const id of m.assignedUnitIds) unitMissions.set(id, [...(unitMissions.get(id) ?? []), m]);
  const units: GRow[] = [...unitMissions.entries()]
    .map(([id, ms]) => {
      const u = unitById.get(id)!;
      const unavailable = u.status === 'grounded' || u.status === 'maintenance' ? { from: S.now - 6 * HOUR, to: t1, label: u.status === 'grounded' ? 'Grounded' : 'In maintenance' } : undefined;
      const markers: GMarker[] = [];
      if (u.busyUntil > S.now && u.status === 'charging') markers.push({ t: u.busyUntil, tone: 'live', label: 'CHG', detail: `Charging / refuel complete` });
      return {
        id: `u:${id}`,
        group: 'units' as const,
        height: 26,
        unit: u,
        bars: ms.map(barOf),
        conflicts: conflicts.filter((c) => (c.resource?.kind === 'unit' && c.resource.id === id)),
        unavailable,
        markers,
      };
    })
    .filter((r) => !!r.unit)
    .sort((a, b) => Math.min(...a.bars.map((x) => x.from)) - Math.min(...b.bars.map((x) => x.from)));

  // Payloads used by assigned units' missions
  const payloadMissions = new Map<string, Mission[]>();
  for (const m of open) {
    const ids = new Set(m.payloadIds);
    for (const uid of m.assignedUnitIds) {
      const u = unitById.get(uid);
      if (!u) continue;
      for (const pid of u.payloadIds) {
        const p = S.payloads.find((x) => x.id === pid);
        if (p && m.requiredPayloads.includes(p.type)) ids.add(pid);
      }
    }
    if (!m.assignedUnitIds.length) continue;
    for (const pid of ids) payloadMissions.set(pid, [...(payloadMissions.get(pid) ?? []), m]);
  }
  const payloads: GRow[] = [...payloadMissions.entries()]
    .map(([pid, ms]) => {
      const p = S.payloads.find((x) => x.id === pid)!;
      const markers: GMarker[] = [];
      if (p) {
        markers.push({ t: p.calDue, tone: p.calDue < S.now ? 'alert' : 'warn', label: 'CAL', detail: `${p.calType} due` });
        for (const b of S.calBookings.filter((x) => x.payloadId === pid)) markers.push({ t: b.at, tone: 'ok', label: 'BKD', detail: 'Calibration booked' });
      }
      return { id: `p:${pid}`, group: 'payloads' as const, height: 26, payload: p, bars: ms.map(barOf), conflicts: conflicts.filter((c) => c.resource?.kind === 'payload' && c.resource.id === pid), markers };
    })
    .filter((r) => !!r.payload)
    .sort((a, b) => Math.min(...a.bars.map((x) => x.from)) - Math.min(...b.bars.map((x) => x.from)));

  // Crews
  const crewMissions = new Map<string, Mission[]>();
  for (const m of open) for (const c of m.crewIds) crewMissions.set(c, [...(crewMissions.get(c) ?? []), m]);
  const crews: GRow[] = [...crewMissions.entries()]
    .map(([cid, ms]) => {
      const c = S.crews.find((x) => x.id === cid)!;
      const markers: GMarker[] = [];
      if (c && c.dutyHrsToday < c.maxDutyHrs && ms.some((m) => m.status === 'active')) {
        markers.push({ t: S.now + (c.maxDutyHrs - c.dutyHrsToday) * HOUR, tone: 'warn', label: 'DUTY', detail: `${c.maxDutyHrs} h duty limit reached` });
      }
      return { id: `c:${cid}`, group: 'crews' as const, height: 26, crew: c, bars: ms.map(barOf), conflicts: conflicts.filter((x) => x.resource?.kind === 'crew' && x.resource.id === cid), markers };
    })
    .filter((r) => !!r.crew)
    .sort((a, b) => Math.min(...a.bars.map((x) => x.from)) - Math.min(...b.bars.map((x) => x.from)));

  return { rows: { missions, units, payloads, crews } };
}

// ── Calendar model ──────────────────────────────────────────────────────────
export interface CalDay {
  start: number;
  conflicts: number;
  blocking: number;
  /** Share of daylight site-hours that are no-go (0..1); undefined = beyond forecast. */
  wxRisk?: number;
  wxWorst?: string;
}

export function calendarDays(S: OpsState, conflicts: Conflict[], day0: number, n: number): CalDay[] {
  const open = S.missions.filter(isOpen);
  const leads = new Map(open.map((m) => [m.id, leadAirframe(m, S)]));
  const horizonEnd = Math.floor(S.now / HOUR) * HOUR + 192 * HOUR;
  const out: CalDay[] = [];
  for (let i = 0; i < n; i++) {
    const start = day0 + i * DAY;
    const end = start + DAY;
    const cs = conflicts.filter((c) => c.from < end && c.to > start);
    let total = 0;
    let bad = 0;
    const why = new Map<string, number>();
    if (start < horizonEnd) {
      for (const m of open) {
        const lead = leads.get(m.id);
        if (!lead) continue;
        for (const s of missionSlots(m, S)) {
          if (s.t < start || s.t >= end || !s.wx.daylight) continue;
          total++;
          const c = classifySlot(s, m, lead);
          if (c.cls === 'nogo') {
            bad++;
            for (const r of c.reasons) why.set(r.split(' ')[0], (why.get(r.split(' ')[0]) ?? 0) + 1);
          }
        }
      }
    }
    out.push({
      start,
      conflicts: cs.length,
      blocking: cs.filter((c) => c.blocking).length,
      wxRisk: total ? bad / total : undefined,
      wxWorst: [...why.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    });
  }
  return out;
}
