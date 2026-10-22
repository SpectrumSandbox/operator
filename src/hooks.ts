// Shared derived-data hooks. Engines memoise internally by state keys, so these
// are cheap to call from several components.
import { useMemo } from 'react';
import { useOpsState } from './store';
import { detectConflicts, type Conflict } from './engine/conflicts';
import { generateBriefing } from './engine/briefing';
import { missionHealth } from './engine/health';
import type { MissionHealth } from './types';

export function useConflicts(): Conflict[] {
  const S = useOpsState();
  return detectConflicts(S);
}

export function useBriefing() {
  const S = useOpsState();
  return generateBriefing(S);
}

/** Health per mission id (recomputed at most once per sim-minute). */
export function useMissionHealth(): Record<string, MissionHealth> {
  const S = useOpsState();
  const conflicts = detectConflicts(S);
  const minute = Math.floor(S.now / 60_000);
  return useMemo(() => {
    const out: Record<string, MissionHealth> = {};
    for (const m of S.missions) out[m.id] = missionHealth(m, conflicts, S);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, conflicts, S.missions.map((m) => m.status + m.assignedUnitIds.join()).join()]);
}
