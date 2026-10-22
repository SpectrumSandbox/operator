import { Suspense, lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { actions, useOps } from './store';
import { Header, VIEWS } from './app/Header';
import { Toasts } from './app/Toasts';
import { CommandPalette } from './app/CommandPalette';
import type { ViewId } from './types';
// Views are code-split: each loads on first visit (Leaflet ships only with the
// map views). After first paint the rest are prefetched while the browser is idle.
const loaders = {
  'mission-control': () => import('./views/MissionControl').then((m) => ({ default: m.MissionControl })),
  fleet: () => import('./views/Fleet').then((m) => ({ default: m.FleetView })),
  scheduler: () => import('./views/Scheduler').then((m) => ({ default: m.SchedulerView })),
  telemetry: () => import('./views/Telemetry').then((m) => ({ default: m.TelemetryView })),
  analytics: () => import('./views/Analytics').then((m) => ({ default: m.AnalyticsView })),
  'master-data': () => import('./views/MasterData').then((m) => ({ default: m.MasterDataView })),
} satisfies Record<ViewId, () => Promise<{ default: ComponentType }>>;
const LAZY = Object.fromEntries(Object.entries(loaders).map(([k, f]) => [k, lazy(f)])) as Record<ViewId, LazyExoticComponent<ComponentType>>;

function prefetchViews() {
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500));
  idle(() => Object.values(loaders).forEach((f) => void f().catch(() => undefined)));
}

function ViewFallback() {
  return (
    <div className="h-full flex items-center justify-center text-dim text-[12px] gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-live blink" /> Loading…
    </div>
  );
}

const VIEW_IDS = VIEWS.map((v) => v.id);

function viewFromHash(): ViewId {
  const h = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as ViewId;
  return VIEW_IDS.includes(h) ? h : 'mission-control';
}

function CurrentView({ view }: { view: ViewId }) {
  const V = LAZY[view];
  return <V />;
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

  useEffect(prefetchViews, []);

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
        <Suspense fallback={<ViewFallback />}>
          <CurrentView view={view} />
        </Suspense>
      </main>
      <Toasts />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
