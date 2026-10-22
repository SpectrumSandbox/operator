import type { AirspaceZone, Base, Crew, MasterData, Mission, Payload, Permit, Unit, WeatherCell } from '../types';

/** The slice of operational state the engines need (subset of OpsState). */
export interface EngineState {
  now: number;
  units: Unit[];
  missions: Mission[];
  payloads: Payload[];
  crews: Crew[];
  bases: Base[];
  zones: AirspaceZone[];
  permits: Permit[];
  weatherCells: WeatherCell[];
  master: MasterData;
  weatherSeverity: number;
  kpIndex: number;
  /** Bumped whenever master data changes (cache key). */
  masterVersion: number;
  /** Booked calibrations (payloadId → time the calibration will be performed). */
  calBookings: { payloadId: string; at: number; missionId?: string }[];
}
