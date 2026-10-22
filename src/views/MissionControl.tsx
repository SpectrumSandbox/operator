// View 01 · Mission Control — map-first tactical workspace:
// one-row KPI strip · collapsible work queue · live map of Indonesia ·
// collapsible Briefing / Mission / Fleet panel. On wide screens the side panels
// dock next to the map; below 1200 px they collapse to icon rails and open as
// drawers over the map instead of squeezing it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { actions, useOps } from '../store';
import { useBriefing } from '../hooks';
import { KpiStrip } from './mission-control/KpiStrip';
import { WorkQueue, useQueueData } from './mission-control/WorkQueue';
import { OpsMap } from './mission-control/OpsMap';
import { SidePanel, type SideTab } from './mission-control/SidePanel';
import { Drawer, Rail, type RailItem } from './mission-control/Dock';
import { mapInsets } from './mission-control/uiState';
import { QUEUE_DEFAULT, type QueueState, type QueueTab } from './mission-control/util';

const LS_QUEUE = 'so.mc.queue';
const LS_DOCK = 'so.mc.dock.';

type Tier = 'wide' | 'mid' | 'narrow';
const tierOf = (w: number): Tier => (w >= 1600 ? 'wide' : w >= 1200 ? 'mid' : 'narrow');

/** Panel widths per tier: docked [queue, panel] or drawer [queue, panel]. */
const WIDTH: Record<Tier, [number, number]> = { wide: [340, 400], mid: [300, 340], narrow: [320, 380] };

function loadQueue(): QueueState {
  try {
    const raw = localStorage.getItem(LS_QUEUE);
    if (raw) return { ...QUEUE_DEFAULT, ...(JSON.parse(raw) as Partial<QueueState>) };
  } catch {
    /* storage unavailable */
  }
  return QUEUE_DEFAULT;
}

interface DockState {
  tier: Tier;
  left: boolean;
  right: boolean;
}

/** Docked tiers remember their open/collapsed state; narrow screens always start on rails. */
function loadDock(tier: Tier): DockState {
  if (tier === 'narrow') return { tier, left: false, right: false };
  try {
    const raw = localStorage.getItem(LS_DOCK + tier);
    if (raw) {
      const v = JSON.parse(raw) as Partial<DockState>;
      return { tier, left: v.left !== false, right: v.right !== false };
    }
  } catch {
    /* storage unavailable */
  }
  return { tier, left: true, right: true };
}

function saveDock(d: DockState) {
  if (d.tier === 'narrow') return;
  try {
    localStorage.setItem(LS_DOCK + d.tier, JSON.stringify({ left: d.left, right: d.right }));
  } catch {
    /* storage unavailable */
  }
}

