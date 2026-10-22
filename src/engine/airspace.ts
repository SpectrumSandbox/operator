import type { AirspaceZone, LatLng, Mission, Permit } from '../types';
import { distKm, geometryPoints, pointInPolygon } from '../lib/geo';

export function zoneContains(z: AirspaceZone, p: LatLng): boolean {
  if (z.shape.type === 'circle') return distKm(z.shape.center, p) <= z.shape.radiusKm;
  return pointInPolygon(p, z.shape.points);
}

export function zoneActive(z: AirspaceZone, ts: number): boolean {
  if (z.activeFrom === undefined || z.activeTo === undefined) return true;
  return ts >= z.activeFrom && ts <= z.activeTo;
}

export function zoneActiveDuring(z: AirspaceZone, from: number, to: number): boolean {
  if (z.activeFrom === undefined || z.activeTo === undefined) return true;
  return z.activeFrom < to && z.activeTo > from;
}

const zoneCache = new Map<string, string[]>();

/** Zones whose footprint intersects the mission geometry (time-independent). */
export function zonesForMission(m: Mission, zones: AirspaceZone[]): AirspaceZone[] {
  const key = m.id + ':' + zones.length + ':' + JSON.stringify(m.geometry).length;
  let ids = zoneCache.get(key);
  if (!ids) {
    const pts = [...geometryPoints(m.geometry), m.launchPoint];
    ids = zones.filter((z) => pts.some((p) => zoneContains(z, p))).map((z) => z.id);
    zoneCache.set(key, ids);
  }
  const set = new Set(ids);
  return zones.filter((z) => set.has(z.id));
}

/** Zones that restrict operations (anything except population buffers / CTR below 400 ft). */
export function restrictiveZones(m: Mission, zones: AirspaceZone[]): AirspaceZone[] {
  return zonesForMission(m, zones).filter((z) => {
    if (z.kind === 'population') return false;
    if (z.kind === 'ctr') return m.maxAltFt > z.maxUasFt;
    return true;
  });
}

/** Does this mission need a formal clearance (permit) to fly at all? */
export function permitRequired(m: Mission, zones: AirspaceZone[]): boolean {
  if (m.bvlos) return true;
  return restrictiveZones(m, zones).some((z) => !z.activeFrom); // permanent restriction (KKOP, military, CTR >400ft)
}

export interface AirspaceCheck {
  ok: boolean;
  reasons: string[];
}

/** Clearance lead time assumed when a permit must still be (re)submitted. */
export const CLEARANCE_LEAD_MS = 48 * 3_600_000;
/** Expedited emergency clearance (BNPB / Basarnas coordination) for urgent SAR. */
export const EMERGENCY_LEAD_MS = 1 * 3_600_000;

/**
 * Airspace legality of operating mission `m` at time ts (planning view).
 * - approved permit → legal inside its window
 * - pending permit  → legal inside the requested window (planning assumption; dispatch is gated by conflicts)
 * - none / expired / rejected / beyond window → legal only after the (re)submission lead time
 * - active TFR / NOTAM with UAS prohibition → never legal while active
 */
export function airspaceAt(m: Mission, ts: number, zones: AirspaceZone[], permits: Permit[], now: number): AirspaceCheck {
  const reasons: string[] = [];
  const permit = permits.find((p) => p.missionId === m.id);
  const needs = permitRequired(m, zones);
  if (needs) {
    const lead = now + (m.priority === 'urgent' ? EMERGENCY_LEAD_MS : CLEARANCE_LEAD_MS);
    const usable = permit && (permit.status === 'approved' || permit.status === 'pending');
    if (usable && ts >= permit.windowStart && ts <= permit.windowEnd) {
      // inside an approved or requested window
    } else if (ts < lead) {
      reasons.push(!permit ? 'Clearance lead time (no permit filed)' : permit.status === 'expired' || permit.status === 'rejected' ? `${permit.kind} ${permit.status} — re-submission lead` : `Outside ${permit.kind} window`);
    }
  }
  for (const z of zonesForMission(m, zones)) {
    if (z.activeFrom === undefined) continue; // permanent zones handled by permit
    if (zoneActive(z, ts) && z.maxUasFt === 0) reasons.push(`${z.ref ?? z.kind.toUpperCase()} · ${z.name}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function permitFor(m: Mission, permits: Permit[]): Permit | undefined {
  return permits.find((p) => p.missionId === m.id);
}
