// Mission Control — prioritized work queue (missions, requests, flags, fleet).
// Compact two-line rows; actions surface on hover / selection; filters live
// behind a single Filter button.
import { useMemo, useState, type ReactNode } from 'react';
import { actions, useOps, useOpsState } from '../../store';
import { useConflicts, useMissionHealth } from '../../hooks';
import { AIRFRAME, MISSION_HEALTH, MISSION_PROFILES, MISSION_STATUS, MISSION_TYPES, PAYLOAD_META, PRIORITY, REGION, REGIONS, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { CONFLICT_LABEL } from '../../engine/conflicts';
import { Empty, Icon, cx, type IconName, type Tone } from '../../ui/kit';
import { fmtDur, fmtRel } from '../../lib/time';
import type { Mission, MissionHealth, MissionType, Priority, RegionId } from '../../types';
import { calState, missionRank, slaText, type QueueState, type QueueTab } from './util';
import { HeadButton } from './Dock';

const PRI_STRIPE: Record<Priority, string> = { urgent: TONE_COLOR.alert, high: TONE_COLOR.warn, routine: 'rgba(255,255,255,0.16)' };

interface FleetIssue {
  unitId: string;
  tone: Tone;
  icon: IconName;
  text: string;
}

interface FlagItem {
  id: string;
  tone: Tone;
  kind: string;
  title: string;
  detail: string;
  missionId?: string;
  unitId?: string;
  view?: string;
}

export interface QueueData {
  missions: Mission[];
  completed: Mission[];
  requests: Mission[];
  flags: FlagItem[];
  fleet: FleetIssue[][];
  counts: Record<QueueTab, number>;
  health: Record<string, MissionHealth>;
}

/** All queue lists and counts for the current filters (shared by the queue and its rail). */
export function useQueueData(queue: QueueState): QueueData {
  const S = useOpsState();
  const health = useMissionHealth();
  const conflicts = useConflicts();
  const now = S.now;
  const minute = Math.floor(now / 60_000);

  const filtered = useMemo(() => {
    return S.missions.filter(
      (m) =>
        (queue.type === 'all' || m.type === queue.type) &&
        (queue.priority === 'all' || m.priority === queue.priority) &&
        (queue.region === 'all' || m.regionId === queue.region),
    );
  }, [S.missions, queue.type, queue.priority, queue.region]);

  const missions = useMemo(() => {
    let list = filtered.filter((m) => m.status !== 'request' && m.status !== 'completed');
    if (queue.status === 'active') list = list.filter((m) => m.status === 'active');
    if (queue.status === 'hold') list = list.filter((m) => m.status === 'hold-weather' || m.status === 'hold-airspace' || m.status === 'delayed');
    return list.sort(missionRank);
  }, [filtered, queue.status]);
  const completed = useMemo(() => filtered.filter((m) => m.status === 'completed'), [filtered]);
  const requests = useMemo(() => filtered.filter((m) => m.status === 'request').sort(missionRank), [filtered]);

  const flags = useMemo<FlagItem[]>(() => {
    const out: FlagItem[] = [];
    const scope = new Set(filtered.map((m) => m.id));
    const code = (id: string) => S.missions.find((x) => x.id === id)?.code ?? '';
    const seen = new Set<string>();
    for (const c of conflicts.filter((x) => x.blocking && x.missionIds.some((id) => scope.has(id)))) {
      const k = c.kind + c.missionIds.join() + c.title;
      if (seen.has(k)) continue;
      seen.add(k);
      const codes = c.missionIds.map(code).filter(Boolean);
      out.push({ id: c.id, tone: c.severity === 'critical' ? 'alert' : 'warn', kind: `${CONFLICT_LABEL[c.kind]}${codes.length ? ' · ' + codes.join(' + ') : ''}`, title: c.title, detail: c.resolution, missionId: c.missionIds[0] });
    }
    for (const m of filtered.filter((x) => x.status === 'hold-weather' || x.status === 'hold-airspace')) {
      if (out.some((f) => f.missionId === m.id)) continue;
      out.push({ id: 'hold-' + m.id, tone: 'warn', kind: m.status === 'hold-weather' ? 'Weather hold' : 'Airspace hold', title: `${m.code} ${m.name}`, detail: m.notes ?? 'Units returned to launch — resumes automatically when the window opens.', missionId: m.id });
    }
    for (const r of S.pipelines.filter((x) => x.quarantine)) {
      const m = S.missions.find((x) => x.id === r.missionId);
      if (m && !scope.has(m.id)) continue;
      out.push({ id: 'q-' + r.id, tone: 'alert', kind: 'Quarantined dataset', title: `${r.dataset} — ${r.quarantine!.reason}`, detail: r.quarantine!.detail, view: 'telemetry' });
    }
    for (const a of S.alerts.filter((x) => x.severity === 'critical').slice(0, 6)) {
      if (a.ref?.kind === 'mission' && !scope.has(a.ref.id)) continue;
      out.push({ id: 'al-' + a.id, tone: 'alert', kind: `Critical alert · ${fmtRel(a.ts, now)}`, title: a.text, detail: a.ref?.kind === 'unit' ? 'Inspect unit telemetry & fault log' : a.ref?.kind === 'mission' ? 'Open mission & assign unit' : 'Review', missionId: a.ref?.kind === 'mission' ? a.ref.id : undefined, unitId: a.ref?.kind === 'unit' ? a.ref.id : undefined });
    }
    const rank: Record<Tone, number> = { alert: 0, warn: 1, live: 2, ok: 3, idle: 4 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflicts, filtered, S.pipelines, S.alerts, minute]);

  const fleet = useMemo(() => {
    const groups: FleetIssue[][] = [];
    const regionOk = (baseId: string) => queue.region === 'all' || S.bases.find((b) => b.id === baseId)?.regionId === queue.region;
    for (const u of S.units) {
      if (!regionOk(u.baseId)) continue;
      const is: FleetIssue[] = [];
      if (u.contingency) is.push({ unitId: u.id, tone: 'alert', icon: 'siren', text: `Contingency ${u.contingency.action} → ${u.contingency.targetName}` });
      if (u.status === 'grounded') is.push({ unitId: u.id, tone: 'alert', icon: 'octagon-x', text: 'Grounded — not airworthy' });
      if (u.status === 'maintenance') is.push({ unitId: u.id, tone: 'warn', icon: 'wrench', text: `In maintenance · back ${u.busyUntil > now ? fmtRel(u.busyUntil, now) : 'pending sign-off'}` });
      if (u.energyPct < 30) is.push({ unitId: u.id, tone: u.energyPct < 20 ? 'alert' : 'warn', icon: 'battery-low', text: `Energy ${Math.round(u.energyPct)}%${u.status === 'charging' ? ' · charging' : ''}` });
      for (const f of u.faults.filter((x) => x.active && x.severity !== 'info')) is.push({ unitId: u.id, tone: f.severity === 'critical' ? 'alert' : 'warn', icon: 'triangle-alert', text: `${f.code} · ${f.text}` });
      if (u.airframeHrs >= u.nextServiceHrs - 5 && u.status !== 'maintenance') is.push({ unitId: u.id, tone: 'warn', icon: 'clock', text: `Service due in ${Math.max(0, u.nextServiceHrs - u.airframeHrs).toFixed(1)} h` });
      for (const pid of u.payloadIds) {
        const p = S.payloads.find((x) => x.id === pid);
        if (!p) continue;
        const cs = calState(p, now);
        if (cs === 'expired') is.push({ unitId: u.id, tone: 'alert', icon: PAYLOAD_META[p.type].icon, text: `${PAYLOAD_META[p.type].short} ${p.serial} calibration expired ${fmtDur(now - p.calDue)} ago` });
        else if (cs === 'due-soon') is.push({ unitId: u.id, tone: 'warn', icon: PAYLOAD_META[p.type].icon, text: `${PAYLOAD_META[p.type].short} ${p.serial} calibration due in ${fmtDur(p.calDue - now)}` });
      }
      if (is.length) groups.push(is);
    }
    const score = (g: FleetIssue[]) => g.reduce((a, i) => a + (i.tone === 'alert' ? 10 : i.tone === 'warn' ? 3 : 1), 0);
    return groups.sort((a, b) => score(b) - score(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.units, S.payloads, minute, queue.region]);

  const counts: Record<QueueTab, number> = {
    all: missions.length + requests.length,
    missions: missions.length,
    requests: requests.length,
    flags: flags.length,
    fleet: fleet.length,
  };
  return { missions, completed, requests, flags, fleet, counts, health };
}

// ── rows ────────────────────────────────────────────────────────────────────
function SlaTag({ due, now }: { due: number; now: number }) {
  const sla = slaText(due, now);
  return (
    <span className={cx('num text-[10.5px] shrink-0 tabular-nums', sla.late ? 'text-alert font-semibold' : sla.soon ? 'text-warn' : 'text-dim')} title={`SLA ${sla.late ? 'breached' : 'due'} ${fmtRel(due, now)}`}>
      {sla.text}
    </span>
  );
}

function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center h-[15px] px-1 text-[8.5px] font-semibold uppercase tracking-[0.08em] border shrink-0 leading-none" style={{ color: TONE_COLOR[tone], borderColor: TONE_COLOR[tone] + '55', background: TONE_COLOR[tone] + '12' }}>
      {children}
    </span>
  );
}

/** Small action that appears on hover / selection, floated over the row's right edge. */
function RowAction({ label, onClick, show, solid }: { label: string; onClick: () => void; show: boolean; solid?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      tabIndex={show ? 0 : -1}
      className={cx(
        'absolute right-2 bottom-[7px] h-[20px] px-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] border transition-opacity shadow-[-14px_0_10px_-2px_rgba(40,40,40,0.95)]',
        solid ? 'bg-white text-ink border-white hover:bg-[#e6e6e6]' : 'bg-card-2 text-text border-line-2 hover:border-white/60',
        show ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
      )}
    >
      {label} <span className="font-mono">→</span>
    </button>
  );
}

function MissionRow({ m, now, health, selected, onOpen }: { m: Mission; now: number; health?: MissionHealth; selected: boolean; onOpen: (id: string) => void }) {
  const units = useOps((s) => s.units);
  const prof = MISSION_PROFILES[m.type];
  const st = MISSION_STATUS[m.status];
  const h = MISSION_HEALTH[health ?? 'nominal'];
  const isReq = m.status === 'request';
  const live = m.status === 'active' || m.status === 'hold-weather' || m.status === 'hold-airspace';
  const callsigns = m.assignedUnitIds.map((id) => units.find((u) => u.id === id)?.callsign).filter(Boolean) as string[];
  const done = m.status === 'completed';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => actions.selectMission(m.id)}
      onKeyDown={(e) => e.key === 'Enter' && actions.selectMission(m.id)}
      data-mission={m.id}
      aria-current={selected || undefined}
      className={cx('group relative pl-3 pr-2.5 pt-[7px] pb-[8px] border-b border-line cursor-pointer transition-colors outline-none', selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035] focus-visible:bg-white/[0.04]', done && 'opacity-60')}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: PRI_STRIPE[m.priority] }} title={PRIORITY[m.priority].label} />
      {selected && <span className="absolute right-0 top-0 bottom-0 w-[2px] bg-white" />}
      <div className="flex items-center gap-1.5 min-w-0 h-4">
        <Icon name={prof.icon} size={12} style={{ color: prof.color }} className="shrink-0" />
        <span className="num text-[10.5px] text-muted truncate">{m.code}</span>
        {isReq ? <StatusTag tone={PRIORITY[m.priority].tone}>{m.priority === 'urgent' ? 'Urgent' : PRIORITY[m.priority].label}</StatusTag> : <StatusTag tone={st.tone}>{st.label}</StatusTag>}
        {!done && !isReq && health && health !== 'nominal' && <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: h.color }} title={`Health: ${h.label}`} />}
        <span className="ml-auto" />
        <SlaTag due={m.slaDue} now={now} />
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0 mt-[3px]">
        <span className={cx('text-[12px] font-semibold truncate min-w-0', selected ? 'text-white' : 'text-text')} title={m.name}>
          {m.name}
        </span>
        <span className="text-[10.5px] text-dim shrink-0 truncate max-w-[45%]">{REGION[m.regionId].name}</span>
      </div>
      {selected && (
        <div className="flex items-center gap-2 mt-1.5 h-[20px] pr-[92px] text-[10.5px] min-w-0">
          {live && <span className="num text-muted shrink-0">{Math.round(m.progress * 100)}%</span>}
          {callsigns.length > 0 ? (
            <span className="num text-live/90 truncate" title={callsigns.join(', ')}>
              {callsigns.join(' · ')}
            </span>
          ) : (
            <span className="text-dim truncate">
              {m.subtype} · {m.workload} {prof.unit}
            </span>
          )}
        </div>
      )}
      {!done && <RowAction label={isReq ? 'Assign' : 'Details'} solid={isReq && selected} show={selected} onClick={() => onOpen(m.id)} />}
      {live && (
        <span className="absolute left-[3px] right-0 bottom-0 h-[2px] bg-white/[0.06]" aria-hidden>
          <span className="block h-full" style={{ width: `${Math.round(m.progress * 100)}%`, background: h.color }} />
        </span>
      )}
    </div>
  );
}

