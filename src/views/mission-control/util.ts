// Mission Control — shared helpers, colours and queue state types.
import type { LatLng, Mission, MissionType, Payload, Priority, RegionId, TransportMode, Unit, UnitStatus } from '../../types';
import { CAL_DUE_SOON_DAYS, PRIORITY, TONE_COLOR, UNIT_STATUS, type Tone } from '../../data/catalog';
import { distKm, lerp } from '../../lib/geo';
import { DAY, fmtDur } from '../../lib/time';
import { candidatesFor, type EtaResult } from '../../engine/eta';
import type { EngineState } from '../../engine/ctx';

export type QueueTab = 'all' | 'missions' | 'requests' | 'flags' | 'fleet';
export type StatusFilter = 'all' | 'active' | 'hold' | 'late';

export interface QueueState {
  tab: QueueTab;
  type: MissionType | 'all';
  priority: Priority | 'all';
  region: RegionId | 'all';
  status: StatusFilter;
}

export const QUEUE_DEFAULT: QueueState = { tab: 'all', type: 'all', priority: 'all', region: 'all', status: 'all' };

/** Distinct colours per unit status (stacked readiness bar). */
export const UNIT_STATUS_COLOR: Record<UnitStatus, string> = {
  available: '#3ccf6e',
  assigned: '#5ebfc0',
  'in-transit': '#8384e2',
  'in-flight': '#26d8d9',
  charging: '#8b93a3',
  maintenance: '#e8a33a',
  grounded: '#ff4d55',
};

export const TRANSPORT_COLOR: Record<TransportMode, string> = {
  road: '#c7c45d',
  ferry: '#5ebfc0',
  air: '#c05ebf',
  'self-ferry': '#26d8d9',
};

export const TRANSPORT_SHORT: Record<TransportMode, string> = {
  road: 'road',
  ferry: 'ferry',
  air: 'air freight',
  'self-ferry': 'self-ferry',
};

export function unitTone(u: Unit): Tone {
  if (u.contingency) return 'alert';
  return UNIT_STATUS[u.status].tone;
}

export function unitColor(u: Unit): string {
  return TONE_COLOR[unitTone(u)];
}

export const SERVICEABLE = (u: Unit) => u.status !== 'grounded' && u.status !== 'maintenance';

export function isAirborne(u: Unit): boolean {
  return u.status === 'in-flight' || u.status === 'in-transit' || !!u.contingency;
}

/** SLA countdown text: "T−3h 20m" or "+1h 05m late". */
export function slaText(due: number, now: number): { text: string; late: boolean; soon: boolean } {
  const d = due - now;
  if (d < 0) return { text: `+${fmtDur(-d)}`, late: true, soon: false };
  return { text: `T−${fmtDur(d)}`, late: false, soon: d < 4 * 3_600_000 };
}

export function calState(p: Payload, now: number): 'expired' | 'due-soon' | 'ok' {
  if (p.calDue < now) return 'expired';
  if (p.calDue - now < CAL_DUE_SOON_DAYS * DAY) return 'due-soon';
  return 'ok';
}

export function missionRank(a: Mission, b: Mission): number {
  return PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.slaDue - b.slaDue;
}

/** Portion of a flight pattern from its start up to `km`. */
export function slicePath(path: LatLng[], km: number): LatLng[] {
  if (path.length < 2) return path;
  const out: LatLng[] = [path[0]];
  let rem = Math.max(0, km);
  for (let i = 1; i < path.length; i++) {
    const seg = distKm(path[i - 1], path[i]);
    if (rem <= seg) {
      out.push(seg === 0 ? path[i] : lerp(path[i - 1], path[i], rem / seg));
      return out;
    }
    out.push(path[i]);
    rem -= seg;
  }
  return out;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export const SEV_TONE: Record<'info' | 'warn' | 'critical', Tone> = { info: 'live', warn: 'warn', critical: 'alert' };

/** Top-5 feasible candidates (soonest valid completion) for a mission. */
export function topCandidates(m: Mission | undefined, S: EngineState): EtaResult[] {
  if (!m || m.status === 'completed') return [];
  return candidatesFor(m, S)
    .filter((c) => c.feasible)
    .slice(0, 5);
}
