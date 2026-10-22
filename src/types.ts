// ─────────────────────────────────────────────────────────────────────────────
// Spectrum Operator — domain model
// Generalized across airframe classes and mission profiles.
// ─────────────────────────────────────────────────────────────────────────────

export type LatLng = [number, number];

export type RegionId =
  | 'jabodetabek'
  | 'west-java'
  | 'east-java-bali'
  | 'kalimantan'
  | 'sulawesi'
  | 'papua'
  | 'sumatra';

export interface Region {
  id: RegionId;
  name: string;
  short: string;
  center: LatLng;
  zoom: number;
}

// ── Airframes ────────────────────────────────────────────────────────────────
export type AirframeClass =
  | 'vtol-fixed-wing'
  | 'multirotor-quad'
  | 'multirotor-hexa'
  | 'multirotor-octo'
  | 'heavy-lift-cargo'
  | 'long-endurance-fw'
  | 'tactical-isr'
  | 'usv';

export type Propulsion = 'electric' | 'hybrid' | 'ice';
export type RainTolerance = 'none' | 'light' | 'moderate';

export interface AirframeModel {
  id: string;
  name: string;
  maker: string;
  cls: AirframeClass;
  propulsion: Propulsion;
  mtowKg: number;
  maxPayloadKg: number;
  enduranceMin: number;
  cruiseKmh: number;
  ceilingFtAgl: number;
  /** Characteristic dimension (m) used for SORA ground risk. */
  spanM: number;
  rainTolerance: RainTolerance;
  /** Mission types this airframe can fly. */
  roles: MissionType[];
  /** Hours between scheduled airframe inspections. */
  serviceIntervalHrs: number;
  /** Requires a heavy-lift rating to operate. */
  heavyLift: boolean;
  isVessel?: boolean;
}

// ── Missions ─────────────────────────────────────────────────────────────────
export type MissionType = 'survey' | 'corridor' | 'isr' | 'sar' | 'cargo' | 'agri';
export type Priority = 'routine' | 'high' | 'urgent';
export type MissionStatus =
  | 'request'
  | 'planned'
  | 'scheduled'
  | 'active'
  | 'hold-weather'
  | 'hold-airspace'
  | 'delayed'
  | 'completed';
export type MissionHealth = 'nominal' | 'at-risk' | 'delayed' | 'hold';

export type MissionGeometry =
  | { kind: 'aoi'; polygon: LatLng[] }
  | { kind: 'corridor'; line: LatLng[]; bufferM: number }
  | { kind: 'route'; line: LatLng[] }
  | { kind: 'loiter'; center: LatLng; radiusKm: number };

export type PayloadType = 'lidar' | 'multispectral' | 'rgb' | 'eoir' | 'cargo-winch' | 'comms';
export type CrewCert = 'BVLOS' | 'HeavyLift' | 'Night' | 'Maritime' | 'Thermal' | 'Agri-Spray' | 'VTOL';

export interface Mission {
  id: string;
  code: string;
  name: string;
  clientId: string;
  type: MissionType;
  /** Sub-profile, e.g. "LiDAR", "Pipeline", "Coast-guard patrol". */
  subtype: string;
  priority: Priority;
  regionId: RegionId;
  geometry: MissionGeometry;
  launchPoint: LatLng;
  /** Workload in mission units (ha, km, hrs, km², kg). */
  workload: number;
  /** Cargo only: one-way route distance (km). */
  routeKm?: number;
  status: MissionStatus;
  assignedUnitIds: string[];
  crewIds: string[];
  payloadIds: string[];
  requiredPayloads: PayloadType[];
  requiredCerts: CrewCert[];
  /** Mission requires daylight (optical sensors / VLOS). */
  daylightOnly: boolean;
  scheduledStart: number;
  scheduledEnd: number;
  slaDue: number;
  /** 0..1 */
  progress: number;
  permitId?: string;
  maxAltFt: number;
  /** Recurring cadence in days (SLA cadence commitment). */
  cadenceDays?: number;
  requestedBy?: string;
  notes?: string;
  /** Population density class along the operation, for SORA. */
  population: 'controlled' | 'sparse' | 'populated' | 'gathering';
  /** BVLOS operation? */
  bvlos: boolean;
  /** Landmass of the launch point — drives road vs ferry vs air transit. */
  island: string;
  /** Preferred transport mode for crew & airframe; 'auto' picks the fastest feasible. */
  transportPref: TransportMode | 'auto';
}

// ── Assets ───────────────────────────────────────────────────────────────────
export type UnitStatus =
  | 'available'
  | 'assigned'
  | 'in-transit'
  | 'in-flight'
  | 'charging'
  | 'maintenance'
  | 'grounded';

export type TransportMode = 'road' | 'ferry' | 'air' | 'self-ferry';

