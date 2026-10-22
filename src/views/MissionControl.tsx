// View 01 · Mission Control — full-viewport tactical workspace:
// KPI strip · prioritized work queue · live map of Indonesia · AI briefing & fleet summary.
import { useCallback, useEffect, useState } from 'react';
import { useOps } from '../store';
import { KpiStrip } from './mission-control/KpiStrip';
import { WorkQueue } from './mission-control/WorkQueue';
import { OpsMap } from './mission-control/OpsMap';
import { SidePanel } from './mission-control/SidePanel';
import { QUEUE_DEFAULT, type QueueState } from './mission-control/util';

const LS_KEY = 'so.mc.queue';

function loadQueue(): QueueState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...QUEUE_DEFAULT, ...(JSON.parse(raw) as Partial<QueueState>) };
  } catch {
    /* storage unavailable */
  }
  return QUEUE_DEFAULT;
}

export function MissionControl() {
  const [queue, setQueueState] = useState<QueueState>(loadQueue);
  const setQueue = useCallback((p: Partial<QueueState>) => setQueueState((q) => ({ ...q, ...p })), []);
  const selM = useOps((s) => s.selectedMissionId);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(queue));
    } catch {
      /* storage unavailable */
    }
  }, [queue]);

  // Keep the selected mission row in view when selection comes from the map / briefing.
  useEffect(() => {
    if (!selM) return;
    const el = document.querySelector(`[data-queue] [data-mission="${selM}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selM]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <KpiStrip queue={queue} setQueue={setQueue} />
      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_350px] min-[1440px]:grid-cols-[340px_minmax(0,1fr)_390px]">
        <WorkQueue queue={queue} setQueue={setQueue} />
        <div className="relative min-h-0 min-w-0">
          <OpsMap />
        </div>
        <SidePanel />
      </div>
    </div>
  );
}
