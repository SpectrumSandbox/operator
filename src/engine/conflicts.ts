// Automated Conflict Detection Engine — scans the schedule for resource,
// compliance, airspace and weather conflicts and proposes resolutions.
import type { Crew, Mission, Unit } from '../types';
import { AIRFRAME, PAYLOAD_META, PRIORITY } from '../data/catalog';
import { HOUR, fmtDur } from '../lib/time';
import type { EngineState } from './ctx';
import { computeEta, judgeSlot, missionSlots, recommended, scheduleInWindows } from './eta';
import { permitFor, permitRequired, restrictiveZones, zoneActiveDuring } from './airspace';

export type ConflictKind =
  | 'unit-double-booking'
  | 'crew-double-booking'
  | 'calibration'
  | 'maintenance'
  | 'crew-fatigue'
  | 'crew-rating'
  | 'airspace'
  | 'weather';

export interface Conflict {
  id: string;
  kind: ConflictKind;
  severity: 'warn' | 'critical';
  blocking: boolean;
  missionIds: string[];
  resource?: { kind: 'unit' | 'crew' | 'payload' | 'permit' | 'zone'; id: string; label: string };
  title: string;
  detail: string;
  resolution: string;
  /** Time span to highlight on the Gantt. */
  from: number;
  to: number;
}

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  'unit-double-booking': 'Asset double-booking',
  'crew-double-booking': 'Crew double-booking',
  calibration: 'Sensor calibration',
  maintenance: 'Maintenance interval',
  'crew-fatigue': 'Crew duty / fatigue',
  'crew-rating': 'Pilot rating mismatch',
  airspace: 'Airspace clearance',
  weather: 'Weather window',
};

const ACTIVE_STATUSES: Mission['status'][] = ['planned', 'scheduled', 'active', 'hold-weather', 'hold-airspace', 'delayed'];

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

let cache: { key: string; result: Conflict[] } | undefined;

