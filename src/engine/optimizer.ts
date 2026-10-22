// AI Schedule Optimizer ("Auto-Propose Schedule")
// Greedy, constraint-aware planner:
//   1. orders missions by priority → SLA due,
//   2. clusters geographically proximate missions so one team chains them,
//   3. picks the unit with the earliest valid completion (ETA engine) given
//      units already committed in this proposal,
//   4. rosters a rated, rested crew and aligns payloads with valid calibration,
//   5. respects SLA cadence commitments and routes around weather/airspace windows.
import type { Crew, LatLng, Mission, Unit } from '../types';
import { AIRFRAME, PAYLOAD_META, PRIORITY } from '../data/catalog';
import { distKm } from '../lib/geo';
import { HOUR, MIN } from '../lib/time';
import type { EngineState } from './ctx';
import { computeEta, type EtaResult } from './eta';
import { detectConflicts } from './conflicts';
import { permitFor, permitRequired } from './airspace';

export interface ProposalItem {
  missionId: string;
  unitId: string;
  crewIds: string[];
  payloadIds: string[];
  start: number;
  end: number;
  eta: EtaResult;
  cluster: number;
  rationale: string[];
  slaMet: boolean;
  changed: boolean;
  /** Follow-up actions the plan depends on (applied on accept). */
  permitAction?: 'file' | 'file-emergency' | 'resubmit' | 'extend';
  calBookings: { payloadId: string; at: number; label: string }[];
}

export interface Proposal {
  createdAt: number;
  items: ProposalItem[];
  unplaced: { missionId: string; reason: string }[];
  clusters: { id: number; label: string; missionIds: string[] }[];
  stats: {
    missions: number;
    conflictsBefore: number;
    conflictsAfter: number;
    transitKmNaive: number;
    transitKmPlanned: number;
    slaMet: number;
    slaTotal: number;
    permitFilings: number;
    calBookings: number;
  };
}

const PLANNABLE: Mission['status'][] = ['request', 'planned', 'scheduled', 'hold-weather', 'hold-airspace', 'delayed'];

function clusterMissions(ms: Mission[], radiusKm = 70): Mission[][] {
  const left = [...ms];
  const out: Mission[][] = [];
  while (left.length) {
    const seed = left.shift()!;
    const group = [seed];
    for (let i = left.length - 1; i >= 0; i--) {
      if (group.some((g) => distKm(g.launchPoint, left[i].launchPoint) <= radiusKm)) group.push(...left.splice(i, 1));
    }
    out.push(group);
  }
  return out;
}

