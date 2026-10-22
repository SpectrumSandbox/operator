import { useState } from 'react';
import type { Mission, PipelineRun } from '../../types';
import { APPROVERS, MISSION_PROFILES } from '../../data/catalog';
import { actions } from '../../store';
import { Empty, Icon, Panel, TONE_TEXT, cx } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
import { qaDone, qaTone } from './shared';
import { InfoTip } from '../analytics/parts';

export function SignoffQueue({ runs, missionById, now, onSelect, selectedId }: { runs: PipelineRun[]; missionById: Map<string, Mission>; now: number; onSelect: (id: string) => void; selectedId?: string }) {
  const queue = runs
    .filter((r) => r.signoff.required && !(r.signoff.first && r.signoff.second))
    .sort((a, b) => Number(qaDone(b)) - Number(qaDone(a)) || Number(!!b.signoff.first) - Number(!!a.signoff.first) || a.createdAt - b.createdAt);
  const ready = queue.filter((r) => qaDone(r) && !r.quarantine).length;

  return (
    <Panel
      title="Dual sign-off"
      index="D"
      className="h-full"
      bodyClassName="overflow-auto"
      actions={
        <span className="flex items-center gap-2 text-[10.5px] text-dim">
          <span>
            <span className="num text-warn">{ready}</span> ready of <span className="num text-text">{queue.length}</span>
          </span>
          <InfoTip text="Critical epochs and client deliverables publish to the client portal only after two different approvers sign. The publish step stays locked until both signatures are recorded." />
        </span>
      }
    >
      {queue.length === 0 ? (
        <Empty icon="circle-check" text="No deliverables awaiting sign-off" />
      ) : (
        <ul>
          {queue.map((r) => (
            <SignRow key={r.id} run={r} mission={missionById.get(r.missionId)} now={now} onSelect={onSelect} selected={r.id === selectedId} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SignRow({ run: r, mission: m, now, onSelect, selected }: { run: PipelineRun; mission?: Mission; now: number; onSelect: (id: string) => void; selected: boolean }) {
  const first = r.signoff.first;
  const options = APPROVERS.filter((a) => a !== first?.by);
  const [who, setWho] = useState<string>(options[0]);
  const approver = options.includes(who) ? who : options[0];
  const ready = qaDone(r) && !r.quarantine;
  const prof = m ? MISSION_PROFILES[m.type] : undefined;

  return (
    <li className={cx('px-3 py-2 border-b border-line last:border-b-0', selected && 'bg-white/[0.05]')} style={selected ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined}>
      <button className="w-full text-left" onClick={() => onSelect(r.id)}>
        <div className="flex items-center gap-2">
          <span className="num text-[11.5px] text-white truncate min-w-0">{r.dataset}</span>
          {r.critical && <span className="text-[10.5px] text-warn shrink-0">critical</span>}
          <span className={cx('ml-auto num text-[11px] whitespace-nowrap shrink-0', r.qaScore !== undefined ? TONE_TEXT[qaTone(r.qaScore)] : 'text-dim')}>{r.qaScore !== undefined ? `QA ${r.qaScore.toFixed(1)}` : 'QA pending'}</span>
        </div>
        <div className="text-[10.5px] text-dim mt-0.5">
          <span className="num">{m?.code}</span>
          {prof && <span style={{ color: prof.color }}> · {prof.short}</span>} · {r.processingLabel}
        </div>
      </button>

      <div className="flex items-center gap-3 mt-1.5 text-[10.5px]">
        <span className={cx('flex items-center gap-1 min-w-0', first ? 'text-ok' : 'text-dim')} title={first ? `First approver: ${first.by} · ${fmtRel(first.at, now)}` : 'First approver pending'}>
          <Icon name={first ? 'circle-check' : 'circle-dot'} size={11} className="shrink-0" />
          <span className="truncate">{first ? first.by : '1st pending'}</span>
        </span>
        <span className="flex items-center gap-1 text-dim" title={first ? 'Second approver must be a different person' : 'After first signature'}>
          <Icon name="circle-dot" size={11} />
          2nd pending
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <select
          value={approver}
          onChange={(e) => setWho(e.target.value)}
          className="field flex-1 min-w-[150px] text-[11px] h-6"
          aria-label="Approver"
          disabled={!ready}
        >
          {options.map((a) => (
            <option key={a} value={a} className="bg-card">
              {a}
            </option>
          ))}
        </select>
        <button
          className={cx('btn h-6 px-2 text-[10px] shrink-0', ready && 'btn-solid')}
          disabled={!ready}
          onClick={() => actions.signoff(r.id, approver)}
          title={ready ? undefined : r.quarantine ? 'Dataset is quarantined — resolve before sign-off' : 'Automated QA scoring must finish before sign-off'}
        >
          {first ? 'Sign 2nd' : 'Sign 1st'}
        </button>
      </div>
      {!ready && <div className="text-[10.5px] text-dim mt-1">{r.quarantine ? 'Quarantined — resolve before sign-off' : 'Awaiting QA score'}</div>}
    </li>
  );
}
