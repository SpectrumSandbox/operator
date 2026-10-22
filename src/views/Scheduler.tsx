// View 03 · Scheduler & Airspace — the planner's main workspace.
import { useCallback, useMemo, useState } from 'react';
import { actions, useOpsState } from '../store';
import { detectConflicts, type Conflict } from '../engine/conflicts';
import { Icon, Kpi, SectionTitle, Segmented, Tabs, cx } from '../ui/kit';
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

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <TipLayer />
      <SectionTitle
        index="03"
        title="Mission & Resource Scheduling + Airspace Clearance"
        subtitle="Multi-resource timeline with weather, clearance and NOTAM overlays · automated conflict detection · AI schedule optimizer · deterministic Deployment ETA engine."
        right={
          <>
            <div className="flex items-center gap-2 h-8 px-2.5 border border-line-2 bg-bg-deep" title="Weather scenario — recalculates weather bands, conflicts and ETAs">
              <span style={{ color: sevColor }} className="flex shrink-0">
                <Icon name={sev < 0.5 ? 'sun' : sev < 1.5 ? 'cloud-rain' : 'cloud-lightning'} size={13} />
              </span>
              <span className="label">Weather</span>
              <input type="range" min={0} max={2} step={0.1} value={sev} onChange={(e) => actions.setWeatherSeverity(+e.target.value)} className="w-[96px]" aria-label="Weather severity" />
              <span className="num text-[11px] font-semibold w-[88px] whitespace-nowrap" style={{ color: sevColor }}>
                {sevLabel} {sev.toFixed(1)}
              </span>
            </div>
            <button className="btn btn-solid h-8" onClick={propose}>
              <Icon name="sparkles" size={13} /> Auto-Propose Schedule
            </button>
          </>
        }
      />

      {S.proposal && !reviewOpen && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 border border-white/30 bg-white/[0.04] text-[12px]">
          <Icon name="sparkles" size={14} className="text-white" />
          <span className="text-white font-semibold">AI proposal ready</span>
          <span className="text-muted num">
            {S.proposal.items.filter((i) => i.changed).length} changes · blocking {S.proposal.stats.conflictsBefore} → {S.proposal.stats.conflictsAfter} · SLA {S.proposal.stats.slaMet}/{S.proposal.stats.slaTotal}
          </span>
          <span className="text-dim hidden lg:inline">Dashed outlines on the timeline show proposed slots.</span>
          <button className="btn h-7 ml-auto" onClick={() => actions.dismissProposal()}>Dismiss</button>
          <button className="btn btn-solid h-7" onClick={() => setReviewOpen(true)}>Review proposal</button>
        </div>
      )}

      <div className="panel grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-3">
        <Kpi label="Open missions" value={model.rows.missions.length} icon="clipboard-list" sub={`${model.rows.missions.filter((r) => r.mission!.status === 'active').length} active · ${model.rows.missions.filter((r) => !r.mission!.assignedUnitIds.length).length} unassigned`} />
        <Kpi label="Blocking conflicts" value={blocking} tone={blocking ? 'alert' : 'ok'} icon="octagon-alert" sub={`${conflicts.length} detected in total`} />
        <Kpi label="No-go weather in windows" value={(kpis.wxNoGo / HOUR).toFixed(0)} unit="h" tone={kpis.wxNoGo > 0 ? 'warn' : 'ok'} icon="cloud-lightning" sub={`${kpis.wxTotal ? Math.round((kpis.wxNoGo / kpis.wxTotal) * 100) : 0}% of scheduled operable hours`} />
        <Kpi label="Clearance gaps" value={kpis.clearanceGap} tone={kpis.clearanceGap ? 'alert' : 'ok'} icon="file-check" sub="missing / pending / expired" />
        <Kpi label="NOTAM / TFR overlaps" value={kpis.notamHits} tone={kpis.notamHits ? 'alert' : 'ok'} icon="ban" sub="missions intersecting a no-fly window" />
        <Kpi label="AI decisions today" value={`${S.aiToday.accepted}/${S.aiToday.accepted + S.aiToday.overridden}`} icon="sparkles" sub={`${S.aiToday.overridden} operator overrides`} />
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-line mb-3">
        <Tabs<Tab>
          className="border-b-0 -mb-px"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'gantt', label: 'Gantt Timeline', icon: 'chart-gantt' },
            { id: 'calendar', label: 'Calendar', icon: 'calendar-days' },
            { id: 'eta', label: 'Deployment ETA Engine', icon: 'timer' },
            { id: 'airspace', label: 'Airspace & Permits', icon: 'shield', count: S.permits.filter((p) => p.status !== 'approved').length || undefined },
          ]}
        />
        {tab === 'gantt' && (
          <div className="ml-auto flex items-center gap-3 pb-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="label">View</span>
              <Segmented<Lens>
                value={lens}
                onChange={setLens}
                options={[
                  { value: 'all', label: 'All resources' },
                  { value: 'missions', label: 'Missions' },
                  { value: 'resources', label: 'Assets & crew' },
                ]}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="label">Horizon</span>
              <Segmented<24 | 72 | 168>
                value={horizon}
                onChange={setHorizon}
                options={[
                  { value: 24, label: '24 h' },
                  { value: 72, label: '3 d' },
                  { value: 168, label: '7 d' },
                ]}
              />
            </div>
          </div>
        )}
        {tab === 'calendar' && (
          <div className="ml-auto pb-2 text-[11px] text-dim">
            14 days from today · <span className="num">{openMissions.length}</span> open missions · weather risk = share of no-go daylight site-hours
          </div>
        )}
      </div>

      {(tab === 'gantt' || tab === 'calendar') && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_380px] gap-3 items-start">
          <div className="flex flex-col gap-3 min-w-0">
            <section className="panel min-w-0">
              <header className="flex items-center gap-2 px-3 h-10 border-b border-line">
                <span className="idx">03.1 ·</span>
                <Icon name={tab === 'gantt' ? 'chart-gantt' : 'calendar-days'} size={13} className="text-muted" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em]">{tab === 'gantt' ? 'Multi-resource timeline' : 'Mission calendar'}</h3>
                <span className="text-[11px] text-dim hidden md:inline">
                  {tab === 'gantt' ? <>now −6 h → +{horizon === 168 ? '7 d' : horizon === 72 ? '3 d' : '24 h'} · {S.tz}</> : <>{S.tz}</>}
                </span>
                <span className={cx('ml-auto num text-[11px]', blocking ? 'text-alert' : 'text-ok')}>
                  <Icon name={blocking ? 'triangle-alert' : 'shield-check'} size={11} className="inline -mt-0.5 mr-1" />
                  {blocking} blocking
                </span>
              </header>
              {tab === 'gantt' ? (
                <>
                  <Gantt model={model} t0={t0} t1={t1} horizonH={horizon} now={nowMin} tz={S.tz} lens={lens} selectedId={selected} focus={focus} onSelect={select} onConflict={onGanttConflict} />
                  <div className="px-3 py-2 border-t border-line">
                    <GanttLegend />
                  </div>
                </>
              ) : (
                <CalendarView days={calDays} missions={openMissions} now={nowMin} tz={S.tz} selectedId={selected} onSelect={select} />
              )}
            </section>
            {selected && <MissionDrawer S={S} missionId={selected} conflicts={conflicts} openConflictId={openConflict} onOpenConflict={setOpenConflict} onClose={() => actions.selectMission(undefined)} />}
            {!selected && (
              <div className="panel px-3 py-3 text-[11.5px] text-dim flex items-center gap-2">
                <Icon name="info" size={13} /> Select a mission bar to open its detail drawer — conflicts with resolutions, ±1 h shift and the Deployment ETA calculator.
              </div>
            )}
          </div>
          <ConflictsPanel className="xl:sticky xl:top-0 xl:max-h-[86vh] min-w-0" conflicts={conflicts} missions={S.missions} now={S.now} selectedId={selected} openId={openConflict} onOpen={setOpenConflict} onFocus={focusConflict} />
        </div>
      )}

      {tab === 'eta' && <EtaEngineTab S={S} selectedId={selected} onSelect={select} />}
      {tab === 'airspace' && <AirspaceTab S={S} onSelect={selectFromElsewhere} onPropose={propose} />}

      <ProposalReview open={reviewOpen && !!S.proposal} onClose={() => setReviewOpen(false)} S={S} />
    </div>
  );
}
