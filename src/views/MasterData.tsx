// 06 · Master Data Manager — Chapter 7 parameters driving the Deployment ETA engine.
import { useMemo, useState } from 'react';
import { useOps } from '../store';
import { Icon, SectionTitle, useTz } from '../ui/kit';
import { fmtRel, fmtStamp } from '../lib/time';
import type { MasterData, MasterParam } from '../types';
import { AirframeTable, OverheadTable, SetupTable, SpeedsTable, WeatherTable } from './master/Tables';
import { ImpactPanel, MasterAudit } from './master/Impact';
import { RecentCtx } from './master/ParamCell';
import { KpiCell, KpiStrip } from './analytics/parts';

function allParams(md: MasterData): MasterParam[] {
  const out: MasterParam[] = [];
  for (const r of Object.values(md.regionalSpeeds)) out.push(...Object.values(r));
  out.push(...Object.values(md.missionSetupMin));
  out.push(...Object.values(md.modeOverheadMin));
  for (const a of Object.values(md.airframes)) {
    out.push(...(Object.values(a.capacity) as MasterParam[]));
    out.push(a.sortieMin, a.turnaroundMin, a.setupMin, a.maxWindKts, a.maxGustKts, a.minVisKm, a.selfFerryKmh);
  }
  return out;
}

export function MasterDataView() {
  const master = useOps((s) => s.master);
  const masterVersion = useOps((s) => s.masterVersion);
  const audit = useOps((s) => s.audit);
  const now = useOps((s) => Math.floor(s.now / 10_000) * 10_000);
  const t0 = useOps((s) => s.t0);
  const tz = useTz();
  const [mountedAt] = useState(t0);

  const stats = useMemo(() => {
    const ps = allParams(master);
    const verified = ps.filter((p) => p.verified).length;
    return { total: ps.length, verified, unverified: ps.length - verified };
  }, [master]);
  const last = useMemo(() => audit.find((a) => a.kind === 'master-data'), [audit]);
  const pct = stats.total ? (stats.verified / stats.total) * 100 : 0;

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <SectionTitle index="06" title="Master Data" subtitle="Chapter 7 parameters driving the Deployment ETA engine" />

      <KpiStrip className="mb-2">
        <KpiCell
          label="unverified · ETAs indicative"
          value={stats.unverified}
          tone={stats.unverified ? 'warn' : 'ok'}
          title={stats.unverified ? 'Awaiting field validation — any ETA that uses one of these is flagged INDICATIVE' : 'All parameters verified'}
        />
        <KpiCell
          label="verified"
          value={stats.verified}
          title={`${pct.toFixed(0)}% of ${stats.total} parameters across 5 tables`}
          extra={
            <span className="w-[56px] h-[3px] bg-warn/70 flex shrink-0" aria-hidden>
              <span className="h-full bg-ok" style={{ width: `${pct}%` }} />
            </span>
          }
        />
        <KpiCell label="parameters" value={stats.total} title="Across 5 tables" hide="lg" />
        <KpiCell
          label={last ? `last change · ${fmtRel(last.ts, now)}` : 'baseline · no edits'}
          value={`v${masterVersion}`}
          title={last ? `${fmtStamp(last.ts, tz)} · ${last.actor} · ${last.text}` : 'Seed baseline — no edits this session'}
        />
      </KpiStrip>

      <p className="flex items-center gap-1.5 mb-3 text-[11px] text-dim">
        <Icon name="info" size={12} className="shrink-0" />
        <span className="truncate" title="Click a value to edit — commits on Enter or blur, Esc cancels; negative or invalid values are rejected. Editing does not auto-verify: confirm field-validated values with the shield toggle. Every change is versioned and written to the audit trail.">
          Click a value to edit (<span className="num text-muted">Enter</span> commits, <span className="num text-muted">Esc</span> cancels). <Icon name="shield-check" size={11} className="inline -mt-0.5 text-ok" /> toggles verified; unverified values flag ETAs as indicative. All edits are audited.
        </span>
      </p>

      <RecentCtx.Provider value={mountedAt}>
        <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
          <div className="2xl:col-span-7">
            <SpeedsTable />
          </div>
          <div className="2xl:col-span-5">
            <OverheadTable />
          </div>
          <div className="2xl:col-span-12">
            <AirframeTable />
          </div>
          <div className="2xl:col-span-7">
            <WeatherTable />
          </div>
          <div className="2xl:col-span-5">
            <SetupTable />
          </div>
          <div className="2xl:col-span-7">
            <ImpactPanel />
          </div>
          <div className="2xl:col-span-5">
            <MasterAudit />
          </div>
        </div>
      </RecentCtx.Provider>
    </div>
  );
}
