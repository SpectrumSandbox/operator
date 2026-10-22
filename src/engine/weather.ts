// Deterministic weather model: diurnal tropical convection + drifting storm cells.
// Real deployments would replace `sampleWeather` with BMKG / NWP feeds; the
// interface (WeatherSample) stays the same.
import type { LatLng, RainTolerance, WeatherCell, WeatherSample } from '../types';
import { destination, distKm } from '../lib/geo';
import { HOUR } from '../lib/time';
import { clamp, noise } from '../lib/format';

export interface WxContext {
  now: number;
  cells: WeatherCell[];
  /** 0 = calm, 1 = forecast, 2 = severe (slider) */
  severity: number;
}

/** Local solar hour from UTC timestamp and longitude. */
export function solarHour(ts: number, lng: number): number {
  const h = (ts / HOUR + lng / 15) % 24;
  return (h + 24) % 24;
}

/** Cell position & strength projected to time ts (drift + decay). */
export function projectCell(c: WeatherCell, ts: number, now: number): { center: LatLng; intensity: number; radiusKm: number } {
  const dtH = (ts - now) / HOUR;
  const center = dtH === 0 ? c.center : destination(c.center, c.driftDeg, c.driftKmh * dtH);
  const life = c.kind === 'thunderstorm' ? 9 : c.kind === 'squall' ? 6 : 14;
  const intensity = dtH <= 0 ? c.intensity : c.intensity * clamp(1 - dtH / life, 0, 1);
  return { center, intensity, radiusKm: c.radiusKm * (1 + Math.max(0, dtH) * 0.04) };
}

export function sampleWeather(pos: LatLng, ts: number, ctx: WxContext): WeatherSample {
  const sev = ctx.severity;
  const sh = solarHour(ts, pos[1]);
  const hourIdx = Math.floor(ts / HOUR);
  const n1 = noise(Math.round(pos[0] * 4), Math.round(pos[1] * 4), hourIdx);
  const n2 = noise(Math.round(pos[0] * 3) + 11, Math.round(pos[1] * 3), hourIdx, 7);
  const n3 = noise(Math.round(pos[0] * 2), Math.round(pos[1] * 2) + 5, Math.floor(hourIdx / 3));

  // Regional wind climatology (east monsoon — Bali/Nusa & Sulawesi windier).
  let baseWind = 3.5 + n1 * 6.5;
  if (pos[1] > 114 && pos[0] < -7.8) baseWind += 5;
  if (pos[1] > 119 && pos[1] < 125) baseWind += 2;
  // Afternoon sea-breeze / mixing peak around 14:00 local.
  const diurnal = Math.max(0, Math.sin(((sh - 9) / 10) * Math.PI)) * 5.5;
  let wind = (baseWind + diurnal) * (0.65 + 0.35 * sev);

  // Diurnal convection: rain probability peaks 14–19 local.
  const convWindow = sh >= 13 && sh <= 20 ? Math.sin(((sh - 13) / 7) * Math.PI) : 0;
  const convProne = pos[1] > 106.5 && pos[1] < 108 && pos[0] < -6.6 ? 0.35 : pos[1] > 135 ? 0.4 : 0.18; // Bandung highlands, Papua
  let rain = n2 < convWindow * (convProne + 0.15 * sev) ? (2 + n3 * 10) * (0.5 + 0.5 * sev) : 0;
  let thunder = false;

  for (const c of ctx.cells) {
    const p = projectCell(c, ts, ctx.now);
    if (p.intensity <= 0.02) continue;
    const d = distKm(pos, p.center);
    if (d > p.radiusKm) continue;
    const k = Math.sqrt(1 - d / p.radiusKm) * p.intensity * (0.6 + 0.4 * sev);
    rain = Math.max(rain, (c.kind === 'rain' ? 9 : 22) * k);
    wind += (c.kind === 'squall' ? 18 : c.kind === 'thunderstorm' ? 12 : 4) * k;
    if (c.kind !== 'rain' && k > 0.35) thunder = true;
  }

  const gust = wind * (1.22 + n3 * 0.2) + (thunder ? 10 : 0);
  const vis = clamp(12 - rain * 0.6 - (sh < 7 ? 3 * n1 : 0), 0.8, 12);
  const ceiling = clamp(3800 - rain * 160 - (thunder ? 800 : 0) - n2 * 600, 600, 6000);
  const light = clamp(Math.sin(((sh - 6) / 12) * Math.PI), 0, 1) * (rain > 4 ? 0.55 : 1);
  return {
    windKts: +wind.toFixed(1),
    gustKts: +gust.toFixed(1),
    windDirDeg: Math.round((90 + n1 * 140 + hourIdx * 3) % 360),
    rainMmH: +rain.toFixed(1),
    visKm: +vis.toFixed(1),
    ceilingFt: Math.round(ceiling / 50) * 50,
    tempC: +(23 + light * 8 - rain * 0.3 - (pos[1] > 107 && pos[1] < 108 && pos[0] < -6.7 ? 5 : 0)).toFixed(1),
    daylight: sh >= 6 && sh < 18,
    light: +light.toFixed(2),
  };
}

export const RAIN_LIMIT: Record<RainTolerance, number> = { none: 0.3, light: 2.5, moderate: 7.5 };

export function isThunder(s: WeatherSample): boolean {
  return s.gustKts - s.windKts * 1.3 > 8 && s.rainMmH > 6;
}

/** Wind barb-ish arrow glyph rotation helper: where the wind blows TO. */
export function windToDeg(fromDeg: number): number {
  return (fromDeg + 180) % 360;
}

export function kpLabel(kp: number): { label: string; tone: 'ok' | 'warn' | 'alert' } {
  if (kp >= 6) return { label: 'G2 storm · RTK unreliable', tone: 'alert' };
  if (kp >= 5) return { label: 'G1 storm · GNSS degraded', tone: 'warn' };
  if (kp >= 4) return { label: 'Active · monitor RTK', tone: 'warn' };
  return { label: 'Quiet · GNSS nominal', tone: 'ok' };
}
