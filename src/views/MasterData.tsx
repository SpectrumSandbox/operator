// 06 · Master Data Manager — Chapter 7 parameters driving the Deployment ETA engine.
import { useMemo, useState } from 'react';
import { useOps } from '../store';
import { Icon, SectionTitle, useTz } from '../ui/kit';
import { fmtRel, fmtStamp } from '../lib/time';
import type { MasterData, MasterParam } from '../types';
import { AirframeTable, OverheadTable, SetupTable, SpeedsTable, WeatherTable } from './master/Tables';
import { ImpactPanel, MasterAudit } from './master/Impact';
import { RecentCtx } from './master/ParamCell';
import { TileCell, TileGrid, StatTile } from './analytics/parts';

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
      <SectionTitle
        index="06"
        title="Master Data Manager"
        subtitle="Chapter 7 configuration — parameters driving the Deployment ETA engine"
        right={
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="shield-check" size={13} className="text-ok" /> Verified
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="triangle-alert" size={13} className="text-warn" /> Unverified → ETAs flagged INDICATIVE
            </span>
          </div>
        }
      />

      <TileGrid className="grid-cols-2 lg:grid-cols-5 mb-3">
        <TileCell>
          <StatTile label="Parameters" icon="database" value={stats.total} sub="across 5 tables" />
        </TileCell>
        <TileCell>
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 label">
              <Icon name="shield-check" size={11} /> Verified
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="num text-[21px] font-semibold leading-none text-ok">{stats.verified}</span>
              <span className="num text-[11px] text-dim">{pct.toFixed(0)}%</span>
            </div>
            <div className="h-[4px] bg-white/[0.08] mt-2 flex">
              <div className="h-full bg-ok" style={{ width: `${pct}%` }} />
              <div className="h-full bg-warn" style={{ width: `${100 - pct}%` }} />
            </div>
          </div>
        </TileCell>
        <TileCell>
          <StatTile label="Unverified · indicative" icon="triangle-alert" value={stats.unverified} tone={stats.unverified ? 'warn' : 'ok'} sub={stats.unverified ? 'awaiting field validation' : 'all parameters verified'} />
        </TileCell>
        <TileCell>
          <div className="px-3 py-2.5 min-w-0">
            <div className="flex items-center gap-1.5 label">
              <Icon name="clock" size={11} /> Last change
            </div>
            {last ? (
              <>
                <div className="num text-[13px] text-white mt-1 truncate">{fmtStamp(last.ts, tz)}</div>
                <div className="text-[10.5px] text-dim truncate" title={last.text}>
                  {last.actor} · {fmtRel(last.ts, now)} · {last.text}
                </div>
              </>
            ) : (
              <>
                <div className="num text-[13px] text-white mt-1">Baseline</div>
                <div className="text-[10.5px] text-dim">No edits this session</div>
              </>
            )}
          </div>
        </TileCell>
        <TileCell>
          <StatTile label="Master version" icon="git-branch" value={`v${masterVersion}`} sub={masterVersion > 1 ? `${masterVersion - 1} revision${masterVersion > 2 ? 's' : ''} since load` : 'seed baseline'} />
        </TileCell>
      </TileGrid>

      <div className="panel px-3 py-2 mb-3 flex items-start gap-2 text-[11px] text-muted">
        <Icon name="info" size={13} className="text-dim mt-[1px]" />
        <span>
          Click a value to edit — commits on <span className="num text-text">Enter</span> or blur, <span className="num text-text">Esc</span> cancels; negative or invalid values are rejected. Editing does not auto-verify: confirm field-validated values with the shield toggle. Every change is versioned and written to the audit trail.
        </span>
      </div>

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
