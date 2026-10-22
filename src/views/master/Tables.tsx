// Chapter 7 master-data tables.
import type { ReactNode } from 'react';
import { useOps } from '../../store';
import { AIRFRAMES, AIRFRAME_CLASS_LABEL, MISSION_PROFILES, MISSION_TYPES, REGIONS, TRANSPORT_LABEL } from '../../data/catalog';
import { Panel, cx, type IconName } from '../../ui/kit';
import type { AirframeParams, MissionType, TransportMode } from '../../types';
import { ParamCell, RowVerify, TableVerifyAll, type Path } from './ParamCell';

function Th({ children, right, className, sub }: { children: ReactNode; right?: boolean; className?: string; sub?: ReactNode }) {
  return (
    <th className={cx(right && 'text-right', className)}>
      <div>{children}</div>
      {sub && <div className="normal-case tracking-normal font-normal text-[10px] text-dim/80 num">{sub}</div>}
    </th>
  );
}

function T({ index, title, subtitle, paths, children }: { index: string; title: string; icon?: IconName; subtitle: string; paths: Path[]; children: ReactNode }) {
  return (
    <Panel index={index} title={title} subtitle={subtitle} actions={<TableVerifyAll paths={paths} label={title} />}>
      <div className="overflow-x-auto">{children}</div>
    </Panel>
  );
}

// ── 1 · Regional travel speeds ─────────────────────────────────────────────
const SPEED_MODES: Exclude<TransportMode, 'self-ferry'>[] = ['road', 'ferry', 'air'];
const SPEED_LABEL = { road: 'Road', ferry: 'Ferry / Speedboat', air: 'Air freight' };

