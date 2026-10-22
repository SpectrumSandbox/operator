import { useState } from 'react';
import type { Mission, PipelineRun } from '../../types';
import { APPROVERS, MISSION_PROFILES } from '../../data/catalog';
import { actions } from '../../store';
import { Badge, Empty, Icon, Panel, Stamp, TONE_TEXT, cx } from '../../ui/kit';
import { fmtRel } from '../../lib/time';
import { qaDone, qaTone } from './shared';

export function SignoffQueue({ runs, missionById, now, onSelect, selectedId }: { runs: PipelineRun[]; missionById: Map<string, Mission>; now: number; onSelect: (id: string) => void; selectedId?: string }) {
  const queue = runs
    .filter((r) => r.signoff.required && !(r.signoff.first && r.signoff.second))
    .sort((a, b) => Number(qaDone(b)) - Number(qaDone(a)) || Number(!!b.signoff.first) - Number(!!a.signoff.first) || a.createdAt - b.createdAt);
  const ready = queue.filter((r) => qaDone(r) && !r.quarantine).length;

  return (
    <Panel
      title="Dual-Approver Sign-off"
      index="D"
      icon="user-check"
      className="h-full"
      bodyClassName="overflow-auto"
      actions={
        <span className="text-[10.5px] text-dim">
          <span className="num text-warn">{ready}</span>/<span className="num text-text">{queue.length}</span> ready
        </span>
      }
    >
      <div className="px-3 py-2 border-b border-line text-[11px] text-muted flex items-start gap-2 bg-warn-bg/40">
        <Icon name="lock" size={12} className="text-warn mt-0.5 shrink-0" />
        <span>
          Critical epochs and client deliverables publish to the client portal only after <b className="text-text">two different approvers</b> sign. The publish step stays locked until both signatures are recorded.
        </span>
      </div>
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
    <li className={cx('px-3 py-2.5 border-b border-line last:border-b-0', selected && 'bg-white/[0.05]')} style={selected ? { boxShadow: 'inset 2px 0 0 var(--view-accent)' } : undefined}>
      <button className="w-full text-left" onClick={() => onSelect(r.id)}>
        <div className="flex items-center gap-2">
          <span className="num text-[11.5px] text-white truncate min-w-0">{r.dataset}</span>
          {r.critical && <Badge tone="warn" className="shrink-0">critical</Badge>}
          <span className={cx('ml-auto num text-[11px] whitespace-nowrap shrink-0', r.qaScore !== undefined ? TONE_TEXT[qaTone(r.qaScore)] : 'text-dim')}>{r.qaScore !== undefined ? `QA ${r.qaScore.toFixed(1)}` : 'QA pending'}</span>
        </div>
        <div className="text-[10.5px] text-dim mt-0.5">
          <span className="num">{m?.code}</span>
          {prof && <span style={{ color: prof.color }}> · {prof.short}</span>} · {r.processingLabel}
        </div>
      </button>

      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <div className={cx('border px-2 py-1.5', first ? 'border-ok/40 bg-ok-bg' : 'border-line')}>
          <div className="label text-[9px] flex items-center gap-1">
            <span className="num">1</span> First approver
          </div>
          {first ? (
            <>
              <div className="text-[11px] text-text truncate flex items-center gap-1">
                <Icon name="circle-check" size={11} className="text-ok shrink-0" />
                {first.by}
              </div>
              <div className="num text-[10px] text-dim">
                <Stamp ts={first.at} /> · {fmtRel(first.at, now)}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-dim">pending</div>
          )}
        </div>
        <div className="border border-dashed border-line-2 px-2 py-1.5">
          <div className="label text-[9px] flex items-center gap-1">
            <span className="num">2</span> Second approver
          </div>
          <div className="text-[11px] text-dim">{first ? 'pending — different person' : 'after first signature'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <select
          value={approver}
          onChange={(e) => setWho(e.target.value)}
          className="field flex-1 min-w-[170px] text-[11px] h-7"
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
          className={cx('btn h-7 px-2 text-[10px] shrink-0', ready && 'btn-solid')}
          disabled={!ready}
          onClick={() => actions.signoff(r.id, approver)}
          title={ready ? undefined : r.quarantine ? 'Dataset is quarantined — resolve before sign-off' : 'Automated QA scoring must finish before sign-off'}
        >
          <Icon name="file-check" size={11} /> {first ? 'Sign as second approver' : 'Sign as first approver'}
        </button>
      </div>
      {!ready && (
        <div className="text-[10.5px] text-dim mt-1.5 flex items-center gap-1">
          <Icon name="hourglass" size={10} /> {r.quarantine ? 'Quarantined — resolve before sign-off' : 'Awaiting automated QA score before sign-off'}
        </div>
      )}
      {ready && (
        <div className="text-[10.5px] text-warn mt-1.5 flex items-center gap-1">
          <Icon name="lock" size={10} /> Client portal publish gated — {first ? '1 of 2' : '0 of 2'} signatures
        </div>
      )}
    </li>
  );
}