export function detectConflicts(S: EngineState): Conflict[] {
  const key = `${Math.floor(S.now / (5 * 60_000))}|${S.masterVersion}|${S.weatherSeverity}|${S.missions.map((m) => m.id + m.status + m.assignedUnitIds.join() + m.crewIds.join() + m.scheduledStart + m.scheduledEnd).join(';')}|${S.units.map((u) => u.status[0] + u.airframeHrs.toFixed(0)).join('')}|${S.permits.map((p) => p.status).join('')}|${S.payloads.map((p) => p.calDue).join(',')}|${(S.calBookings ?? []).length}|${S.crews.map((c) => c.certs.length + ':' + c.dutyHrsToday.toFixed(0)).join(',')}`;
  if (cache?.key === key) return cache.result;

  const out: Conflict[] = [];
  const missions = S.missions.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const unitById = new Map(S.units.map((u) => [u.id, u]));
  const crewById = new Map(S.crews.map((c) => [c.id, c]));
  const push = (c: Omit<Conflict, 'id'>) => out.push({ ...c, id: `${c.kind}:${c.missionIds.join('+')}:${c.resource?.id ?? ''}:${out.length}` });

  // 1–2. Double bookings
  for (let i = 0; i < missions.length; i++) {
    for (let j = i + 1; j < missions.length; j++) {
      const a = missions[i];
      const b = missions[j];
      if (!overlap(a.scheduledStart, a.scheduledEnd, b.scheduledStart, b.scheduledEnd)) continue;
      const from = Math.max(a.scheduledStart, b.scheduledStart);
      const to = Math.min(a.scheduledEnd, b.scheduledEnd);
      for (const uid of a.assignedUnitIds.filter((x) => b.assignedUnitIds.includes(x))) {
        const u = unitById.get(uid)!;
        const alt = recommended(PRIORITY[a.priority].rank <= PRIORITY[b.priority].rank ? b : a, S);
        push({
          kind: 'unit-double-booking',
          severity: 'critical',
          blocking: true,
          missionIds: [a.id, b.id],
          resource: { kind: 'unit', id: uid, label: u.callsign },
          title: `${u.callsign} booked on two missions`,
          detail: `${a.code} and ${b.code} overlap for ${fmtDur(to - from)}.`,
          resolution: alt ? `Re-assign ${b.code} to ${unitById.get(alt.unitId)?.callsign} (earliest valid completion), or shift ${b.code} by ${fmtDur(to - from)}.` : `Shift ${b.code} after ${a.code} completes.`,
          from,
          to,
        });
      }
      for (const cid of a.crewIds.filter((x) => b.crewIds.includes(x))) {
        const c = crewById.get(cid)!;
        const spare = S.crews.find((x) => x.baseId === c.baseId && x.id !== c.id && x.role === c.role && x.dutyHrsToday < 6);
        push({
          kind: 'crew-double-booking',
          severity: 'critical',
          blocking: true,
          missionIds: [a.id, b.id],
          resource: { kind: 'crew', id: cid, label: c.name },
          title: `${c.name} rostered twice`,
          detail: `${c.role} on ${a.code} and ${b.code} simultaneously (${fmtDur(to - from)}).`,
          resolution: spare ? `Swap ${b.code} to ${spare.name} (${spare.role}, ${spare.dutyHrsToday.toFixed(1)} h on duty).` : `No spare ${c.role} at base — stagger missions by ${fmtDur(to - from)}.`,
          from,
          to,
        });
      }
    }
  }

  for (const m of missions) {
    const units = m.assignedUnitIds.map((id) => unitById.get(id)).filter((u): u is Unit => !!u);
    const crews = m.crewIds.map((id) => crewById.get(id)).filter((c): c is Crew => !!c);
    const durH = (m.scheduledEnd - m.scheduledStart) / HOUR;

    // 3. Calibration
    for (const u of units) {
      for (const pid of u.payloadIds) {
        const p = S.payloads.find((x) => x.id === pid);
        if (!p || !m.requiredPayloads.includes(p.type)) continue;
        const booked = (S.calBookings ?? []).some((b) => b.payloadId === p.id && b.at <= m.scheduledStart);
        if (p.calDue < m.scheduledEnd && !booked) {
          const expired = p.calDue < S.now;
          const spare = S.payloads.find((x) => x.type === p.type && x.baseId === u.baseId && !x.unitId && x.calDue > m.scheduledEnd);
          push({
            kind: 'calibration',
            severity: expired ? 'critical' : 'warn',
            blocking: expired,
            missionIds: [m.id],
            resource: { kind: 'payload', id: p.id, label: `${PAYLOAD_META[p.type].short} ${p.serial}` },
            title: `${PAYLOAD_META[p.type].short} ${p.serial} calibration ${expired ? 'expired' : 'expires mid-mission'}`,
            detail: `${p.calType} due ${fmtDur(p.calDue - S.now)} ${p.calDue < S.now ? 'ago' : 'from now'}; ${m.code} ends in ${fmtDur(m.scheduledEnd - S.now)}.`,
            resolution: spare ? `Mount spare ${spare.serial} (valid ${fmtDur(spare.calDue - S.now)}).` : `Book ${p.calType.toLowerCase()} before ${m.code} or move mission earlier.`,
            from: Math.max(m.scheduledStart, Math.min(p.calDue, m.scheduledEnd)),
            to: m.scheduledEnd,
          });
        }
      }
    }

    // 4. Maintenance interval / unserviceable
    for (const u of units) {
      const af = AIRFRAME[u.modelId];
      const p = S.master.airframes[u.modelId];
      const cap = p.capacity[m.type]?.value ?? 1;
      const flightHrs = Math.min(durH, (Math.ceil((m.workload * (1 - m.progress)) / cap) * p.sortieMin.value) / 60);
      if (u.status === 'grounded' || u.status === 'maintenance') {
        push({
          kind: 'maintenance',
          severity: 'critical',
          blocking: true,
          missionIds: [m.id],
          resource: { kind: 'unit', id: u.id, label: u.callsign },
          title: `${u.callsign} is ${u.status}`,
          detail: u.faults.filter((f) => f.active).map((f) => f.code).join(', ') || 'Unit not serviceable',
          resolution: 'Re-assign to recommended unit from Deployment ETA engine.',
          from: m.scheduledStart,
          to: m.scheduledEnd,
        });
      } else if (u.airframeHrs + flightHrs > u.nextServiceHrs) {
        push({
          kind: 'maintenance',
          severity: u.airframeHrs >= u.nextServiceHrs ? 'critical' : 'warn',
          blocking: u.airframeHrs >= u.nextServiceHrs,
          missionIds: [m.id],
          resource: { kind: 'unit', id: u.id, label: u.callsign },
          title: `${u.callsign} exceeds ${af.serviceIntervalHrs} h service interval`,
          detail: `${u.airframeHrs.toFixed(0)} h now + ${flightHrs.toFixed(1)} h planned > ${u.nextServiceHrs} h inspection.`,
          resolution: `Schedule ${af.serviceIntervalHrs} h inspection before ${m.code} or split sorties with another ${af.name}.`,
          from: m.scheduledStart + Math.max(0, ((u.nextServiceHrs - u.airframeHrs) / Math.max(flightHrs, 0.1)) * (m.scheduledEnd - m.scheduledStart)),
          to: m.scheduledEnd,
        });
      }
    }

    // 5. Crew fatigue
    for (const c of crews) {
      const todayHrs = Math.min(durH, Math.max(0, (m.scheduledEnd - Math.max(S.now, m.scheduledStart)) / HOUR));
      const startsSoon = m.scheduledStart < S.now + 12 * HOUR;
      if (startsSoon && c.dutyHrsToday + todayHrs > c.maxDutyHrs) {
        push({
          kind: 'crew-fatigue',
          severity: c.dutyHrsToday >= c.maxDutyHrs ? 'critical' : 'warn',
          blocking: c.dutyHrsToday >= c.maxDutyHrs,
          missionIds: [m.id],
          resource: { kind: 'crew', id: c.id, label: c.name },
          title: `${c.name} exceeds ${c.maxDutyHrs} h duty limit`,
          detail: `${c.dutyHrsToday.toFixed(1)} h on duty + ${todayHrs.toFixed(1)} h remaining on ${m.code}.`,
          resolution: `Hand over at ${(c.maxDutyHrs - c.dutyHrsToday).toFixed(1)} h — relief from ${S.bases.find((b) => b.id === c.baseId)?.name}.`,
          from: S.now + Math.max(0, c.maxDutyHrs - c.dutyHrsToday) * HOUR,
          to: m.scheduledEnd,
        });
      }
      if (c.flightHrs28d + durH * 0.6 > c.maxFlightHrs28d) {
        push({
          kind: 'crew-fatigue',
          severity: 'warn',
          blocking: false,
          missionIds: [m.id],
          resource: { kind: 'crew', id: c.id, label: c.name },
          title: `${c.name} near 28-day flight-hour cap`,
          detail: `${c.flightHrs28d} h of ${c.maxFlightHrs28d} h in rolling 28 days.`,
          resolution: 'Rotate PIC for next cadence cycle.',
          from: m.scheduledStart,
          to: m.scheduledEnd,
        });
      }
    }

    // 6. Ratings
    if (m.status !== 'planned' || crews.length) {
      const have = new Set(crews.flatMap((c) => c.certs));
      const need = new Set(m.requiredCerts);
      if (units.some((u) => AIRFRAME[u.modelId].heavyLift)) need.add('HeavyLift');
      if (m.bvlos) need.add('BVLOS');
      const missing = [...need].filter((c) => !have.has(c));
      if (missing.length && crews.length) {
        const fix = S.crews.find((c) => missing.every((x) => c.certs.includes(x)) && c.dutyHrsToday < 8);
        push({
          kind: 'crew-rating',
          severity: 'critical',
          blocking: true,
          missionIds: [m.id],
          resource: { kind: 'crew', id: crews[0].id, label: crews.map((c) => c.name.split(' ')[0]).join(', ') },
          title: `Crew lacks ${missing.join(' + ')} rating`,
          detail: `${m.code} requires ${[...need].join(', ')}.`,
          resolution: fix ? `Add ${fix.name} (${fix.certs.join(', ')}) — ${S.bases.find((b) => b.id === fix.baseId)?.city}.` : 'Request rated PIC from another hub.',
          from: m.scheduledStart,
          to: m.scheduledEnd,
        });
      }
      if (!crews.length && m.status !== 'planned') {
        push({
          kind: 'crew-rating',
          severity: 'warn',
          blocking: true,
          missionIds: [m.id],
          title: 'No crew rostered',
          detail: `${m.code} has no PIC assigned.`,
          resolution: 'Run Auto-Propose Schedule to roster crew.',
          from: m.scheduledStart,
          to: m.scheduledEnd,
        });
      }
    }

    // Does the scheduled span actually accommodate the remaining work inside
    // legal (airspace) + flyable (weather/daylight) hours? Engine-backed check.
    const lead = units[0];
    let fit: { fits: boolean; blockers: string[]; execMs: number } | undefined;
    if (lead && m.status !== 'completed') {
      const af = AIRFRAME[lead.modelId];
      const p = S.master.airframes[lead.modelId];
      const r = computeEta(lead, m, S);
      if (r.sorties > 0 || r.tExec > 0) {
        const from = Math.max(S.now, m.scheduledStart);
        const win = scheduleInWindows(m, af, p, S, from, r.tExec);
        fit = { fits: win.feasible && win.completion <= m.scheduledEnd + 30 * 60_000, blockers: win.blockers, execMs: r.tExec };
      }
    }
    const airspaceDominant = fit && !fit.fits && /NOTAM|TFR|window|Clearance|clearance|re-submission|lead/.test(fit.blockers.slice(0, 2).join(' '));

    // 7. Airspace — permit status gates dispatch
    const permit = permitFor(m, S.permits);
    if (permitRequired(m, S.zones)) {
      const statusBad = !permit || permit.status !== 'approved';
      const windowBad = !statusBad && (permit!.windowStart > Math.max(S.now, m.scheduledStart) + 60_000 || permit!.windowEnd < m.scheduledEnd) && (!fit || !fit.fits);
      if (statusBad || windowBad) {
        const z = restrictiveZones(m, S.zones)[0];
        push({
          kind: 'airspace',
          severity: !permit || permit.status === 'expired' || permit.status === 'rejected' ? 'critical' : 'warn',
          blocking: true,
          missionIds: [m.id],
          resource: permit ? { kind: 'permit', id: permit.id, label: permit.ref } : undefined,
          title: !permit ? 'Airspace clearance missing' : permit.status !== 'approved' ? `${permit.kind} ${permit.status}` : 'Mission outside clearance window',
          detail: z ? `Operation intersects ${z.name}${m.bvlos ? ' and is BVLOS' : ''}.` : m.bvlos ? 'BVLOS operation requires SINKAP clearance.' : '',
          resolution:
            permit?.status === 'pending'
              ? `Escalate ${permit.ref} with ${permit.authority}; dispatch blocked until approved.`
              : permit?.status === 'expired' || permit?.status === 'rejected'
                ? `Re-submit ${permit.kind} to ${permit.authority} (≈ 48 h lead time).`
                : permit
                  ? `Request window extension on ${permit.ref} or shift mission inside it.`
                  : m.priority === 'urgent'
                    ? 'Request expedited emergency clearance via BNPB / Basarnas coordination (≈ 1 h).'
                    : 'Submit SINKAP / NOTAM request via AirNav Indonesia (≈ 48 h lead time).',
          from: m.scheduledStart,
          to: m.scheduledEnd,
        });
      }
    }
    // Temporary restrictions overlapping the span: blocking only if work no longer fits.
    for (const z of restrictiveZones(m, S.zones)) {
      if (z.activeFrom === undefined) continue;
      if (zoneActiveDuring(z, Math.max(S.now, m.scheduledStart), m.scheduledEnd)) {
        const blocking = !!airspaceDominant || !fit;
        push({
          kind: 'airspace',
          severity: blocking ? 'critical' : 'warn',
          blocking,
          missionIds: [m.id],
          resource: { kind: 'zone', id: z.id, label: z.ref ?? z.name },
          title: blocking ? `${z.ref ?? 'TFR'} blocks mission window` : `${z.ref ?? 'TFR'} pauses operations`,
          detail: `${z.name} restricts UAS ${new Date(z.activeFrom).toISOString().slice(11, 16)}–${new Date(z.activeTo!).toISOString().slice(11, 16)} UTC${blocking ? '' : ' — remaining work still fits the window'}.`,
          resolution: blocking ? 'Shift around NOTAM window or re-plan geometry outside restricted area.' : 'Engine routes sorties around the restriction; brief crew on stand-down period.',
          from: Math.max(m.scheduledStart, z.activeFrom),
          to: Math.min(m.scheduledEnd, z.activeTo!),
        });
      }
    }

    // 8. Weather window
    if (lead && m.status !== 'completed') {
      const af = AIRFRAME[lead.modelId];
      const p = S.master.airframes[lead.modelId];
      // Only operable hours count (night hours of daylight-only missions are not "weather").
      const slots = missionSlots(m, S).filter((s) => s.t + HOUR > Math.max(S.now, m.scheduledStart) && s.t < m.scheduledEnd && judgeSlot(s, m, af, p).lightOk);
      const bad = slots.filter((s) => !judgeSlot(s, m, af, p).weatherOk);
      const frac = slots.length ? bad.length / slots.length : 0;
      const weatherBlocks = !!fit && !fit.fits && !airspaceDominant;
      if (weatherBlocks || frac > 0.4) {
        const reasons = [...new Set(bad.flatMap((s) => judgeSlot(s, m, af, p).reasons.filter((r) => /Wind|Gust|Rain|Vis|Ceiling/.test(r)).map((r) => r.split(' ')[0])))].slice(0, 3);
        push({
          kind: 'weather',
          severity: weatherBlocks ? 'critical' : 'warn',
          blocking: weatherBlocks,
          missionIds: [m.id],
          title: weatherBlocks ? `Work no longer fits weather window` : `Marginal weather in ${Math.round(frac * 100)}% of window`,
          detail: `${reasons.join(' · ') || 'Limits exceeded'}${fit ? ` — ${(fit.execMs / HOUR).toFixed(1)} h of flying needed` : ''}.`,
          resolution: 'Re-slot into next contiguous weather window (see ETA engine) or swap to a higher wind/rain-rated airframe.',
          from: bad[0]?.t ?? m.scheduledStart,
          to: (bad[bad.length - 1]?.t ?? m.scheduledEnd - HOUR) + HOUR,
        });
      }
    }
  }

  cache = { key, result: out };
  return out;
}

export function conflictsForMission(id: string, all: Conflict[]): Conflict[] {
  return all.filter((c) => c.missionIds.includes(id));
}
