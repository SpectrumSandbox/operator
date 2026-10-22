import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, useOps } from '../store';
import { Icon, StatusDot, Wordmark, cx, type IconName } from '../ui/kit';
import { fmtClock, fmtDate, fmtDow, fmtRel } from '../lib/time';
import type { Alert, ViewId } from '../types';

export const VIEWS: { id: ViewId; n: string; label: string; short: string; accent: string; icon: IconName }[] = [
  { id: 'mission-control', n: '01', label: 'Mission Control', short: 'Control', accent: '#5cc3ba', icon: 'map' },
  { id: 'fleet', n: '02', label: 'Fleet & Assets', short: 'Fleet', accent: '#52bd5e', icon: 'drone' },
  { id: 'scheduler', n: '03', label: 'Scheduler & Airspace', short: 'Schedule', accent: '#c7c45d', icon: 'chart-gantt' },
  { id: 'telemetry', n: '04', label: 'Telemetry & QA', short: 'QA', accent: '#c99064', icon: 'activity' },
  { id: 'analytics', n: '05', label: 'Analytics', short: 'Analytics', accent: '#c560c8', icon: 'chart-line' },
  { id: 'master-data', n: '06', label: 'Master Data', short: 'Master', accent: '#8384e2', icon: 'sliders-horizontal' },
];

const SPEEDS = [1, 10, 60, 300];

