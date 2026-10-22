// ─────────────────────────────────────────────────────────────────────────────
// Seed data — Indonesian operational picture, generated relative to "now".
// Coordinates are real places; operational figures are representative.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  AirspaceZone,
  Alert,
  AuditEntry,
  Base,
  Battery,
  Client,
  Crew,
  DailyRecord,
  FaultCode,
  LatLng,
  MasterData,
  MasterParam,
  Mission,
  MissionType,
  Payload,
  PayloadType,
  Permit,
  PipelineRun,
  RegionId,
  Unit,
  UnitStatus,
  WeatherCell,
} from '../types';
import { AIRFRAME, MISSION_TYPES, PAYLOAD_META } from './catalog';
import { DAY, HOUR, MIN, startOfDay, startOfHour } from '../lib/time';
import { rng } from '../lib/format';
import { destination } from '../lib/geo';

const mp = (value: number, verified = true): MasterParam => ({ value, verified });

// ── Clients ──────────────────────────────────────────────────────────────────
export const CLIENTS: Client[] = [
  { id: 'oikn', name: 'Otorita IKN', sector: 'Government', slaTargetPct: 95 },
  { id: 'pertamina', name: 'Pertamina Gas', sector: 'Oil & Gas', slaTargetPct: 97 },
  { id: 'pln', name: 'PLN (Persero) UIT JBB', sector: 'Utilities', slaTargetPct: 95 },
  { id: 'kcic', name: 'KCIC (Whoosh HSR)', sector: 'Rail', slaTargetPct: 95 },
  { id: 'jababeka', name: 'Jababeka Infrastruktur', sector: 'Industrial Estate', slaTargetPct: 90 },
  { id: 'imip', name: 'IMIP Morowali', sector: 'Mining & Smelting', slaTargetPct: 95 },
  { id: 'pelindo', name: 'Pelindo Regional 3', sector: 'Ports', slaTargetPct: 92 },
  { id: 'bakamla', name: 'Bakamla RI', sector: 'Maritime Security', slaTargetPct: 98 },
  { id: 'bnpb', name: 'BNPB', sector: 'Disaster Response', slaTargetPct: 99 },
  { id: 'basarnas', name: 'Basarnas', sector: 'Search & Rescue', slaTargetPct: 99 },
  { id: 'dinkes-dki', name: 'Dinkes DKI Jakarta', sector: 'Health', slaTargetPct: 98 },
  { id: 'dinkes-bali', name: 'Dinkes Provinsi Bali', sector: 'Health', slaTargetPct: 98 },
  { id: 'freeport', name: 'PT Freeport Indonesia', sector: 'Mining', slaTargetPct: 95 },
  { id: 'sinarmas', name: 'Sinar Mas Forestry (APP)', sector: 'Forestry', slaTargetPct: 90 },
  { id: 'pupuk', name: 'Pupuk Kujang', sector: 'Agriculture', slaTargetPct: 90 },
  { id: 'ptpn', name: 'PTPN I Regional 2', sector: 'Plantation', slaTargetPct: 90 },
  { id: 'badangeologi', name: 'Badan Geologi (PVMBG)', sector: 'Government', slaTargetPct: 92 },
  { id: 'ptba', name: 'Bukit Asam (PTBA)', sector: 'Mining', slaTargetPct: 92 },
];

// ── Bases ────────────────────────────────────────────────────────────────────
export const BASES: Base[] = [
  { id: 'b-jkt', name: 'Jakarta Ops Hub', city: 'Cipayung, Jakarta Timur · Halim periphery', regionId: 'jabodetabek', pos: [-6.3165, 106.901], kind: 'hub', island: 'Java', chargers: 16, alternates: [{ name: 'TMII Field LZ', pos: [-6.3025, 106.895] }, { name: 'Cibubur LZ', pos: [-6.37, 106.893] }] },
  { id: 'b-ckr', name: 'Cikarang Industrial Hub', city: 'Jababeka, Kab. Bekasi', regionId: 'jabodetabek', pos: [-6.2985, 107.156], kind: 'hub', island: 'Java', chargers: 10, alternates: [{ name: 'Deltamas LZ', pos: [-6.353, 107.165] }] },
  { id: 'b-ancol', name: 'Ancol Marina Launch Pad', city: 'Ancol, Jakarta Utara', regionId: 'jabodetabek', pos: [-6.121, 106.833], kind: 'maritime', island: 'Java', chargers: 4, alternates: [{ name: 'Pantai Mutiara LZ', pos: [-6.105, 106.787] }] },
  { id: 'b-bdg', name: 'Bandung Highlands Base', city: 'Lembang, Kab. Bandung Barat', regionId: 'west-java', pos: [-6.8135, 107.6175], kind: 'forward', island: 'Java', chargers: 8, alternates: [{ name: 'Parongpong LZ', pos: [-6.809, 107.564] }] },
  { id: 'b-bpn', name: 'Balikpapan–IKN Corridor Hub', city: 'Kariangau, Balikpapan', regionId: 'kalimantan', pos: [-1.165, 116.815], kind: 'hub', island: 'Kalimantan', chargers: 12, alternates: [{ name: 'KM 13 LZ', pos: [-1.155, 116.88] }] },
  { id: 'b-ikn', name: 'IKN Sepaku Forward Base', city: 'Sepaku, Penajam Paser Utara', regionId: 'kalimantan', pos: [-0.952, 116.735], kind: 'forward', island: 'Kalimantan', chargers: 6, alternates: [{ name: 'Sepaku Field LZ', pos: [-0.935, 116.752] }] },
  { id: 'b-mwl', name: 'Morowali Industrial Site', city: 'Bahodopi, Morowali (IMIP)', regionId: 'sulawesi', pos: [-2.84, 122.178], kind: 'forward', island: 'Sulawesi', chargers: 6, alternates: [{ name: 'Fatufia LZ', pos: [-2.858, 122.188] }] },
  { id: 'b-sby', name: 'Surabaya Maritime Base', city: 'Tanjung Perak, Surabaya', regionId: 'east-java-bali', pos: [-7.211, 112.715], kind: 'maritime', island: 'Java', chargers: 10, alternates: [{ name: 'Kenjeran LZ', pos: [-7.235, 112.79] }] },
  { id: 'b-dps', name: 'Denpasar Coastal Base', city: 'Sanur, Denpasar', regionId: 'east-java-bali', pos: [-8.684, 115.262], kind: 'maritime', island: 'Bali', chargers: 8, alternates: [{ name: 'Serangan LZ', pos: [-8.728, 115.236] }] },
  { id: 'b-tim', name: 'Timika Forward Base', city: 'Kuala Kencana, Mimika', regionId: 'papua', pos: [-4.43, 136.87], kind: 'forward', island: 'Papua', chargers: 4, alternates: [{ name: 'Kuala Kencana Field', pos: [-4.415, 136.885] }] },
  { id: 'b-pku', name: 'Pekanbaru Forestry Base', city: 'Rumbai, Pekanbaru', regionId: 'sumatra', pos: [0.56, 101.43], kind: 'forward', island: 'Sumatra', chargers: 6, alternates: [{ name: 'Rumbai LZ', pos: [0.585, 101.45] }] },
];

// ── Airframe master data defaults ────────────────────────────────────────────
function masterDefaults(): MasterData {
  const speeds = (road: number, ferry: number, air: number, v = [true, true, true]) => ({
    road: mp(road, v[0]),
    ferry: mp(ferry, v[1]),
    air: mp(air, v[2]),
  });
  return {
    regionalSpeeds: {
      jabodetabek: speeds(26, 28, 260),
      'west-java': speeds(36, 20, 260),
      'east-java-bali': speeds(40, 22, 260),
      kalimantan: speeds(42, 18, 240, [true, false, true]),
      sulawesi: speeds(34, 18, 220, [true, false, false]),
      papua: speeds(22, 14, 200, [false, false, true]),
      sumatra: speeds(48, 22, 250),
    },
    missionSetupMin: {
      survey: mp(25),
      corridor: mp(15),
      isr: mp(10),
      sar: mp(5),
      cargo: mp(15),
      agri: mp(20),
    },
    modeOverheadMin: {
      road: mp(20),
      ferry: mp(90),
      air: mp(240),
      'self-ferry': mp(10),
    },
    airframes: {
      'elang-e1': { capacity: { survey: mp(450), corridor: mp(85), isr: mp(2.0), sar: mp(18) }, sortieMin: mp(120), turnaroundMin: mp(25), setupMin: mp(45), maxWindKts: mp(25), maxGustKts: mp(32), minVisKm: mp(3), selfFerryKmh: mp(72) },
      'wingtra-g2': { capacity: { survey: mp(220), agri: mp(260) }, sortieMin: mp(50), turnaroundMin: mp(12), setupMin: mp(25), maxWindKts: mp(22), maxGustKts: mp(27), minVisKm: mp(3), selfFerryKmh: mp(58) },
      m350: { capacity: { corridor: mp(6), isr: mp(0.6), sar: mp(2.5), survey: mp(45) }, sortieMin: mp(38), turnaroundMin: mp(8), setupMin: mp(20), maxWindKts: mp(23), maxGustKts: mp(28), minVisKm: mp(1.5), selfFerryKmh: mp(54) },
      m4td: { capacity: { isr: mp(0.75), sar: mp(3), corridor: mp(8) }, sortieMin: mp(45), turnaroundMin: mp(30), setupMin: mp(10), maxWindKts: mp(23), maxGustKts: mp(27), minVisKm: mp(1), selfFerryKmh: mp(50) },
      'h6-hybrid': { capacity: { survey: mp(160, false), corridor: mp(40, false) }, sortieMin: mp(140), turnaroundMin: mp(15), setupMin: mp(40), maxWindKts: mp(20), maxGustKts: mp(25), minVisKm: mp(2), selfFerryKmh: mp(45) },
      'agras-t50': { capacity: { agri: mp(3.5) }, sortieMin: mp(11), turnaroundMin: mp(9), setupMin: mp(30), maxWindKts: mp(12), maxGustKts: mp(15), minVisKm: mp(1), selfFerryKmh: mp(36) },
      flycart30: { capacity: { cargo: mp(30) }, sortieMin: mp(24), turnaroundMin: mp(10), setupMin: mp(25), maxWindKts: mp(23), maxGustKts: mp(28), minVisKm: mp(2), selfFerryKmh: mp(72) },
      'wingcopter-198': { capacity: { cargo: mp(5) }, sortieMin: mp(70), turnaroundMin: mp(15), setupMin: mp(30), maxWindKts: mp(27), maxGustKts: mp(32), minVisKm: mp(3), selfFerryKmh: mp(100) },
      'penguin-c': { capacity: { isr: mp(14, false), sar: mp(400, false), corridor: mp(600, false) }, sortieMin: mp(900), turnaroundMin: mp(90), setupMin: mp(90), maxWindKts: mp(30), maxGustKts: mp(38), minVisKm: mp(4), selfFerryKmh: mp(80) },
      'otter-usv': { capacity: { survey: mp(60, false), isr: mp(10, false) }, sortieMin: mp(600, false), turnaroundMin: mp(120, false), setupMin: mp(60, false), maxWindKts: mp(20, false), maxGustKts: mp(25, false), minVisKm: mp(0.5), selfFerryKmh: mp(9) },
    },
  };
}

