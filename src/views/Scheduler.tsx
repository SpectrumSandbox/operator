// View 03 · Scheduler & Airspace — the planner's main workspace.
import { useCallback, useMemo, useState } from 'react';
import { actions, useOpsState } from '../store';
import { detectConflicts, type Conflict } from '../engine/conflicts';
import { Icon, SectionTitle, Segmented, Tabs, cx } from '../ui/kit';
import { KpiCell, KpiStrip } from './analytics/parts';
import { HOUR, MIN, startOfDay, startOfHour } from '../lib/time';
import { buildGantt, calendarDays, isOpen } from './scheduler/model';
import { Gantt, GanttLegend, type FocusRequest, type Lens } from './scheduler/Gantt';
import { CalendarView } from './scheduler/Calendar';
import { ConflictsPanel } from './scheduler/ConflictsPanel';
import { ProposalReview } from './scheduler/ProposalReview';
import { MissionDrawer } from './scheduler/MissionDrawer';
import { EtaEngineTab } from './scheduler/EtaEngine';
import { AirspaceTab } from './scheduler/Airspace';
import { TipLayer } from './scheduler/shared';

type Tab = 'gantt' | 'calendar' | 'eta' | 'airspace';

export function SchedulerView() {
  const S = useOpsState();
  const [tab, setTab] = useState<Tab>('gantt');
  const [horizon, setHorizon] = useState<24 | 72 | 168>(72);
  const [lens, setLens] = useState<Lens>('all');
  const [openConflict, setOpenConflict] = useState<string | undefined>();
  const [focus, setFocus] = useState<FocusRequest | undefined>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(() => window.innerWidth >= 1600);
  const [blockingOnly, setBlockingOnly] = useState(false);

  const minute = Math.floor(S.now / MIN);
  const nowMin = minute * MIN;
  const conflicts = detectConflicts(S);

  const t0 = startOfHour(nowMin) - 6 * HOUR;
  const t1 = startOfHour(nowMin) + (horizon + 1) * HOUR;

  const missionSig = S.missions.map((m) => `${m.id}${m.status}${m.scheduledStart}${m.scheduledEnd}${m.assignedUnitIds.join()}${m.crewIds.join()}${m.payloadIds.join()}${m.progress.toFixed(2)}`).join('|');
  const unitSig = S.units.map((u) => u.status[0] + (u.missionId ?? '')).join();
  const model = useMemo(
    () => buildGantt(S, conflicts, t1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, t1, missionSig, unitSig, conflicts, S.permits, S.calBookings, S.proposal, S.weatherSeverity, S.masterVersion, S.payloads],
  );

  const day0 = startOfDay(nowMin, S.tz);
  const calDays = useMemo(
    () => (tab === 'calendar' ? calendarDays(S, conflicts, day0, 14) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, Math.floor(minute / 5), day0, missionSig, conflicts, S.weatherSeverity, S.masterVersion],
  );
  const openMissions = useMemo(() => S.missions.filter(isOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionSig]);

  const select = useCallback((id: string) => actions.selectMission(id), []);
  const onGanttConflict = useCallback((c: Conflict) => {
    actions.selectMission(c.missionIds[0]);
    setOpenConflict(c.id);
    // Open the engine on wide screens; on narrow ones the mission drawer below already lists the conflicts.
    if (window.innerWidth >= 1280) setConflictsOpen(true);
  }, []);
  const focusConflict = useCallback((c: Conflict) => {
    actions.selectMission(c.missionIds[0]);
    setOpenConflict(c.id);
    if (tab !== 'gantt' && tab !== 'calendar') setTab('gantt');
    setFocus({ missionId: c.missionIds[0], t: c.from, nonce: Date.now() });
  }, [tab]);
  const selectFromElsewhere = useCallback((id: string) => {
    actions.selectMission(id);
    setTab('gantt');
    const m = S.missions.find((x) => x.id === id);
    setFocus({ missionId: id, t: m?.scheduledStart ?? S.now, nonce: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionSig]);

  const propose = () => {
    actions.runAutoPropose();
    setReviewOpen(true);
  };

  // Headline figures (recalculate with weather severity, schedule and clearances).
  const kpis = useMemo(() => {
    let wxNoGo = 0;
    let wxTotal = 0;
    for (const r of model.rows.missions) {
      const m = r.mission!;
      for (const w of r.wx ?? []) {
        const a = Math.max(w.from, m.scheduledStart, nowMin);
        const b = Math.min(w.to, m.scheduledEnd);
        if (b <= a || w.cls === 'dark') continue;
        wxTotal += b - a;
        if (w.cls === 'nogo') wxNoGo += b - a;
      }
    }
    const notamHits = model.rows.missions.filter((r) => r.notams?.some((z) => z.activeFrom! < r.mission!.scheduledEnd && z.activeTo! > Math.max(nowMin, r.mission!.scheduledStart))).length;
    const clearanceGap = model.rows.missions.filter((r) => r.permitNeeded && (!r.permit || r.permit.status !== 'approved')).length;
    return { wxNoGo, wxTotal, notamHits, clearanceGap };
  }, [model, nowMin]);

  const sev = S.weatherSeverity;
  const sevLabel = sev < 0.5 ? 'Calm' : sev < 1.5 ? 'Forecast' : 'Severe';
  const sevColor = sev < 0.5 ? '#3ccf6e' : sev < 1.5 ? '#e8a33a' : '#ff4d55';
  const blocking = conflicts.filter((c) => c.blocking).length;
  const selected = S.selectedMissionId && S.missions.some((m) => m.id === S.selectedMissionId && m.status !== 'completed') ? S.selectedMissionId : undefined;

  const unassigned = model.rows.missions.filter((r) => !r.mission!.assignedUnitIds.length).length;
  const activeN = model.rows.missions.filter((r) => r.mission!.status === 'active').length;
  const showBlocking = () => {
    setConflictsOpen(true);
    setBlockingOnly(true);
    if (tab !== 'gantt' && tab !== 'calendar') setTab('gantt');
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <TipLayer />
      <SectionTitle
        index="03"
        title="Scheduling & Airspace"
        subtitle="Multi-resource timeline · conflict detection · AI optimizer · Deployment ETA"
        right={
          <>
            <label className="flex items-center gap-2 h-8 px-2.5 border border-line bg-bg-deep" title="Weather scenario — recalculates weather bands, conflicts and ETAs">
              <span style={{ color: sevColor }} className="flex shrink-0">
                <Icon name={sev < 0.5 ? 'sun' : sev < 1.5 ? 'cloud-rain' : 'cloud-lightning'} size={13} />
              </span>
              <input type="range" min={0} max={2} step={0.1} value={sev} onChange={(e) => actions.setWeatherSeverity(+e.target.value)} className="w-[80px]" aria-label="Weather severity" />
              <span className="num text-[11px] w-[76px] whitespace-nowrap" style={{ color: sevColor }}>
                {sevLabel} {sev.toFixed(1)}
              </span>
            </label>
            <button className="btn btn-solid h-8" onClick={propose}>
              <Icon name="sparkles" size={13} /> Auto-Propose
            </button>
          </>
        }
      />

      {S.proposal && !reviewOpen && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 px-3 py-1.5 border border-white/25 bg-white/[0.04] text-[12px]">
          <Icon name="sparkles" size={13} className="text-white" />
          <span className="text-white font-semibold">AI proposal ready</span>
          <span className="text-muted num">
            {S.proposal.items.filter((i) => i.changed).length} changes · blocking {S.proposal.stats.conflictsBefore} → {S.proposal.stats.conflictsAfter} · SLA {S.proposal.stats.slaMet}/{S.proposal.stats.slaTotal}
          </span>
          <span className="text-dim hidden 2xl:inline">Dashed outlines show proposed slots.</span>
          <span className="ml-auto flex gap-1.5">
            <button className="btn h-7" onClick={() => actions.dismissProposal()}>Dismiss</button>
            <button className="btn btn-solid h-7" onClick={() => setReviewOpen(true)}>Review</button>
          </span>
        </div>
      )}

      <KpiStrip className="mb-3">
        <KpiCell label="open missions" value={model.rows.missions.length} title={`${activeN} active · ${unassigned} unassigned`} extra={unassigned ? <span className="num text-[10.5px] text-warn">{unassigned} unassigned</span> : undefined} />
        <KpiCell label="blocking conflicts" value={blocking} tone={blocking ? 'alert' : 'ok'} title={`${conflicts.length} conflicts detected in total — click to list blocking ones`} onClick={showBlocking} />
        <KpiCell label="clearance gaps" value={kpis.clearanceGap} tone={kpis.clearanceGap ? 'alert' : undefined} title="Permit required but missing, pending or expired" />
        <KpiCell label="no-go wx in windows" value={(kpis.wxNoGo / HOUR).toFixed(0)} unit="h" tone={kpis.wxNoGo > 0 ? 'warn' : undefined} title={`${kpis.wxTotal ? Math.round((kpis.wxNoGo / kpis.wxTotal) * 100) : 0}% of scheduled operable hours are no-go`} />
        <KpiCell label="NOTAM overlaps" value={kpis.notamHits} tone={kpis.notamHits ? 'alert' : undefined} title="Missions intersecting a NOTAM / TFR no-fly window" hide="lg" />
        <KpiCell label="AI accepted today" value={`${S.aiToday.accepted}/${S.aiToday.accepted + S.aiToday.overridden}`} title={`${S.aiToday.overridden} operator overrides today`} hide="xl" />
      </KpiStrip>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-line mb-3">
        <Tabs<Tab>
          className="border-b-0 -mb-px"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'gantt', label: 'Timeline', icon: 'chart-gantt' },
            { id: 'calendar', label: 'Calendar', icon: 'calendar-days' },
            { id: 'eta', label: 'Deployment ETA', icon: 'timer' },
            { id: 'airspace', label: 'Airspace & Permits', icon: 'shield', count: S.permits.filter((p) => p.status !== 'approved').length || undefined },
          ]}
        />
        {tab === 'gantt' && (
          <div className="ml-auto flex items-center gap-3 pb-1.5 flex-wrap">
            <Segmented<Lens>
              value={lens}
              onChange={setLens}
              options={[
                { value: 'all', label: 'All', title: 'Missions and resources' },
                { value: 'missions', label: 'Missions' },
                { value: 'resources', label: 'Assets & crew' },
              ]}
            />
            <span className="w-px h-4 bg-line" />
            <Segmented<24 | 72 | 168>
              value={horizon}
              onChange={setHorizon}
              options={[
                { value: 24, label: '24 h', title: 'Now −6 h → +24 h' },
                { value: 72, label: '3 d', title: 'Now −6 h → +3 d' },
                { value: 168, label: '7 d', title: 'Now −6 h → +7 d' },
              ]}
            />
          </div>
        )}
        {tab === 'calendar' && (
          <div className="ml-auto pb-2 text-[11px] text-dim" title="Weather risk = share of no-go daylight site-hours">
            14 days · <span className="num">{openMissions.length}</span> open missions
          </div>
        )}
      </div>

      {(tab === 'gantt' || tab === 'calendar') && (
        <div className="flex items-start gap-3">
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <section className="panel min-w-0">
              <header className="flex items-center gap-2 px-3 h-9 border-b border-line">
                <span className="idx">03.1 ·</span>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em]">{tab === 'gantt' ? 'Timeline' : 'Mission calendar'}</h3>
                <span className="ml-auto text-[10.5px] text-dim hidden md:inline">Click a bar for details</span>
              </header>
              {tab === 'gantt' ? (
                <>
                  <Gantt model={model} t0={t0} t1={t1} horizonH={horizon} now={nowMin} tz={S.tz} lens={lens} selectedId={selected} focus={focus} onSelect={select} onConflict={onGanttConflict} />
                  <div className="px-3 py-1.5 border-t border-line">
                    <GanttLegend />
                  </div>
                </>
              ) : (
                <CalendarView days={calDays} missions={openMissions} now={nowMin} tz={S.tz} selectedId={selected} onSelect={select} />
              )}
            </section>
            {selected && <MissionDrawer S={S} missionId={selected} conflicts={conflicts} openConflictId={openConflict} onOpenConflict={setOpenConflict} onClose={() => actions.selectMission(undefined)} />}
          </div>
          {conflictsOpen ? (
            <>
              <div className="xl:hidden fixed inset-0 top-12 z-[1400] bg-black/45" onClick={() => setConflictsOpen(false)} aria-hidden />
              <ConflictsPanel
                className="w-[340px] 2xl:w-[360px] shrink-0 xl:sticky xl:top-0 xl:max-h-[calc(100vh-88px)] max-xl:fixed max-xl:right-0 max-xl:top-12 max-xl:bottom-0 max-xl:z-[1500] max-xl:max-w-[100vw] max-xl:shadow-2xl"
                conflicts={conflicts}
                missions={S.missions}
                now={S.now}
                selectedId={selected}
                openId={openConflict}
                onOpen={setOpenConflict}
                onFocus={(c) => {
                  focusConflict(c);
                  if (window.innerWidth < 1280) setConflictsOpen(false);
                }}
                blockingOnly={blockingOnly}
                setBlockingOnly={setBlockingOnly}
                onCollapse={() => setConflictsOpen(false)}
              />
            </>
          ) : (
            <button
              onClick={() => setConflictsOpen(true)}
              className="panel shrink-0 w-8 self-stretch max-h-[calc(100vh-88px)] sticky top-0 flex flex-col items-center gap-2 py-2.5 hover:bg-white/[0.04] transition-colors"
              title="Show conflict engine"
              aria-label={`Show conflict engine — ${blocking} blocking of ${conflicts.length}`}
              aria-expanded={false}
            >
              <Icon name="chevron-left" size={13} className="text-dim" />
              <span className={cx('num text-[11px] font-semibold', blocking ? 'text-alert' : 'text-ok')}>{blocking}</span>
              <span className="text-[10.5px] text-muted [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">Conflicts · {conflicts.length}</span>
            </button>
          )}
        </div>
      )}

      {tab === 'eta' && <EtaEngineTab S={S} selectedId={selected} onSelect={select} />}
      {tab === 'airspace' && <AirspaceTab S={S} onSelect={selectFromElsewhere} onPropose={propose} />}

      <ProposalReview open={reviewOpen && !!S.proposal} onClose={() => setReviewOpen(false)} S={S} />
    </div>
  );
}
