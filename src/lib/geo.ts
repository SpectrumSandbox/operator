import type { LatLng, MissionGeometry } from '../types';

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Destination point given start, bearing (deg) and distance (km). */
export function destination(a: LatLng, brg: number, km: number): LatLng {
  const d = km / R;
  const b = rad(brg);
  const lat1 = rad(a[0]);
  const lng1 = rad(a[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lat2), deg(lng2)];
}

export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function lineLengthKm(line: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += distKm(line[i - 1], line[i]);
  return s;
}

/** Point at distance `km` along polyline (clamped), plus heading at that point. */
export function alongLine(line: LatLng[], km: number): { pos: LatLng; heading: number; done: boolean } {
  if (line.length === 0) return { pos: [0, 0], heading: 0, done: true };
  if (line.length === 1) return { pos: line[0], heading: 0, done: true };
  let rem = Math.max(0, km);
  for (let i = 1; i < line.length; i++) {
    const seg = distKm(line[i - 1], line[i]);
    if (rem <= seg || i === line.length - 1) {
      const t = seg === 0 ? 1 : Math.min(1, rem / seg);
      return { pos: lerp(line[i - 1], line[i], t), heading: bearingDeg(line[i - 1], line[i]), done: i === line.length - 1 && rem >= seg };
    }
    rem -= seg;
  }
  const n = line.length;
  return { pos: line[n - 1], heading: bearingDeg(line[n - 2], line[n - 1]), done: true };
}

/** Polygon area in hectares (equirectangular approximation, fine at AOI scale). */
export function polygonAreaHa(poly: LatLng[]): number {
  if (poly.length < 3) return 0;
  const lat0 = rad(poly.reduce((s, p) => s + p[0], 0) / poly.length);
  const xy = poly.map(([la, ln]) => [rad(ln) * R * Math.cos(lat0), rad(la) * R]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    a += x1 * y2 - x2 * y1;
  }
  return (Math.abs(a) / 2) * 100; // km² → ha
}

export function centroid(pts: LatLng[]): LatLng {
  const n = pts.length || 1;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Representative points of a mission geometry (for proximity / zone checks). */
export function geometryPoints(g: MissionGeometry): LatLng[] {
  switch (g.kind) {
    case 'aoi':
      return [...g.polygon, centroid(g.polygon)];
    case 'corridor':
    case 'route': {
      const out: LatLng[] = [];
      const len = lineLengthKm(g.line);
      const n = Math.max(2, Math.min(40, Math.ceil(len / 3)));
      for (let i = 0; i <= n; i++) out.push(alongLine(g.line, (len * i) / n).pos);
      return out;
    }
    case 'loiter': {
      const out: LatLng[] = [g.center];
      for (let b = 0; b < 360; b += 30) out.push(destination(g.center, b, g.radiusKm));
      return out;
    }
  }
}

export function geometryCenter(g: MissionGeometry): LatLng {
  switch (g.kind) {
    case 'aoi':
      return centroid(g.polygon);
    case 'corridor':
    case 'route':
      return alongLine(g.line, lineLengthKm(g.line) / 2).pos;
    case 'loiter':
      return g.center;
  }
}

export function circlePoints(center: LatLng, radiusKm: number, n = 48): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) out.push(destination(center, (360 * i) / n, radiusKm));
  return out;
}

/** Lawnmower survey pattern over a polygon's bounding box, clipped by inclusion test. */
export function lawnmower(poly: LatLng[], spacingKm: number): LatLng[] {
  const lats = poly.map((p) => p[0]);
  const lngs = poly.map((p) => p[1]);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const dLat = spacingKm / 111;
  const path: LatLng[] = [];
  let flip = false;
  for (let lat = minLat + dLat / 2; lat < maxLat; lat += dLat) {
    // find inside span along this latitude
    const samples: number[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const lng = minLng + ((maxLng - minLng) * i) / steps;
      if (pointInPolygon([lat, lng], poly)) samples.push(lng);
    }
    if (samples.length < 2) continue;
    const a: LatLng = [lat, Math.min(...samples)];
    const b: LatLng = [lat, Math.max(...samples)];
    path.push(...(flip ? [b, a] : [a, b]));
    flip = !flip;
  }
  return path.length ? path : [centroid(poly)];
}

export function fmtLatLng(p: LatLng): string {
  const la = `${Math.abs(p[0]).toFixed(4)}°${p[0] < 0 ? 'S' : 'N'}`;
  const ln = `${Math.abs(p[1]).toFixed(4)}°${p[1] < 0 ? 'W' : 'E'}`;
  return `${la} ${ln}`;
}