// ── Crews ────────────────────────────────────────────────────────────────────
const CREW_DEF: [string, Crew['role'], Crew['certs'], string, number, number][] = [
  // name, role, certs, base, flightHrs28d, dutyToday
  ['Andi Saputra', 'PIC', ['BVLOS', 'VTOL', 'Night'], 'b-jkt', 62, 6.5],
  ['Rina Maharani', 'PIC', ['BVLOS', 'Thermal', 'Night'], 'b-jkt', 48, 4],
  ['Yusuf Hidayat', 'Payload Operator', ['Thermal'], 'b-jkt', 31, 3],
  ['Dimas Pratama', 'PIC', ['HeavyLift', 'BVLOS'], 'b-ancol', 55, 7.5],
  ['Siti Rahmawati', 'Visual Observer', [], 'b-ancol', 22, 7],
  ['Fajar Nugraha', 'PIC', ['VTOL'], 'b-ckr', 40, 2],
  ['Lestari Wulandari', 'Field Technician', [], 'b-ckr', 0, 5],
  ['Agus Setiawan', 'PIC', ['Agri-Spray', 'HeavyLift'], 'b-bdg', 71, 5.5],
  ['Nurul Aini', 'Payload Operator', ['Thermal'], 'b-bdg', 26, 1],
  ['Bayu Kurniawan', 'PIC', ['BVLOS', 'VTOL', 'Night'], 'b-bpn', 78, 9.5],
  ['Putri Anggraini', 'PIC', ['BVLOS', 'VTOL'], 'b-bpn', 58, 6],
  ['Rudi Hartono', 'Field Technician', [], 'b-bpn', 0, 8],
  ['Eko Prasetyo', 'PIC', ['BVLOS', 'VTOL', 'Thermal'], 'b-ikn', 44, 4],
  ['Wayan Sudarsana', 'PIC', ['Thermal', 'Night', 'Maritime'], 'b-dps', 52, 3.5],
  ['Kadek Ayu Lestari', 'PIC', ['BVLOS', 'VTOL'], 'b-dps', 35, 0],
  ['Hasan Basri', 'PIC', ['HeavyLift', 'Thermal', 'Night'], 'b-mwl', 81, 10.2],
  ['Irfan Maulana', 'Visual Observer', [], 'b-mwl', 18, 9],
  ['Teguh Santoso', 'PIC', ['Maritime', 'BVLOS'], 'b-sby', 47, 5],
  ['Dewi Anjani', 'Payload Operator', ['Thermal'], 'b-sby', 29, 5],
  ['Yohanes Wenda', 'PIC', ['BVLOS', 'VTOL', 'HeavyLift'], 'b-tim', 39, 2],
  ['Markus Kogoya', 'Field Technician', [], 'b-tim', 0, 2],
  ['Rizal Fahmi', 'PIC', ['VTOL', 'Agri-Spray'], 'b-pku', 57, 4],
  ['Indah Permata', 'Payload Operator', [], 'b-pku', 20, 4],
];

// ── Fleet ────────────────────────────────────────────────────────────────────
// [id, tail, callsign, model, base, status, firmware, airframeHrs]
const UNIT_DEF: [string, string, string, string, string, UnitStatus, string, number][] = [
  ['u-e1-01', 'SG-E1-001', 'ELANG-01', 'elang-e1', 'b-ikn', 'in-flight', 'SGFC 3.4.2', 412],
  ['u-e1-02', 'SG-E1-002', 'ELANG-02', 'elang-e1', 'b-ikn', 'in-flight', 'SGFC 3.4.2', 388],
  ['u-e1-03', 'SG-E1-003', 'ELANG-03', 'elang-e1', 'b-jkt', 'available', 'SGFC 3.4.2', 156],
  ['u-e1-04', 'SG-E1-004', 'ELANG-04', 'elang-e1', 'b-jkt', 'charging', 'SGFC 3.4.1', 201],
  ['u-e1-05', 'SG-E1-005', 'ELANG-05', 'elang-e1', 'b-bdg', 'available', 'SGFC 3.4.2', 97],
  ['u-e1-06', 'SG-E1-006', 'ELANG-06', 'elang-e1', 'b-bpn', 'maintenance', 'SGFC 3.3.9', 499],
  ['u-e1-07', 'SG-E1-007', 'ELANG-07', 'elang-e1', 'b-mwl', 'available', 'SGFC 3.4.2', 233],
  ['u-e1-08', 'SG-E1-008', 'ELANG-08', 'elang-e1', 'b-dps', 'available', 'SGFC 3.4.2', 64],
  ['u-e1-09', 'SG-E1-009', 'ELANG-09', 'elang-e1', 'b-tim', 'assigned', 'SGFC 3.4.0', 178],
  ['u-e1-10', 'SG-E1-010', 'ELANG-10', 'elang-e1', 'b-pku', 'available', 'SGFC 3.4.2', 120],
  ['u-wt-01', 'SG-WT-011', 'WINGTRA-11', 'wingtra-g2', 'b-ckr', 'assigned', 'WingtraOS 2.18', 286],
  ['u-wt-02', 'SG-WT-012', 'WINGTRA-12', 'wingtra-g2', 'b-bdg', 'available', 'WingtraOS 2.18', 142],
  ['u-wt-03', 'SG-WT-013', 'WINGTRA-13', 'wingtra-g2', 'b-pku', 'assigned', 'WingtraOS 2.17', 309],
  ['u-m3-01', 'SG-M3-021', 'MATRIX-21', 'm350', 'b-jkt', 'assigned', 'v12.01.08', 188],
  ['u-m3-02', 'SG-M3-022', 'MATRIX-22', 'm350', 'b-jkt', 'grounded', 'v11.02.04', 302],
  ['u-m3-03', 'SG-M3-023', 'MATRIX-23', 'm350', 'b-ckr', 'available', 'v12.01.08', 76],
  ['u-m3-04', 'SG-M3-024', 'MATRIX-24', 'm350', 'b-mwl', 'in-flight', 'v12.01.08', 254],
  ['u-m3-05', 'SG-M3-025', 'MATRIX-25', 'm350', 'b-sby', 'assigned', 'v12.01.08', 131],
  ['u-m3-06', 'SG-M3-026', 'MATRIX-26', 'm350', 'b-bpn', 'available', 'v12.01.06', 58],
  ['u-m4-01', 'SG-M4-031', 'DOCK-31', 'm4td', 'b-jkt', 'available', 'v01.04.02', 88],
  ['u-m4-02', 'SG-M4-032', 'DOCK-32', 'm4td', 'b-dps', 'in-flight', 'v01.04.02', 141],
  ['u-m4-03', 'SG-M4-033', 'DOCK-33', 'm4td', 'b-ikn', 'charging', 'v01.04.02', 97],
  ['u-h6-01', 'SG-H6-041', 'CARRIER-41', 'h6-hybrid', 'b-ckr', 'available', 'ArduCopter 4.6.1', 64],
  ['u-h6-02', 'SG-H6-042', 'CARRIER-42', 'h6-hybrid', 'b-bpn', 'available', 'ArduCopter 4.5.7', 148],
  ['u-t5-01', 'SG-T5-051', 'AGRAS-51', 'agras-t50', 'b-bdg', 'assigned', 'v02.01.15', 211],
  ['u-t5-02', 'SG-T5-052', 'AGRAS-52', 'agras-t50', 'b-bdg', 'assigned', 'v02.01.15', 196],
  ['u-t5-03', 'SG-T5-053', 'AGRAS-53', 'agras-t50', 'b-pku', 'available', 'v02.01.12', 88],
  ['u-fc-01', 'SG-FC-061', 'FLYCART-61', 'flycart30', 'b-mwl', 'in-flight', 'v01.05.03', 167],
  ['u-fc-02', 'SG-FC-062', 'FLYCART-62', 'flycart30', 'b-tim', 'available', 'v01.05.03', 92],
  ['u-fc-03', 'SG-FC-063', 'FLYCART-63', 'flycart30', 'b-jkt', 'available', 'v01.05.03', 41],
  ['u-wc-01', 'SG-WC-071', 'WINGCOPTER-71', 'wingcopter-198', 'b-ancol', 'in-flight', 'WC-FW 5.2', 238],
  ['u-wc-02', 'SG-WC-072', 'WINGCOPTER-72', 'wingcopter-198', 'b-ancol', 'charging', 'WC-FW 5.2', 226],
  ['u-wc-03', 'SG-WC-073', 'WINGCOPTER-73', 'wingcopter-198', 'b-dps', 'assigned', 'WC-FW 5.1', 119],
  ['u-pc-01', 'SG-PC-081', 'PENGUIN-81', 'penguin-c', 'b-bpn', 'in-flight', 'Veronte 6.12', 1840],
  ['u-pc-02', 'SG-PC-082', 'PENGUIN-82', 'penguin-c', 'b-sby', 'in-transit', 'Veronte 6.12', 960],
  ['u-ot-01', 'SG-OT-091', 'OTTER-91', 'otter-usv', 'b-sby', 'in-flight', 'MR-OS 4.0', 620],
];

const LATEST_FW: Record<string, string> = {
  'elang-e1': 'SGFC 3.4.2',
  'wingtra-g2': 'WingtraOS 2.18',
  m350: 'v12.01.08',
  m4td: 'v01.04.02',
  'h6-hybrid': 'ArduCopter 4.6.1',
  'agras-t50': 'v02.01.15',
  flycart30: 'v01.05.03',
  'wingcopter-198': 'WC-FW 5.2',
  'penguin-c': 'Veronte 6.12',
  'otter-usv': 'MR-OS 4.1',
};

