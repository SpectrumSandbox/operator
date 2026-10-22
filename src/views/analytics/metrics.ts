// Operations analytics — filtering, bucketing and aggregation of DailyRecord history.
import type { AuditEntry, Base, Crew, DailyRecord, MissionType, RegionId, Unit } from '../../types';
import { AIRFRAME, MISSION_PROFILES, MISSION_TYPES, OVERRIDE_REASONS, REGIONS } from '../../data/catalog';
import { CLIENTS } from '../../data/seed';
import { DAY } from '../../lib/time';

export type Period = 7 | 30 | 90 | 120;
export const PERIODS: Period[] = [7, 30, 90, 120];

export interface Filters {
  period: Period;
  region: RegionId | 'all';
  type: MissionType | 'all';
  client: string; // 'all' or client id
}

export const DEFAULT_FILTERS: Filters = { period: 30, region: 'all', type: 'all', client: 'all' };

/** Flyable window per airframe-day used as the utilisation denominator (h). */
export const AIRFRAME_DAY_H = 8;
/** Rostered crew hours per crew-day (one 8 h shift). */
export const CREW_DAY_H = 8;
export const SLA_TARGET = 95;

/**
 * Contracted flight-to-publish delivery window per mission profile (h). An SLA
 * commitment counts as met only when the mission flew on time AND the deliverable
 * was published inside this window; a late deliverable breaches one commitment.
 */
export const DELIVERY_WINDOW_H: Record<MissionType, number> = { survey: 40, corridor: 26, isr: 12, sar: 10, cargo: 2.2, agri: 22 };

export function slaMetEffective(r: DailyRecord): number {
  return r.turnaroundHrs > DELIVERY_WINDOW_H[r.type] ? Math.max(0, r.slaMet - 1) : r.slaMet;
}

export interface Agg {
  n: number;
  sorties: number;
  flightHrs: number;
  workload: number;
  costIdr: number;
  deliverables: number;
  slaMet: number;
  slaTotal: number;
  aiAccepted: number;
  aiOverridden: number;
  /** Σ turnaround × deliverables (for weighted mean). */
  tatW: number;
  signoffW: number;
  crewHrs: number;
  lastDay: number;
}

export function emptyAgg(): Agg {
  return { n: 0, sorties: 0, flightHrs: 0, workload: 0, costIdr: 0, deliverables: 0, slaMet: 0, slaTotal: 0, aiAccepted: 0, aiOverridden: 0, tatW: 0, signoffW: 0, crewHrs: 0, lastDay: 0 };
}

export function aggregate(rs: DailyRecord[]): Agg {
  const a = emptyAgg();
  for (const r of rs) {
    a.n++;
    a.sorties += r.sorties;
    a.flightHrs += r.flightHrs;
    a.workload += r.workload;
    a.costIdr += r.costIdr;
    a.deliverables += r.deliverables;
    a.slaMet += slaMetEffective(r);
    a.slaTotal += r.slaTotal;
    a.aiAccepted += r.aiAccepted;
    a.aiOverridden += r.aiOverridden;
    a.tatW += r.turnaroundHrs * r.deliverables;
    a.signoffW += r.signoffHrs * r.deliverables;
    a.crewHrs += r.crewHrs;
    if (r.day > a.lastDay) a.lastDay = r.day;
  }
  return a;
}

export const slaPct = (a: Agg) => (a.slaTotal ? (a.slaMet / a.slaTotal) * 100 : NaN);
export const meanTat = (a: Agg) => (a.deliverables ? a.tatW / a.deliverables : NaN);
export const meanSignoff = (a: Agg) => (a.deliverables ? a.signoffW / a.deliverables : NaN);
export const adoption = (acc: number, ovr: number) => (acc + ovr ? (acc / (acc + ovr)) * 100 : NaN);

export function matches(r: DailyRecord, f: Filters): boolean {
  return (f.region === 'all' || r.regionId === f.region) && (f.type === 'all' || r.type === f.type) && (f.client === 'all' || r.clientId === f.client);
}

/** Records in the window [today − (k+1)·period, today − k·period). */
export function windowRecords(history: DailyRecord[], f: Filters, today: number, k = 0): DailyRecord[] {
  const end = today - k * f.period * DAY;
  const start = end - f.period * DAY;
  return history.filter((r) => r.day >= start && r.day < end && matches(r, f));
}

/** Records in an arbitrary [start, end) range matching the filters. */
export function rangeRecords(history: DailyRecord[], f: Filters, start: number, end: number): DailyRecord[] {
  return history.filter((r) => r.day >= start && r.day < end && matches(r, f));
}

export function windowStart(f: Filters, today: number): number {
  return today - f.period * DAY;
}

export function bucketDays(p: Period): number {
  return p <= 30 ? 1 : 7;
}

export interface Bucket {
  t: number;
  recs: DailyRecord[];
}

/** Split records into daily (≤30 d) or weekly buckets, aligned to the window start. */
export function bucketize(rs: DailyRecord[], start: number, end: number, sizeDays: number): Bucket[] {
  const out: Bucket[] = [];
  for (let t = start; t < end; t += sizeDays * DAY) out.push({ t, recs: [] });
  for (const r of rs) {
    const i = Math.floor((r.day - start) / (sizeDays * DAY));
    if (i >= 0 && i < out.length) out[i].recs.push(r);
  }
  return out;
}