/** Close a popover on outside click / Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function SimControl() {
  const running = useOps((s) => s.simRunning);
  const speed = useOps((s) => s.simSpeed);
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return (
    <div className="flex items-center border border-line-2 h-7" role="group" aria-label="Simulation">
      <button onClick={actions.toggleSim} className="w-7 h-full flex items-center justify-center hover:bg-white/[0.06]" title={running ? 'Pause live simulation' : 'Resume live simulation'} aria-label={running ? 'Pause simulation' : 'Resume simulation'}>
        <Icon name={running ? 'pause' : 'play'} size={12} />
      </button>
      <button onClick={() => actions.setSimSpeed(next)} className="h-full px-2 border-l border-line-2 num text-[11px] hover:bg-white/[0.06] min-w-[42px]" title={`Simulation speed — click for ${next}×`}>
        {speed}×
      </button>
    </div>
  );
}

function Clock() {
  const now = useOps((s) => Math.floor(s.now / 1000) * 1000);
  const tz = useOps((s) => s.tz);
  const running = useOps((s) => s.simRunning);
  return (
    <button onClick={() => actions.setTz(tz === 'WIB' ? 'UTC' : 'WIB')} className="flex items-center gap-2 h-8 px-2 hover:bg-white/[0.04] text-left" title={`${fmtDow(now, tz)} ${fmtDate(now, tz)} — click to switch to ${tz === 'WIB' ? 'UTC' : 'WIB (UTC+7)'}`}>
      <span className="num text-[15px] font-semibold text-white tracking-tight leading-none">
        {fmtClock(now, tz)}
        {running && <span className="blink text-live">▮</span>}
      </span>
      <span className="num text-[10px] font-semibold px-1 h-[18px] inline-flex items-center border border-line-2 text-muted">{tz}</span>
    </button>
  );
}

function goAlert(a: Alert) {
  const ref = a.ref;
  if (!ref) return;
  if (ref.kind === 'mission') {
    actions.selectMission(ref.id);
    location.hash = '#/mission-control';
  } else if (ref.kind === 'unit') {
    actions.selectUnit(ref.id);
    location.hash = '#/fleet';
  } else if (ref.kind === 'payload') location.hash = '#/fleet';
  else if (ref.kind === 'pipeline') location.hash = '#/telemetry';
  else if (ref.kind === 'zone') location.hash = '#/scheduler';
}

function Alerts() {
  const alerts = useOps((s) => s.alerts);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const close = useMemo(() => () => setOpen(false), []);
  const ref = useDismiss(open, close);
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warn = alerts.filter((a) => a.severity === 'warn').length;
  const fresh = seen === undefined ? alerts.length : Math.max(0, alerts.findIndex((a) => a.id === seen));
  const latest = alerts.find((a) => a.severity !== 'info');
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (alerts[0]) setSeen(alerts[0].id);
        }}
        className={cx('flex items-center gap-2 h-8 px-2.5 border transition-colors max-w-[420px]', open ? 'border-white/50 bg-white/[0.05]' : 'border-line-2 hover:border-white/40')}
        aria-expanded={open}
        aria-label={`${critical} critical and ${warn} warning alerts`}
      >
        <span className="relative">
          <Icon name="bell" size={14} className={critical ? 'text-alert' : 'text-muted'} />
          {fresh > 0 && <span className="absolute -top-1 -right-1 w-[7px] h-[7px] rounded-full bg-alert" />}
        </span>
        {critical > 0 && <span className="num text-[11px] font-semibold text-alert">{critical}</span>}
        {warn > 0 && <span className="num text-[11px] font-semibold text-warn">{warn}</span>}
        {latest && <span className="hidden 2xl:block text-[11.5px] text-muted truncate max-w-[300px]">{latest.text}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[420px] max-w-[calc(100vw-24px)] panel shadow-2xl z-[1500]" style={{ background: '#242424' }}>
          <div className="flex items-center gap-2 px-3 h-9 border-b border-line">
            <span className="label">Alerts</span>
            <span className="num text-[10.5px] text-alert">{critical} critical</span>
            <span className="num text-[10.5px] text-warn">{warn} warning</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {alerts.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-dim">No alerts</li>}
            {alerts.slice(0, 30).map((a) => (
              <li key={a.id} className="group flex items-start gap-2.5 px-3 py-2 border-b border-line last:border-b-0 hover:bg-white/[0.03]">
                <span className="mt-[5px]">
                  <StatusDot tone={a.severity === 'critical' ? 'alert' : a.severity === 'warn' ? 'warn' : 'live'} size={7} />
                </span>
                <button className="flex-1 min-w-0 text-left" onClick={() => (goAlert(a), setOpen(false))} disabled={!a.ref}>
                  <span className="block text-[12px] text-text leading-snug">{a.text}</span>
                  <span className="num text-[10px] text-dim">{fmtRel(a.ts, now)}</span>
                </button>
                <button onClick={() => actions.dismissAlert(a.id)} className="opacity-0 group-hover:opacity-100 text-dim hover:text-white mt-0.5" aria-label="Dismiss alert" title="Dismiss">
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Header({ onSearch }: { onSearch: () => void }) {
  const view = useOps((s) => s.view);
  return (
    <header className="shrink-0 border-b border-line bg-bg z-[1000] no-print">
      <div className="flex items-stretch h-12 pl-4 pr-3 gap-3">
        <div className="flex items-center shrink-0">
          <Wordmark compact />
        </div>
        <nav className="flex items-stretch min-w-0 overflow-x-auto ml-2" aria-label="Views">
          {VIEWS.map((v) => {
            const on = v.id === view;
            return (
              <a
                key={v.id}
                href={`#/${v.id}`}
                title={`${v.n} · ${v.label}  (${Number(v.n)})`}
                className={cx('relative flex items-center gap-1.5 px-2.5 xl:px-3 text-[12px] font-semibold whitespace-nowrap transition-colors', on ? 'text-white' : 'text-dim hover:text-muted')}
                aria-current={on ? 'page' : undefined}
              >
                <span className="font-mono text-[10.5px]" style={{ color: on ? v.accent : undefined }}>
                  {v.n}
                </span>
                <span className="hidden 2xl:inline">{v.label}</span>
                <span className="hidden lg:inline 2xl:hidden">{v.short}</span>
                <Icon name={v.icon} size={14} className="lg:hidden" />
                {on && <span className="absolute left-2 right-2 bottom-0 h-[2px]" style={{ background: v.accent }} />}
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={onSearch} className="hidden md:flex items-center gap-2 h-8 px-2.5 border border-line-2 hover:border-white/40 text-dim hover:text-muted" title="Search missions, units, bases (Ctrl+K)">
            <Icon name="search" size={13} />
            <span className="hidden xl:inline text-[11.5px]">Search</span>
            <kbd className="hidden xl:inline num text-[9.5px] px-1 border border-line-2 text-dim">Ctrl K</kbd>
          </button>
          <Alerts />
          <SimControl />
          <Clock />
        </div>
      </div>
    </header>
  );
}

