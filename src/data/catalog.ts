import type { IconName } from '../ui/icons';
import type {
  AirframeClass,
  AirframeModel,
  CalStatus,
  MissionHealth,
  MissionStatus,
  MissionType,
  PayloadType,
  Priority,
  Region,
  RegionId,
  TransportMode,
  UnitStatus,
  ZoneKind,
} from '../types';

// ── Regions (quick-jumps) ────────────────────────────────────────────────────
export const NATIONAL_VIEW = { center: [-2.4, 118.0] as [number, number], zoom: 5 };

export const REGIONS: Region[] = [
  { id: 'jabodetabek', name: 'Jabodetabek', short: 'JBD', center: [-6.28, 106.95], zoom: 10 },
  { id: 'west-java', name: 'West Java', short: 'JBR', center: [-6.85, 107.55], zoom: 9 },
  { id: 'east-java-bali', name: 'East Java & Bali', short: 'JTM', center: [-7.75, 114.0], zoom: 8 },
  { id: 'kalimantan', name: 'Kalimantan', short: 'KAL', center: [-1.05, 116.8], zoom: 9 },
  { id: 'sulawesi', name: 'Sulawesi', short: 'SUL', center: [-2.85, 122.1], zoom: 9 },
  { id: 'papua', name: 'Papua', short: 'PAP', center: [-4.45, 136.9], zoom: 9 },
  { id: 'sumatra', name: 'Sumatra', short: 'SUM', center: [0.45, 101.6], zoom: 8 },
];
export const REGION: Record<RegionId, Region> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;

// ── Mission profiles ─────────────────────────────────────────────────────────
export interface MissionProfile {
  type: MissionType;
  label: string;
  short: string;
  unit: string;
  workloadLabel: string;
  icon: IconName;
  color: string;
  subtypes: string[];
  description: string;
}

export const MISSION_PROFILES: Record<MissionType, MissionProfile> = {
  survey: {
    type: 'survey',
    label: 'Geospatial Survey & Mapping',
    short: 'Survey',
    unit: 'ha',
    workloadLabel: 'Area coverage',
    icon: 'map',
    color: '#8384E2',
    subtypes: ['LiDAR', 'Photogrammetry', 'Multispectral', 'Bathymetric'],
    description: 'Area coverage (ha / km²)',
  },
  corridor: {
    type: 'corridor',
    label: 'Linear & Corridor Inspection',
    short: 'Corridor',
    unit: 'km',
    workloadLabel: 'Linear distance',
    icon: 'route',
    color: '#C08D5E',
    subtypes: ['Pipeline', 'Power Grid', 'Railway', 'Bridge', 'Solar Farm', 'Wind Farm'],
    description: 'Linear distance (km) or asset count',
  },
  isr: {
    type: 'isr',
    label: 'ISR, Security & Maritime Patrol',
    short: 'ISR',
    unit: 'hrs',
    workloadLabel: 'Loiter duration',
    icon: 'radar',
    color: '#C05EBF',
    subtypes: ['Perimeter Surveillance', 'Coast-Guard Patrol', 'Thermal Tracking'],
    description: 'Loiter duration (hrs) & waypoint loop',
  },
  sar: {
    type: 'sar',
    label: 'Search & Rescue / Emergency Response',
    short: 'SAR',
    unit: 'km²',
    workloadLabel: 'Search grid',
    icon: 'life-buoy',
    color: '#FF6B6B',
    subtypes: ['Disaster Assessment', 'Thermal Search Pattern', 'Flood Mapping'],
    description: 'Search grid coverage & time-on-station',
  },
  cargo: {
    type: 'cargo',
    label: 'Cargo & Medical Logistics',
    short: 'Cargo',
    unit: 'kg',
    workloadLabel: 'Payload mass',
    icon: 'package',
    color: '#5EBFC0',
    subtypes: ['Medical Resupply', 'Inter-Island Resupply', 'Point-to-Point'],
    description: 'Payload mass (kg) & route distance',
  },
  agri: {
    type: 'agri',
    label: 'Precision Agriculture & Forestry',
    short: 'Agri',
    unit: 'ha',
    workloadLabel: 'Hectares treated / scanned',
    icon: 'sprout',
    color: '#5EC060',
    subtypes: ['Crop Spraying', 'Nutrient Diagnosis', 'Canopy Analysis'],
    description: 'Hectares treated / scanned',
  },
};
export const MISSION_TYPES: MissionType[] = ['survey', 'corridor', 'isr', 'sar', 'cargo', 'agri'];