// ── Unit economics ─────────────────────────────────────────────────────────
export interface EconDef {
  id: 'ha' | 'km' | 'kg' | 'fh';
  label: string;
  unit: string;
  types: MissionType[];
  basis: string;
  denom: (a: Agg) => number;
}

export const ECON: EconDef[] = [
  { id: 'ha', label: 'Cost per hectare surveyed', unit: '/ ha', types: ['survey', 'agri'], basis: 'Survey + Agri · cost ÷ area (ha)', denom: (a) => a.workload },
  { id: 'km', label: 'Cost per linear km inspected', unit: '/ km', types: ['corridor'], basis: 'Corridor · cost ÷ linear km', denom: (a) => a.workload },
  { id: 'kg', label: 'Cost per kg delivered', unit: '/ kg', types: ['cargo'], basis: 'Cargo · cost ÷ payload mass (kg)', denom: (a) => a.workload },
  { id: 'fh', label: 'Cost per flight hour', unit: '/ FH', types: MISSION_TYPES, basis: 'All mission types · cost ÷ flight hours', denom: (a) => a.flightHrs },
];

export function econValue(def: EconDef, rs: DailyRecord[]): number {
  const a = aggregate(rs.filter((r) => def.types.includes(r.type)));
  const d = def.denom(a);
  return d > 0 ? a.costIdr / d : NaN;
}

// ── Utilisation ────────────────────────────────────────────────────────────
export interface UtilRow {
  id: RegionId;
  label: string;
  short: string;
  airframes: number;
  crews: number;
  flightHrs: number;
  crewHrs: number;
  fleetPct: number;
  crewPct: number;
}

export function utilisation(rs: DailyRecord[], f: Filters, units: Unit[], crews: Crew[], bases: Base[]): UtilRow[] {
  const baseRegion = new Map(bases.map((b) => [b.id, b.regionId]));
  const regions = f.region === 'all' ? REGIONS : REGIONS.filter((r) => r.id === f.region);
  return regions.map((reg) => {
    const af = units.filter((u) => baseRegion.get(u.baseId) === reg.id && (f.type === 'all' || AIRFRAME[u.modelId].roles.includes(f.type))).length;
    const cr = crews.filter((c) => baseRegion.get(c.baseId) === reg.id).length;
    const recs = rs.filter((r) => r.regionId === reg.id);
    const fh = recs.reduce((s, r) => s + r.flightHrs, 0);
    const ch = recs.reduce((s, r) => s + r.crewHrs, 0);
    return {
      id: reg.id,
      label: reg.name,
      short: reg.short,
      airframes: af,
      crews: cr,
      flightHrs: fh,
      crewHrs: ch,
      fleetPct: af ? (fh / (af * f.period * AIRFRAME_DAY_H)) * 100 : 0,
      crewPct: cr ? (ch / (cr * f.period * CREW_DAY_H)) * 100 : 0,
    };
  });
}

// ── Clients ────────────────────────────────────────────────────────────────
export interface ClientRow {
  id: string;
  name: string;
  sector: string;
  target: number;
  agg: Agg;
  sla: number;
  signoff: number;
  types: MissionType[];
}

export function clientRows(rs: DailyRecord[]): ClientRow[] {
  const by = new Map<string, DailyRecord[]>();
  for (const r of rs) (by.get(r.clientId) ?? by.set(r.clientId, []).get(r.clientId)!).push(r);
  return CLIENTS.filter((c) => by.has(c.id))
    .map((c) => {
      const recs = by.get(c.id)!;
      const agg = aggregate(recs);
      return { id: c.id, name: c.name, sector: c.sector, target: c.slaTargetPct, agg, sla: slaPct(agg), signoff: meanSignoff(agg), types: [...new Set(recs.map((r) => r.type))] };
    })
    .sort((a, b) => b.agg.sorties - a.agg.sorties);
}

// ── Override reasons (audit trail) ─────────────────────────────────────────
export function overrideReasons(audit: AuditEntry[]): { reason: string; count: number }[] {
  const ov = audit.filter((a) => a.kind === 'override');
  return OVERRIDE_REASONS.map((reason) => ({ reason, count: ov.filter((a) => (a.reason ?? 'Other') === reason).length }));
}

export function filterLabel(f: Filters): string {
  const parts = [`${f.period} days`];
  parts.push(f.region === 'all' ? 'All regions' : REGIONS.find((r) => r.id === f.region)!.name);
  parts.push(f.type === 'all' ? 'All mission types' : MISSION_PROFILES[f.type].short);
  parts.push(f.client === 'all' ? 'All clients' : (CLIENTS.find((c) => c.id === f.client)?.name ?? f.client));
  return parts.join(' · ');
}

export function pctDelta(cur: number, prev: number): number {
  if (!isFinite(cur) || !isFinite(prev) || prev === 0) return NaN;
  return ((cur - prev) / prev) * 100;
}