export function SpeedsTable() {
  const paths = REGIONS.flatMap((r) => SPEED_MODES.map((m) => ['regionalSpeeds', r.id, m] as Path));
  return (
    <T index="01" title="Regional travel speeds" icon="truck" subtitle="door-to-door km/h" paths={paths}>
      <table className="tbl text-[12px] min-w-[620px]">
        <thead>
          <tr>
            <Th>Region</Th>
            {SPEED_MODES.map((m) => (
              <Th key={m} right sub="km/h">
                {SPEED_LABEL[m]}
              </Th>
            ))}
            <Th right className="w-[90px]">Row</Th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="num text-dim mr-2">{r.short}</span>
                <span className="text-text">{r.name}</span>
              </td>
              {SPEED_MODES.map((m) => (
                <td key={m} className="text-right">
                  <ParamCell path={['regionalSpeeds', r.id, m]} label={`${r.name} ${SPEED_LABEL[m].toLowerCase()} speed`} unit="km/h" max={1000} />
                </td>
              ))}
              <td className="text-right">
                <RowVerify paths={SPEED_MODES.map((m) => ['regionalSpeeds', r.id, m])} label={`${r.name} travel speeds`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </T>
  );
}

// ── 2 · Transport mode overheads ───────────────────────────────────────────
const MODES: TransportMode[] = ['road', 'ferry', 'air', 'self-ferry'];
const MODE_NOTE: Record<TransportMode, string> = {
  road: 'Vehicle loading, convoy brief, site access',
  ferry: 'Port check-in, boarding & dangerous-goods (LiPo) declaration',
  air: 'Cargo acceptance, DG handling (UN3480), airside transfer',
  'self-ferry': 'Ferry-flight plan upload & pre-flight',
};

export function OverheadTable() {
  const paths = MODES.map((m) => ['modeOverheadMin', m] as Path);
  return (
    <T index="02" title="Transport mode overheads" icon="clock" subtitle="per transit leg" paths={paths}>
      <table className="tbl text-[12px] min-w-[480px]">
        <thead>
          <tr>
            <Th>Mode</Th>
            <Th>Includes</Th>
            <Th right sub="min">Overhead</Th>
          </tr>
        </thead>
        <tbody>
          {MODES.map((m) => (
            <tr key={m}>
              <td className="whitespace-nowrap">
                <span className="text-text">{TRANSPORT_LABEL[m]}</span>
              </td>
              <td className="text-[11px] text-dim max-w-[260px] truncate" title={MODE_NOTE[m]}>{MODE_NOTE[m]}</td>
              <td className="text-right">
                <ParamCell path={['modeOverheadMin', m]} label={`${TRANSPORT_LABEL[m]} overhead`} unit="min" allowZero max={2880} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </T>
  );
}

// ── 5 · Mission-type set-up ────────────────────────────────────────────────
const SETUP_NOTE: Record<MissionType, string> = {
  survey: 'GCP check, LiDAR boresight / IMU warm-up',
  corridor: 'EO/IR gimbal NUC, corridor waypoint load',
  isr: 'Loiter plan, video downlink check',
  sar: 'Search-pattern upload, thermal NUC',
  cargo: 'Load-cell tare, cold-chain seal, release test',
  agri: 'Tank fill & nozzle calibration / MSI panel',
};

export function SetupTable() {
  const paths = MISSION_TYPES.map((t) => ['missionSetupMin', t] as Path);
  return (
    <T index="05" title="Mission-type set-up times" icon="wrench" subtitle="minutes" paths={paths}>
      <table className="tbl text-[12px] min-w-[480px]">
        <thead>
          <tr>
            <Th>Mission profile</Th>
            <Th>Typical tasks</Th>
            <Th right sub="min">Set-up</Th>
          </tr>
        </thead>
        <tbody>
          {MISSION_TYPES.map((t) => (
            <tr key={t}>
              <td className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 text-text">
                  <i className="w-1.5 h-1.5 shrink-0" style={{ background: MISSION_PROFILES[t].color }} />
                  {MISSION_PROFILES[t].label}
                </span>
              </td>
              <td className="text-[11px] text-dim max-w-[260px] truncate" title={SETUP_NOTE[t]}>{SETUP_NOTE[t]}</td>
              <td className="text-right">
                <ParamCell path={['missionSetupMin', t]} label={`${MISSION_PROFILES[t].short} set-up time`} unit="min" allowZero max={600} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </T>
  );
}

// ── 3 · Airframe coverage / capacity / timings ─────────────────────────────
const TIMING: { key: keyof AirframeParams; label: string; unit: string }[] = [
  { key: 'sortieMin', label: 'Sortie flight', unit: 'min' },
  { key: 'turnaroundMin', label: 'Swap / turnaround', unit: 'min' },
  { key: 'setupMin', label: 'Set-up', unit: 'min' },
  { key: 'selfFerryKmh', label: 'Self-ferry', unit: 'km/h' },
];

export function AirframeTable() {
  const airframes = useOps((s) => s.master.airframes);
  const paths: Path[] = [];
  for (const af of AIRFRAMES) {
    for (const t of MISSION_TYPES) if (airframes[af.id]?.capacity[t]) paths.push(['airframes', af.id, 'capacity', t]);
    for (const tm of TIMING) paths.push(['airframes', af.id, tm.key]);
  }
  return (
    <T index="03" title="Airframe coverage & sortie timings" icon="drone" subtitle="capacity per sortie · · = not supported" paths={paths}>
      <table className="tbl text-[12px] min-w-[1240px]">
        <thead>
          <tr>
            <Th>Airframe</Th>
            {MISSION_TYPES.map((t) => (
              <Th key={t} right sub={`${MISSION_PROFILES[t].unit} / sortie`}>
                <span className="inline-flex items-center gap-1">
                  <i className="w-1.5 h-1.5 inline-block" style={{ background: MISSION_PROFILES[t].color }} />
                  {MISSION_PROFILES[t].short}
                </span>
              </Th>
            ))}
            {TIMING.map((t) => (
              <Th key={t.key} right sub={t.unit} className={t.key === 'sortieMin' ? 'border-l border-line-2' : undefined}>
                {t.label}
              </Th>
            ))}
            <Th right>Row</Th>
          </tr>
        </thead>
        <tbody>
          {AIRFRAMES.map((af) => {
            const p = airframes[af.id];
            const rowPaths: Path[] = [...MISSION_TYPES.filter((t) => p?.capacity[t]).map((t) => ['airframes', af.id, 'capacity', t] as Path), ...TIMING.map((tm) => ['airframes', af.id, tm.key] as Path)];
            return (
              <tr key={af.id}>
                <td className="min-w-[180px]">
                  <div className="text-text font-medium whitespace-nowrap">{af.name}</div>
                  <div className="text-[10px] text-dim whitespace-nowrap">
                    {AIRFRAME_CLASS_LABEL[af.cls]} · <span className="num">{af.maker}</span>
                  </div>
                </td>
                {MISSION_TYPES.map((t) => (
                  <td key={t} className="text-right">
                    {p?.capacity[t] ? (
                      <ParamCell path={['airframes', af.id, 'capacity', t]} label={`${af.name} ${MISSION_PROFILES[t].short} coverage/sortie`} unit={MISSION_PROFILES[t].unit} width={60} />
                    ) : (
                      <span className="text-dim/60 num pr-[30px]">·</span>
                    )}
                  </td>
                ))}
                {TIMING.map((tm) => (
                  <td key={tm.key} className={cx('text-right', tm.key === 'sortieMin' && 'border-l border-line-2')}>
                    <ParamCell path={['airframes', af.id, tm.key]} label={`${af.name} ${tm.label.toLowerCase()} ${tm.key === 'selfFerryKmh' ? 'speed' : 'time'}`} unit={tm.unit} allowZero={tm.key === 'turnaroundMin' || tm.key === 'setupMin'} width={56} />
                  </td>
                ))}
                <td className="text-right">
                  <RowVerify paths={rowPaths} label={af.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </T>
  );
}

// ── 4 · Weather limits ─────────────────────────────────────────────────────
const RAIN: Record<string, { label: string; tone: 'alert' | 'warn' | 'ok' }> = {
  none: { label: 'None · IP43', tone: 'alert' },
  light: { label: 'Light rain', tone: 'warn' },
  moderate: { label: 'Moderate · IP55', tone: 'ok' },
};

export function WeatherTable() {
  const paths: Path[] = AIRFRAMES.flatMap((af) => (['maxWindKts', 'maxGustKts', 'minVisKm'] as const).map((k) => ['airframes', af.id, k] as Path));
  return (
    <T index="04" title="Weather & wind limits" icon="wind" subtitle="per airframe" paths={paths}>
      <table className="tbl text-[12px] min-w-[640px]">
        <thead>
          <tr>
            <Th>Airframe</Th>
            <Th right sub="kt">Max wind</Th>
            <Th right sub="kt">Max gust</Th>
            <Th right sub="km">Min visibility</Th>
            <Th sub="read-only">Rain tolerance</Th>
            <Th right>Row</Th>
          </tr>
        </thead>
        <tbody>
          {AIRFRAMES.map((af) => (
            <tr key={af.id}>
              <td className="text-text whitespace-nowrap">{af.name}</td>
              <td className="text-right">
                <ParamCell path={['airframes', af.id, 'maxWindKts']} label={`${af.name} max wind`} unit="kt" max={80} />
              </td>
              <td className="text-right">
                <ParamCell path={['airframes', af.id, 'maxGustKts']} label={`${af.name} max gust`} unit="kt" max={90} />
              </td>
              <td className="text-right">
                <ParamCell path={['airframes', af.id, 'minVisKm']} label={`${af.name} min visibility`} unit="km" max={20} />
              </td>
              <td>
                <span className={cx('text-[11px]', RAIN[af.rainTolerance].tone === 'ok' ? 'text-muted' : RAIN[af.rainTolerance].tone === 'warn' ? 'text-warn' : 'text-alert')}>{RAIN[af.rainTolerance].label}</span>
              </td>
              <td className="text-right">
                <RowVerify paths={(['maxWindKts', 'maxGustKts', 'minVisKm'] as const).map((k) => ['airframes', af.id, k])} label={`${af.name} weather limits`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </T>
  );
}