function FlagRow({ f }: { f: FlagItem }) {
  const go = () => {
    if (f.missionId) actions.selectMission(f.missionId);
    else if (f.unitId) actions.selectUnit(f.unitId);
    else if (f.view) location.hash = '#/' + f.view;
  };
  return (
    <button onClick={go} className="group relative w-full text-left pl-3 pr-2.5 pt-[7px] pb-[8px] border-b border-line hover:bg-white/[0.035] transition-colors" title={`${f.title}\n→ ${f.detail}`}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: TONE_COLOR[f.tone] }} />
      <div className="flex items-center gap-1.5 h-4 min-w-0">
        <span className="label text-[9px] truncate" style={{ color: TONE_COLOR[f.tone] }}>
          {f.kind}
        </span>
        <Icon name={f.view && !f.missionId ? 'arrow-up-right' : 'chevron-right'} size={12} className="ml-auto shrink-0 text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="text-[12px] font-semibold text-text truncate mt-[3px]">{f.title}</div>
      <div className="text-[10.5px] text-dim truncate mt-[1px]">
        <span className="font-mono">→</span> {f.detail}
      </div>
    </button>
  );
}

function FleetRow({ issues, selected }: { issues: FleetIssue[]; selected: boolean }) {
  const units = useOps((s) => s.units);
  const u = units.find((x) => x.id === issues[0].unitId)!;
  const worst: Tone = issues.some((i) => i.tone === 'alert') ? 'alert' : issues.some((i) => i.tone === 'warn') ? 'warn' : 'idle';
  const st = UNIT_STATUS[u.status];
  const top = issues[0];
  return (
    <button
      onClick={() => actions.selectUnit(u.id)}
      className={cx('relative w-full text-left pl-3 pr-2.5 pt-[7px] pb-[8px] border-b border-line transition-colors', selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]')}
      title={issues.map((i) => i.text).join('\n')}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: TONE_COLOR[worst] }} />
      {selected && <span className="absolute right-0 top-0 bottom-0 w-[2px] bg-white" />}
      <div className="flex items-center gap-1.5 h-4 min-w-0">
        <span className="text-[12px] font-bold text-white shrink-0">{u.callsign}</span>
        <span className="num text-[10px] text-dim truncate">{AIRFRAME[u.modelId].name}</span>
        <span className="ml-auto" />
        <StatusTag tone={st.tone}>{st.label.split(' / ')[0]}</StatusTag>
      </div>
      <div className="flex items-center gap-1.5 mt-[3px] text-[10.5px] min-w-0" style={{ color: top.tone === 'idle' ? '#b4b4b4' : TONE_COLOR[top.tone] }}>
        <Icon name={top.icon} size={11} className="shrink-0" />
        <span className="truncate">{top.text}</span>
        {issues.length > 1 && <span className="num text-dim shrink-0 ml-auto">+{issues.length - 1}</span>}
      </div>
    </button>
  );
}

