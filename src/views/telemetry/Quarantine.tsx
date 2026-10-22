import type { Mission, PipelineRun, QuarantineReason, Unit } from '../../types';
import { actions } from '../../store';
import { Badge, Empty, Icon, Panel, Stamp, cx, type IconName } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
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
  const reflights = [...missionById.values()].filter((x) => x.code.startsWith('RFL'));
  const q = runs.filter((r) => r.quarantine).sort((a, b) => b.quarantine!.at - a.quarantine!.at);
  return (
    <Panel
      title="Quarantined Datasets"
      index="B"
      icon="shield-alert"
      className={cx('h-full', q.length > 0 && '!border-alert/40')}
      bodyClassName="overflow-auto"
      actions={q.length > 0 ? <Badge tone="alert" solid>{q.length} held</Badge> : <Badge tone="ok">clear</Badge>}
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
            return (
              <li key={r.id} className={cx('border-b border-line last:border-b-0 px-3 py-2.5 transition-colors', sel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_#ff4d55]' : 'hover:bg-white/[0.02]')}>
                <button className="w-full text-left" onClick={() => onSelect(r.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="alert">
                      <Icon name={REASON_ICON[qd.reason]} size={10} /> {qd.reason}
                    </Badge>
                    {r.critical && <Badge tone="warn">critical</Badge>}
                    {rfl && (
                      <Badge tone="live" title={rfl.name}>
                        <Icon name="plane-takeoff" size={10} /> {rfl.code}
                      </Badge>
                    )}
                    <span className="ml-auto num text-[10.5px] text-dim" title="Time quarantined">
                      <Stamp ts={qd.at} /> · {fmtRel(qd.at, now)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="num text-[11.5px] text-white">{r.dataset}</span>
                    <span className="num text-[10.5px] text-dim">
                      {m?.code} · {u?.callsign}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-muted mt-1 leading-snug">{qd.detail}</p>
                  <div className="num text-[10.5px] text-dim mt-1">
                    held at {failed ? failed.key : 'validation'} · {flagged} flagged {r.grid.layout === 'corridor' ? 'segments' : 'cells'} · {r.sizeGb} GB
                  </div>
                </button>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button className="btn h-6 px-2 text-[10px]" onClick={() => actions.resolveQuarantine(r.id, 'reprocess')} title="Re-queue the failed step with corrected parameters">
                    <Icon name="refresh-cw" size={11} /> Re-process
                  </button>
                  <button className="btn h-6 px-2 text-[10px]" disabled={!!rfl} onClick={() => actions.resolveQuarantine(r.id, 'reflight')} title="Create a high-priority re-flight request mission covering the flagged cells">
                    <Icon name="plane-takeoff" size={11} /> {rfl ? 'Re-flight requested' : `Request re-flight · ${flagged} cells`}
                  </button>
                  <button className="btn h-6 px-2 text-[10px] hover:!border-warn hover:!text-warn" onClick={() => actions.resolveQuarantine(r.id, 'accept')} title="Release with a documented exception (audit-logged)">
                    <Icon name="file-check" size={11} /> Accept w/ exception
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
