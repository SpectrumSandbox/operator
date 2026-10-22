// AI Operational Briefing — automated synthesis of the live operational picture:
// bottlenecks, airspace/NOTAM expiries, closing weather windows, calibration
// expiries and recommended re-tasking. Rule-based and fully explainable: every
// line links to the evidence it came from.
import type { Mission } from '../types';
import { AIRFRAME, PAYLOAD_META, PRIORITY } from '../data/catalog';
import { HOUR, fmtDur } from '../lib/time';
import type { EngineState } from './ctx';
import { detectConflicts } from './conflicts';
import { candidatesFor, judgeSlot, missionSlots } from './eta';
import { zonesForMission } from './airspace';

export type BriefCategory = 'Re-tasking' | 'Bottleneck' | 'Airspace' | 'Weather' | 'Calibration' | 'Fleet';

export interface BriefItem {
  id: string;
  category: BriefCategory;
  severity: 'info' | 'warn' | 'critical';
  text: string;
  action?: { label: string; kind: 'mission' | 'unit' | 'view'; id: string };
}

const SEV_RANK = { critical: 0, warn: 1, info: 2 };

let cache: { key: string; items: BriefItem[] } | undefined;

export function generateBriefing(S: EngineState): BriefItem[] {
  const key = `${Math.floor(S.now / (10 * 60_000))}|${S.masterVersion}|${S.weatherSeverity}|${S.missions.map((m) => m.status + m.assignedUnitIds.length).join('')}|${S.units.map((u) => u.status[0]).join('')}|${S.permits.map((p) => p.status[0]).join('')}`;
  if (cache?.key === key) return cache.items;
  const out: BriefItem[] = [];
  const unitName = (id: string) => S.units.find((u) => u.id === id)?.callsign ?? id;

  // 1. Re-tasking for urgent / unassigned requests
  const open = S.missions.filter((m) => (m.status === 'request' || (m.status === 'planned' && !m.assignedUnitIds.length)) && m.priority !== 'routine');
  for (const m of open.sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.slaDue - b.slaDue).slice(0, 3)) {
    const best = candidatesFor(m, S).find((c) => c.feasible);
    if (!best) {
      out.push({ id: `rt-${m.id}`, category: 'Re-tasking', severity: 'critical', text: `${m.code} ${m.name}: no feasible unit inside 8-day window — escalate.`, action: { label: 'Open', kind: 'mission', id: m.id } });
      continue;
    }
    const slaOk = best.completion <= m.slaDue;
    out.push({
      id: `rt-${m.id}`,
      category: 'Re-tasking',
      severity: m.priority === 'urgent' ? 'critical' : 'warn',
      text: `Re-task ${unitName(best.unitId)} to ${m.code} (${m.subtype}) — deploys in ${fmtDur(best.deployEta - S.now)} via ${best.transit.mode}, completes in ${fmtDur(best.completion - S.now)}${slaOk ? ' — inside SLA' : ` — ${fmtDur(best.completion - m.slaDue)} past SLA`}${best.indicative ? ' (indicative)' : ''}.`,
      action: { label: 'Assign', kind: 'mission', id: m.id },
    });
  }

  // 2. Bottlenecks (blocking conflicts)
  const conflicts = detectConflicts(S).filter((c) => c.blocking);
  const byKind = new Map<string, number>();
  for (const c of conflicts) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
  for (const c of conflicts.filter((x) => x.kind !== 'airspace' && x.kind !== 'weather').slice(0, 3)) {
    out.push({ id: `bn-${c.id}`, category: 'Bottleneck', severity: c.severity, text: `${c.title}. ${c.resolution}`, action: { label: 'Resolve', kind: 'view', id: 'scheduler' } });
  }

  // 3. Airspace: pending/expiring permits and NOTAM windows opening/closing
  for (const p of S.permits) {
    const m = S.missions.find((x) => x.id === p.missionId);
    if (!m || m.status === 'completed') continue;
    if (p.status === 'pending' && m.scheduledStart - S.now < 24 * HOUR)
      out.push({ id: `pm-${p.id}`, category: 'Airspace', severity: 'critical', text: `${p.kind} ${p.ref} still pending with ${p.authority} — ${m.code} starts in ${fmtDur(m.scheduledStart - S.now)}.`, action: { label: 'Open', kind: 'mission', id: m.id } });
    else if (p.status === 'approved' && p.windowEnd > S.now && p.windowEnd - S.now < 12 * HOUR && m.scheduledEnd > p.windowEnd)
      out.push({ id: `pe-${p.id}`, category: 'Airspace', severity: 'warn', text: `${p.ref} clearance window closes in ${fmtDur(p.windowEnd - S.now)} before ${m.code} completes — request extension.`, action: { label: 'Open', kind: 'mission', id: m.id } });
    else if (p.status === 'expired' && m.status !== 'request')
      out.push({ id: `px-${p.id}`, category: 'Airspace', severity: 'critical', text: `${p.kind} ${p.ref} expired — ${m.code} cannot be dispatched until re-issued.`, action: { label: 'Open', kind: 'mission', id: m.id } });
  }
  for (const z of S.zones.filter((z) => z.activeFrom !== undefined)) {
    const affected = S.missions.filter((m) => m.status !== 'completed' && zonesForMission(m, S.zones).some((x) => x.id === z.id));
    if (z.activeFrom! > S.now && z.activeFrom! - S.now < 30 * HOUR)
      out.push({ id: `zn-${z.id}`, category: 'Airspace', severity: affected.length ? 'warn' : 'info', text: `${z.ref} ${z.name} activates in ${fmtDur(z.activeFrom! - S.now)} for ${fmtDur(z.activeTo! - z.activeFrom!)}${affected.length ? ` — affects ${affected.map((m) => m.code).join(', ')}` : ''}.` });
    else if (z.activeFrom! <= S.now && z.activeTo! > S.now)
      out.push({ id: `zx-${z.id}`, category: 'Airspace', severity: affected.length ? 'warn' : 'info', text: `${z.ref} ${z.name} active — lifts in ${fmtDur(z.activeTo! - S.now)}${affected.length ? `; ${affected.map((m) => m.code).join(', ')} held` : ''}.` });
  }

  // 4. Weather windows closing for active / imminent missions
  const live = S.missions.filter((m) => m.status === 'active' || (m.status === 'scheduled' && m.scheduledStart - S.now < 8 * HOUR) || m.status === 'hold-weather');
  for (const m of live) {
    const u = S.units.find((x) => m.assignedUnitIds.includes(x.id));
    if (!u) continue;
    const af = AIRFRAME[u.modelId];
    const p = S.master.airframes[u.modelId];
    const slots = missionSlots(m, S, 30);
    const verdicts = slots.map((s) => judgeSlot(s, m, af, p));
    if (m.status === 'hold-weather') {
      const nextOk = verdicts.findIndex((v) => v.ok);
      out.push({ id: `wh-${m.id}`, category: 'Weather', severity: 'warn', text: `${m.code} on weather hold — next window ${nextOk >= 0 ? `opens in ${fmtDur(slots[nextOk].t - S.now)}` : 'not within 30 h'} (${verdicts[0].reasons.slice(0, 2).join(', ')}).`, action: { label: 'Open', kind: 'mission', id: m.id } });
      continue;
    }
    const firstBad = verdicts.findIndex((v) => !v.weatherOk);
    if (firstBad > 0 && firstBad <= 4 && slots[firstBad].t < m.scheduledEnd) {
      out.push({ id: `wc-${m.id}`, category: 'Weather', severity: 'warn', text: `Weather window for ${m.code} closes in ${fmtDur(slots[firstBad].t - S.now)} (${verdicts[firstBad].reasons[0]}) — ${Math.round((1 - m.progress) * 100)}% workload remaining.`, action: { label: 'Open', kind: 'mission', id: m.id } });
    }
  }

  // 5. Calibration expiries (next 7 days, on assigned or soon-needed payloads)
  const soon = S.payloads.filter((p) => p.calDue - S.now < 7 * 24 * HOUR).sort((a, b) => a.calDue - b.calDue);
  for (const p of soon.slice(0, 4)) {
    const u = S.units.find((x) => x.id === p.unitId);
    const m: Mission | undefined = u ? S.missions.find((x) => x.assignedUnitIds.includes(u.id) && x.status !== 'completed' && x.requiredPayloads.includes(p.type)) : undefined;
    out.push({
      id: `cal-${p.id}`,
      category: 'Calibration',
      severity: p.calDue < S.now ? 'critical' : m && p.calDue < m.scheduledEnd ? 'warn' : 'info',
      text: `${PAYLOAD_META[p.type].short} ${p.serial}${u ? ` on ${u.callsign}` : ''}: ${p.calType.split(' ')[0].toLowerCase()} calibration ${p.calDue < S.now ? `expired ${fmtDur(S.now - p.calDue)} ago` : `due in ${fmtDur(p.calDue - S.now)}`}${m ? ` — needed for ${m.code}` : ''}.`,
      action: { label: 'Fleet', kind: 'view', id: 'fleet' },
    });
  }

  // 6. Fleet health
  const grounded = S.units.filter((u) => u.status === 'grounded');
  const fw = S.units.filter((u) => u.firmware !== u.firmwareLatest);
  if (grounded.length) out.push({ id: 'fl-g', category: 'Fleet', severity: 'warn', text: `${grounded.length} unit(s) grounded: ${grounded.map((u) => `${u.callsign} (${u.faults.find((f) => f.active)?.code ?? 'fault'})`).join(', ')}.`, action: { label: 'Fleet', kind: 'view', id: 'fleet' } });
  if (fw.length) out.push({ id: 'fl-fw', category: 'Fleet', severity: 'info', text: `${fw.length} unit(s) behind latest firmware — batch update during tonight's charge cycle: ${fw.map((u) => u.callsign).join(', ')}.`, action: { label: 'Fleet', kind: 'view', id: 'fleet' } });
  if (S.kpIndex >= 5) out.push({ id: 'kp', category: 'Weather', severity: 'warn', text: `Geomagnetic KP ${S.kpIndex}: expect RTK float on survey sorties — favour PPK workflows and add GCPs.` });

  out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  cache = { key, items: out };
  return out;
}