// ── Payload inventory ────────────────────────────────────────────────────────
// [id, serial, type, model, unit?, base, lastCalDaysAgo]
const PAYLOAD_DEF: [string, string, PayloadType, string, string | undefined, string, number][] = [
  ['p-01', 'L2-4471', 'lidar', 'Zenmuse L2', 'u-e1-01', 'b-ikn', 34],
  ['p-02', 'L2-4502', 'lidar', 'Zenmuse L2', 'u-e1-02', 'b-ikn', 61],
  ['p-03', 'MS-YJ-118', 'lidar', 'YellowScan Mapper+', 'u-h6-01', 'b-ckr', 88],
  ['p-04', 'MS-YJ-121', 'lidar', 'YellowScan Mapper+', 'u-h6-02', 'b-bpn', 12],
  ['p-05', 'RX1-0931', 'rgb', 'Sony RX1R II (42 MP)', 'u-wt-01', 'b-ckr', 120],
  ['p-06', 'RX1-0944', 'rgb', 'Sony RX1R II (42 MP)', 'u-wt-02', 'b-bdg', 40],
  ['p-07', 'P1-2208', 'rgb', 'Zenmuse P1 (45 MP)', 'u-e1-03', 'b-jkt', 15],
  ['p-08', 'P1-2251', 'rgb', 'Zenmuse P1 (45 MP)', 'u-e1-05', 'b-bdg', 176],
  ['p-09', 'MX-RE-7781', 'multispectral', 'MicaSense RedEdge-P', 'u-wt-03', 'b-pku', 28],
  ['p-10', 'MX-RE-7790', 'multispectral', 'MicaSense RedEdge-P', undefined, 'b-bdg', 9],
  ['p-11', 'HS-NANO-31', 'multispectral', 'Headwall Nano-Hyperspec', undefined, 'b-pku', 33],
  ['p-12', 'H30T-5520', 'eoir', 'Zenmuse H30T', 'u-m3-01', 'b-jkt', 22],
  ['p-13', 'H30T-5534', 'eoir', 'Zenmuse H30T', 'u-m3-04', 'b-mwl', 58],
  ['p-14', 'H30T-5590', 'eoir', 'Zenmuse H30T', 'u-m3-05', 'b-sby', 64],
  ['p-15', 'H20T-3107', 'eoir', 'Zenmuse H20T', 'u-m3-03', 'b-ckr', 12],
  ['p-16', 'EPSILON-140', 'eoir', 'Trillium HD40-LV', 'u-pc-01', 'b-bpn', 19],
  ['p-17', 'EPSILON-152', 'eoir', 'Trillium HD40-LV', 'u-pc-02', 'b-sby', 47],
  ['p-18', 'ELG-GMB-09', 'eoir', 'ELANG EO/IR Gimbal G2', 'u-e1-07', 'b-mwl', 30],
  ['p-19', 'ELG-GMB-14', 'eoir', 'ELANG EO/IR Gimbal G2', 'u-e1-09', 'b-tim', 55],
  ['p-20', 'FC-WN-3301', 'cargo-winch', 'FlyCart Winch 20 m', 'u-fc-01', 'b-mwl', 6],
  ['p-21', 'FC-WN-3317', 'cargo-winch', 'FlyCart Winch 20 m', 'u-fc-02', 'b-tim', 33],
  ['p-22', 'FC-WN-3342', 'cargo-winch', 'FlyCart Winch 20 m', 'u-fc-03', 'b-jkt', 14],
  ['p-23', 'WC-POD-212', 'cargo-winch', 'Wingcopter Cold-Chain Pod + Drop', 'u-wc-01', 'b-ancol', 18],
  ['p-24', 'WC-POD-219', 'cargo-winch', 'Wingcopter Cold-Chain Pod + Drop', 'u-wc-02', 'b-ancol', 25],
  ['p-25', 'WC-POD-233', 'cargo-winch', 'Wingcopter Cold-Chain Pod + Drop', 'u-wc-03', 'b-dps', 29],
  ['p-26', 'SILV-SL5-08', 'comms', 'Silvus SL5200 MANET', 'u-pc-01', 'b-bpn', 20],
  ['p-27', 'SILV-SL5-11', 'comms', 'Silvus SL5200 MANET', 'u-pc-02', 'b-sby', 50],
  ['p-28', 'IRD-9770-4', 'comms', 'Iridium Certus 9770 Satcom', 'u-ot-01', 'b-sby', 10],
  ['p-29', 'CS-4G-551', 'comms', 'DJI Cellular Dongle 2 (4G/5G)', 'u-m4-02', 'b-dps', 43],
  ['p-30', 'HRB-C2-77', 'comms', 'Herelink 2.0 C2 Radio', 'u-e1-01', 'b-ikn', 39],
  ['p-31', 'MBES-NORBIT', 'lidar', 'Norbit WINGHEAD i77h MBES', 'u-ot-01', 'b-sby', 70],
  ['p-32', 'H30T-5602', 'eoir', 'Zenmuse H30T', 'u-m4-01', 'b-jkt', 3],
  ['p-33', 'L2-4620', 'lidar', 'Zenmuse L2', 'u-e1-05', 'b-bdg', 20],
  ['p-34', 'H30T-5611', 'eoir', 'Zenmuse H30T', undefined, 'b-sby', 6],
  ['p-35', 'ELG-GMB-21', 'eoir', 'ELANG EO/IR Gimbal G2', undefined, 'b-jkt', 10],
];

// ── Missions ─────────────────────────────────────────────────────────────────
interface MDef {
  id: string;
  code: string;
  name: string;
  client: string;
  type: MissionType;
  sub: string;
  pri: Mission['priority'];
  region: RegionId;
  geo: Mission['geometry'];
  launch: LatLng;
  workload: number;
  routeKm?: number;
  status: Mission['status'];
  units: string[];
  crew: string[];
  payloads: PayloadType[];
  certs: Mission['requiredCerts'];
  daylight: boolean;
  startH: number; // hours from now
  durH: number;
  slaH: number;
  progress: number;
  alt: number;
  pop: Mission['population'];
  bvlos: boolean;
  island: string;
  cadence?: number;
  notes?: string;
  transport?: Mission['transportPref'];
}

const rect = (lat: number, lng: number, dLat: number, dLng: number, skew = 0): LatLng[] => [
  [lat - dLat, lng - dLng + skew],
  [lat - dLat, lng + dLng],
  [lat + dLat, lng + dLng - skew],
  [lat + dLat, lng - dLng],
];