// ── Airframe classes & models ────────────────────────────────────────────────
export const AIRFRAME_CLASS_LABEL: Record<AirframeClass, string> = {
  'vtol-fixed-wing': 'Fixed-Wing VTOL',
  'multirotor-quad': 'Multirotor · Quad',
  'multirotor-hexa': 'Multirotor · Hexa',
  'multirotor-octo': 'Multirotor · Octo',
  'heavy-lift-cargo': 'Heavy-Lift Cargo UAV',
  'long-endurance-fw': 'Long-Endurance Fixed-Wing',
  'tactical-isr': 'Tactical / First-Responder ISR',
  usv: 'USV · Unmanned Surface Vessel',
};

export const AIRFRAMES: AirframeModel[] = [
  { id: 'elang-e1', name: 'ELANG E-1 VTOL', maker: 'Spectrum Group', cls: 'vtol-fixed-wing', propulsion: 'electric', mtowKg: 14, maxPayloadKg: 2.5, enduranceMin: 150, cruiseKmh: 72, ceilingFtAgl: 1500, spanM: 3.2, rainTolerance: 'light', roles: ['survey', 'corridor', 'isr', 'sar'], serviceIntervalHrs: 100, heavyLift: false },
  { id: 'wingtra-g2', name: 'WingtraOne Gen II', maker: 'Wingtra', cls: 'vtol-fixed-wing', propulsion: 'electric', mtowKg: 4.5, maxPayloadKg: 0.8, enduranceMin: 59, cruiseKmh: 58, ceilingFtAgl: 1200, spanM: 1.25, rainTolerance: 'none', roles: ['survey', 'agri'], serviceIntervalHrs: 80, heavyLift: false },
  { id: 'm350', name: 'Matrice 350 RTK', maker: 'DJI Enterprise', cls: 'multirotor-quad', propulsion: 'electric', mtowKg: 9.2, maxPayloadKg: 2.7, enduranceMin: 42, cruiseKmh: 54, ceilingFtAgl: 400, spanM: 0.9, rainTolerance: 'moderate', roles: ['corridor', 'isr', 'sar', 'survey'], serviceIntervalHrs: 60, heavyLift: false },
  { id: 'm4td', name: 'Matrice 4TD + Dock 3', maker: 'DJI Enterprise', cls: 'tactical-isr', propulsion: 'electric', mtowKg: 1.85, maxPayloadKg: 0, enduranceMin: 54, cruiseKmh: 50, ceilingFtAgl: 400, spanM: 0.5, rainTolerance: 'moderate', roles: ['isr', 'sar', 'corridor'], serviceIntervalHrs: 50, heavyLift: false },
  { id: 'h6-hybrid', name: 'Carrier H6 Hybrid', maker: 'Harris Aerial', cls: 'multirotor-hexa', propulsion: 'hybrid', mtowKg: 25, maxPayloadKg: 5, enduranceMin: 150, cruiseKmh: 45, ceilingFtAgl: 400, spanM: 1.8, rainTolerance: 'light', roles: ['survey', 'corridor'], serviceIntervalHrs: 50, heavyLift: false },
  { id: 'agras-t50', name: 'Agras T50', maker: 'DJI Agriculture', cls: 'multirotor-octo', propulsion: 'electric', mtowKg: 92, maxPayloadKg: 40, enduranceMin: 12, cruiseKmh: 36, ceilingFtAgl: 100, spanM: 2.8, rainTolerance: 'none', roles: ['agri'], serviceIntervalHrs: 40, heavyLift: true },
  { id: 'flycart30', name: 'FlyCart 30', maker: 'DJI Delivery', cls: 'heavy-lift-cargo', propulsion: 'electric', mtowKg: 95, maxPayloadKg: 30, enduranceMin: 18, cruiseKmh: 72, ceilingFtAgl: 400, spanM: 2.8, rainTolerance: 'moderate', roles: ['cargo'], serviceIntervalHrs: 40, heavyLift: true },
  { id: 'wingcopter-198', name: 'Wingcopter 198', maker: 'Wingcopter', cls: 'vtol-fixed-wing', propulsion: 'electric', mtowKg: 24.5, maxPayloadKg: 5, enduranceMin: 75, cruiseKmh: 100, ceilingFtAgl: 400, spanM: 1.98, rainTolerance: 'light', roles: ['cargo'], serviceIntervalHrs: 80, heavyLift: false },
  { id: 'penguin-c', name: 'Penguin C Mk2.5', maker: 'Edge Autonomy', cls: 'long-endurance-fw', propulsion: 'ice', mtowKg: 25, maxPayloadKg: 4, enduranceMin: 1200, cruiseKmh: 80, ceilingFtAgl: 5000, spanM: 3.3, rainTolerance: 'light', roles: ['isr', 'sar', 'corridor'], serviceIntervalHrs: 150, heavyLift: false },
  { id: 'otter-usv', name: 'Otter USV', maker: 'Maritime Robotics', cls: 'usv', propulsion: 'electric', mtowKg: 55, maxPayloadKg: 20, enduranceMin: 1200, cruiseKmh: 9, ceilingFtAgl: 0, spanM: 2.0, rainTolerance: 'moderate', roles: ['survey', 'isr'], serviceIntervalHrs: 200, heavyLift: false, isVessel: true },
];
export const AIRFRAME: Record<string, AirframeModel> = Object.fromEntries(AIRFRAMES.map((a) => [a.id, a]));

