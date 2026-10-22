// Fleet view helpers — energy labelling, calibration status, service maths, telemetry ring buffer.
import { useRef } from 'react';
import type { CalStatus, Payload, Unit } from '../../types';
import { AIRFRAME, CAL_DUE_SOON_DAYS, type Tone } from '../../data/catalog';
import { DAY } from '../../lib/time';
import { Icon, cx } from '../../ui/kit';

/** Battery for electric airframes, fuel for ICE / hybrid. */
export function energyKind(u: Unit): 'battery' | 'fuel' {
  return AIRFRAME[u.modelId]?.propulsion === 'electric' ? 'battery' : 'fuel';
}
export const energyTone = (pct: number): Tone => (pct >= 50 ? 'ok' : pct >= 25 ? 'warn' : 'alert');
export const sohTone = (pct: number): Tone => (pct >= 85 ? 'ok' : pct >= 80 ? 'warn' : 'alert');

export function EnergyIcon({ u, size = 11 }: { u: Unit; size?: number }) {
  if (energyKind(u) === 'fuel') return <Icon name="fuel" size={size} />;
  if (u.status === 'charging') return <Icon name="battery-charging" size={size} />;
  return <Icon name={u.energyPct < 25 ? 'battery-low' : u.energyPct < 60 ? 'battery' : 'battery-full'} size={size} />;
}

/** Service interval position for the airframe. */
export function serviceInfo(u: Unit) {
  const interval = AIRFRAME[u.modelId]?.serviceIntervalHrs ?? 100;
  const remaining = u.nextServiceHrs - u.airframeHrs;
  const used = Math.max(0, Math.min(interval, interval - remaining));
  const tone: Tone = remaining <= 0 ? 'alert' : remaining <= 10 ? 'warn' : 'ok';
  return { interval, remaining, used, tone };
}

export function calStatus(p: Payload, now: number): CalStatus {
  const d = (p.calDue - now) / DAY;
  return d < 0 ? 'expired' : d <= CAL_DUE_SOON_DAYS ? 'due-soon' : 'calibrated';
}

/** "in 4d 6h" / "3d overdue" countdown for calibration dues. */
export function calCountdown(p: Payload, now: number): string {
  const d = p.calDue - now;
  const days = Math.abs(d) / DAY;
  const txt = days >= 2 ? `${Math.floor(days)}d` : `${Math.floor(days * 24)}h`;
  return d < 0 ? `${txt} overdue` : `in ${txt}`;
}

export const activeFaults = (u: Unit) => u.faults.filter((f) => f.active);

export function FaultCount({ u }: { u: Unit }) {
  const a = activeFaults(u);
  if (!a.length) return <span className="text-dim num">—</span>;
  const crit = a.some((f) => f.severity === 'critical');
  return (
    <span
      title={a.map((f) => `${f.code} — ${f.text}`).join('\n')}
      className={cx('inline-flex items-center gap-1 h-[18px] px-1.5 border num text-[10.5px] font-semibold', crit ? 'text-alert bg-alert-bg border-alert/40' : 'text-warn bg-warn-bg border-warn/40')}
    >
      <Icon name={crit ? 'octagon-alert' : 'triangle-alert'} size={10} />
      {a.length}
    </span>
  );
}

// ── Live telemetry ring buffer (module-level; survives view switches) ───────
export interface TelSample {
  ts: number;
  alt: number;
  spd: number;
  energy: number;
  link: number;
  sats: number;
}
const RING = 60;

/**
 * Keeps a per-unit ring buffer (last ~60 samples) in a ref and appends one
 * sample per sim tick for every airborne unit. Idempotent for a given `now`.
 */
export function useTelemetryRing(units: Unit[], now: number): Map<string, TelSample[]> {
  const ref = useRef<{ last: number; buf: Map<string, TelSample[]> }>({ last: 0, buf: new Map() });
  const st = ref.current;
  if (st.last !== now) {
    st.last = now;
    for (const u of units) {
      if (u.status !== 'in-flight' && !u.contingency) {
        st.buf.delete(u.id);
        continue;
      }
      const arr = st.buf.get(u.id) ?? [];
      arr.push({ ts: now, alt: u.altM, spd: u.speedKmh, energy: u.energyPct, link: u.linkQuality, sats: u.satellites });
      if (arr.length > RING) arr.splice(0, arr.length - RING);
      st.buf.set(u.id, arr);
    }
  }
  return st.buf;
}

export const linkTone = (q: number): Tone => (q >= 70 ? 'ok' : q >= 50 ? 'warn' : 'alert');
export const gnssTone = (fix: Unit['gnssFix']): Tone => (fix === 'RTK Fixed' ? 'ok' : fix === 'No Fix' ? 'alert' : 'warn');

export function goMission(id: string, select: (id?: string) => void) {
  select(id);
  location.hash = '#/mission-control';
}
