import type { Mission, PipelineRun, QuarantineReason, Unit } from '../../types';
import { actions } from '../../store';
import { Empty, Icon, Panel, cx, useTz, type IconName } from '../../ui/kit';
import { fmtRel, fmtStamp } from '../../lib/time';
import { FLAG_THRESHOLD } from './shared';

const REASON_ICON: Record<QuarantineReason, IconName> = {
  'RTK Float/Loss': 'satellite',
  'Motion Blur > Threshold': 'aperture',
  'Cloud Cover Obstruction': 'cloud',
  'Thermal Calibration Drift': 'thermometer',
  'Incomplete Corridor Overlap': 'route',
  'Telemetry Gap': 'unlink',
};

export function QuarantineQueue({
  runs,
  missionById,
  unitById,
  now,
  selectedId,
  onSelect,
}: {
  runs: PipelineRun[];
  missionById: Map<string, Mission>;
  unitById: Map<string, Unit>;
  now: number;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const tz = useTz();
  const reflights = [...missionById.values()].filter((x) => x.code.startsWith('RFL'));
  const q = runs.filter((r) => r.quarantine).sort((a, b) => b.quarantine!.at - a.quarantine!.at);
  return (
    <Panel
      title="Quarantine"
      index="B"
      className={cx('h-full w-full', q.length > 0 && '!border-alert/40')}
      bodyClassName="overflow-auto"
      actions={<span className={cx('num text-[11px]', q.length ? 'text-alert' : 'text-ok')}>{q.length ? `${q.length} held` : 'clear'}</span>}
    >
      {q.length === 0 ? (
        <Empty icon="shield-check" text="No datasets in quarantine" sub="All runs passed telemetry validation and processing checks." />
      ) : (
        <ul>
          {q.map((r) => {
            const qd = r.quarantine!;
            const m = missionById.get(r.missionId);
            const u = unitById.get(r.unitId);
            const flagged = r.grid.scores.filter((s) => s < FLAG_THRESHOLD).length;
            const failed = r.steps.find((s) => s.status === 'failed');
            const sel = r.id === selectedId;
            const rfl = reflights.find((x) => x.notes?.includes(r.dataset));
            const cellWord = r.grid.layout === 'corridor' ? 'segments' : 'cells';
            return (
              <li key={r.id} className={cx('border-b border-line last:border-b-0 px-3 py-2 transition-colors', sel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_#ff4d55]' : 'hover:bg-white/[0.02]')}>
                <button className="w-full text-left" onClick={() => onSelect(r.id)} title={qd.detail}>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Icon name={REASON_ICON[qd.reason]} size={11} className="text-alert shrink-0" />
                    <span className="text-alert font-semibold truncate">{qd.reason}</span>
                    {r.critical && <span className="text-warn text-[10.5px] shrink-0">· critical</span>}
                    <span className="ml-auto num text-[10.5px] text-dim shrink-0" title={`Quarantined ${fmtStamp(qd.at, tz)}`}>
                      {fmtRel(qd.at, now)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5 min-w-0">
                    <span className="num text-[11.5px] text-white truncate">{r.dataset}</span>
                    <span className="num text-[10.5px] text-dim shrink-0">
                      {m?.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·')} · {u?.callsign}
                    </span>
                  </div>
                  <div className="num text-[10.5px] text-dim mt-0.5 truncate">
                    held at {failed ? failed.key : 'validation'} · {flagged} flagged {cellWord} · {r.sizeGb} GB
                  </div>
                </button>
                <div className="flex items-center gap-1 mt-1.5">
                  <button className="btn h-6 px-2 text-[10px]" onClick={() => actions.resolveQuarantine(r.id, 'reprocess')} title="Re-queue the failed step with corrected parameters">
                    Re-process
                  </button>
                  {rfl ? (
                    <span className="h-6 px-2 inline-flex items-center gap-1 text-[10.5px] text-live" title={`${rfl.code} · ${rfl.name}`}>
                      <Icon name="plane-takeoff" size={11} /> <span className="num">{rfl.code.replace(/^RFL-\d{4}-/, 'RFL·')}</span>
                    </span>
                  ) : (
                    <button className="btn h-6 px-2 text-[10px]" onClick={() => actions.resolveQuarantine(r.id, 'reflight')} title={`Create a high-priority re-flight request mission covering the ${flagged} flagged ${cellWord}`}>
                      Re-flight <span className="num opacity-70">{flagged}</span>
                    </button>
                  )}
                  <button className="btn h-6 px-2 text-[10px] border-transparent text-muted hover:!border-warn hover:!text-warn" onClick={() => actions.resolveQuarantine(r.id, 'accept')} title="Release with a documented exception (audit-logged)">
                    Accept
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
