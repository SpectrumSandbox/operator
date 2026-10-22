// Mission Control — prioritized work queue (missions, requests, flags, fleet).
import { useMemo, type ReactNode } from 'react';
import { actions, useOps, useOpsState } from '../../store';
import { useConflicts, useMissionHealth } from '../../hooks';
import { AIRFRAME, MISSION_HEALTH, MISSION_PROFILES, MISSION_STATUS, MISSION_TYPES, PAYLOAD_META, PRIORITY, REGION, REGIONS, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { CONFLICT_LABEL } from '../../engine/conflicts';
import { Badge, Empty, Icon, Meter, cx, type IconName, type Tone } from '../../ui/kit';
import { fmtDur, fmtRel } from '../../lib/time';
import type { Mission, MissionType, Priority, RegionId } from '../../types';
import { calState, missionRank, slaText, type QueueState, type QueueTab } from './util';

const PRI_STRIPE: Record<Priority, string> = { urgent: TONE_COLOR.alert, high: TONE_COLOR.warn, routine: 'rgba(255,255,255,0.14)' };

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

function FilterSelect<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="relative flex-1 min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className={cx('field w-full h-[26px] text-[11px] pl-1.5 pr-5 appearance-none cursor-pointer truncate', value !== 'all' && 'border-white/60 text-white')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-card">
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
    </label>
  );
}

