// Automated Conflict Detection Engine — grouped, filterable, actionable.
import { useMemo, useState } from 'react';
import { CONFLICT_LABEL, type Conflict, type ConflictKind } from '../../engine/conflicts';
import type { Mission } from '../../types';
import { Badge, Empty, Icon, Panel, Toggle, cx } from '../../ui/kit';
import { fmtDur } from '../../lib/time';
import { CONFLICT_ICON, CONFLICT_ORDER } from './shared';

export function ConflictsPanel({ conflicts, missions, now, selectedId, openId, onOpen, onFocus, className }: { conflicts: Conflict[]; missions: Mission[]; now: number; selectedId?: string; openId?: string; onOpen: (id?: string) => void; onFocus: (c: Conflict) => void; className?: string }) {
  const [blockingOnly, setBlockingOnly] = useState(false);
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
      title="Conflict engine"
      index="03.2"
      icon="shield-alert"
      className={className}
      bodyClassName="flex flex-col min-h-0"
      actions={<span className="num text-[10.5px] text-dim">{conflicts.length} total</span>}
    >
      <div className="grid grid-cols-3 border-b border-line shrink-0">
        <Stat label="Blocking" value={blocking} tone={blocking ? 'text-alert' : 'text-ok'} />
        <Stat label="Critical" value={critical} tone={critical ? 'text-alert' : 'text-ok'} />
        <Stat label="Advisory" value={conflicts.length - blocking} tone="text-warn" />
      </div>
      <div className="flex items-center gap-3 px-3 py-1 border-b border-line shrink-0">
        <Toggle checked={blockingOnly} onChange={setBlockingOnly} label="Blocking only" color="#ff4d55" />
        <Toggle checked={onlySelected} onChange={setOnlySelected} label={<span>Selected mission</span>} disabled={!selectedId} />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {groups.length === 0 && <Empty icon="shield-check" text={blockingOnly ? 'No blocking conflicts' : 'Schedule is conflict-free'} sub="Detector re-runs every 5 sim-minutes and on every schedule change." />}
        {groups.map((g) => (
          <div key={g.kind}>
            <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 h-7 bg-card-2 border-b border-line">
              <Icon name={CONFLICT_ICON[g.kind]} size={12} className="text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text">{CONFLICT_LABEL[g.kind]}</span>
              <span className="num text-[10px] text-dim ml-auto">{g.items.length}</span>
            </div>
            {g.items.map((c) => {
              const open = openId === c.id;
              const tone = c.severity === 'critical' ? 'alert' : 'warn';
              return (
                <div key={c.id} className={cx('border-b border-line transition-colors', open ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]', c.missionIds.includes(selectedId ?? '#') && 'border-l-2 border-l-[#c7c45d]')}>
                  <button className="w-full text-left px-3 py-2" onClick={() => onOpen(open ? undefined : c.id)}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cx('w-1.5 h-1.5 shrink-0', tone === 'alert' ? 'bg-alert' : 'bg-warn')} />
                      {c.blocking && (
                        <Badge tone="alert" solid className="h-[16px] text-[9px] px-1">
                          Blocking
                        </Badge>
                      )}
                      {c.missionIds.map((id) => (
                        <span key={id} className="num text-[10px] text-muted">
                          {code(id)}
                        </span>
                      ))}
                      <span className="ml-auto num text-[10px] text-dim">{c.from > now ? `in ${fmtDur(c.from - now)}` : 'now'}</span>
                    </div>
                    <div className={cx('text-[12px] font-semibold mt-1 leading-snug', tone === 'alert' ? 'text-white' : 'text-text')}>{c.title}</div>
                    {!open && <div className="text-[11px] text-dim truncate mt-0.5">{c.detail}</div>}
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-3 py-1.5 border-r border-line last:border-r-0">
      <div className="label">{label}</div>
      <div className={cx('num text-[18px] font-semibold leading-tight', tone)}>{value}</div>
    </div>
  );
}
