import type { LatLng, Mission } from '../types';
import { circlePoints, lawnmower, lineLengthKm } from '../lib/geo';

const cache = new Map<string, { path: LatLng[]; lengthKm: number; loop: boolean }>();

/** The flight pattern a unit flies for a mission (starts & ends at launch point). */
export function missionPath(m: Mission): { path: LatLng[]; lengthKm: number; loop: boolean } {
  const key = m.id + ':' + JSON.stringify(m.geometry).length;
  const hit = cache.get(key);
  if (hit) return hit;
  const L = m.launchPoint;
  let path: LatLng[];
  let loop = false;
  const g = m.geometry;
  switch (g.kind) {
    case 'aoi': {
      const spacing = m.type === 'agri' ? 0.12 : m.type === 'sar' ? 0.6 : m.subtype === 'Bathymetric' ? 0.08 : 0.35;
      path = [L, ...lawnmower(g.polygon, spacing), L];
      break;
    }
    case 'corridor':
      path = [L, ...g.line, ...[...g.line].reverse(), L];
      break;
    case 'route':
      path = [...g.line, ...[...g.line].reverse()];
      break;
    case 'loiter':
      path = [...circlePoints(g.center, g.radiusKm, 36)];
      path.push(path[0]);
      loop = true;
      break;
  }
  const out = { path, lengthKm: lineLengthKm(path), loop };
  cache.set(key, out);
  return out;
}
