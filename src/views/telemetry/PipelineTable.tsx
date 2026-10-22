import type { Mission, MissionType, PipelineRun, Unit } from '../../types';
import { MISSION_PROFILES, MISSION_TYPES } from '../../data/catalog';
import { Empty, Panel, Select, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { StatusText } from '../fleet/shared';
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
      title="Pipeline runs"
      index="A"
      className="h-full @container"
      bodyClassName="flex flex-col min-h-0"
      actions={
        <div className="flex items-center gap-2">
          <span className="num text-[10.5px] text-dim mr-1">{runs.length === allCount ? allCount : `${runs.length} / ${allCount}`}</span>
          <Select
            className="[&_select]:h-6 [&_select]:text-[11px]"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All states' },
              { value: 'running', label: 'Processing' },
              { value: 'quarantined', label: 'Quarantined' },
              { value: 'signoff', label: 'Awaiting sign-off' },
              { value: 'published', label: 'Published' },
              { value: 'queued', label: 'Queued' },
            ]}
          />
          <Select className="[&_select]:h-6 [&_select]:text-[11px] max-sm:hidden" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...MISSION_TYPES.map((t) => ({ value: t, label: MISSION_PROFILES[t].short }))]} />
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-auto">
        {runs.length === 0 ? (
          <Empty icon="funnel" text="No pipeline runs match these filters" />
        ) : (
          <table className="tbl text-[11.5px] [&_td]:whitespace-nowrap">
            <thead>
              <tr>
                <th>Dataset</th>
                <th className="@max-[760px]:hidden">Mission</th>
                <th className="@max-[900px]:hidden">Unit</th>
                <th>Pipeline</th>
                <th>State</th>
                <th className="text-right @max-[620px]:hidden">Size</th>
                <th className="text-right">QA</th>
                <th className="text-right @max-[1000px]:hidden">Created</th>
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
                    <td className="max-w-[220px] truncate" style={sel ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined} title={`${r.dataset} · ${r.processingLabel}${r.critical ? ' · critical deliverable' : ''}`}>
                      <span className="num text-[11px] text-white">{r.dataset}</span>
                      {r.critical && <span className="text-[10px] text-warn ml-1.5" title="Critical deliverable — dual sign-off">●</span>}
                    </td>
                    <td className="@max-[760px]:hidden" title={m ? `${m.name} · ${prof?.short}` : undefined}>
                      {prof && <i className="inline-block w-1.5 h-1.5 mr-1.5 align-middle" style={{ background: prof.color }} />}
                      <span className="num text-[11px] text-muted">{m?.code ?? '—'}</span>
                    </td>
                    <td className="text-muted text-[11px] @max-[900px]:hidden">{u?.callsign ?? '—'}</td>
                    <td>
                      <MiniStepper run={r} now={now} />
                    </td>
                    <td>
                      <StatusText tone={st.tone} label={st.label} />
                    </td>
                    <td className="num text-right text-muted @max-[620px]:hidden">{r.sizeGb < 1 ? r.sizeGb.toFixed(1) : Math.round(r.sizeGb)} GB</td>
                    <td className={cx('num text-right', r.qaScore !== undefined ? (qaTone(r.qaScore) === 'ok' ? 'text-text' : TONE_TEXT[qaTone(r.qaScore)]) : 'text-dim')}>{r.qaScore !== undefined ? r.qaScore.toFixed(1) : '—'}</td>
                    <td className="num text-right text-dim text-[11px] @max-[1000px]:hidden" title={fmtRel(r.createdAt, now)}>
                      <Stamp ts={r.createdAt} />
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
