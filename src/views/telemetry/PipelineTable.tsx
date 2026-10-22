import type { Mission, MissionType, PipelineRun, Unit } from '../../types';
import { MISSION_PROFILES, MISSION_TYPES } from '../../data/catalog';
import { Badge, Empty, Icon, Panel, Select, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
import { MiniStepper } from './Stepper';
import { RUN_STATE, qaTone, runState, type RunState } from './shared';

export type RunFilter = RunState | 'all';

export function PipelineTable({
  runs,
  allCount,
  missionById,
  unitById,
  now,
  selectedId,
  onSelect,
  status,
  setStatus,
  type,
  setType,
}: {
  runs: PipelineRun[];
  allCount: number;
  missionById: Map<string, Mission>;
  unitById: Map<string, Unit>;
  now: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  status: RunFilter;
  setStatus: (s: RunFilter) => void;
  type: MissionType | 'all';
  setType: (t: MissionType | 'all') => void;
}) {
  return (
    <Panel
      title="Pipeline Run Status"
      index="A"
      icon="git-branch"
      subtitle={`${runs.length} of ${allCount} runs`}
      className="h-full"
      bodyClassName="flex flex-col min-h-0"
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'running', label: 'Processing' },
              { value: 'quarantined', label: 'Quarantined' },
              { value: 'signoff', label: 'Awaiting sign-off' },
              { value: 'published', label: 'Published' },
              { value: 'queued', label: 'Queued' },
            ]}
          />
          <Select value={type} onChange={setType} options={[{ value: 'all', label: 'All mission types' }, ...MISSION_TYPES.map((t) => ({ value: t, label: MISSION_PROFILES[t].short }))]} />
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-auto">
        {runs.length === 0 ? (
          <Empty icon="funnel" text="No pipeline runs match these filters" />
        ) : (
          <table className="tbl text-[11.5px]">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Mission</th>
                <th>Unit</th>
                <th>Steps · Ingest → Validate → Process → QA → Publish</th>
                <th>State</th>
                <th className="text-right">Size</th>
                <th className="text-right">QA</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const m = missionById.get(r.missionId);
                const u = unitById.get(r.unitId);
                const st = RUN_STATE[runState(r)];
                const sel = r.id === selectedId;
                const prof = m ? MISSION_PROFILES[m.type] : undefined;
                return (
                  <tr key={r.id} onClick={() => onSelect(r.id)} className={cx('cursor-pointer', sel && 'bg-white/[0.06]')} aria-selected={sel}>
                    <td className="max-w-[210px]" style={sel ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined}>
                      <div className="num text-[11px] text-white truncate" title={r.dataset}>
                        {r.dataset}
                      </div>
                      <div className="text-[10.5px] text-dim truncate flex items-center gap-1">
                        {r.critical && <Icon name="shield-alert" size={10} className="text-warn" />}
                        {r.processingLabel}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="num text-[11px] text-text">{m?.code ?? '—'}</div>
                      {prof && (
                        <div className="text-[10.5px] flex items-center gap-1" style={{ color: prof.color }}>
                          <Icon name={prof.icon} size={10} /> {prof.short}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-text font-semibold text-[11px]">{u?.callsign ?? '—'}</td>
                    <td className="py-2">
                      <MiniStepper run={r} now={now} />
                    </td>
                    <td>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="num text-right whitespace-nowrap text-muted">{r.sizeGb < 1 ? r.sizeGb.toFixed(1) : Math.round(r.sizeGb)} GB</td>
                    <td className={cx('num text-right', r.qaScore !== undefined ? TONE_TEXT[qaTone(r.qaScore)] : 'text-dim')}>{r.qaScore !== undefined ? r.qaScore.toFixed(1) : '—'}</td>
                    <td className="whitespace-nowrap">
                      <Stamp ts={r.createdAt} />
                      <div className="num text-[10.5px] text-dim">{fmtRel(r.createdAt, now)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