function GroupHead({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 h-6 bg-card-2 border-b border-line label text-[9px]">
      {children}
      {count !== undefined && <span className="num ml-auto">{count}</span>}
    </div>
  );
}

function FilterSelect<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="grid grid-cols-[56px_1fr] items-center gap-2">
      <span className="label text-[9px]">{label}</span>
      <span className="relative min-w-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          aria-label={label}
          className={cx('field w-full h-[26px] text-[11px] pl-2 pr-6 appearance-none cursor-pointer truncate', value !== 'all' && 'border-white/60 text-white')}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-card">
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
      </span>
    </label>
  );
}

const STATUS_LABEL: Record<Exclude<QueueState['status'], 'all'>, string> = { active: 'Active missions', hold: 'Holds & delays', late: 'Late missions' };

export function WorkQueue({
  queue,
  setQueue,
  data,
  onOpenMission,
  onCollapse,
  overlay,
}: {
  queue: QueueState;
  setQueue: (q: Partial<QueueState>) => void;
  data: QueueData;
  onOpenMission: (id: string) => void;
  onCollapse: () => void;
  overlay: boolean;
}) {
  const now = useOps((s) => s.now);
  const sel = useOps((s) => s.selectedMissionId);
  const selU = useOps((s) => s.selectedUnitId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { missions, completed, requests, flags, fleet, counts, health } = data;

  const tabs: { id: QueueTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'missions', label: 'Missions' },
    { id: 'requests', label: 'Requests' },
    { id: 'flags', label: 'Flags' },
    { id: 'fleet', label: 'Fleet' },
  ];

  const nFilters = (queue.type !== 'all' ? 1 : 0) + (queue.priority !== 'all' ? 1 : 0) + (queue.region !== 'all' ? 1 : 0) + (queue.status !== 'all' ? 1 : 0);
  const showStatus = queue.status !== 'all' && (queue.tab === 'missions' || queue.tab === 'all');
  const row = (m: Mission) => <MissionRow key={m.id} m={m} now={now} health={health[m.id]} selected={sel === m.id} onOpen={onOpenMission} />;

  return (
    <section className="flex flex-col min-h-0 h-full bg-card" aria-label="Work queue">
      <header className="flex items-center gap-2 pl-3 pr-1.5 h-10 border-b border-line shrink-0">
        <span className="idx">01 ·</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] truncate">Work queue</h3>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={cx('ml-auto h-[24px] px-2 flex items-center gap-1.5 text-[10.5px] font-semibold border transition-colors', filtersOpen || nFilters ? 'border-white/50 text-white' : 'border-line-2 text-muted hover:text-white hover:border-white/40')}
          aria-expanded={filtersOpen}
          title="Filter by type, priority and region"
        >
          <Icon name="funnel" size={11} />
          Filter
          {nFilters > 0 && <span className="num text-[9.5px] min-w-[14px] h-[14px] px-[3px] flex items-center justify-center bg-white text-ink leading-none">{nFilters}</span>}
        </button>
        <HeadButton icon={overlay ? 'x' : 'chevron-left'} label={overlay ? 'Close work queue (Esc)' : 'Collapse work queue'} onClick={onCollapse} />
      </header>
      {filtersOpen && (
        <div className="px-3 py-2 border-b border-line shrink-0 grid gap-1.5 bg-white/[0.015]">
          <FilterSelect<MissionType | 'all'>
            label="Type"
            value={queue.type}
            onChange={(type) => setQueue({ type })}
            options={[{ value: 'all', label: 'All types' }, ...MISSION_TYPES.map((t) => ({ value: t, label: MISSION_PROFILES[t].label }))]}
          />
          <FilterSelect<Priority | 'all'>
            label="Priority"
            value={queue.priority}
            onChange={(priority) => setQueue({ priority })}
            options={[{ value: 'all', label: 'All priorities' }, ...(['urgent', 'high', 'routine'] as Priority[]).map((p) => ({ value: p, label: PRIORITY[p].label }))]}
          />
          <FilterSelect<RegionId | 'all'>
            label="Region"
            value={queue.region}
            onChange={(region) => setQueue({ region })}
            options={[{ value: 'all', label: 'All regions' }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-dim">
            {(['urgent', 'high', 'routine'] as Priority[]).map((p) => (
              <span key={p} className="flex items-center gap-1" title="Row edge colour = priority">
                <i className="w-[3px] h-2.5" style={{ background: PRI_STRIPE[p] }} />
                {PRIORITY[p].label}
              </span>
            ))}
            {nFilters > 0 && (
              <button className="ml-auto text-muted hover:text-white flex items-center gap-1" onClick={() => setQueue({ type: 'all', priority: 'all', region: 'all', status: 'all' })}>
                <Icon name="x" size={11} /> Clear all
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-stretch border-b border-line shrink-0 px-1 overflow-x-auto" role="tablist" aria-label="Work queue">
        {tabs.map((t) => {
          const on = queue.tab === t.id;
          const n = counts[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setQueue({ tab: t.id, status: t.id === 'missions' || t.id === 'all' ? queue.status : 'all' })}
              className={cx('relative flex-auto flex items-center justify-center gap-1 h-8 px-1 text-[11px] font-semibold whitespace-nowrap transition-colors', on ? 'text-white' : 'text-dim hover:text-muted')}
            >
              {t.label}
              <span className={cx('num text-[10px]', on ? 'text-muted' : 'text-dim', t.id === 'flags' && n > 0 && !on && 'text-alert/80')}>{n}</span>
              {on && <span className="absolute left-1 right-1 bottom-[-1px] h-[2px]" style={{ background: 'var(--view-accent, #5cc3ba)' }} />}
            </button>
          );
        })}
      </div>
      {showStatus && (
        <div className="flex items-center gap-2 px-3 h-7 border-b border-line text-[10.5px] text-muted shrink-0">
          <Icon name="funnel" size={11} className="text-dim" />
          {STATUS_LABEL[queue.status as Exclude<QueueState['status'], 'all'>]}
          <button className="ml-auto text-dim hover:text-white" onClick={() => setQueue({ status: 'all' })} aria-label="Clear status filter" title="Clear">
            <Icon name="x" size={11} />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto" data-queue>
        {queue.tab === 'all' && (
          <>
            {requests.length > 0 && <GroupHead count={requests.length}>Open requests</GroupHead>}
            {requests.map(row)}
            {missions.length > 0 && <GroupHead count={missions.length}>Missions</GroupHead>}
            {missions.map(row)}
            {!requests.length && !missions.length && <Empty icon="funnel" text="No work items match the filters" />}
          </>
        )}
        {queue.tab === 'missions' && (
          <>
            {missions.map(row)}
            {!missions.length && <Empty icon="funnel" text="No missions match the filters" />}
            {completed.length > 0 && queue.status === 'all' && (
              <>
                <GroupHead count={completed.length}>Completed</GroupHead>
                {completed.map(row)}
              </>
            )}
          </>
        )}
        {queue.tab === 'requests' && (
          <>
            {requests.map(row)}
            {!requests.length && <Empty text="No open requests" sub="All incoming requests are planned" />}
          </>
        )}
        {queue.tab === 'flags' && (
          <>
            {flags.map((f) => (
              <FlagRow key={f.id} f={f} />
            ))}
            {!flags.length && <Empty text="No blocking flags" sub="Schedule, data pipeline and alerts are clear" />}
          </>
        )}
        {queue.tab === 'fleet' && (
          <>
            {fleet.map((g) => (
              <FleetRow key={g[0].unitId} issues={g} selected={selU === g[0].unitId} />
            ))}
            {!fleet.length && <Empty text="Every unit is serviceable" />}
          </>
        )}
      </div>
    </section>
  );
}
