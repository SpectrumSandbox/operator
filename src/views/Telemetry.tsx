// 04 · Telemetry & QA Pipeline — post-flight processing, quarantine, spatial QA, dual sign-off, live telemetry.
import { useMemo, useState } from 'react';
import type { MissionType } from '../types';
import { MISSION_PROFILES } from '../data/catalog';
import { useOps } from '../store';
import { Icon, Panel, SectionTitle, Stamp, TONE_TEXT, cx } from '../ui/kit';
import { KpiCell, KpiStrip } from './analytics/parts';
import { StatusText } from './fleet/shared';
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
      <SectionTitle index="04" title="Telemetry & QA Pipeline" subtitle="Edge ingest → validation → processing → QA scoring → dual-approved delivery" />

      <KpiStrip className="mb-3" label="Filter pipeline runs">
        <KpiCell label="quarantined" value={kpi.quarantined} tone={kpi.quarantined ? 'alert' : 'ok'} onClick={() => toggle('quarantined')} active={status === 'quarantined'} title="Held for operator action — click to filter" />
        <KpiCell label="awaiting sign-off" value={kpi.signoff} tone={kpi.signoff ? 'warn' : undefined} onClick={() => toggle('signoff')} active={status === 'signoff'} title="Dual-approval gate — click to filter" />
        <KpiCell label="processing" value={kpi.running} dot="live" pulse={kpi.running > 0} onClick={() => toggle('running')} active={status === 'running'} title="Ingest → QA executing — click to filter" />
        <KpiCell label="published today" value={kpi.published} dot="ok" onClick={() => toggle('published')} active={status === 'published'} title="Delivered to client portal today — click to filter" />
        <KpiCell label="mean QA" value={isFinite(kpi.qa) ? kpi.qa.toFixed(1) : '—'} tone={isFinite(kpi.qa) && qaTone(kpi.qa) !== 'ok' ? qaTone(kpi.qa) : undefined} title={`${kpi.qaN} scored datasets`} hide="lg" />
        <KpiCell label="in pipeline" value={kpi.gb.toLocaleString('en-US', { maximumFractionDigits: 0 })} unit="GB" title={`${pipelines.length} runs in pipeline`} hide="xl" />
      </KpiStrip>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] mb-3">
        <div className="min-w-0 h-[440px]">
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
        <div className="min-w-0 xl:h-[440px] max-xl:max-h-[440px] flex">
          <QuarantineQueue runs={pipelines} missionById={missionById} unitById={unitById} now={now} selectedId={selId} onSelect={setSelId} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] mb-3">
        <div className="min-w-0 flex flex-col gap-3">
          {sel ? (
            <>
              <Panel
                title="Selected run"
                index="C"
                subtitle={<span className="num">{sel.dataset}</span>}
                actions={<StatusText tone={RUN_STATE[runState(sel)].tone} label={RUN_STATE[runState(sel)].label} />}
              >
                <div className="p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim mb-2.5">
                    {selMission && (
                      <span className="flex items-center gap-1.5 min-w-0" title={selMission.name}>
                        <i className="w-1.5 h-1.5 shrink-0" style={{ background: MISSION_PROFILES[selMission.type].color }} />
                        <span className="num text-text">{selMission.code}</span>
                        <span className="truncate max-w-[300px]">{selMission.name}</span>
                      </span>
                    )}
                    <span>
                      <span className="text-text">{unitById.get(sel.unitId)?.callsign}</span>
                    </span>
                    <span className="num text-text">{sel.sizeGb} GB</span>
                    <span>
                      QA <span className={cx('num', sel.qaScore !== undefined ? TONE_TEXT[qaTone(sel.qaScore)] : 'text-dim')}>{sel.qaScore?.toFixed(1) ?? 'pending'}</span>
                    </span>
                    <span>
                      <Stamp ts={sel.createdAt} />
                    </span>
                    {sel.signoff.required && (
                      <span className="flex items-center gap-1" title="Dual sign-off required before publish">
                        <Icon name="lock" size={11} /> sign-off <span className="num text-text">{(sel.signoff.first ? 1 : 0) + (sel.signoff.second ? 1 : 0)}/2</span>
                      </span>
                    )}
                  </div>
                  <FullStepper run={sel} now={now} />
                  {sel.quarantine && (
                    <div className="mt-2 flex items-start gap-2 text-[11px] border-l-2 border-alert bg-alert-bg/60 px-2.5 py-1.5">
                      <span>
                        <b className="text-alert font-semibold">{sel.quarantine.reason}</b> <span className="text-muted">— {sel.quarantine.detail}</span>
                      </span>
                    </div>
                  )}
                </div>
              </Panel>
              <QaGrid run={sel} mission={selMission} />
            </>
          ) : (
            <Panel title="QA map" index="C">
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