export function autoPropose(S: EngineState): Proposal {
  const before = detectConflicts(S).filter((c) => c.blocking).length;
  const targets = S.missions
    .filter((m) => PLANNABLE.includes(m.status))
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.slaDue - b.slaDue);

  const clusters = clusterMissions(targets);
  // Order clusters by their most urgent member, then members by priority + nearest-neighbour chaining.
  const orderedClusters = clusters.map((g, i) => ({ id: i + 1, members: g })).sort((a, b) => Math.min(...a.members.map((m) => PRIORITY[m.priority].rank * 1e13 + m.slaDue)) - Math.min(...b.members.map((m) => PRIORITY[m.priority].rank * 1e13 + m.slaDue)));

  // Simulated resource timelines
  const unitFree = new Map<string, { at: number; pos: LatLng }>();
  for (const u of S.units) {
    const busyWithOther = u.missionId && !targets.some((t) => t.id === u.missionId);
    unitFree.set(u.id, { at: busyWithOther ? Math.max(S.now, u.busyUntil) : u.status === 'charging' ? u.busyUntil : S.now, pos: u.pos });
  }
  const crewLoad = new Map<string, number>(S.crews.map((c) => [c.id, c.dutyHrsToday]));
  const crewFree = new Map<string, number>(S.crews.map((c) => [c.id, S.now]));
  // Crews busy on active (non-plannable) missions
  for (const m of S.missions.filter((x) => x.status === 'active')) for (const c of m.crewIds) crewFree.set(c, Math.max(crewFree.get(c) ?? S.now, m.scheduledEnd));

  const items: ProposalItem[] = [];
  const unplaced: Proposal['unplaced'] = [];
  let naiveKm = 0;
  let plannedKm = 0;

  for (const cl of orderedClusters) {
    const members = [...cl.members].sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.slaDue - b.slaDue);
    for (const m of members) {
      let best: { u: Unit; r: EtaResult; score: number } | undefined;
      for (const u of S.units) {
        const f = unitFree.get(u.id)!;
        const r = computeEta(u, m, S, { availableAt: Math.max(S.now, f.at), from: f.pos });
        if (!r.feasible) continue;
        // Cadence: recurring missions should not start before their cadence slot
        let score = r.completion;
        // Logistics cost: prefer nearby assets unless the mission is urgent (≈ 1.5 min per km moved).
        if (m.priority !== 'urgent') score += r.transit.distKm * 90_000 + (r.transit.mode === 'air' ? 6 * HOUR : 0);
        if (m.cadenceDays && m.status === 'scheduled') score += Math.max(0, m.scheduledStart - r.deployEta) * 0.2;
        if (r.warnings.some((w) => /calibration expired/.test(w))) score += 12 * HOUR;
        if (r.payloadSwap) score += 20 * MIN;
        if (!best || score < best.score) best = { u, r, score };
      }
      if (!best) {
        unplaced.push({ missionId: m.id, reason: 'No feasible unit / window within 8-day horizon' });
        continue;
      }
      const { u, r } = best;
      const base = S.bases.find((b) => b.id === u.baseId)!;
      naiveKm += distKm(base.pos, m.launchPoint);
      plannedKm += r.transit.distKm;

      // Crew rostering
      const need = new Set(m.requiredCerts);
      if (AIRFRAME[u.modelId].heavyLift) need.add('HeavyLift');
      if (m.bvlos) need.add('BVLOS');
      const durH = (r.completion - r.firstWindowStart) / HOUR;
      const rank = (c: Crew) =>
        (c.baseId === u.baseId ? 0 : 1) * 100 + distKm(c.pos, m.launchPoint) / 50 + (crewLoad.get(c.id) ?? 0) * 2 + (c.role === 'PIC' ? 0 : 50);
      const eligible = S.crews.filter((c) => c.role === 'PIC' && [...need].every((x) => c.certs.includes(x)) && (crewFree.get(c.id) ?? S.now) <= r.firstWindowStart && (crewLoad.get(c.id) ?? 0) + Math.min(durH, 8) <= c.maxDutyHrs + (r.firstWindowStart - S.now > 14 * HOUR ? c.dutyHrsToday : 0)).sort((a, b) => rank(a) - rank(b));
      const pic = eligible[0];
      const crewIds = pic ? [pic.id] : [];
      if (pic) {
        crewFree.set(pic.id, r.completion);
        crewLoad.set(pic.id, (crewLoad.get(pic.id) ?? 0) + Math.min(durH, 8));
        const support = S.crews.find((c) => c.role !== 'PIC' && c.baseId === pic.baseId && (crewFree.get(c.id) ?? S.now) <= r.firstWindowStart);
        if (support && (m.requiredPayloads.includes('eoir') || m.type === 'cargo' || m.bvlos)) {
          crewIds.push(support.id);
          crewFree.set(support.id, r.completion);
        }
      }

      // Payload alignment
      const payloadIds: string[] = [];
      for (const pt of m.requiredPayloads) {
        const onboard = S.payloads.find((p) => p.type === pt && u.payloadIds.includes(p.id) && p.calDue > r.completion);
        const spare = S.payloads.find((p) => p.type === pt && p.baseId === u.baseId && !p.unitId && p.calDue > r.completion);
        const any = S.payloads.find((p) => p.type === pt && u.payloadIds.includes(p.id));
        const pick = onboard ?? spare ?? any;
        if (pick) payloadIds.push(pick.id);
      }

      const rationale: string[] = [];
      rationale.push(`${u.callsign} (${AIRFRAME[u.modelId].name}) — earliest valid completion`);
      if (r.transit.distKm > 0.5) rationale.push(`${r.transit.mode} transit ${r.transit.distKm.toFixed(0)} km from ${f2(unitFree.get(u.id)!.pos, base.pos) ? base.name : 'previous job site'}`);
      if (r.windowWait > 30 * MIN) rationale.push(`Waits ${Math.round(r.windowWait / HOUR)} h for weather/airspace window`);
      if (members.length > 1) rationale.push(`Clustered with ${members.length - 1} nearby mission(s)`);
      if (pic) rationale.push(`PIC ${pic.name} (${pic.certs.join('/') || 'standard'})`);
      else rationale.push('⚠ No rated PIC free — needs roster action');
      const spareUsed = payloadIds.map((id) => S.payloads.find((p) => p.id === id)!).filter((p) => p && !u.payloadIds.includes(p.id));
      if (spareUsed.length) rationale.push(`Mount ${spareUsed.map((p) => `${PAYLOAD_META[p.type].short} ${p.serial}`).join(', ')}`);
      if (m.cadenceDays) rationale.push(`Keeps ${m.cadenceDays}-day SLA cadence`);

      const start = r.firstWindowStart;
      const end = r.completion;

      // Clearance follow-up
      let permitAction: ProposalItem['permitAction'];
      if (permitRequired(m, S.zones)) {
        const pm = permitFor(m, S.permits);
        if (!pm) permitAction = m.priority === 'urgent' ? 'file-emergency' : 'file';
        else if (pm.status === 'expired' || pm.status === 'rejected') permitAction = m.priority === 'urgent' ? 'file-emergency' : 'resubmit';
        else if (pm.windowStart > start || pm.windowEnd < end) permitAction = 'extend';
      }
      if (permitAction) rationale.push(permitAction === 'file-emergency' ? 'Expedited emergency clearance (BNPB/Basarnas)' : permitAction === 'extend' ? 'Request clearance window extension' : 'File SINKAP / NOTAM request (48 h lead)');

      // Calibration bookings for payloads that would expire before completion
      const calBookings: ProposalItem['calBookings'] = [];
      for (const pid of payloadIds) {
        const pl = S.payloads.find((x) => x.id === pid);
        if (pl && pl.calDue < end) {
          const at = Math.max(S.now + HOUR, start - 2 * HOUR);
          calBookings.push({ payloadId: pid, at, label: `${PAYLOAD_META[pl.type].short} ${pl.serial}` });
        }
      }
      if (calBookings.length) rationale.push(`Book ${calBookings.map((b) => b.label).join(', ')} calibration before launch`);
      items.push({
        missionId: m.id,
        unitId: u.id,
        crewIds,
        payloadIds,
        start,
        end,
        eta: r,
        cluster: cl.id,
        rationale,
        slaMet: end <= m.slaDue,
        changed: !m.assignedUnitIds.includes(u.id) || Math.abs(m.scheduledStart - start) > 30 * MIN,
        permitAction,
        calBookings,
      });
      // Unit is free after completion, positioned at the mission site (chains clusters).
      unitFree.set(u.id, { at: end + 20 * MIN, pos: m.launchPoint });
    }
  }

  // Estimate conflicts after: re-run the detector on the projected state, with
  // the plan's follow-up actions applied (filed clearances, booked calibrations).
  const projected = applyProposal(S, items);
  const filed = new Set(items.filter((i) => i.permitAction && i.permitAction !== 'file-emergency').map((i) => i.missionId));
  const after = detectConflicts(projected).filter((c) => c.blocking && !(c.kind === 'airspace' && filed.has(c.missionIds[0]) && /pending/.test(c.title))).length;
  // restore cache for real state
  detectConflicts(S);

  return {
    createdAt: S.now,
    items,
    unplaced,
    clusters: orderedClusters.map((c) => ({ id: c.id, label: clusterLabel(c.members), missionIds: c.members.map((m) => m.id) })),
    stats: {
      missions: items.length,
      conflictsBefore: before,
      conflictsAfter: after,
      transitKmNaive: Math.round(naiveKm),
      transitKmPlanned: Math.round(plannedKm),
      slaMet: items.filter((i) => i.slaMet).length,
      slaTotal: items.length,
      permitFilings: items.filter((i) => i.permitAction).length,
      calBookings: items.reduce((n, i) => n + i.calBookings.length, 0),
    },
  };
}