export interface FaultCode {
  code: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
  ts: number;
  active: boolean;
  source: 'MAVLink' | 'BMS' | 'ESC' | 'GNSS' | 'C2' | 'Payload' | 'Airframe';
}

export interface Unit {
  id: string;
  /** Registration / tail number. */
  tail: string;
  callsign: string;
  modelId: string;
  status: UnitStatus;
  baseId: string;
  pos: LatLng;
  headingDeg: number;
  altM: number;
  speedKmh: number;
  /** Battery % (electric) or fuel % (ICE/hybrid). */
  energyPct: number;
  /** Battery state of health %. */
  sohPct: number;
  chargeCycles: number;
  /** Cell voltage imbalance (mV). */
  cellDeltaMv: number;
  packVoltage: number;
  airframeHrs: number;
  motorHrs: number;
  /** Airframe hours at which the next service is due. */
  nextServiceHrs: number;
  firmware: string;
  firmwareLatest: string;
  lastFlightTs: number;
  faults: FaultCode[];
  payloadIds: string[];
  crewId?: string;
  missionId?: string;
  /** Timestamp at which the unit becomes free (0 = now). */
  busyUntil: number;
  /** Flight breadcrumb. */
  track: LatLng[];
  /** Simulation: distance flown along mission path (km). */
  pathKm: number;
  /** Simulation: transit target. */
  transitTo?: LatLng;
  transitMode?: TransportMode;
  /** Simulation: contingency state. */
  contingency?: ContingencyState;
  linkQuality: number;
  gnssFix: 'RTK Fixed' | 'RTK Float' | '3D Fix' | 'No Fix';
  satellites: number;
}

export type ContingencyEvent = 'c2-loss' | 'high-wind' | 'adsb-intrusion' | 'cell-sag';
export interface ContingencyState {
  event: ContingencyEvent;
  startedAt: number;
  action: 'RTL' | 'DIVERT' | 'HOLD' | 'DESCEND' | 'LAND';
  target: LatLng;
  targetName: string;
  log: { ts: number; text: string }[];
}

export type CalStatus = 'calibrated' | 'due-soon' | 'expired';

export interface Payload {
  id: string;
  serial: string;
  type: PayloadType;
  model: string;
  calType: string;
  lastCal: number;
  calDue: number;
  unitId?: string;
  baseId: string;
  /** e.g. shutter count or winch cycles */
  lifecycle?: { label: string; value: number; limit: number };
  health?: { label: string; value: string; ok: boolean }[];
}

export interface Crew {
  id: string;
  name: string;
  role: 'PIC' | 'Visual Observer' | 'Payload Operator' | 'Field Technician';
  certs: CrewCert[];
  baseId: string;
  pos: LatLng;
  status: 'on-duty' | 'off-duty' | 'in-field' | 'rest';
  dutyHrsToday: number;
  maxDutyHrs: number;
  flightHrs28d: number;
  maxFlightHrs28d: number;
  phone: string;
}

export interface Base {
  id: string;
  name: string;
  city: string;
  regionId: RegionId;
  pos: LatLng;
  kind: 'hub' | 'forward' | 'maritime';
  island: string;
  chargers: number;
  /** Alternate landing zones near the base (for contingency divert). */
  alternates: { name: string; pos: LatLng }[];
}

export interface Client {
  id: string;
  name: string;
  sector: string;
  slaTargetPct: number;
}

// ── Airspace & weather ───────────────────────────────────────────────────────
export type ZoneKind = 'ctr' | 'kkop' | 'tfr' | 'notam' | 'military' | 'population';

export interface AirspaceZone {
  id: string;
  name: string;
  kind: ZoneKind;
  shape: { type: 'circle'; center: LatLng; radiusKm: number } | { type: 'polygon'; points: LatLng[] };
  floorFt: number;
  ceilingFt: number;
  /** Max permitted UAS altitude inside zone (ft AGL); 0 = prohibited. */
  maxUasFt: number;
  authority: string;
  ref?: string;
  /** Active window; undefined = permanent. */
  activeFrom?: number;
  activeTo?: number;
  airspaceClass?: 'B' | 'C' | 'D' | 'G';
  note?: string;
}

export type PermitStatus = 'approved' | 'pending' | 'expired' | 'rejected';
export interface Permit {
  id: string;
  missionId: string;
  authority: 'DGCA (DKPPU)' | 'AirNav Indonesia' | 'TNI AU' | 'Otoritas Bandara';
  ref: string;
  kind: 'SINKAP Clearance' | 'NOTAM Request' | 'Security Clearance (SC)' | 'Flight Approval (FA)';
  status: PermitStatus;
  windowStart: number;
  windowEnd: number;
  submittedAt: number;
}