export function MissionControl() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [queue, setQueueState] = useState<QueueState>(loadQueue);
  const setQueue = useCallback((p: Partial<QueueState>) => setQueueState((q) => ({ ...q, ...p })), []);
  const selM = useOps((s) => s.selectedMissionId);
  const selU = useOps((s) => s.selectedUnitId);
  const [dock, setDockState] = useState<DockState>(() => loadDock(tierOf(window.innerWidth)));
  const [tab, setTab] = useState<SideTab>(() => (selU ? 'fleet' : selM ? 'mission' : 'briefing'));
  const data = useQueueData(queue);
  const briefing = useBriefing();
  const critical = briefing.filter((i) => i.severity === 'critical').length;

  const overlay = dock.tier === 'narrow';
  const [wq, wp] = WIDTH[dock.tier];

  const setDock = useCallback((fn: (d: DockState) => DockState) => {
    setDockState((d) => {
      const n = fn(d);
      saveDock(n);
      return n;
    });
  }, []);

  // Drawers are mutually exclusive when they overlay the map.
  const openLeft = useCallback((v: boolean) => setDock((d) => ({ ...d, left: v, right: v && d.tier === 'narrow' ? false : d.right })), [setDock]);
  const openRight = useCallback((v: boolean) => setDock((d) => ({ ...d, right: v, left: v && d.tier === 'narrow' ? false : d.left })), [setDock]);

  // Track the available width (the view may sit in a narrow side pane).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const t = tierOf(el.clientWidth || window.innerWidth);
      setDockState((d) => (d.tier === t ? d : loadDock(t)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_QUEUE, JSON.stringify(queue));
    } catch {
      /* storage unavailable */
    }
  }, [queue]);

  // Tell the map how much of its right edge is (or is about to be) covered, so
  // selections are framed in the visible part.
  useLayoutEffect(() => {
    mapInsets.overlay = overlay;
    mapInsets.right = overlay ? wp : dock.right ? 0 : wp - 40;
  }, [overlay, wp, dock.right]);

  // Selection surfaces the matching tab and opens the panel (as a drawer when narrow).
  useEffect(() => {
    if (!selM) return;
    setTab('mission');
    openRight(true);
  }, [selM, openRight]);
  useEffect(() => {
    if (!selU) return;
    setTab('fleet');
    openRight(true);
  }, [selU, openRight]);

  // Keep the selected mission row in view when selection comes from the map / briefing.
  useEffect(() => {
    if (!selM) return;
    const el = document.querySelector(`[data-queue] [data-mission="${selM}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selM, dock.left]);

  const onFilter = useCallback(
    (p: Partial<QueueState>) => {
      setQueue(p);
      if ((p.tab && p.tab !== 'all') || (p.status && p.status !== 'all')) openLeft(true);
    },
    [setQueue, openLeft],
  );

  const openMission = useCallback(() => {
    setTab('mission');
    openRight(true);
  }, [openRight]);
  const onOpenMission = useCallback(
    (id: string) => {
      // A new selection opens the panel via the selection effect.
      if (id !== selM) actions.selectMission(id);
      else openMission();
    },
    [selM, openMission],
  );

  const queueTab = (t: QueueTab) => {
    if (dock.left && queue.tab === t) {
      openLeft(false);
      return;
    }
    setQueue({ tab: t, status: t === 'missions' || t === 'all' ? queue.status : 'all' });
    openLeft(true);
  };
  const panelTab = (t: SideTab) => {
    if (dock.right && tab === t) {
      openRight(false);
      return;
    }
    setTab(t);
    openRight(true);
  };

  const leftItems: RailItem[] = [
    { id: 'all', icon: 'list', label: 'Work queue', count: data.counts.all, active: dock.left && queue.tab === 'all', onClick: () => queueTab('all') },
    { id: 'requests', icon: 'clipboard-list', label: 'Open requests', count: data.counts.requests, tone: 'warn', active: dock.left && queue.tab === 'requests', onClick: () => queueTab('requests') },
    { id: 'flags', icon: 'flag', label: 'Flags', count: data.counts.flags, tone: 'alert', active: dock.left && queue.tab === 'flags', onClick: () => queueTab('flags') },
    { id: 'fleet', icon: 'wrench', label: 'Fleet issues', count: data.counts.fleet, tone: 'warn', active: dock.left && queue.tab === 'fleet', onClick: () => queueTab('fleet') },
  ];
  const rightItems: RailItem[] = [
    { id: 'briefing', icon: 'sparkles', label: 'AI briefing', count: critical, tone: 'alert', active: dock.right && tab === 'briefing', onClick: () => panelTab('briefing') },
    { id: 'mission', icon: 'target', label: selM ? 'Selected mission' : 'Mission · deployment calculator', dot: selM ? 'live' : undefined, active: dock.right && tab === 'mission', onClick: () => panelTab('mission') },
    { id: 'fleet', icon: selU ? 'radio' : 'gauge', label: selU ? 'Selected unit · telemetry' : 'Fleet readiness', dot: selU ? 'live' : undefined, active: dock.right && tab === 'fleet', onClick: () => panelTab('fleet') },
  ];

  const queueEl = <WorkQueue queue={queue} setQueue={setQueue} data={data} onOpenMission={onOpenMission} onCollapse={() => openLeft(false)} overlay={overlay} />;
  const panelEl = <SidePanel tab={tab} setTab={setTab} critical={critical} onCollapse={() => openRight(false)} overlay={overlay} />;
  const missionPanelVisible = dock.right && tab === 'mission';

  return (
    <div ref={rootRef} className="h-full flex flex-col min-h-0 overflow-hidden">
      <KpiStrip queue={queue} onFilter={onFilter} />
      <div className="relative flex-1 min-h-0 flex">
        {!overlay && dock.left ? (
          <div className="shrink-0 min-h-0 border-r border-line" style={{ width: wq }}>
            {queueEl}
          </div>
        ) : (
          <Rail side="left" title="Work queue" items={leftItems} open={dock.left} onToggle={() => openLeft(!dock.left)} />
        )}
        <div className="relative flex-1 min-w-0 min-h-0">
          <OpsMap showSelection={!!selM && !missionPanelVisible && !(overlay && (dock.left || dock.right))} />
        </div>
        {!overlay && dock.right ? (
          <div className="shrink-0 min-h-0 border-l border-line" style={{ width: wp }}>
            {panelEl}
          </div>
        ) : (
          <Rail side="right" title="Briefing panel" items={rightItems} open={dock.right} onToggle={() => openRight(!dock.right)} />
        )}
        {overlay && dock.left && (
          <Drawer side="left" width={wq} label="Work queue" onClose={() => openLeft(false)}>
            {queueEl}
          </Drawer>
        )}
        {overlay && dock.right && (
          <Drawer side="right" width={wp} label="Briefing, mission and fleet" onClose={() => openRight(false)}>
            {panelEl}
          </Drawer>
        )}
      </div>
    </div>
  );
}