const MISSION_DEF: MDef[] = [
  { id: 'm-01', code: 'MSN-2610-001', name: 'IKN Core Zone LiDAR Mapping — Phase 3', client: 'oikn', type: 'survey', sub: 'LiDAR', pri: 'high', region: 'kalimantan', geo: { kind: 'aoi', polygon: [[-0.905, 116.655], [-0.9, 116.715], [-0.945, 116.728], [-0.962, 116.69], [-0.94, 116.648]] }, launch: [-0.945, 116.705], workload: 2350, status: 'active', units: ['u-e1-01', 'u-e1-02'], crew: ['c-13'], payloads: ['lidar'], certs: ['BVLOS', 'VTOL'], daylight: true, startH: -3, durH: 7, slaH: 30, progress: 0.42, alt: 400, pop: 'sparse', bvlos: true, island: 'Kalimantan', cadence: 30 },
  { id: 'm-02', code: 'MSN-2610-002', name: 'Jababeka Estate As-Built Photogrammetry', client: 'jababeka', type: 'survey', sub: 'Photogrammetry', pri: 'routine', region: 'jabodetabek', geo: { kind: 'aoi', polygon: rect(-6.295, 107.165, 0.02, 0.022, 0.004) }, launch: [-6.2985, 107.156], workload: 620, status: 'scheduled', units: ['u-wt-01'], crew: ['c-06'], payloads: ['rgb'], certs: ['VTOL'], daylight: true, startH: 18, durH: 5, slaH: 72, progress: 0, alt: 400, pop: 'populated', bvlos: false, island: 'Java', cadence: 90 },
  { id: 'm-03', code: 'MSN-2610-003', name: 'Lembang Fault Topographic LiDAR Survey', client: 'badangeologi', type: 'survey', sub: 'LiDAR', pri: 'high', region: 'west-java', geo: { kind: 'aoi', polygon: [[-6.808, 107.55], [-6.818, 107.72], [-6.842, 107.718], [-6.832, 107.548]] }, launch: [-6.8135, 107.6175], workload: 1800, status: 'hold-weather', units: ['u-e1-05'], crew: ['c-08'], payloads: ['lidar'], certs: ['BVLOS', 'VTOL'], daylight: true, startH: 2, durH: 9, slaH: 40, progress: 0.18, alt: 400, pop: 'sparse', bvlos: true, island: 'Java', notes: 'Afternoon convective cells over Tangkuban Perahu — fly morning windows only.' },
  { id: 'm-04', code: 'MSN-2610-004', name: 'Teluk Lamong Terminal Bathymetric Survey', client: 'pelindo', type: 'survey', sub: 'Bathymetric', pri: 'routine', region: 'east-java-bali', geo: { kind: 'aoi', polygon: rect(-7.19, 112.665, 0.005, 0.009) }, launch: [-7.198, 112.676], workload: 85, status: 'active', units: ['u-ot-01'], crew: ['c-18'], payloads: ['lidar', 'comms'], certs: ['Maritime'], daylight: false, startH: -5, durH: 14, slaH: 48, progress: 0.55, alt: 0, pop: 'controlled', bvlos: true, island: 'Java' },
  { id: 'm-05', code: 'MSN-2610-005', name: 'Balikpapan–Samarinda Gas Pipeline Patrol', client: 'pertamina', type: 'corridor', sub: 'Pipeline', pri: 'high', region: 'kalimantan', geo: { kind: 'corridor', line: [[-1.17, 116.83], [-1.02, 116.9], [-0.86, 116.96], [-0.72, 117.04], [-0.55, 117.12]], bufferM: 200 }, launch: [-1.165, 116.815], workload: 236, status: 'active', units: ['u-pc-01'], crew: ['c-10'], payloads: ['eoir', 'comms'], certs: ['BVLOS'], daylight: false, startH: -6, durH: 12, slaH: 14, progress: 0.38, alt: 1200, pop: 'sparse', bvlos: true, island: 'Kalimantan', cadence: 7 },
  { id: 'm-06', code: 'MSN-2610-006', name: 'SUTET 500 kV Depok–Cawang Line Inspection', client: 'pln', type: 'corridor', sub: 'Power Grid', pri: 'high', region: 'jabodetabek', geo: { kind: 'corridor', line: [[-6.42, 106.83], [-6.36, 106.86], [-6.3, 106.875], [-6.255, 106.882]], bufferM: 60 }, launch: [-6.3165, 106.901], workload: 21, status: 'hold-airspace', units: ['u-m3-01'], crew: ['c-02', 'c-03'], payloads: ['eoir'], certs: ['Thermal'], daylight: true, startH: 1, durH: 4, slaH: 20, progress: 0, alt: 300, pop: 'populated', bvlos: false, island: 'Java', notes: 'Northern segment enters Halim KKOP — awaiting AirNav clearance.' },
  { id: 'm-07', code: 'MSN-2610-007', name: 'Whoosh HSR Track Inspection Padalarang–Tegalluar', client: 'kcic', type: 'corridor', sub: 'Railway', pri: 'routine', region: 'west-java', geo: { kind: 'corridor', line: [[-6.843, 107.49], [-6.9, 107.55], [-6.95, 107.64], [-6.973, 107.73]], bufferM: 40 }, launch: [-6.9, 107.55], workload: 30, status: 'planned', units: [], crew: [], payloads: ['rgb'], certs: [], daylight: true, startH: 30, durH: 6, slaH: 96, progress: 0, alt: 200, pop: 'populated', bvlos: false, island: 'Java', cadence: 30 },
  { id: 'm-08', code: 'MSN-2610-008', name: 'Suramadu Bridge Structural Inspection', client: 'pelindo', type: 'corridor', sub: 'Bridge', pri: 'routine', region: 'east-java-bali', geo: { kind: 'corridor', line: [[-7.188, 112.776], [-7.17, 112.78], [-7.152, 112.786]], bufferM: 80 }, launch: [-7.193, 112.772], workload: 5.4, status: 'scheduled', units: ['u-m3-05'], crew: ['c-19'], payloads: ['eoir'], certs: ['Thermal'], daylight: true, startH: 4, durH: 3, slaH: 30, progress: 0, alt: 200, pop: 'populated', bvlos: false, island: 'Java' },
  { id: 'm-09', code: 'REQ-2610-009', name: 'Cirata Floating Solar PV Thermal Inspection', client: 'pln', type: 'corridor', sub: 'Solar Farm', pri: 'routine', region: 'west-java', geo: { kind: 'aoi', polygon: rect(-6.705, 107.36, 0.008, 0.012) }, launch: [-6.712, 107.348], workload: 42, status: 'request', units: [], crew: [], payloads: ['eoir'], certs: ['Thermal'], daylight: true, startH: 48, durH: 6, slaH: 168, progress: 0, alt: 200, pop: 'sparse', bvlos: false, island: 'Java', notes: '192 MWp — string-level hotspot detection, 42 km of panel rows.' },
  { id: 'm-10', code: 'MSN-2610-010', name: 'IMIP Smelter Perimeter Thermal Surveillance', client: 'imip', type: 'isr', sub: 'Perimeter Surveillance', pri: 'high', region: 'sulawesi', geo: { kind: 'loiter', center: [-2.818, 122.16], radiusKm: 2.6 }, launch: [-2.84, 122.178], workload: 10, status: 'active', units: ['u-m3-04'], crew: ['c-16', 'c-17'], payloads: ['eoir'], certs: ['Thermal', 'Night'], daylight: false, startH: -2, durH: 10, slaH: 9, progress: 0.2, alt: 300, pop: 'controlled', bvlos: false, island: 'Sulawesi', cadence: 1 },
  { id: 'm-11', code: 'MSN-2610-011', name: 'Bakamla Selat Bali Maritime Patrol', client: 'bakamla', type: 'isr', sub: 'Coast-Guard Patrol', pri: 'high', region: 'east-java-bali', geo: { kind: 'loiter', center: [-8.25, 114.47], radiusKm: 14 }, launch: [-8.215, 114.37], workload: 12, status: 'scheduled', units: ['u-pc-02'], crew: ['c-18'], payloads: ['eoir', 'comms'], certs: ['BVLOS', 'Maritime'], daylight: false, startH: 9, durH: 12, slaH: 24, progress: 0, alt: 2500, pop: 'controlled', bvlos: true, island: 'Java', transport: 'road' },
  { id: 'm-12', code: 'MSN-2610-012', name: 'Benoa Port Thermal Security Sweep', client: 'pelindo', type: 'isr', sub: 'Thermal Tracking', pri: 'routine', region: 'east-java-bali', geo: { kind: 'loiter', center: [-8.748, 115.214], radiusKm: 1.4 }, launch: [-8.728, 115.236], workload: 4, status: 'active', units: ['u-m4-02'], crew: ['c-14'], payloads: ['eoir'], certs: ['Thermal'], daylight: false, startH: -1, durH: 4, slaH: 5, progress: 0.3, alt: 200, pop: 'populated', bvlos: false, island: 'Bali' },
  { id: 'm-13', code: 'MSN-2610-013', name: 'Grasberg Lowland Haul-Road Perimeter Patrol', client: 'freeport', type: 'isr', sub: 'Perimeter Surveillance', pri: 'routine', region: 'papua', geo: { kind: 'loiter', center: [-4.36, 136.94], radiusKm: 6 }, launch: [-4.43, 136.87], workload: 8, status: 'scheduled', units: ['u-e1-09'], crew: ['c-20'], payloads: ['eoir'], certs: ['VTOL'], daylight: true, startH: 14, durH: 8, slaH: 36, progress: 0, alt: 800, pop: 'sparse', bvlos: true, island: 'Papua' },
  { id: 'm-14', code: 'REQ-2610-014', name: 'Cianjur Landslide Damage Assessment', client: 'bnpb', type: 'sar', sub: 'Disaster Assessment', pri: 'urgent', region: 'west-java', geo: { kind: 'aoi', polygon: [[-6.835, 107.04], [-6.83, 107.095], [-6.875, 107.1], [-6.88, 107.045]] }, launch: [-6.858, 107.07], workload: 12, status: 'request', units: [], crew: [], payloads: ['rgb'], certs: ['BVLOS'], daylight: true, startH: 0, durH: 4, slaH: 8, progress: 0, alt: 400, pop: 'populated', bvlos: true, island: 'Java', notes: 'BNPB request via Pusdalops — Cugenang district, rapid orthomosaic for responders.' },
  { id: 'm-15', code: 'REQ-2610-015', name: 'Selat Sunda Missing Fishing Vessel — Thermal Search', client: 'basarnas', type: 'sar', sub: 'Thermal Search Pattern', pri: 'urgent', region: 'jabodetabek', geo: { kind: 'aoi', polygon: [[-5.88, 105.86], [-5.86, 105.99], [-5.98, 106.01], [-6.0, 105.88]] }, launch: [-6.012, 106.02], workload: 60, status: 'request', units: [], crew: [], payloads: ['eoir'], certs: ['BVLOS', 'Night', 'Thermal'], daylight: false, startH: 0, durH: 8, slaH: 18, progress: 0, alt: 1000, pop: 'controlled', bvlos: true, island: 'Java', notes: 'KM Sinar Laut 07, 6 POB, last AIS ping 03:40 WIB off Pulau Sangiang.' },
  { id: 'm-16', code: 'MSN-2610-016', name: 'Kepulauan Seribu Medical Resupply — RSUD Pulau Pramuka', client: 'dinkes-dki', type: 'cargo', sub: 'Medical Resupply', pri: 'high', region: 'jabodetabek', geo: { kind: 'route', line: [[-6.121, 106.833], [-5.95, 106.72], [-5.745, 106.614]] }, launch: [-6.121, 106.833], workload: 12, routeKm: 48, status: 'active', units: ['u-wc-01', 'u-wc-02'], crew: ['c-04', 'c-05'], payloads: ['cargo-winch'], certs: ['BVLOS', 'HeavyLift'], daylight: true, startH: -1.5, durH: 5, slaH: 6, progress: 0.35, alt: 400, pop: 'controlled', bvlos: true, island: 'Java', cadence: 2, notes: 'Blood units, insulin and vaccines — cold-chain 2–8 °C.' },
  { id: 'm-17', code: 'MSN-2610-017', name: 'Nusa Penida Vaccine Cold-Chain Drop', client: 'dinkes-bali', type: 'cargo', sub: 'Inter-Island Resupply', pri: 'high', region: 'east-java-bali', geo: { kind: 'route', line: [[-8.684, 115.262], [-8.69, 115.38], [-8.678, 115.48]] }, launch: [-8.684, 115.262], workload: 8, routeKm: 24, status: 'scheduled', units: ['u-wc-03'], crew: ['c-15'], payloads: ['cargo-winch'], certs: ['BVLOS'], daylight: true, startH: 6, durH: 3, slaH: 20, progress: 0, alt: 400, pop: 'controlled', bvlos: true, island: 'Bali', cadence: 7 },
  { id: 'm-18', code: 'MSN-2610-018', name: 'IMIP Hillside Spare-Part Heavy Lift', client: 'imip', type: 'cargo', sub: 'Point-to-Point', pri: 'routine', region: 'sulawesi', geo: { kind: 'route', line: [[-2.84, 122.178], [-2.852, 122.16], [-2.868, 122.146]] }, launch: [-2.84, 122.178], workload: 240, routeKm: 4.4, status: 'active', units: ['u-fc-01'], crew: ['c-16'], payloads: ['cargo-winch'], certs: ['HeavyLift'], daylight: true, startH: -1, durH: 4, slaH: 10, progress: 0.4, alt: 300, pop: 'controlled', bvlos: false, island: 'Sulawesi' },
  { id: 'm-19', code: 'MSN-2610-019', name: 'Lowland Camp Resupply — Mile 38', client: 'freeport', type: 'cargo', sub: 'Point-to-Point', pri: 'routine', region: 'papua', geo: { kind: 'route', line: [[-4.43, 136.87], [-4.41, 136.895], [-4.392, 136.922]] }, launch: [-4.43, 136.87], workload: 180, routeKm: 7.2, status: 'planned', units: [], crew: [], payloads: ['cargo-winch'], certs: ['HeavyLift'], daylight: true, startH: 26, durH: 5, slaH: 60, progress: 0, alt: 300, pop: 'sparse', bvlos: true, island: 'Papua' },
  { id: 'm-20', code: 'MSN-2610-020', name: 'Riau Acacia Concession Canopy Analysis', client: 'sinarmas', type: 'agri', sub: 'Canopy Analysis', pri: 'routine', region: 'sumatra', geo: { kind: 'aoi', polygon: [[0.62, 101.74], [0.64, 101.83], [0.56, 101.86], [0.54, 101.76]] }, launch: [0.6, 101.79], workload: 3200, status: 'scheduled', units: ['u-wt-03'], crew: ['c-22', 'c-23'], payloads: ['multispectral'], certs: ['VTOL'], daylight: true, startH: 20, durH: 30, slaH: 120, progress: 0, alt: 400, pop: 'sparse', bvlos: true, island: 'Sumatra', cadence: 30 },
  { id: 'm-21', code: 'MSN-2610-021', name: 'Subang Rice Paddy Precision Spraying', client: 'pupuk', type: 'agri', sub: 'Crop Spraying', pri: 'high', region: 'west-java', geo: { kind: 'aoi', polygon: rect(-6.43, 107.76, 0.008, 0.01) }, launch: [-6.43, 107.75], workload: 140, status: 'scheduled', units: ['u-t5-01', 'u-t5-02'], crew: ['c-08'], payloads: [], certs: ['Agri-Spray', 'HeavyLift'], daylight: true, startH: 16, durH: 8, slaH: 48, progress: 0, alt: 30, pop: 'sparse', bvlos: false, island: 'Java' },
  { id: 'm-22', code: 'MSN-2610-022', name: 'Ciwidey Tea Estate Nutrient Diagnosis', client: 'ptpn', type: 'agri', sub: 'Nutrient Diagnosis', pri: 'routine', region: 'west-java', geo: { kind: 'aoi', polygon: rect(-7.1, 107.45, 0.012, 0.014) }, launch: [-7.1, 107.44], workload: 260, status: 'planned', units: [], crew: [], payloads: ['multispectral'], certs: ['VTOL'], daylight: true, startH: 40, durH: 4, slaH: 100, progress: 0, alt: 400, pop: 'sparse', bvlos: false, island: 'Java', cadence: 14 },
  { id: 'm-23', code: 'REQ-2610-023', name: 'Tanjung Enim Coal Stockpile Volumetrics', client: 'ptba', type: 'survey', sub: 'Photogrammetry', pri: 'routine', region: 'sumatra', geo: { kind: 'aoi', polygon: rect(-3.74, 103.79, 0.012, 0.016) }, launch: [-3.74, 103.775], workload: 310, status: 'request', units: [], crew: [], payloads: ['rgb'], certs: [], daylight: true, startH: 72, durH: 4, slaH: 240, progress: 0, alt: 400, pop: 'sparse', bvlos: false, island: 'Sumatra', cadence: 30 },
  { id: 'm-24', code: 'MSN-2610-024', name: 'Halim–Cawang Toll Viaduct Night Inspection', client: 'pln', type: 'corridor', sub: 'Bridge', pri: 'routine', region: 'jabodetabek', geo: { kind: 'corridor', line: [[-6.248, 106.874], [-6.243, 106.89], [-6.236, 106.905]], bufferM: 50 }, launch: [-6.25, 106.873], workload: 3.6, status: 'planned', units: ['u-m3-02'], crew: ['c-02'], payloads: ['eoir'], certs: ['Night', 'Thermal'], daylight: false, startH: 12, durH: 3, slaH: 40, progress: 0, alt: 150, pop: 'populated', bvlos: false, island: 'Java', notes: 'Inside Halim KKOP inner horizontal surface — military SC required.' },
  { id: 'm-25', code: 'MSN-2610-025', name: 'IKN Toll Road Earthworks Progress Survey', client: 'oikn', type: 'survey', sub: 'Photogrammetry', pri: 'routine', region: 'kalimantan', geo: { kind: 'corridor', line: [[-1.12, 116.79], [-1.06, 116.76], [-1.0, 116.74]], bufferM: 300 }, launch: [-1.12, 116.79], workload: 420, status: 'completed', units: [], crew: [], payloads: ['rgb'], certs: ['VTOL'], daylight: true, startH: -30, durH: 6, slaH: -12, progress: 1, alt: 400, pop: 'sparse', bvlos: true, island: 'Kalimantan', cadence: 14 },
];