// ── Payload types ────────────────────────────────────────────────────────────
export interface PayloadMeta {
  label: string;
  short: string;
  calType: string;
  intervalDays: number;
  icon: IconName;
}
export const PAYLOAD_META: Record<PayloadType, PayloadMeta> = {
  lidar: { label: 'LiDAR', short: 'LiDAR', calType: 'Boresight alignment & IMU calibration', intervalDays: 90, icon: 'scan-line' },
  multispectral: { label: 'Multispectral / Hyperspectral', short: 'MSI', calType: 'Radiometric calibration', intervalDays: 30, icon: 'aperture' },
  rgb: { label: 'RGB Photogrammetry', short: 'RGB', calType: 'Camera intrinsics / shutter lifecycle', intervalDays: 180, icon: 'camera' },
  eoir: { label: 'EO/IR Thermal Gimbal', short: 'EO/IR', calType: 'NUC / thermal drift calibration', intervalDays: 60, icon: 'thermometer' },
  'cargo-winch': { label: 'Cargo Winch / Drop Mechanism', short: 'Winch', calType: 'Load cell & release actuator test', intervalDays: 30, icon: 'package' },
  comms: { label: 'Comms Link (C2 · Satcom · 4G/5G)', short: 'Comms', calType: 'Link budget & cellular failover test', intervalDays: 45, icon: 'radio-tower' },
};
export const PAYLOAD_TYPES: PayloadType[] = ['lidar', 'multispectral', 'rgb', 'eoir', 'cargo-winch', 'comms'];
export const CAL_DUE_SOON_DAYS = 7;

// ── Status semantics ─────────────────────────────────────────────────────────
export type Tone = 'ok' | 'live' | 'warn' | 'alert' | 'idle';

export const TONE_COLOR: Record<Tone, string> = {
  ok: '#3ccf6e',
  live: '#26d8d9',
  warn: '#e8a33a',
  alert: '#ff4d55',
  idle: '#8b93a3',
};