/** Apply proposal items to a state snapshot (used for projection and on accept). */
export function applyProposal<T extends EngineState>(S: T, items: ProposalItem[]): T {
  const permits = [...S.permits];
  for (const it of items) {
    if (!it.permitAction) continue;
    const m = S.missions.find((x) => x.id === it.missionId)!;
    const existing = permits.findIndex((p) => p.missionId === m.id);
    const emergency = it.permitAction === 'file-emergency';
    const rec = {
      id: existing >= 0 ? permits[existing].id : `pm-${m.id}`,
      missionId: m.id,
      authority: emergency ? ('AirNav Indonesia' as const) : ('DGCA (DKPPU)' as const),
      ref: emergency ? `EMRG/${m.code.slice(-7)}/BNPB-AIRNAV` : `SINKAP/REQ/${m.code.slice(-7)}`,
      kind: emergency ? ('Flight Approval (FA)' as const) : ('SINKAP Clearance' as const),
      status: emergency ? ('approved' as const) : ('pending' as const),
      windowStart: Math.min(it.start, S.now) - HOUR,
      windowEnd: it.end + 2 * HOUR,
      submittedAt: S.now,
    };
    if (existing >= 0) permits[existing] = it.permitAction === 'extend' ? { ...permits[existing], status: 'pending', windowEnd: it.end + 2 * HOUR, windowStart: Math.min(permits[existing].windowStart, it.start) } : rec;
    else permits.push(rec);
  }
  return {
    ...S,
    permits,
    calBookings: [...(S.calBookings ?? []), ...items.flatMap((i) => i.calBookings.map((b) => ({ payloadId: b.payloadId, at: b.at, missionId: i.missionId })))],
    missions: S.missions.map((m) => {
      const it = items.find((i) => i.missionId === m.id);
      if (!it) return m;
      return { ...m, assignedUnitIds: [it.unitId], crewIds: it.crewIds.length ? it.crewIds : m.crewIds, payloadIds: it.payloadIds, scheduledStart: it.start, scheduledEnd: it.end, status: proposedStatus(m, it) };
    }),
  };
}

/** Status a mission takes when a proposal item is applied. Without a rated PIC it stays 'planned'. */
export function proposedStatus(m: Mission, it: ProposalItem): Mission['status'] {
  const hasCrew = it.crewIds.length > 0 || m.crewIds.length > 0;
  if (m.status === 'request' || m.status === 'planned' || m.status === 'delayed') return hasCrew ? 'scheduled' : 'planned';
  if (m.status === 'hold-weather' || m.status === 'hold-airspace') return 'scheduled';
  return m.status;
}

function f2(a: LatLng, b: LatLng) {
  return distKm(a, b) < 2;
}

function clusterLabel(ms: Mission[]): string {
  const regions = [...new Set(ms.map((m) => m.regionId))];
  return regions.map((r) => r.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(' / ');
}
