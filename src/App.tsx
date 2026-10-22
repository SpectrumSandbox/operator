import { useEffect, useState } from 'react';
import { actions, useOps } from './store';
import { Header, VIEWS } from './app/Header';
import { Toasts } from './app/Toasts';
import { CommandPalette } from './app/CommandPalette';
import type { ViewId } from './types';
import { MissionControl } from './views/MissionControl';
import { FleetView } from './views/Fleet';
import { SchedulerView } from './views/Scheduler';
import { TelemetryView } from './views/Telemetry';
import { AnalyticsView } from './views/Analytics';
import { MasterDataView } from './views/MasterData';

const VIEW_IDS = VIEWS.map((v) => v.id);

function viewFromHash(): ViewId {
  const h = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as ViewId;
  return VIEW_IDS.includes(h) ? h : 'mission-control';
}

export function App() {
  const view = useOps((s) => s.view);

  useEffect(() => {
    const sync = () => {
      const v = viewFromHash();
      if (!location.hash || location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] !== v) history.replaceState(null, '', `#/${v}`);
      actions.setView(v);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const [search, setSearch] = useState(false);

  // Global shortcuts: Ctrl/Cmd+K or "/" search · 1–6 switch views · Space pause/resume simulation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch((v) => !v);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearch(true);
      } else if (/^[1-6]$/.test(e.key)) {
        location.hash = '#/' + VIEWS[Number(e.key) - 1].id;
      } else if (e.key === ' ' && (t?.tagName === 'BODY' || !t)) {
        e.preventDefault();
        actions.toggleSim();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const accent = VIEWS.find((v) => v.id === view)?.accent ?? '#5cc3ba';

  return (
    <div className="h-full flex flex-col" style={{ ['--view-accent' as string]: accent }}>
      <Header onSearch={() => setSearch(true)} />
      <main className="flex-1 min-h-0 relative">
        {view === 'mission-control' && <MissionControl />}
        {view === 'fleet' && <FleetView />}
        {view === 'scheduler' && <SchedulerView />}
        {view === 'telemetry' && <TelemetryView />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'master-data' && <MasterDataView />}
      </main>
      <Toasts />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
