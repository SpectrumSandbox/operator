import { useEffect } from 'react';
import { actions, useOps } from './store';
import { Header, VIEWS } from './app/Header';
import { Toasts } from './app/Toasts';
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

  const accent = VIEWS.find((v) => v.id === view)?.accent ?? '#5cc3ba';

  return (
    <div className="h-full flex flex-col" style={{ ['--view-accent' as string]: accent }}>
      <Header />
      <main className="flex-1 min-h-0 relative">
        {view === 'mission-control' && <MissionControl />}
        {view === 'fleet' && <FleetView />}
        {view === 'scheduler' && <SchedulerView />}
        {view === 'telemetry' && <TelemetryView />}
        {view === 'analytics' && <AnalyticsView />}
        {view === 'master-data' && <MasterDataView />}
      </main>
      <Toasts />
    </div>
  );
}