export interface WeatherCell {
  id: string;
  kind: 'rain' | 'thunderstorm' | 'squall';
  center: LatLng;
  radiusKm: number;
  intensity: number; // 0..1
  driftKmh: number;
  driftDeg: number;
}

export interface WeatherSample {
  windKts: number;
  gustKts: number;
  windDirDeg: number;
  rainMmH: number;
  visKm: number;
  ceilingFt: number;
  tempC: number;
  daylight: boolean;
  /** 0..1 light level for optical sensors */
  light: number;
}

// ── Data pipelines ───────────────────────────────────────────────────────────
export type PipelineStepKey = 'ingest' | 'validate' | 'process' | 'qa' | 'publish';
export type StepStatus = 'done' | 'running' | 'queued' | 'failed' | 'blocked';

export interface PipelineRun {
  id: string;
  missionId: string;
  unitId: string;
  dataset: string;
  sizeGb: number;
  processingLabel: string;
  steps: { key: PipelineStepKey; status: StepStatus; progress: number; startedAt?: number; endedAt?: number }[];
  qaScore?: number;
  quarantine?: { reason: QuarantineReason; detail: string; at: number };
  /** QA grid: row-major scores 0..100 */
  grid: { rows: number; cols: number; scores: number[]; layout: 'grid' | 'corridor' };
  signoff: { required: boolean; first?: { by: string; at: number }; second?: { by: string; at: number } };
  createdAt: number;
  critical: boolean;
}

export type QuarantineReason =
  | 'RTK Float/Loss'
  | 'Motion Blur > Threshold'
  | 'Cloud Cover Obstruction'
  | 'Thermal Calibration Drift'
  | 'Incomplete Corridor Overlap'
  | 'Telemetry Gap';

// ── Batteries ────────────────────────────────────────────────────────────────
export interface Battery {
  serial: string;
  model: string;
  unitId?: string;
  baseId: string;
  cycles: number;
  cycleLimit: number;
  sohPct: number;
  irMilliOhm: number;
  irBaselineMilliOhm: number;
  lastBalanced: number;
  status: 'active' | 'watch' | 'retire';
  /** Internal resistance history (mΩ), last ~12 readings. */
  irHistory: number[];
}

// ── Master data (Chapter 7 configuration) ───────────────────────────────────
export interface MasterParam {
  value: number;
  verified: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export interface AirframeParams {
  /** Effective capacity per sortie, in the mission's unit. */
  capacity: Partial<Record<MissionType, MasterParam>>;
  sortieMin: MasterParam;
  turnaroundMin: MasterParam;
  setupMin: MasterParam;
  maxWindKts: MasterParam;
  maxGustKts: MasterParam;
  minVisKm: MasterParam;
  selfFerryKmh: MasterParam;
}

export interface MasterData {
  regionalSpeeds: Record<RegionId, Record<Exclude<TransportMode, 'self-ferry'>, MasterParam>>;
  airframes: Record<string, AirframeParams>;
  /** Extra mission-type specific setup minutes (payload mounting / calibration). */
  missionSetupMin: Record<MissionType, MasterParam>;
  /** Fixed handling overhead per transport mode (loading, boarding, cargo handling). */
  modeOverheadMin: Record<TransportMode, MasterParam>;
}

// ── Audit & alerts ───────────────────────────────────────────────────────────
export type OverrideReason = 'Crew Preference' | 'Payload Specificity' | 'Client Priority' | 'Local Logistics' | 'Other';

export interface AuditEntry {
  id: string;
  ts: number;
  actor: string;
  kind: 'override' | 'accept-ai' | 'signoff' | 'master-data' | 'dispatch' | 'contingency' | 'schedule' | 'quarantine';
  text: string;
  missionId?: string;
  recommendedUnitId?: string;
  chosenUnitId?: string;
  reason?: OverrideReason;
  note?: string;
}

export interface Alert {
  id: string;
  ts: number;
  severity: 'info' | 'warn' | 'critical';
  text: string;
  ref?: { kind: 'mission' | 'unit' | 'zone' | 'payload' | 'pipeline'; id: string };
}

// ── Analytics history ───────────────────────────────────────────────────────
export interface DailyRecord {
  day: number; // timestamp (start of day WIB)
  regionId: RegionId;
  type: MissionType;
  clientId: string;
  sorties: number;
  flightHrs: number;
  workload: number;
  costIdr: number;
  turnaroundHrs: number;
  deliverables: number;
  slaMet: number;
  slaTotal: number;
  aiAccepted: number;
  aiOverridden: number;
  signoffHrs: number;
  crewHrs: number;
}

export type ViewId = 'mission-control' | 'fleet' | 'scheduler' | 'telemetry' | 'analytics' | 'master-data';
