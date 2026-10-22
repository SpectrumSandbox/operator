import type { Mission, MissionHealth } from '../types';
import type { Conflict } from './conflicts';
import type { EngineState } from './ctx';
import { missionEta } from './eta';

/** Mission health used for map colouring & queue badges. */
export function missionHealth(m: Mission, conflicts: Conflict[], S: EngineState): MissionHealth {
  if (m.status === 'hold-weather' || m.status === 'hold-airspace') return 'hold';
  if (m.status === 'delayed') return 'delayed';
  if (m.status === 'completed') return 'nominal';
  const mine = conflicts.filter((c) => c.missionIds.includes(m.id));
  if (m.slaDue < S.now) return 'delayed';
  if (m.status !== 'request') {
    const eta = missionEta(m, S);
    if (eta && isFinite(eta.completion) && eta.completion > m.slaDue) return 'delayed';
  }
  if (mine.some((c) => c.blocking) || mine.some((c) => c.kind === 'weather')) return 'at-risk';
  return 'nominal';
}