export const UNIT_STATUS: Record<UnitStatus, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'ok' },
  assigned: { label: 'Assigned', tone: 'live' },
  'in-transit': { label: 'In Transit', tone: 'live' },
  'in-flight': { label: 'In Flight', tone: 'live' },
  charging: { label: 'Charging / Refueling', tone: 'idle' },
  maintenance: { label: 'Maintenance', tone: 'warn' },
  grounded: { label: 'Grounded', tone: 'alert' },
};
export const UNIT_STATUSES: UnitStatus[] = ['available', 'assigned', 'in-transit', 'in-flight', 'charging', 'maintenance', 'grounded'];

export const MISSION_STATUS: Record<MissionStatus, { label: string; tone: Tone }> = {
  request: { label: 'Request', tone: 'idle' },
  planned: { label: 'Planned', tone: 'idle' },
  scheduled: { label: 'Scheduled', tone: 'ok' },
  active: { label: 'Active', tone: 'live' },
  'hold-weather': { label: 'Weather Hold', tone: 'warn' },
  'hold-airspace': { label: 'Airspace Hold', tone: 'alert' },
  delayed: { label: 'Delayed', tone: 'warn' },
  completed: { label: 'Completed', tone: 'ok' },
};

export const MISSION_HEALTH: Record<MissionHealth, { label: string; tone: Tone; color: string }> = {
  nominal: { label: 'Nominal', tone: 'ok', color: '#3ccf6e' },
  'at-risk': { label: 'At-Risk', tone: 'warn', color: '#e8a33a' },
  delayed: { label: 'Delayed', tone: 'alert', color: '#ff4d55' },
  hold: { label: 'Weather / Airspace Hold', tone: 'warn', color: '#d8d926' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  urgent: { label: 'Urgent / SAR', tone: 'alert', rank: 0 },
  high: { label: 'High', tone: 'warn', rank: 1 },
  routine: { label: 'Routine', tone: 'idle', rank: 2 },
};

export const CAL_STATUS: Record<CalStatus, { label: string; tone: Tone }> = {
  calibrated: { label: 'Calibrated', tone: 'ok' },
  'due-soon': { label: 'Due Soon', tone: 'warn' },
  expired: { label: 'Expired', tone: 'alert' },
};

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  road: 'Road Vehicle',
  ferry: 'Maritime Ferry / Speedboat',
  air: 'Air Freight',
  'self-ferry': 'Direct Self-Ferry Flight',
};
export const TRANSPORT_ICON: Record<TransportMode, IconName> = {
  road: 'truck',
  ferry: 'ship',
  air: 'plane',
  'self-ferry': 'navigation',
};

export const ZONE_META: Record<ZoneKind, { label: string; color: string; fill: number; dash?: string }> = {
  ctr: { label: 'Controlled Airspace (CTR)', color: '#8384E2', fill: 0.05, dash: '6 4' },
  kkop: { label: 'KKOP Airport Safety Zone', color: '#e8a33a', fill: 0.1 },
  tfr: { label: 'Temporary Flight Restriction', color: '#ff4d55', fill: 0.16, dash: '3 3' },
  notam: { label: 'NOTAM Area', color: '#d926d8', fill: 0.1, dash: '4 3' },
  military: { label: 'Military Restricted', color: '#ff4d55', fill: 0.12 },
  population: { label: 'Population Density Buffer', color: '#d8d926', fill: 0.06, dash: '2 4' },
};

export const OVERRIDE_REASONS = ['Crew Preference', 'Payload Specificity', 'Client Priority', 'Local Logistics', 'Other'] as const;

export const OPERATOR_NAME = 'Ops Duty Officer · Rizky A.';
export const APPROVERS = ['Dewi Kartika (QA Lead)', 'Hendra Wijaya (Chief Pilot)', 'Sari Nugroho (GIS Manager)', 'Bima Prasetyo (Ops Director)'];
