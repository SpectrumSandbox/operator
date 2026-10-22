// 04 · Telemetry & QA Pipeline — post-flight processing, quarantine, spatial QA, dual sign-off, live telemetry.
import { useMemo, useState } from 'react';
import type { MissionType } from '../types';
import { MISSION_PROFILES } from '../data/catalog';
import { useOps } from '../store';
import { Badge, Icon, Kpi, Panel, SectionTitle, Stamp, TONE_TEXT, cx } from '../ui/kit';
import { startOfDay } from '../lib/time';
import { useTelemetryRing } from './fleet/shared';
import { PipelineTable, type RunFilter } from './telemetry/PipelineTable';
import { QuarantineQueue } from './telemetry/Quarantine';
import { QaGrid } from './telemetry/QaGrid';
import { SignoffQueue } from './telemetry/Signoff';
import { LiveStream } from './telemetry/LiveStream';
import { FullStepper } from './telemetry/Stepper';
import { RUN_STATE, qaTone, runState } from './telemetry/shared';

export function TelemetryView() {
  const now = useOps((s) => s.now);
  const tz = useOps((s) => s.tz);
  const pipelines = useOps((s) => s.pipelines);
  const missions = useOps((s) => s.missions);
  const units = useOps((s) => s.units);
  const ring = useTelemetryRing(units, now);

  const [status, setStatus] = useState<RunFilter>('all');
  const [type, setType] = useState<MissionType | 'all'>('all');
  const [selId, setSelId] = useState<string | undefined>(() => pipelines.find((r) => r.quarantine && r.grid.layout === 'grid')?.id ?? pipelines[0]?.id);

  const missionById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const kpi = useMemo(() => {
    const sod = startOfDay(now, tz);
    let running = 0,
      quarantined = 0,
      signoff = 0,
      published = 0,
      gb = 0;
    const qa: number[] = [];
    for (const r of pipelines) {
      const st = runState(r);
      if (st === 'running') running++;
      if (st === 'quarantined') quarantined++;
      if (st === 'signoff') signoff++;
      const pub = r.steps[4];
      if (pub.status === 'done' && (pub.endedAt ?? 0) >= sod) published++;
      if (r.qaScore !== undefined) qa.push(r.qaScore);
      gb += r.sizeGb;
    }
    return { running, quarantined, signoff, published, gb, qa: qa.length ? qa.reduce((a, b) => a + b, 0) / qa.length : NaN, qaN: qa.length };
  }, [pipelines, now, tz]);

  const order: Record<string, number> = { quarantined: 0, running: 1, signoff: 2, queued: 3, published: 4 };
  const runs = useMemo(
    () =>
      pipelines
        .filter((r) => (status === 'all' || runState(r) === status) && (type === 'all' || missionById.get(r.missionId)?.type === type))
        .sort((a, b) => order[runState(a)] - order[runState(b)] || b.createdAt - a.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pipelines, status, type, missionById],
  );
  const sel = pipelines.find((r) => r.id === selId);
  const selMission = sel ? missionById.get(sel.missionId) : undefined;
  const toggle = (s: RunFilter) => setStatus(status === s ? 'all' : s);

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <SectionTitle
        index="04"
        title="Data Processing, Telemetry & QA Monitor"
        subtitle="Post-flight and real-time data pipelines across every mission type — edge ingest, flight-log validation, mission processing, automated QA scoring and dual-approved client delivery."
      />

      <div className="panel grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 mb-3">
        <Kpi label="Runs in progress" value={kpi.running} tone="live" icon="cpu" onClick={() => toggle('running')} active={status === 'running'} sub="ingest → QA executing" />
        <Kpi label="Quarantined" value={kpi.quarantined} tone={kpi.quarantined ? 'alert' : 'ok'} icon="shield-alert" onClick={() => toggle('quarantined')} active={status === 'quarantined'} sub="held for operator action" />
        <Kpi label="Awaiting sign-off" value={kpi.signoff} tone={kpi.signoff ? 'warn' : 'ok'} icon="user-check" onClick={() => toggle('signoff')} active={status === 'signoff'} sub="dual approval gate" />
        <Kpi label="Published today" value={kpi.published} tone="ok" icon="external-link" onClick={() => toggle('published')} active={status === 'published'} sub="to client portal" />
        <Kpi label="Mean QA score" value={isFinite(kpi.qa) ? kpi.qa.toFixed(1) : '—'} tone={isFinite(kpi.qa) ? qaTone(kpi.qa) : undefined} icon="clipboard-check" sub={`${kpi.qaN} scored datasets`} />
        <Kpi label="Data volume" value={kpi.gb.toLocaleString('en-US', { maximumFractionDigits: 0 })} unit="GB" icon="hard-drive" sub={`${pipelines.length} runs in pipeline`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_400px] mb-3">
        <div className="min-w-0 h-[480px]">
          <PipelineTable
            runs={runs}
            allCount={pipelines.length}
            missionById={missionById}
            unitById={unitById}
            now={now}
            selectedId={selId}
            onSelect={setSelId}
            status={status}
            setStatus={setStatus}
            type={type}
            setType={setType}
          />
        </div>
        <div className="min-w-0 h-[480px]">
          <QuarantineQueue runs={pipelines} missionById={missionById} unitById={unitById} now={now} selectedId={selId} onSelect={setSelId} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_400px] mb-3">
        <div className="min-w-0 flex flex-col gap-3">
          {sel ? (
            <>
              <Panel
                title="Selected Run"
                icon="git-branch"
                subtitle={<span className="num">{sel.dataset}</span>}
                actions={
                  <>
                    <Badge tone={RUN_STATE[runState(sel)].tone} dot>
                      {RUN_STATE[runState(sel)].label}
                    </Badge>
                  </>
                }
              >
                <div className="p-3">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] mb-3">
                    {selMission && (
                      <span className="flex items-center gap-1.5">
                        <Icon name={MISSION_PROFILES[selMission.type].icon} size={12} className="text-muted" />
                        <span className="num text-text">{selMission.code}</span>
                        <span className="text-muted truncate max-w-[340px]">{selMission.name}</span>
                      </span>
                    )}
                    <span className="text-dim">
                      Unit <span className="text-text font-semibold">{unitById.get(sel.unitId)?.callsign}</span>
                    </span>
                    <span className="text-dim">
                      Size <span className="num text-text">{sel.sizeGb} GB</span>
                    </span>
                    <span className="text-dim">
                      QA <span className={cx('num', sel.qaScore !== undefined ? TONE_TEXT[qaTone(sel.qaScore)] : 'text-dim')}>{sel.qaScore?.toFixed(1) ?? 'pending'}</span>
                    </span>
                    <span className="text-dim">
                      Created <Stamp ts={sel.createdAt} />
                    </span>
                    {sel.signoff.required && (
                      <span className="text-dim flex items-center gap-1">
                        <Icon name="lock" size={11} /> Dual sign-off{' '}
                        <span className="num text-text">{(sel.signoff.first ? 1 : 0) + (sel.signoff.second ? 1 : 0)}/2</span>
                      </span>
                    )}
                  </div>
                  <FullStepper run={sel} now={now} />
                  {sel.quarantine && (
                    <div className="mt-2 flex items-start gap-2 text-[11px] border border-alert/40 bg-alert-bg px-2.5 py-1.5">
                      <Icon name="shield-alert" size={12} className="text-alert mt-0.5 shrink-0" />
                      <span>
                        <b className="text-alert">{sel.quarantine.reason}</b> <span className="text-muted">— {sel.quarantine.detail}</span>
                      </span>
                    </div>
                  )}
                </div>
              </Panel>
              <QaGrid run={sel} mission={selMission} />
            </>
          ) : (
            <Panel title="Flagged-Cell QA Map" index="C" icon="grid-3x3">
              <div className="p-8 text-center text-dim text-[12px]">Select a pipeline run to inspect its spatial QA grid.</div>
            </Panel>
          )}
        </div>
        <div className="min-w-0 xl:max-h-[760px]">
          <SignoffQueue runs={pipelines} missionById={missionById} now={now} onSelect={setSelId} selectedId={selId} />
        </div>
      </div>

      <LiveStream units={units} missionById={missionById} ring={ring} />
    </div>
  );
}
