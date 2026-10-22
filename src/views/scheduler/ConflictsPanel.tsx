// Automated Conflict Detection Engine — grouped, filterable, actionable.
import { useMemo, useState } from 'react';
import { CONFLICT_LABEL, type Conflict, type ConflictKind } from '../../engine/conflicts';
import type { Mission } from '../../types';
import { Empty, Icon, Panel, Toggle, cx } from '../../ui/kit';
import { fmtDur } from '../../lib/time';
import { CONFLICT_ORDER } from './shared';

export function ConflictsPanel({
  conflicts,
  missions,
  now,
  selectedId,
  openId,
  onOpen,
  onFocus,
  className,
  blockingOnly,
  setBlockingOnly,
  onCollapse,
}: {
  conflicts: Conflict[];
  missions: Mission[];
  now: number;
  selectedId?: string;
  openId?: string;
  onOpen: (id?: string) => void;
  onFocus: (c: Conflict) => void;
  className?: string;
  blockingOnly: boolean;
  setBlockingOnly: (v: boolean) => void;
  onCollapse?: () => void;
}) {
  const [onlySelected, setOnlySelected] = useState(false);
  const code = (id: string) => missions.find((m) => m.id === id)?.code ?? id;

  const list = useMemo(() => conflicts.filter((c) => (!blockingOnly || c.blocking) && (!onlySelected || !selectedId || c.missionIds.includes(selectedId))), [conflicts, blockingOnly, onlySelected, selectedId]);
  const groups = useMemo(() => {
    const g = new Map<ConflictKind, Conflict[]>();
    for (const c of list) g.set(c.kind, [...(g.get(c.kind) ?? []), c]);
    return CONFLICT_ORDER.filter((k) => g.has(k)).map((k) => ({ kind: k, items: g.get(k)!.sort((a, b) => Number(b.blocking) - Number(a.blocking) || (a.severity === 'critical' ? -1 : 1)) }));
  }, [list]);
  const blocking = conflicts.filter((c) => c.blocking).length;
  const critical = conflicts.filter((c) => c.severity === 'critical').length;

  return (
    <Panel
      title="Conflicts"
      index="03.2"
      className={className}
      bodyClassName="flex flex-col min-h-0"
      actions={
        onCollapse && (
          <button onClick={onCollapse} className="text-dim hover:text-white p-0.5" title="Collapse conflict engine" aria-label="Collapse conflict engine" aria-expanded>
            <Icon name="chevron-right" size={14} />
          </button>
        )
      }
    >
      <div className="flex items-center gap-3 px-3 h-8 border-b border-line shrink-0 text-[11px] num">
        <span className={blocking ? 'text-alert' : 'text-ok'}>
          {blocking} <span className="font-sans text-dim">blocking</span>
        </span>
        <span className={critical ? 'text-alert' : 'text-dim'}>
          {critical} <span className="font-sans text-dim">critical</span>
        </span>
        <span className="text-warn">
          {conflicts.length - blocking} <span className="font-sans text-dim">advisory</span>
        </span>
      </div>
      <div className="flex items-center gap-3 px-3 py-0.5 border-b border-line shrink-0">
        <Toggle checked={blockingOnly} onChange={setBlockingOnly} label="Blocking only" color="#ff4d55" />
        <Toggle checked={onlySelected} onChange={setOnlySelected} label="Selected mission" disabled={!selectedId} />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {groups.length === 0 && <Empty icon="shield-check" text={blockingOnly ? 'No blocking conflicts' : 'Schedule is conflict-free'} sub="Detector re-runs every 5 sim-minutes and on every schedule change." />}
        {groups.map((g) => (
          <div key={g.kind}>
            <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 h-6 bg-card-2 border-b border-line">
              <span className="text-[10.5px] font-semibold text-muted">{CONFLICT_LABEL[g.kind]}</span>
              <span className="num text-[10px] text-dim ml-auto">{g.items.length}</span>
            </div>
            {g.items.map((c) => {
              const open = openId === c.id;
              const tone = c.severity === 'critical' ? 'alert' : 'warn';
              return (
                <div key={c.id} className={cx('border-b border-line transition-colors', open ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]', c.missionIds.includes(selectedId ?? '#') && 'border-l-2 border-l-[#c7c45d]')}>
                  <button className="w-full text-left px-3 py-1.5" onClick={() => onOpen(open ? undefined : c.id)}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cx('w-1.5 h-1.5 shrink-0', tone === 'alert' ? 'bg-alert' : 'bg-warn')} title={c.severity} />
                      {c.blocking && <span className="text-[10px] font-semibold text-alert">Blocking</span>}
                      {c.missionIds.map((id) => (
                        <span key={id} className="num text-[10px] text-muted">
                          {code(id)}
                        </span>
                      ))}
                      <span className="ml-auto num text-[10px] text-dim">{c.from > now ? `in ${fmtDur(c.from - now)}` : 'now'}</span>
                    </div>
                    <div className={cx('text-[12px] font-semibold mt-0.5 leading-snug', tone === 'alert' ? 'text-white' : 'text-text')} title={open ? undefined : c.detail}>
                      {c.title}
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-2.5 -mt-0.5">
                      <div className="text-[11px] text-muted leading-snug">{c.detail}</div>
                      <div className="mt-2 border border-live/30 bg-live-bg px-2.5 py-2">
                        <div className="label text-live flex items-center gap-1">
                          <Icon name="wrench" size={10} /> Resolution
                        </div>
                        <div className="text-[11.5px] text-white mt-0.5 leading-snug">{c.resolution}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {c.resource && (
                          <span className="text-[10.5px] text-dim">
                            {c.resource.kind}: <span className="text-muted">{c.resource.label}</span>
                          </span>
                        )}
                        <button className="btn h-6 ml-auto" onClick={() => onFocus(c)}>
                          <Icon name="crosshair" size={11} /> Show on timeline
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
