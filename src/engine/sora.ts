// Pre-flight SORA (JARUS Specific Operations Risk Assessment, v2.0 tables)
// Ground Risk Class (GRC) + Air Risk Class (ARC) → SAIL → dispatch decision.
import type { AirframeModel, AirspaceZone, Mission } from '../types';
import { zonesForMission } from './airspace';

export type Arc = 'a' | 'b' | 'c' | 'd';
export type Sail = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

export interface SoraMitigations {
  /** M1 strategic ground-risk mitigation (buffers / sheltering) */
  m1: 0 | -1 | -2;
  /** M2 effects of impact reduced (parachute / frangibility) */
  m2: 0 | -1;
  /** M3 emergency response plan: +1 none, 0 medium, -1 high */
  m3: 1 | 0 | -1;
  /** Strategic air-risk mitigation (NOTAM, segregation, time-of-day) */
  arcReduction: 0 | 1;
}

export interface SoraResult {
  kineticJ: number;
  dimClass: number;
  scenario: string;
  intrinsicGrc: number;
  finalGrc: number;
  initialArc: Arc;
  residualArc: Arc;
  arcReason: string;
  sail: Sail | 'Certified';
  dispatch: 'approved' | 'authorisation' | 'prohibited';
  dispatchText: string;
  osoRobustness: string;
  zones: AirspaceZone[];
}

// rows: scenario, cols: dimension class 1..4
const GRC_TABLE: Record<string, number[]> = {
  'VLOS · controlled ground area': [1, 2, 3, 4],
  'BVLOS · controlled ground area': [1, 2, 3, 4],
  'VLOS · sparsely populated': [2, 3, 4, 5],
  'BVLOS · sparsely populated': [3, 4, 5, 6],
  'VLOS · populated': [4, 5, 6, 8],
  'BVLOS · populated': [5, 6, 8, 10],
  'VLOS · gathering of people': [7, 7, 7, 7],
  'BVLOS · gathering of people': [8, 8, 8, 8],
};

const SAIL_TABLE: Record<number, Sail[]> = {
  2: ['I', 'II', 'IV', 'VI'],
  3: ['II', 'II', 'IV', 'VI'],
  4: ['III', 'III', 'IV', 'VI'],
  5: ['IV', 'IV', 'IV', 'VI'],
  6: ['V', 'V', 'V', 'VI'],
  7: ['VI', 'VI', 'VI', 'VI'],
};

export function defaultMitigations(m: Mission, af: AirframeModel): SoraMitigations {
  return {
    m1: m.population === 'populated' ? -1 : 0,
    m2: af.mtowKg <= 25 && af.cls !== 'heavy-lift-cargo' && !af.isVessel ? -1 : 0,
    m3: m.priority === 'urgent' ? 0 : -1,
    arcReduction: m.bvlos ? 1 : 0,
  };
}

export function computeSora(m: Mission, af: AirframeModel, zones: AirspaceZone[], mit: SoraMitigations): SoraResult {
  const v = af.cruiseKmh / 3.6;
  const kineticJ = 0.5 * af.mtowKg * v * v;
  const keClass = kineticJ < 700 ? 1 : kineticJ < 34_000 ? 2 : kineticJ < 1_084_000 ? 3 : 4;
  const spanClass = af.spanM <= 1 ? 1 : af.spanM <= 3 ? 2 : af.spanM <= 8 ? 3 : 4;
  const dimClass = af.isVessel ? 1 : Math.max(keClass, spanClass);
  const pop = m.population === 'controlled' ? 'controlled ground area' : m.population === 'sparse' ? 'sparsely populated' : m.population === 'populated' ? 'populated' : 'gathering of people';
  const scenario = `${m.bvlos ? 'BVLOS' : 'VLOS'} · ${pop}`;
  const intrinsicGrc = af.isVessel ? 1 : GRC_TABLE[scenario][dimClass - 1];
  const floor = GRC_TABLE[`${m.bvlos ? 'BVLOS' : 'VLOS'} · controlled ground area`][dimClass - 1];
  const finalGrc = Math.max(floor, intrinsicGrc + mit.m1 + mit.m2 + mit.m3);

  const zs = zonesForMission(m, zones);
  let initialArc: Arc = 'b';
  let arcReason = 'Uncontrolled airspace < 500 ft AGL, rural';
  if (af.isVessel) {
    initialArc = 'a';
    arcReason = 'Surface vessel — atypical / segregated';
  } else if (zs.some((z) => z.kind === 'kkop' || z.kind === 'military')) {
    initialArc = 'd';
    arcReason = 'Airport environment / military (KKOP)';
  } else if (zs.some((z) => z.kind === 'ctr') && m.maxAltFt > 400) {
    initialArc = 'd';
    arcReason = 'Controlled airspace above 400 ft';
  } else if (zs.some((z) => z.kind === 'ctr') || m.maxAltFt > 500) {
    initialArc = 'c';
    arcReason = m.maxAltFt > 500 ? 'Above 500 ft AGL' : 'Controlled airspace (CTR) ≤ 400 ft';
  } else if (zs.some((z) => z.kind === 'population')) {
    initialArc = 'c';
    arcReason = 'Urban airspace < 500 ft';
  }
  const order: Arc[] = ['a', 'b', 'c', 'd'];
  const residualArc = order[Math.max(order.indexOf(initialArc) === 0 ? 0 : 1, order.indexOf(initialArc) - mit.arcReduction)];

  let sail: Sail | 'Certified';
  if (finalGrc > 7) sail = 'Certified';
  else sail = SAIL_TABLE[Math.max(2, finalGrc)][order.indexOf(residualArc)];

  const idx = sail === 'Certified' ? 7 : ['I', 'II', 'III', 'IV', 'V', 'VI'].indexOf(sail) + 1;
  const dispatch = idx <= 2 ? 'approved' : idx <= 4 ? 'authorisation' : 'prohibited';
  const dispatchText =
    dispatch === 'approved'
      ? 'Within operator standard scenario — dispatch permitted'
      : dispatch === 'authorisation'
        ? 'Requires DKPPU operational authorisation (PM 37/2020 · CASR 107)'
        : sail === 'Certified'
          ? 'Certified category — not permitted under Specific category'
          : 'SAIL V–VI — high-robustness OSOs required; dispatch blocked';
  const osoRobustness = idx <= 2 ? 'Low' : idx <= 4 ? 'Medium' : 'High';
  return { kineticJ, dimClass, scenario, intrinsicGrc, finalGrc, initialArc, residualArc, arcReason, sail, dispatch, dispatchText, osoRobustness, zones: zs };
}

export const SORA_CHECKLIST = [
  { id: 'ops-manual', label: 'Operations manual & ConOps current for this mission profile' },
  { id: 'notam', label: 'NOTAMs reviewed (AirNav AIS) & clearance on file' },
  { id: 'wx', label: 'Weather brief within limits (BMKG + onboard)' },
  { id: 'c2', label: 'C2 link budget & lost-link behaviour (RTL altitude) verified' },
  { id: 'geofence', label: 'Geofence uploaded incl. KKOP / military exclusions' },
  { id: 'erp', label: 'Emergency Response Plan briefed; alternate landing zones loaded' },
  { id: 'crew', label: 'Crew rest, currency & ratings verified' },
  { id: 'airframe', label: 'Airframe pre-flight inspection & battery SoH check' },
  { id: 'payload', label: 'Payload calibration valid through mission end' },
  { id: 'observer', label: 'Visual observers / airspace observers positioned (if required)' },
];