// ── Airspace ─────────────────────────────────────────────────────────────────
function zones(now: number): AirspaceZone[] {
  const h = (n: number) => now + n * HOUR;
  const circle = (center: LatLng, radiusKm: number) => ({ type: 'circle' as const, center, radiusKm });
  return [
    // Controlled airspace (CTR) — UAS max 400 ft AGL outside KKOP without ATC clearance
    { id: 'z-ctr-jkt', name: 'Jakarta CTR (Soekarno-Hatta / Halim)', kind: 'ctr', shape: circle([-6.2, 106.78], 42), floorFt: 0, ceilingFt: 6000, maxUasFt: 400, authority: 'AirNav Indonesia', airspaceClass: 'C' },
    { id: 'z-ctr-sub', name: 'Surabaya CTR (Juanda)', kind: 'ctr', shape: circle([-7.3798, 112.7869], 28), floorFt: 0, ceilingFt: 5000, maxUasFt: 400, authority: 'AirNav Indonesia', airspaceClass: 'C' },
    { id: 'z-ctr-dps', name: 'Bali CTR (I Gusti Ngurah Rai)', kind: 'ctr', shape: circle([-8.7482, 115.1672], 28), floorFt: 0, ceilingFt: 5000, maxUasFt: 400, authority: 'AirNav Indonesia', airspaceClass: 'C' },
    { id: 'z-ctr-bpn', name: 'Balikpapan CTR (Sepinggan)', kind: 'ctr', shape: circle([-1.2683, 116.8945], 25), floorFt: 0, ceilingFt: 4500, maxUasFt: 400, authority: 'AirNav Indonesia', airspaceClass: 'C' },
    { id: 'z-ctr-bdo', name: 'Bandung CTR (Husein Sastranegara)', kind: 'ctr', shape: circle([-6.9006, 107.5763], 18), floorFt: 0, ceilingFt: 4500, maxUasFt: 400, authority: 'AirNav Indonesia', airspaceClass: 'D' },
    // KKOP airport safety zones (Kawasan Keselamatan Operasi Penerbangan)
    { id: 'z-kkop-hlp', name: 'KKOP Halim Perdanakusuma (WIHH)', kind: 'kkop', shape: circle([-6.2666, 106.891], 6), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. I', ref: 'PM 37/2020', note: 'Inner horizontal & approach surfaces — UAS prohibited without AirNav + Lanud clearance.' },
    { id: 'z-kkop-cgk', name: 'KKOP Soekarno-Hatta (WIII)', kind: 'kkop', shape: circle([-6.1256, 106.6559], 9), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. I', ref: 'PM 37/2020' },
    { id: 'z-kkop-bdo', name: 'KKOP Husein Sastranegara (WICC)', kind: 'kkop', shape: circle([-6.9006, 107.5763], 5), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. I' },
    { id: 'z-kkop-sub', name: 'KKOP Juanda (WARR)', kind: 'kkop', shape: circle([-7.3798, 112.7869], 8), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. III' },
    { id: 'z-kkop-dps', name: 'KKOP I Gusti Ngurah Rai (WADD)', kind: 'kkop', shape: circle([-8.7482, 115.1672], 6.5), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. IV', note: 'Benoa approach funnel — coordinate with Bali Approach.' },
    { id: 'z-kkop-bpn', name: 'KKOP Sepinggan (WALL)', kind: 'kkop', shape: circle([-1.2683, 116.8945], 7), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. VII' },
    { id: 'z-kkop-tim', name: 'KKOP Mozes Kilangin (WAYY)', kind: 'kkop', shape: circle([-4.5283, 136.8873], 6), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. X' },
    { id: 'z-kkop-pku', name: 'KKOP Sultan Syarif Kasim II (WIBB)', kind: 'kkop', shape: circle([0.4608, 101.4445], 7), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. II' },
    { id: 'z-kkop-imip', name: 'IMIP Private Airstrip Safety Zone', kind: 'kkop', shape: circle([-2.808, 122.148], 1.8), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Otoritas Bandara Wil. V' },
    // Military restricted
    { id: 'z-mil-halim', name: 'Lanud Halim Perdanakusuma (TNI AU)', kind: 'military', shape: circle([-6.2666, 106.891], 3), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'TNI AU', ref: 'WIR-11' },
    { id: 'z-mil-atang', name: 'Lanud Atang Sendjaja (TNI AU)', kind: 'military', shape: circle([-6.5414, 106.7556], 4), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'TNI AU', ref: 'WIR-14' },
    { id: 'z-mil-sulaiman', name: 'Lanud Sulaiman (TNI AU)', kind: 'military', shape: circle([-7.026, 107.58], 3), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'TNI AU' },
    { id: 'z-mil-koarmada', name: 'Koarmada II Naval Base, Ujung', kind: 'military', shape: circle([-7.206, 112.739], 1.5), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'TNI AL' },
    { id: 'z-mil-ikn', name: 'IKN KIPP VVIP Prohibited Area (Istana Garuda)', kind: 'military', shape: circle([-0.989, 116.702], 2.2), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'Paspampres / TNI AU', ref: 'WAP-IKN' },
    // TFR / NOTAM (time-windowed)
    { id: 'z-tfr-vvip', name: 'VVIP Movement — Jakarta Pusat', kind: 'tfr', shape: circle([-6.1754, 106.8272], 5), floorFt: 0, ceilingFt: 99999, maxUasFt: 0, authority: 'AirNav Indonesia', ref: 'NOTAM A2614/26', activeFrom: h(1), activeTo: h(6) },
    { id: 'z-tfr-benoa', name: 'Benoa Cruise Terminal Security Zone', kind: 'tfr', shape: circle([-8.745, 115.212], 0.9), floorFt: 0, ceilingFt: 2000, maxUasFt: 0, authority: 'KSOP Benoa', ref: 'NOTAM B0902/26', activeFrom: h(-0.5), activeTo: h(3) },
    { id: 'z-notam-bali', name: 'Bali Strait Naval Exercise (Latgab)', kind: 'notam', shape: circle([-8.15, 114.42], 16), floorFt: 0, ceilingFt: 15000, maxUasFt: 0, authority: 'TNI AL / AirNav', ref: 'NOTAM B0871/26', activeFrom: h(20), activeTo: h(44) },
    { id: 'z-notam-lembang', name: 'Lembang Paragliding Festival', kind: 'notam', shape: circle([-6.805, 107.65], 3), floorFt: 0, ceilingFt: 3000, maxUasFt: 0, authority: 'AirNav Indonesia', ref: 'NOTAM C1207/26', activeFrom: h(26), activeTo: h(50) },
    { id: 'z-notam-ikn', name: 'IKN Flypast Rehearsal', kind: 'notam', shape: circle([-0.97, 116.7], 8), floorFt: 0, ceilingFt: 10000, maxUasFt: 0, authority: 'TNI AU', ref: 'NOTAM A2650/26', activeFrom: h(30), activeTo: h(34) },
    // Population density buffers
    { id: 'z-pop-jkt', name: 'DKI Jakarta Dense Urban Core', kind: 'population', shape: { type: 'polygon', points: [[-6.12, 106.74], [-6.12, 106.92], [-6.24, 106.95], [-6.34, 106.88], [-6.3, 106.76], [-6.2, 106.72]] }, floorFt: 0, ceilingFt: 400, maxUasFt: 200, authority: 'DKPPU · SORA buffer', note: '>15,000 people/km² — GRC 6+ unless mitigated.' },
    { id: 'z-pop-bdg', name: 'Bandung Metro', kind: 'population', shape: circle([-6.917, 107.619], 7), floorFt: 0, ceilingFt: 400, maxUasFt: 200, authority: 'DKPPU · SORA buffer' },
    { id: 'z-pop-sby', name: 'Surabaya Metro', kind: 'population', shape: circle([-7.265, 112.75], 9), floorFt: 0, ceilingFt: 400, maxUasFt: 200, authority: 'DKPPU · SORA buffer' },
    { id: 'z-pop-dps', name: 'Denpasar Metro', kind: 'population', shape: circle([-8.655, 115.216], 5), floorFt: 0, ceilingFt: 400, maxUasFt: 200, authority: 'DKPPU · SORA buffer' },
  ];
}

function permits(now: number): Permit[] {
  const h = (n: number) => now + n * HOUR;
  return [
    { id: 'pm-01', missionId: 'm-01', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0451', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-24), windowEnd: h(120), submittedAt: h(-96) },
    { id: 'pm-02', missionId: 'm-02', authority: 'AirNav Indonesia', ref: 'FA/JKT/26/1188', kind: 'Flight Approval (FA)', status: 'approved', windowStart: h(12), windowEnd: h(60), submittedAt: h(-48) },
    { id: 'pm-03', missionId: 'm-03', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0466', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-6), windowEnd: h(72), submittedAt: h(-72) },
    { id: 'pm-04', missionId: 'm-04', authority: 'Otoritas Bandara', ref: 'KSOP-TPR/26/0187', kind: 'Flight Approval (FA)', status: 'approved', windowStart: h(-12), windowEnd: h(36), submittedAt: h(-60) },
    { id: 'pm-05', missionId: 'm-05', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2609/0398', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-200), windowEnd: h(500), submittedAt: h(-400) },
    { id: 'pm-06', missionId: 'm-06', authority: 'AirNav Indonesia', ref: 'NOTAM-REQ/JKT/26/0772', kind: 'NOTAM Request', status: 'pending', windowStart: h(1), windowEnd: h(8), submittedAt: h(-20) },
    { id: 'pm-08', missionId: 'm-08', authority: 'TNI AU', ref: 'SC/LANUD-MLG/26/221', kind: 'Security Clearance (SC)', status: 'approved', windowStart: h(3), windowEnd: h(9), submittedAt: h(-50) },
    { id: 'pm-10', missionId: 'm-10', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0402', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-48), windowEnd: h(300), submittedAt: h(-120) },
    { id: 'pm-11', missionId: 'm-11', authority: 'AirNav Indonesia', ref: 'NOTAM-REQ/DPS/26/0391', kind: 'NOTAM Request', status: 'approved', windowStart: h(8), windowEnd: h(22), submittedAt: h(-30) },
    { id: 'pm-12', missionId: 'm-12', authority: 'Otoritas Bandara', ref: 'OB4/DPS/26/118', kind: 'Flight Approval (FA)', status: 'approved', windowStart: h(-2), windowEnd: h(12), submittedAt: h(-26) },
    { id: 'pm-13', missionId: 'm-13', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0470', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(10), windowEnd: h(60), submittedAt: h(-40) },
    { id: 'pm-16', missionId: 'm-16', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2608/0277', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-500), windowEnd: h(900), submittedAt: h(-900) },
    { id: 'pm-17', missionId: 'm-17', authority: 'Otoritas Bandara', ref: 'OB4/DPS/26/124', kind: 'Flight Approval (FA)', status: 'approved', windowStart: h(3), windowEnd: h(30), submittedAt: h(-28) },
    { id: 'pm-18', missionId: 'm-18', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0433', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(-30), windowEnd: h(48), submittedAt: h(-80) },
    { id: 'pm-20', missionId: 'm-20', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0481', kind: 'SINKAP Clearance', status: 'pending', windowStart: h(18), windowEnd: h(100), submittedAt: h(-10) },
    { id: 'pm-21', missionId: 'm-21', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0475', kind: 'SINKAP Clearance', status: 'approved', windowStart: h(12), windowEnd: h(60), submittedAt: h(-36) },
    { id: 'pm-24', missionId: 'm-24', authority: 'TNI AU', ref: 'SC/LANUD-HLM/26/309', kind: 'Security Clearance (SC)', status: 'expired', windowStart: h(-60), windowEnd: h(-12), submittedAt: h(-140) },
    { id: 'pm-07', missionId: 'm-07', authority: 'DGCA (DKPPU)', ref: 'SINKAP/2610/0490', kind: 'SINKAP Clearance', status: 'pending', windowStart: h(28), windowEnd: h(80), submittedAt: h(-4) },
  ];
}

function weatherCells(): WeatherCell[] {
  return [
    { id: 'wx-1', kind: 'thunderstorm', center: [-6.8, 107.7], radiusKm: 16, intensity: 0.85, driftKmh: 10, driftDeg: 245 },
    { id: 'wx-2', kind: 'rain', center: [0.66, 101.95], radiusKm: 38, intensity: 0.5, driftKmh: 14, driftDeg: 260 },
    { id: 'wx-3', kind: 'squall', center: [-8.32, 114.6], radiusKm: 22, intensity: 0.6, driftKmh: 22, driftDeg: 290 },
    { id: 'wx-4', kind: 'thunderstorm', center: [-4.28, 137.02], radiusKm: 20, intensity: 0.9, driftKmh: 8, driftDeg: 200 },
    { id: 'wx-5', kind: 'rain', center: [-6.36, 107.22], radiusKm: 9, intensity: 0.3, driftKmh: 12, driftDeg: 270 },
    { id: 'wx-6', kind: 'rain', center: [-0.75, 117.25], radiusKm: 26, intensity: 0.45, driftKmh: 15, driftDeg: 235 },
  ];
}

// ── Pipelines ────────────────────────────────────────────────────────────────
function pipelines(now: number): PipelineRun[] {
  const r = rng(77);
  const grid = (rows: number, cols: number, base: number, holes: number[], layout: 'grid' | 'corridor' = 'grid') => {
    const scores = Array.from({ length: rows * cols }, () => Math.round(Math.min(100, base + (r() - 0.35) * 18)));
    holes.forEach((i) => (scores[i] = Math.round(25 + r() * 30)));
    return { rows, cols, scores, layout };
  };
  const steps = (state: ('done' | 'running' | 'queued' | 'failed' | 'blocked')[], prog = 0.5) =>
    (['ingest', 'validate', 'process', 'qa', 'publish'] as const).map((key, i) => ({
      key,
      status: state[i],
      progress: state[i] === 'done' ? 1 : state[i] === 'running' ? prog : 0,
      startedAt: state[i] !== 'queued' && state[i] !== 'blocked' ? now - (5 - i) * 40 * MIN : undefined,
      endedAt: state[i] === 'done' ? now - (4 - i) * 40 * MIN : undefined,
    }));
  return [
    { id: 'pl-01', missionId: 'm-25', unitId: 'u-e1-02', dataset: 'IKN-TOLL-ORTHO-S01..S06', sizeGb: 182, processingLabel: 'Orthomosaic + DSM', steps: steps(['done', 'done', 'done', 'done', 'queued']), qaScore: 94.2, grid: grid(6, 14, 93, [], 'corridor'), signoff: { required: true, first: { by: 'Sari Nugroho (GIS Manager)', at: now - 2 * HOUR } }, createdAt: now - 26 * HOUR, critical: true },
    { id: 'pl-02', missionId: 'm-01', unitId: 'u-e1-01', dataset: 'IKN-KIPP-LIDAR-P3-S04', sizeGb: 64, processingLabel: 'Point Cloud Classification', steps: steps(['done', 'done', 'running', 'queued', 'queued'], 0.62), grid: grid(8, 10, 92, [17, 18]), signoff: { required: true }, createdAt: now - 3 * HOUR, critical: true },
    { id: 'pl-03', missionId: 'm-01', unitId: 'u-e1-02', dataset: 'IKN-KIPP-LIDAR-P3-S05', sizeGb: 58, processingLabel: 'Point Cloud Classification', steps: steps(['done', 'failed', 'blocked', 'blocked', 'blocked']), quarantine: { reason: 'RTK Float/Loss', detail: 'RTK float for 7m 40s over NE block — base station BPN-CORS-2 dropout; 3 flight lines lack fixed solution (σh 0.31 m > 0.05 m).', at: now - 70 * MIN }, grid: grid(8, 10, 88, [6, 7, 16, 17, 26, 27, 36]), signoff: { required: true }, createdAt: now - 2 * HOUR, critical: true },
    { id: 'pl-04', missionId: 'm-05', unitId: 'u-pc-01', dataset: 'PGN-BPN-SMD-EOIR-0926', sizeGb: 211, processingLabel: 'Thermal Anomaly Detection', steps: steps(['done', 'done', 'running', 'queued', 'queued'], 0.33), grid: grid(4, 24, 95, [41], 'corridor'), signoff: { required: false }, createdAt: now - 5 * HOUR, critical: false },
    { id: 'pl-05', missionId: 'm-10', unitId: 'u-m3-04', dataset: 'IMIP-PERIM-NIGHT-1021', sizeGb: 38, processingLabel: 'Thermal Anomaly Detection', steps: steps(['done', 'done', 'done', 'done', 'done']), qaScore: 97.1, grid: grid(6, 6, 96, []), signoff: { required: false }, createdAt: now - 14 * HOUR, critical: false },
    { id: 'pl-06', missionId: 'm-03', unitId: 'u-e1-05', dataset: 'LBG-FAULT-LIDAR-S01', sizeGb: 49, processingLabel: 'Point Cloud + DTM', steps: steps(['done', 'done', 'failed', 'blocked', 'blocked']), quarantine: { reason: 'Cloud Cover Obstruction', detail: 'Low stratus at 1,800 ft over western strip — 22% of returns attenuated; DTM voids > 4 m² in 9 cells.', at: now - 5 * HOUR }, grid: grid(5, 16, 86, [3, 4, 19, 20, 35, 36, 51, 52, 67]), signoff: { required: true }, createdAt: now - 7 * HOUR, critical: true },
    { id: 'pl-07', missionId: 'm-08', unitId: 'u-m3-05', dataset: 'SRMD-BRIDGE-PREV-0919', sizeGb: 27, processingLabel: 'Structural Defect AI', steps: steps(['done', 'done', 'done', 'done', 'queued']), qaScore: 91.4, grid: grid(3, 20, 92, [12], 'corridor'), signoff: { required: true, first: { by: 'Hendra Wijaya (Chief Pilot)', at: now - 40 * MIN } }, createdAt: now - 20 * HOUR, critical: true },
    { id: 'pl-08', missionId: 'm-16', unitId: 'u-wc-01', dataset: 'KS-MED-0122-POD', sizeGb: 0.4, processingLabel: 'Delivery Proof (PoD)', steps: steps(['done', 'done', 'done', 'running', 'queued'], 0.8), grid: grid(1, 6, 99, []), signoff: { required: false }, createdAt: now - 50 * MIN, critical: false },
    { id: 'pl-09', missionId: 'm-12', unitId: 'u-m4-02', dataset: 'BENOA-SEC-1021-N', sizeGb: 12, processingLabel: 'Thermal Anomaly Detection', steps: steps(['done', 'failed', 'blocked', 'blocked', 'blocked']), quarantine: { reason: 'Thermal Calibration Drift', detail: 'NUC drift 1.8 K vs blackbody reference after 34 min; radiometric values outside ±1 K tolerance.', at: now - 25 * MIN }, grid: grid(5, 5, 84, [2, 7, 12]), signoff: { required: false }, createdAt: now - 1 * HOUR, critical: false },
    { id: 'pl-10', missionId: 'm-07', unitId: 'u-m3-03', dataset: 'KCIC-HSR-RGB-0918', sizeGb: 96, processingLabel: 'Structural Defect AI', steps: steps(['done', 'done', 'done', 'failed', 'blocked']), quarantine: { reason: 'Incomplete Corridor Overlap', detail: 'Side-lap 41% on km 18.2–19.6 (Tegalluar viaduct) vs 70% spec — gimbal pitch fault during segment.', at: now - 30 * HOUR }, grid: grid(3, 24, 90, [44, 45, 46, 68, 69]), signoff: { required: true }, createdAt: now - 34 * HOUR, critical: true },
    { id: 'pl-11', missionId: 'm-20', unitId: 'u-wt-03', dataset: 'APP-RIAU-MSI-0921', sizeGb: 140, processingLabel: 'NDVI / NDRE Canopy Indices', steps: steps(['done', 'done', 'done', 'done', 'queued']), qaScore: 96.3, grid: grid(7, 9, 95, []), signoff: { required: true, first: { by: 'Dewi Kartika (QA Lead)', at: now - 3 * HOUR } }, createdAt: now - 30 * HOUR, critical: true },
    { id: 'pl-12', missionId: 'm-04', unitId: 'u-ot-01', dataset: 'TLAM-MBES-1021-L01..L22', sizeGb: 74, processingLabel: 'Bathymetric Surface (CUBE)', steps: steps(['running', 'queued', 'queued', 'queued', 'queued'], 0.47), grid: grid(4, 12, 93, []), signoff: { required: true }, createdAt: now - 20 * MIN, critical: true },
    { id: 'pl-13', missionId: 'm-18', unitId: 'u-fc-01', dataset: 'IMIP-LIFT-1021-POD', sizeGb: 0.2, processingLabel: 'Delivery Proof (PoD)', steps: steps(['done', 'done', 'done', 'done', 'done']), qaScore: 100, grid: grid(1, 8, 99, []), signoff: { required: false }, createdAt: now - 3 * HOUR, critical: false },
    { id: 'pl-14', missionId: 'm-01', unitId: 'u-e1-01', dataset: 'IKN-KIPP-LIDAR-P3-S03', sizeGb: 61, processingLabel: 'Point Cloud Classification', steps: steps(['done', 'failed', 'blocked', 'blocked', 'blocked']), quarantine: { reason: 'Motion Blur > Threshold', detail: 'Colourising RGB frames: 14% exceed 1.5 px blur (gust 24 kt at 11:20); LiDAR returns nominal.', at: now - 4 * HOUR }, grid: grid(8, 10, 90, [44, 45, 54]), signoff: { required: true }, createdAt: now - 5 * HOUR, critical: true },
  ];
}

// ── Batteries ────────────────────────────────────────────────────────────────
function batteries(now: number, units: Unit[]): Battery[] {
  const r = rng(4242);
  const out: Battery[] = [];
  const packModel: Record<string, [string, number, number]> = {
    'elang-e1': ['SG-LiHV 12S 32Ah', 400, 9],
    'wingtra-g2': ['Wingtra Flight Battery', 300, 14],
    m350: ['TB65', 400, 11],
    m4td: ['M4 Intelligent Battery', 400, 18],
    'h6-hybrid': ['Tattu 12S 22Ah (buffer)', 300, 8],
    'agras-t50': ['DB1560', 1500, 5],
    flycart30: ['DB2000', 1500, 4],
    'wingcopter-198': ['WC HV-Pack 3', 500, 10],
  };
  let i = 0;
  for (const u of units) {
    const pm = packModel[u.modelId];
    if (!pm) continue;
    const n = u.modelId === 'agras-t50' || u.modelId === 'flycart30' ? 4 : u.modelId === 'm350' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      i++;
      const cycles = Math.round(pm[1] * (0.15 + r() * 0.75));
      const irBase = pm[2];
      let ir = irBase * (1 + (cycles / pm[1]) * 0.45 + (r() - 0.5) * 0.08);
      // inject anomalies
      if (i === 5 || i === 17 || i === 31) ir *= 1.55;
      if (i === 23) ir *= 1.85;
      const soh = Math.max(62, Math.round(100 - (cycles / pm[1]) * 22 - (ir / irBase - 1) * 25 - r() * 3));
      const ratio = ir / irBase;
      const status: Battery['status'] = soh < 75 || ratio > 1.7 || cycles > pm[1] * 0.95 ? 'retire' : soh < 82 || ratio > 1.4 ? 'watch' : 'active';
      const hist: number[] = [];
      for (let j = 11; j >= 0; j--) hist.push(+(ir * (1 - j * (ratio > 1.4 ? 0.035 : 0.006) + (r() - 0.5) * 0.02)).toFixed(1));
      out.push({
        serial: `${pm[0].split(' ')[0].replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase()}-${String(2300 + i * 7).padStart(4, '0')}-${String(i).padStart(3, '0')}`,
        model: pm[0],
        unitId: u.id,
        baseId: u.baseId,
        cycles,
        cycleLimit: pm[1],
        sohPct: soh,
        irMilliOhm: +ir.toFixed(1),
        irBaselineMilliOhm: irBase,
        lastBalanced: now - Math.round(r() * 20) * DAY,
        status,
        irHistory: hist,
      });
    }
  }
  return out;
}

// ── Analytics history ───────────────────────────────────────────────────────
function history(now: number): DailyRecord[] {
  const r = rng(2026);
  const out: DailyRecord[] = [];
  const combos: [RegionId, MissionType, string, number][] = [
    ['kalimantan', 'survey', 'oikn', 1.0],
    ['kalimantan', 'corridor', 'pertamina', 0.9],
    ['jabodetabek', 'corridor', 'pln', 0.7],
    ['jabodetabek', 'cargo', 'dinkes-dki', 1.0],
    ['jabodetabek', 'survey', 'jababeka', 0.3],
    ['west-java', 'agri', 'pupuk', 0.6],
    ['west-java', 'survey', 'badangeologi', 0.4],
    ['west-java', 'corridor', 'kcic', 0.5],
    ['sulawesi', 'isr', 'imip', 1.0],
    ['sulawesi', 'cargo', 'imip', 0.7],
    ['east-java-bali', 'isr', 'bakamla', 0.6],
    ['east-java-bali', 'cargo', 'dinkes-bali', 0.5],
    ['east-java-bali', 'survey', 'pelindo', 0.4],
    ['papua', 'isr', 'freeport', 0.5],
    ['papua', 'cargo', 'freeport', 0.4],
    ['sumatra', 'agri', 'sinarmas', 0.5],
    ['west-java', 'sar', 'bnpb', 0.12],
    ['jabodetabek', 'sar', 'basarnas', 0.1],
  ];
  const unitCost: Record<MissionType, [number, number, number]> = {
    // [workload per sortie, flight hrs per sortie, cost per flight hour IDR]
    survey: [180, 1.1, 4_800_000],
    corridor: [22, 0.9, 5_200_000],
    isr: [1.6, 1.6, 4_100_000],
    sar: [12, 1.5, 4_500_000],
    cargo: [9, 0.7, 6_300_000],
    agri: [24, 0.6, 2_900_000],
  };
  const today = startOfDay(now);
  for (let d = 119; d >= 1; d--) {
    const day = today - d * DAY;
    const trend = 1 + (119 - d) / 220; // growing ops
    const wet = Math.sin((d / 119) * Math.PI) * 0.15; // rain season effect
    for (const [regionId, type, clientId, w] of combos) {
      if (r() > w * 0.85) continue;
      const sorties = Math.max(1, Math.round((1 + r() * 4) * trend * (type === 'agri' ? 3 : 1)));
      const [wps, hps, cph] = unitCost[type];
      const flightHrs = +(sorties * hps * (0.8 + r() * 0.4)).toFixed(2);
      const workload = +(sorties * wps * (0.7 + r() * 0.5)).toFixed(1);
      const costIdr = Math.round(flightHrs * cph * (0.9 + r() * 0.25) + sorties * 350_000);
      const baseTat = type === 'survey' ? 30 : type === 'corridor' ? 20 : type === 'cargo' ? 1.5 : type === 'agri' ? 16 : 8;
      const turnaroundHrs = +(baseTat * (1.25 - (119 - d) / 400) * (0.75 + r() * 0.6) * (1 + wet)).toFixed(1);
      const slaTotal = 1 + Math.round(r() * 2);
      const slaMet = Math.min(slaTotal, Math.round(slaTotal * (0.82 + (119 - d) / 1000 + r() * 0.16 - wet * 0.3)));
      const aiTotal = Math.round(sorties * 0.6 + r() * 2);
      const adopt = Math.min(0.95, 0.48 + (119 - d) / 300 + (r() - 0.5) * 0.15);
      const aiAccepted = Math.round(aiTotal * adopt);
      out.push({
        day,
        regionId,
        type,
        clientId,
        sorties,
        flightHrs,
        workload,
        costIdr,
        turnaroundHrs,
        deliverables: Math.max(1, Math.round(sorties / 3)),
        slaMet,
        slaTotal,
        aiAccepted,
        aiOverridden: aiTotal - aiAccepted,
        signoffHrs: +(2 + r() * 20 * (1.1 - (119 - d) / 200)).toFixed(1),
        crewHrs: +(flightHrs * 2.6 + r() * 3).toFixed(1),
      });
    }
  }
  return out;
}

// ── Assemble ────────────────────────────────────────────────────────────────
export interface SeedState {
  bases: Base[];
  units: Unit[];
  payloads: Payload[];
  crews: Crew[];
  missions: Mission[];
  zones: AirspaceZone[];
  permits: Permit[];
  weatherCells: WeatherCell[];
  pipelines: PipelineRun[];
  batteries: Battery[];
  master: MasterData;
  history: DailyRecord[];
  audit: AuditEntry[];
  alerts: Alert[];
}

export function createSeed(now: number): SeedState {
  const r = rng(1337);
  const baseById = Object.fromEntries(BASES.map((b) => [b.id, b]));

  const crews: Crew[] = CREW_DEF.map(([name, role, certs, baseId, fh, duty], i) => {
    const b = baseById[baseId];
    return {
      id: `c-${String(i + 1).padStart(2, '0')}`,
      name,
      role,
      certs,
      baseId,
      pos: destination(b.pos, r() * 360, 0.3 + r() * 1.2),
      status: duty > 9 ? 'rest' : duty > 0 ? 'on-duty' : 'off-duty',
      dutyHrsToday: duty,
      maxDutyHrs: 10,
      flightHrs28d: fh,
      maxFlightHrs28d: 80,
      phone: `+62 81${Math.floor(10 + r() * 89)}-${Math.floor(1000 + r() * 8999)}-${Math.floor(1000 + r() * 8999)}`,
    };
  });

  const missions: Mission[] = MISSION_DEF.map((d) => {
    const start = startOfHour(now) + d.startH * HOUR;
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      clientId: d.client,
      type: d.type,
      subtype: d.sub,
      priority: d.pri,
      regionId: d.region,
      geometry: d.geo,
      launchPoint: d.launch,
      workload: d.workload,
      routeKm: d.routeKm,
      status: d.status,
      assignedUnitIds: d.units,
      crewIds: d.crew,
      payloadIds: [],
      requiredPayloads: d.payloads,
      requiredCerts: d.certs,
      daylightOnly: d.daylight,
      scheduledStart: start,
      scheduledEnd: start + d.durH * HOUR,
      slaDue: startOfHour(now) + d.slaH * HOUR,
      progress: d.progress,
      maxAltFt: d.alt,
      cadenceDays: d.cadence,
      notes: d.notes,
      population: d.pop,
      bvlos: d.bvlos,
      island: d.island,
      transportPref: d.transport ?? 'auto',
    };
  });

  const missionByUnit: Record<string, Mission> = {};
  for (const m of missions) for (const u of m.assignedUnitIds) missionByUnit[u] = m;

  const units: Unit[] = UNIT_DEF.map(([id, tail, callsign, modelId, baseId, status, firmware, hrs]) => {
    const af = AIRFRAME[modelId];
    const b = baseById[baseId];
    const m = missionByUnit[id];
    const flying = status === 'in-flight';
    const pos: LatLng = flying && m ? m.launchPoint : status === 'in-transit' && m ? destination(b.pos, 150, 40) : destination(b.pos, r() * 360, 0.05 + r() * 0.15);
    const faults: FaultCode[] = [];
    if (id === 'u-m3-02') {
      faults.push({ code: 'ESC_3_OVERCURRENT', text: 'ESC #3 over-current event during climb; motor 3 bearing noise', severity: 'critical', ts: now - 18 * HOUR, active: true, source: 'ESC' });
      faults.push({ code: 'FW_OUTDATED', text: 'Firmware 2 releases behind — mandatory safety update', severity: 'warn', ts: now - 3 * DAY, active: true, source: 'MAVLink' });
    }
    if (id === 'u-e1-06') faults.push({ code: 'AIRFRAME_SVC_DUE', text: '100 h airframe inspection — wing spar & VTOL boom check', severity: 'warn', ts: now - 6 * HOUR, active: true, source: 'Airframe' });
    if (id === 'u-e1-02') faults.push({ code: 'GPS_GLITCH', text: 'EKF lane switch — GNSS glitch (KP 5 window)', severity: 'info', ts: now - 2 * HOUR, active: false, source: 'GNSS' });
    if (id === 'u-pc-01') faults.push({ code: 'C2_RSSI_LOW', text: 'C2 RSSI −94 dBm at 62 km — MANET relay recommended', severity: 'warn', ts: now - 40 * MIN, active: true, source: 'C2' });
    if (id === 'u-wc-02') faults.push({ code: 'BAT_CELL_IMBALANCE', text: 'Cell delta 48 mV post-flight — balance charge scheduled', severity: 'warn', ts: now - 1 * HOUR, active: true, source: 'BMS' });
    if (id === 'u-fc-01') faults.push({ code: 'WINCH_LOAD_SPIKE', text: 'Winch load-cell spike 41 kg (rated 40 kg) — sling oscillation', severity: 'info', ts: now - 30 * MIN, active: false, source: 'Payload' });
    if (id === 'u-e1-09') faults.push({ code: 'FW_UPDATE_AVAIL', text: 'SGFC 3.4.2 available — VTOL transition tuning', severity: 'info', ts: now - 2 * DAY, active: true, source: 'MAVLink' });
    if (id === 'u-m3-01') faults.push({ code: 'COMPASS_INTERF', text: 'Compass interference near HV line — recalibrate before corridor sortie', severity: 'info', ts: now - 5 * HOUR, active: false, source: 'MAVLink' });
    const busy =
      status === 'in-flight' && m ? m.scheduledEnd : status === 'charging' ? now + (30 + r() * 60) * MIN : status === 'maintenance' ? now + 26 * HOUR : status === 'in-transit' ? now + 3 * HOUR : status === 'assigned' && m ? m.scheduledEnd : 0;
    return {
      id,
      tail,
      callsign,
      modelId,
      status,
      baseId,
      pos,
      headingDeg: r() * 360,
      altM: flying ? (af.isVessel ? 0 : Math.min(120, m ? m.maxAltFt * 0.3048 : 100)) : 0,
      speedKmh: flying ? af.cruiseKmh * 0.9 : 0,
      energyPct: flying ? 45 + r() * 45 : status === 'charging' ? 20 + r() * 40 : 85 + r() * 15,
      sohPct: Math.round(78 + r() * 21),
      chargeCycles: Math.round(40 + r() * 320),
      cellDeltaMv: id === 'u-wc-02' ? 48 : Math.round(4 + r() * 18),
      packVoltage: +(44 + r() * 6).toFixed(1),
      airframeHrs: hrs,
      motorHrs: +(hrs * (0.92 + r() * 0.06)).toFixed(1),
      nextServiceHrs: id === 'u-e1-06' ? 500 : id === 'u-e1-02' ? 400 : Math.ceil((hrs + 1) / af.serviceIntervalHrs) * af.serviceIntervalHrs,
      firmware,
      firmwareLatest: LATEST_FW[modelId],
      lastFlightTs: flying ? now : now - Math.round(2 + r() * 70) * HOUR,
      faults,
      payloadIds: PAYLOAD_DEF.filter((p) => p[4] === id).map((p) => p[0]),
      crewId: m?.crewIds[0],
      missionId: m && (status === 'in-flight' || status === 'assigned' || status === 'in-transit') ? m.id : undefined,
      busyUntil: busy,
      track: [],
      pathKm: flying && m ? (m.progress || 0.1) * 30 : 0,
      transitTo: status === 'in-transit' && m ? m.launchPoint : undefined,
      transitMode: status === 'in-transit' ? 'road' : undefined,
      linkQuality: flying ? 70 + r() * 28 : 100,
      gnssFix: flying ? (r() > 0.15 ? 'RTK Fixed' : '3D Fix') : '3D Fix',
      satellites: Math.round(18 + r() * 14),
    };
  });

  for (const m of missions) m.payloadIds = PAYLOAD_DEF.filter((p) => p[4] && m.assignedUnitIds.includes(p[4])).map((p) => p[0]);

  const payloads: Payload[] = PAYLOAD_DEF.map(([id, serial, type, model, unitId, baseId, daysAgo]) => {
    const meta = PAYLOAD_META[type];
    const lastCal = now - daysAgo * DAY;
    const lifecycle =
      type === 'rgb'
        ? { label: 'Shutter actuations', value: Math.round(80_000 + r() * 320_000), limit: 500_000 }
        : type === 'cargo-winch'
          ? { label: 'Release cycles', value: Math.round(200 + r() * 1800), limit: 2500 }
          : type === 'lidar'
            ? { label: 'Laser hours', value: Math.round(80 + r() * 700), limit: 1500 }
            : undefined;
    const health =
      type === 'comms'
        ? [
            { label: 'C2 link margin', value: `${(8 + r() * 14).toFixed(1)} dB`, ok: true },
            { label: '4G/5G failover', value: id === 'p-29' ? 'FAILED last test' : 'Pass · 2.1 s', ok: id !== 'p-29' },
            { label: 'Satcom', value: id === 'p-28' ? 'Iridium Certus · 704 kbps' : 'n/a', ok: true },
          ]
        : undefined;
    return { id, serial, type, model, calType: meta.calType, lastCal, calDue: lastCal + meta.intervalDays * DAY, unitId, baseId, lifecycle, health };
  });

  const audit: AuditEntry[] = [
    { id: 'a-1', ts: now - 3.1 * HOUR, actor: 'Rizky A.', kind: 'accept-ai', text: 'Accepted AI recommendation ELANG-01 + ELANG-02 for IKN Phase 3', missionId: 'm-01', recommendedUnitId: 'u-e1-01', chosenUnitId: 'u-e1-01' },
    { id: 'a-2', ts: now - 2 * HOUR, actor: 'Rizky A.', kind: 'override', text: 'Override: PENGUIN-81 instead of ELANG-06 for pipeline patrol', missionId: 'm-05', recommendedUnitId: 'u-e1-06', chosenUnitId: 'u-pc-01', reason: 'Payload Specificity', note: 'Client contract specifies 10 h continuous EO/IR coverage.' },
    { id: 'a-3', ts: now - 70 * MIN, actor: 'System', kind: 'quarantine', text: 'Dataset IKN-KIPP-LIDAR-P3-S05 quarantined — RTK Float/Loss', missionId: 'm-01' },
    { id: 'a-4', ts: now - 40 * MIN, actor: 'Hendra Wijaya', kind: 'signoff', text: 'First approval — SRMD-BRIDGE-PREV-0919', missionId: 'm-08' },
  ];

  const alerts: Alert[] = [
    { id: 'al-1', ts: now - 5 * MIN, severity: 'critical', text: 'MATRIX-22 grounded — ESC #3 over-current, maintenance ticket MX-2610-118', ref: { kind: 'unit', id: 'u-m3-02' } },
    { id: 'al-2', ts: now - 12 * MIN, severity: 'warn', text: 'Thunderstorm cell over Lembang drifting WSW 10 km/h — MSN-2610-003 on weather hold', ref: { kind: 'mission', id: 'm-03' } },
    { id: 'al-3', ts: now - 20 * MIN, severity: 'warn', text: 'NOTAM A2614/26 VVIP movement Jakarta Pusat active +1h to +6h', ref: { kind: 'zone', id: 'z-tfr-vvip' } },
    { id: 'al-4', ts: now - 25 * MIN, severity: 'critical', text: 'BNPB urgent request: Cianjur landslide damage assessment — SLA 6h', ref: { kind: 'mission', id: 'm-14' } },
    { id: 'al-5', ts: now - 32 * MIN, severity: 'critical', text: 'Basarnas SAR request: missing vessel KM Sinar Laut 07, Selat Sunda — SLA 4h', ref: { kind: 'mission', id: 'm-15' } },
    { id: 'al-6', ts: now - 40 * MIN, severity: 'warn', text: 'PENGUIN-81 C2 RSSI −94 dBm at 62 km on pipeline corridor', ref: { kind: 'unit', id: 'u-pc-01' } },
    { id: 'al-7', ts: now - 55 * MIN, severity: 'info', text: 'KP-index 5 forecast 18:00–24:00 WIB — GNSS degradation possible', ref: undefined },
  ];

  const u = units;
  return {
    bases: BASES,
    units: u,
    payloads,
    crews,
    missions,
    zones: zones(now),
    permits: permits(now),
    weatherCells: weatherCells(),
    pipelines: pipelines(now),
    batteries: batteries(now, u),
    master: masterDefaults(),
    history: history(now),
    audit,
    alerts,
  };
}

export const MISSION_TYPE_LIST = MISSION_TYPES;