function MissionRow({ m, now, health, selected }: { m: Mission; now: number; health?: string; selected: boolean }) {
  const units = useOps((s) => s.units);
  const prof = MISSION_PROFILES[m.type];
  const st = MISSION_STATUS[m.status];
  const h = MISSION_HEALTH[(health ?? 'nominal') as keyof typeof MISSION_HEALTH];
  const sla = slaText(m.slaDue, now);
  const live = m.status === 'active' || m.status === 'hold-weather' || m.status === 'hold-airspace';
  const callsigns = m.assignedUnitIds.map((id) => units.find((u) => u.id === id)?.callsign).filter(Boolean) as string[];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => actions.selectMission(m.id)}
      onKeyDown={(e) => e.key === 'Enter' && actions.selectMission(m.id)}
      data-mission={m.id}
      className={cx('relative grid grid-cols-[3px_1fr] border-b border-line cursor-pointer transition-colors outline-none', selected ? 'bg-white/[0.07] shadow-[inset_-2px_0_0_#f2f2f2]' : 'hover:bg-white/[0.03] focus-visible:bg-white/[0.04]')}
    >
      <span style={{ background: PRI_STRIPE[m.priority] }} aria-label={PRIORITY[m.priority].label} />
      <div className="pl-2.5 pr-2.5 py-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center border" style={{ color: prof.color, borderColor: prof.color + '66', background: prof.color + '14' }} title={prof.label}>
            <Icon name={prof.icon} size={11} />
          </span>
          <span className="num text-[10.5px] text-muted truncate">{m.code}</span>
          {m.priority === 'urgent' && <span className="text-[9px] font-bold tracking-[0.1em] text-alert">URGENT</span>}
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            {m.status !== 'completed' && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: h.color }} title={`Health: ${h.label}`} />}
            <Badge tone={st.tone} className="h-[17px] px-1 text-[9px]">
              {st.label}
            </Badge>
          </span>
        </div>
        <div className={cx('text-[12px] font-semibold leading-snug mt-1 line-clamp-2', selected ? 'text-white' : 'text-text')}>{m.name}</div>
        <div className="flex items-center gap-2 mt-1 text-[10.5px] text-dim min-w-0">
          <span className="truncate">
            {REGION[m.regionId].name} · {m.subtype}
          </span>
          <span className={cx('ml-auto num shrink-0', sla.late ? 'text-alert font-semibold' : sla.soon ? 'text-warn' : 'text-muted')} title={`SLA due ${fmtRel(m.slaDue, now)}`}>
            <Icon name="timer" size={10} className="inline -mt-[2px] mr-0.5" />
            {sla.text}
          </span>
        </div>
        {(live || callsigns.length > 0) && (
          <div className="flex items-center gap-2 mt-1.5">
            {live ? (
              <>
                <Meter value={m.progress * 100} color={h.color} height={3} className="flex-1" />
                <span className="num text-[10px] text-muted w-8 text-right">{Math.round(m.progress * 100)}%</span>
              </>
            ) : (
              <span className="flex-1" />
            )}
            {callsigns.length > 0 && (
              <span className="num text-[10px] text-live/90 truncate max-w-[55%]" title={callsigns.join(', ')}>
                {callsigns.join(' · ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RequestRow({ m, now, selected }: { m: Mission; now: number; selected: boolean }) {
  const prof = MISSION_PROFILES[m.type];
  const sla = slaText(m.slaDue, now);
  return (
    <div className={cx('relative grid grid-cols-[3px_1fr] border-b border-line transition-colors', selected ? 'bg-white/[0.07] shadow-[inset_-2px_0_0_#f2f2f2]' : 'hover:bg-white/[0.03]')} data-mission={m.id}>
      <span style={{ background: PRI_STRIPE[m.priority] }} />
      <div className="pl-2.5 pr-2.5 py-2 min-w-0">
        <button className="block w-full text-left" onClick={() => actions.selectMission(m.id)}>
          <div className="flex items-center gap-1.5">
            <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center border" style={{ color: prof.color, borderColor: prof.color + '66', background: prof.color + '14' }}>
              <Icon name={prof.icon} size={11} />
            </span>
            <span className="num text-[10.5px] text-muted">{m.code}</span>
            <Badge tone={PRIORITY[m.priority].tone} className="ml-auto h-[17px] px-1 text-[9px]">
              {PRIORITY[m.priority].label}
            </Badge>
          </div>
          <div className="text-[12px] font-semibold text-text leading-snug mt-1">{m.name}</div>
          <div className="text-[10.5px] text-dim mt-0.5 truncate">
            {REGION[m.regionId].name} · {m.subtype} · {m.workload} {prof.unit}
          </div>
        </button>
        <div className="flex items-center mt-1.5">
          <span className={cx('num text-[10.5px]', sla.late ? 'text-alert font-semibold' : sla.soon ? 'text-warn' : 'text-muted')}>
            <Icon name="timer" size={10} className="inline -mt-[2px] mr-0.5" />
            SLA {sla.text}
          </span>
          <button className="ml-auto btn h-[22px] px-2 text-[10px]" onClick={() => actions.selectMission(m.id)}>
            Assign <span className="font-mono">→</span>
          </button>
        </div>
      </div>
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
    <button onClick={go} className="w-full text-left grid grid-cols-[3px_1fr] border-b border-line hover:bg-white/[0.03] transition-colors">
      <span style={{ background: TONE_COLOR[f.tone] }} />
      <div className="pl-2.5 pr-2.5 py-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="label text-[9px] truncate" style={{ color: TONE_COLOR[f.tone] }}>
            {f.kind}
          </span>
          {f.view && !f.missionId && <span className="ml-auto text-[10px] text-dim">Open {f.view} →</span>}
        </div>
        <div className="text-[12px] font-semibold text-text leading-snug mt-0.5">{f.title}</div>
        <div className="text-[10.5px] text-muted mt-0.5 leading-snug flex gap-1">
          <Icon name="arrow-right" size={10} className="shrink-0 mt-[2px] text-dim" />
          <span>{f.detail}</span>
        </div>
      </div>
    </button>
  );
}

function FleetRow({ issues, selected }: { issues: FleetIssue[]; selected: boolean }) {
  const units = useOps((s) => s.units);
  const u = units.find((x) => x.id === issues[0].unitId)!;
  const worst: Tone = issues.some((i) => i.tone === 'alert') ? 'alert' : issues.some((i) => i.tone === 'warn') ? 'warn' : 'idle';
  const st = UNIT_STATUS[u.status];
  return (
    <button onClick={() => actions.selectUnit(u.id)} className={cx('w-full text-left grid grid-cols-[3px_1fr] border-b border-line transition-colors', selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]')}>
      <span style={{ background: TONE_COLOR[worst] }} />
      <div className="pl-2.5 pr-2.5 py-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-white">{u.callsign}</span>
          <span className="num text-[10px] text-dim">{u.tail}</span>
          <Badge tone={st.tone} className="ml-auto h-[17px] px-1 text-[9px]">
            {st.label.split(' / ')[0]}
          </Badge>
        </div>
        <div className="text-[10.5px] text-dim truncate">{AIRFRAME[u.modelId].name}</div>
        <ul className="mt-1 space-y-0.5">
          {issues.map((i) => (
            <li key={i.text} className="flex items-start gap-1.5 text-[10.5px] leading-snug" style={{ color: i.tone === 'idle' ? '#b4b4b4' : TONE_COLOR[i.tone] }}>
              <Icon name={i.icon} size={11} className="shrink-0 mt-[1px]" />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
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

export function WorkQueue({ queue, setQueue }: { queue: QueueState; setQueue: (q: Partial<QueueState>) => void }) {
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

  const tabs: { id: QueueTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'missions', label: 'Missions', count: counts.missions },
    { id: 'requests', label: 'Requests', count: counts.requests },
    { id: 'flags', label: 'Flags', count: counts.flags },
    { id: 'fleet', label: 'Fleet', count: counts.fleet },
  ];

  const anyFilter = queue.type !== 'all' || queue.priority !== 'all' || queue.region !== 'all' || queue.status !== 'all';
  const sel = S.selectedMissionId;
  const selU = S.selectedUnitId;

  return (
    <section className="panel flex flex-col min-h-0 h-full border-t-0 border-l-0">
      <header className="flex items-center gap-2 px-3 h-9 border-b border-line shrink-0">
        <span className="idx">01 ·</span>
        <Icon name="list" size={13} className="text-muted" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em]">Work queue</h3>
        <span className="text-[10.5px] text-dim">priority · SLA</span>
        {anyFilter && (
          <button className="ml-auto text-[10.5px] text-muted hover:text-white flex items-center gap-1" onClick={() => setQueue({ type: 'all', priority: 'all', region: 'all', status: 'all' })}>
            <Icon name="x" size={11} /> Clear
          </button>
        )}
      </header>
      <div className="flex items-stretch border-b border-line shrink-0 px-1" role="tablist" aria-label="Work queue">
        {tabs.map((t) => {
          const on = queue.tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setQueue({ tab: t.id, status: t.id === 'missions' || t.id === 'all' ? queue.status : 'all' })}
              className={cx('relative flex-auto flex items-center justify-center gap-1 h-8 px-1 text-[11px] font-semibold whitespace-nowrap transition-colors', on ? 'text-white' : 'text-dim hover:text-muted')}
            >
              {t.label}
              <span className={cx('num text-[10px]', on ? 'text-text' : 'text-dim', t.id === 'flags' && t.count > 0 && !on && 'text-alert/80')}>{t.count}</span>
              {on && <span className="absolute left-1 right-1 bottom-[-1px] h-[2px]" style={{ background: 'var(--view-accent, #26d8d9)' }} />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1 px-2 py-1.5 border-b border-line shrink-0">
        <FilterSelect<MissionType | 'all'>
          label="Mission type"
          value={queue.type}
          onChange={(type) => setQueue({ type })}
          options={[{ value: 'all', label: 'All types' }, ...MISSION_TYPES.map((t) => ({ value: t, label: MISSION_PROFILES[t].short }))]}
        />
        <FilterSelect<Priority | 'all'>
          label="Priority"
          value={queue.priority}
          onChange={(priority) => setQueue({ priority })}
          options={[{ value: 'all', label: 'All priority' }, ...(['urgent', 'high', 'routine'] as Priority[]).map((p) => ({ value: p, label: PRIORITY[p].label }))]}
        />
        <FilterSelect<RegionId | 'all'>
          label="Region"
          value={queue.region}
          onChange={(region) => setQueue({ region })}
          options={[{ value: 'all', label: 'All regions' }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]}
        />
      </div>
      {queue.status !== 'all' && (queue.tab === 'missions' || queue.tab === 'all') && (
        <div className="flex items-center gap-2 px-3 h-7 border-b border-line text-[10.5px] text-muted shrink-0 bg-white/[0.02]">
          <Icon name="funnel" size={11} />
          {queue.status === 'active' ? 'Showing active missions' : queue.status === 'hold' ? 'Showing holds & delays' : 'Showing late missions'}
          <button className="ml-auto text-dim hover:text-white" onClick={() => setQueue({ status: 'all' })} aria-label="Clear status filter">
            <Icon name="x" size={11} />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto" data-queue>
        {queue.tab === 'all' && (
          <>
            {requests.length > 0 && <GroupHead count={requests.length}>Open requests</GroupHead>}
            {requests.map((m) => (
              <RequestRow key={m.id} m={m} now={now} selected={sel === m.id} />
            ))}
            {missions.length > 0 && <GroupHead count={missions.length}>Missions</GroupHead>}
            {missions.map((m) => (
              <MissionRow key={m.id} m={m} now={now} health={health[m.id]} selected={sel === m.id} />
            ))}
            {!requests.length && !missions.length && <Empty icon="funnel" text="No work items match the filters" />}
          </>
        )}
        {queue.tab === 'missions' && (
          <>
            {missions.map((m) => (
              <MissionRow key={m.id} m={m} now={now} health={health[m.id]} selected={sel === m.id} />
            ))}
            {!missions.length && <Empty icon="funnel" text="No missions match the filters" />}
            {completed.length > 0 && queue.status === 'all' && (
              <>
                <GroupHead count={completed.length}>Completed</GroupHead>
                {completed.map((m) => (
                  <MissionRow key={m.id} m={m} now={now} health={health[m.id]} selected={sel === m.id} />
                ))}
              </>
            )}
          </>
        )}
        {queue.tab === 'requests' && (
          <>
            {requests.map((m) => (
              <RequestRow key={m.id} m={m} now={now} selected={sel === m.id} />
            ))}
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
      <footer className="flex items-center gap-3 px-3 h-7 border-t border-line text-[10px] text-dim shrink-0">
        {(['urgent', 'high', 'routine'] as Priority[]).map((p) => (
          <span key={p} className="flex items-center gap-1">
            <i className="w-[3px] h-2.5" style={{ background: PRI_STRIPE[p] }} />
            {PRIORITY[p].label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="text-alert num">+</span>= SLA breached
        </span>
      </footer>
    </section>
  );
}
