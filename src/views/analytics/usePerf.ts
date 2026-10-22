// Memoised performance dataset for the current filter set (recomputes only on filter / day change).
import { useMemo } from 'react';
import { useOps } from '../../store';
import { MISSION_PROFILES, MISSION_TYPES } from '../../data/catalog';
import { DAY, startOfDay } from '../../lib/time';
import type { DailyRecord, MissionType } from '../../types';
import {
  adoption,
  aggregate,
  bucketDays,
  bucketize,
  clientRows,
  ECON,
  rangeRecords,
  econValue,
  meanTat,
  overrideReasons,
  slaPct,
  utilisation,
  windowRecords,
  windowStart,
  type Agg,
  type Bucket,
  type ClientRow,
  type EconDef,
  type Filters,
  type UtilRow,
} from './metrics';

export interface EconStat {
  def: EconDef;
  cur: number;
  prev: number;
  spark: number[];
  applicable: boolean;
}

export interface PerfData {
  today: number;
  start: number;
  recs: DailyRecord[];
  prevRecs: DailyRecord[];
  cur: Agg;
  prev: Agg;
  buckets: Bucket[];
  bucketSize: number;
  aiBuckets: Bucket[];
  aiBucketSize: number;
  tatByType: { type: MissionType; values: { x: number; y: number }[]; mean: number }[];
  econ: EconStat[];
  util: UtilRow[];
  clients: ClientRow[];
  overrides: { reason: string; count: number }[];
  overrideLog: { ts: number; text: string; reason?: string; note?: string }[];
  spark: { sorties: number[]; hrs: number[]; deliv: number[]; sla: number[]; tat: number[]; ai: number[] };
}

export function usePerf(f: Filters): PerfData {
  const history = useOps((s) => s.history);
  const today = useOps((s) => startOfDay(s.now));
  const units = useOps((s) => s.units);
  const crews = useOps((s) => s.crews);
  const bases = useOps((s) => s.bases);
  const audit = useOps((s) => s.audit);
  const unitSig = units.length;
  const crewSig = crews.length;

  const core = useMemo(() => {
    const recs = windowRecords(history, f, today, 0);
    const prevRecs = windowRecords(history, f, today, 1);
    const start = windowStart(f, today);
    const bucketSize = bucketDays(f.period);
    const buckets = bucketize(recs, start, today, bucketSize);
    const aiBucketSize = f.period <= 7 ? 1 : 7;
    const aiStart = today - Math.ceil(f.period / aiBucketSize) * aiBucketSize * DAY;
    const aiBuckets = bucketize(rangeRecords(history, f, aiStart, today), aiStart, today, aiBucketSize);
    const cur = aggregate(recs);
    const prev = aggregate(prevRecs);
    const splitSize = Math.max(bucketSize, f.period <= 7 ? 1 : 7);
    const splitBuckets = bucketize(recs, start, today, splitSize);
    const types = MISSION_TYPES.filter((t) => recs.some((r) => r.type === t));
    const tatByType = types.map((type) => ({
      type,
      values: splitBuckets
        .map((b) => ({ x: b.t, y: meanTat(aggregate(b.recs.filter((r) => r.type === type))) }))
        .filter((p) => isFinite(p.y)),
      mean: meanTat(aggregate(recs.filter((r) => r.type === type))),
    }));
    const econBucketSize = f.period <= 7 ? 1 : 7;
    const econStart = today - Math.ceil(f.period / econBucketSize) * econBucketSize * DAY;
    const econBuckets = bucketize(rangeRecords(history, f, econStart, today), econStart, today, econBucketSize);
    const econ: EconStat[] = ECON.map((def) => ({
      def,
      cur: econValue(def, recs),
      prev: econValue(def, prevRecs),
      spark: econBuckets.map((b) => econValue(def, b.recs)).filter((v) => isFinite(v)),
      applicable: f.type === 'all' || def.types.includes(f.type),
    }));
    const per = (fn: (a: Agg) => number) => buckets.map((b) => fn(aggregate(b.recs))).filter((v) => isFinite(v));
    const spark = {
      sorties: per((a) => a.sorties),
      hrs: per((a) => a.flightHrs),
      deliv: per((a) => a.deliverables),
      sla: per(slaPct),
      tat: per(meanTat),
      ai: aiBuckets.map((b) => {
        const a = aggregate(b.recs);
        return adoption(a.aiAccepted, a.aiOverridden);
      }).filter((v) => isFinite(v)),
    };
    return { recs, prevRecs, start, bucketSize, buckets, aiBucketSize, aiBuckets, cur, prev, tatByType, econ, clients: clientRows(recs), spark };
  }, [history, today, f]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const util = useMemo(() => utilisation(core.recs, f, units, crews, bases), [core.recs, f, unitSig, crewSig, bases]);
  const overrides = useMemo(() => overrideReasons(audit), [audit]);
  const overrideLog = useMemo(() => audit.filter((a) => a.kind === 'override').slice(0, 6).map((a) => ({ ts: a.ts, text: a.text, reason: a.reason, note: a.note })), [audit]);

  return { today, ...core, util, overrides, overrideLog };
}

export const typeLabel = (t: MissionType) => MISSION_PROFILES[t].short;
