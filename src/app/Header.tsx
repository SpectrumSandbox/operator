import { useMemo } from 'react';
import { actions, useOps } from '../store';
import { Icon, Segmented, StatusDot, Wordmark, cx } from '../ui/kit';
import { fmtClock, fmtDate, fmtDow } from '../lib/time';
import type { ViewId } from '../types';
import { TONE_COLOR } from '../data/catalog';

export const VIEWS: { id: ViewId; n: string; label: string; short: string; accent: string }[] = [
  { id: 'mission-control', n: '01', label: 'Mission Control', short: 'Control', accent: '#5cc3ba' },
  { id: 'fleet', n: '02', label: 'Fleet & Assets', short: 'Fleet', accent: '#52bd5e' },
  { id: 'scheduler', n: '03', label: 'Scheduler & Airspace', short: 'Schedule', accent: '#c7c45d' },
  { id: 'telemetry', n: '04', label: 'Telemetry & QA Pipeline', short: 'QA', accent: '#c99064' },
  { id: 'analytics', n: '05', label: 'Operations Analytics', short: 'Analytics', accent: '#c560c8' },
  { id: 'master-data', n: '06', label: 'Master Data', short: 'Master', accent: '#8384e2' },
];

function Clock() {
  const now = useOps((s) => Math.floor(s.now / 1000) * 1000);
  const tz = useOps((s) => s.tz);
  const running = useOps((s) => s.simRunning);
  const speed = useOps((s) => s.simSpeed);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <button onClick={actions.toggleSim} className="btn h-7 px-2" title={running ? 'Pause live simulation' : 'Resume live simulation'} aria-label={running ? 'Pause simulation' : 'Resume simulation'}>
          <Icon name={running ? 'pause' : 'play'} size={12} />
        </button>
        <Segmented
          value={speed}
          onChange={(v) => actions.setSimSpeed(v)}
          options={[
            { value: 1, label: '1×', title: 'Real time' },
            { value: 10, label: '10×', title: '10× speed' },
            { value: 60, label: '60×', title: '1 min = 1 s' },
            { value: 300, label: '300×', title: '5 min = 1 s' },
          ]}
          className="hidden xl:inline-flex"
        />
      </div>
      <div className="text-right leading-none">
        <div className="num text-[16px] font-semibold text-white tracking-tight">
          {fmtClock(now, tz)}
          {running && <span className="blink text-live">▮</span>}
        </div>
        <div className="num text-[9.5px] text-dim mt-[3px]">
          {fmtDow(now, tz)} {fmtDate(now, tz)}
        </div>
      </div>
      <Segmented
        value={tz}
        onChange={(v) => actions.setTz(v)}
        options={[
          { value: 'WIB', label: 'WIB', title: 'Waktu Indonesia Barat (UTC+7)' },
          { value: 'UTC', label: 'UTC' },
        ]}
      />
    </div>
  );
}

function Ticker() {
  const alerts = useOps((s) => s.alerts);
  const tz = useOps((s) => s.tz);
  const items = useMemo(() => alerts.slice(0, 10), [alerts]);
  if (!items.length) return null;
  const go = (ref?: { kind: string; id: string }) => {
    if (!ref) return;
    if (ref.kind === 'mission') {
      actions.selectMission(ref.id);
      location.hash = '#/mission-control';
    } else if (ref.kind === 'unit') {
      actions.selectUnit(ref.id);
      location.hash = '#/fleet';
    } else if (ref.kind === 'zone') location.hash = '#/scheduler';
  };
  const row = (p: string) => items.map((a) => (
    <button key={p + a.id} onClick={() => go(a.ref)} className="flex items-center gap-2 px-4 text-[11.5px] whitespace-nowrap hover:text-white text-muted">
      <StatusDot tone={a.severity === 'critical' ? 'alert' : a.severity === 'warn' ? 'warn' : 'live'} pulse={a.severity === 'critical'} size={6} />
      <span className="num text-dim">{fmtClock(a.ts, tz, false)}</span>
      <span>{a.text}</span>
    </button>
  ));
  return (
    <div className="relative flex-1 min-w-0 overflow-hidden h-full flex items-center border-x border-line mx-4" aria-label="Active alerts">
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-2 bg-gradient-to-r from-bg via-bg to-transparent">
        <span className="label flex items-center gap-1.5" style={{ color: TONE_COLOR.alert }}>
          <Icon name="siren" size={11} /> Alerts
          <span className="num text-text">{alerts.filter((a) => a.severity !== 'info').length}</span>
        </span>
      </div>
      <div className="flex ticker-track pl-28">
        {row('a')}
        {row('b')}
      </div>
    </div>
  );
}

export function Header() {
  const view = useOps((s) => s.view);
  return (
    <header className="shrink-0 border-b border-line bg-bg/95 backdrop-blur z-[1000] no-print">
      <div className="flex items-center h-[52px] px-4">
        <Wordmark />
        <Ticker />
        <div className="flex items-center gap-4 shrink-0">
          <Clock />
          <a href="https://designer.spectrumgroup.id" target="_blank" rel="noopener noreferrer" className="hidden lg:inline-flex btn h-7" title="Open the Spectrum Aircraft Designer">
            designer.spectrumgroup.id <span className="font-mono">↗</span>
          </a>
        </div>
      </div>
      <nav className="flex items-stretch h-9 px-2 overflow-x-auto border-t border-line" aria-label="Views">
        {VIEWS.map((v) => {
          const on = v.id === view;
          return (
            <a
              key={v.id}
              href={`#/${v.id}`}
              className={cx('relative flex items-center gap-1.5 px-3 text-[12px] font-semibold whitespace-nowrap transition-colors', on ? 'text-white' : 'text-dim hover:text-muted')}
              aria-current={on ? 'page' : undefined}
            >
              <span className="font-mono text-[10.5px]" style={{ color: on ? v.accent : undefined }}>
                {v.n} ·
              </span>
              <span className="hidden sm:inline">{v.label}</span>
              <span className="sm:hidden">{v.short}</span>
              {on && <span className="absolute left-2 right-2 bottom-0 h-[2px]" style={{ background: v.accent }} />}
            </a>
          );
        })}
        <div className="ml-auto hidden md:flex items-center gap-2 pr-2 text-[10.5px] text-dim">
          <StatusDot tone="live" pulse size={6} />
          <span className="num">LIVE SIM</span>
          <span className="text-line-2">|</span>
          <span>PT Spectrum Group Indonesia</span>
        </div>
      </nav>
    </header>
  );
}
