// Live impact of master data on the Deployment ETA engine + master-data audit trail.
import { useMemo, useRef } from 'react';
import { ops, useOps } from '../../store';
import { AIRFRAME, MISSION_PROFILES, PRIORITY, TRANSPORT_ICON } from '../../data/catalog';
import { missionEta, recommended, type EtaResult } from '../../engine/eta';
import { Badge, DataBadge, Empty, Icon, Panel, cx, useTz } from '../../ui/kit';
import { fmtDur, fmtRel, fmtStamp } from '../../lib/time';
import type { Mission } from '../../types';

interface Row {
  m: Mission;
  r?: EtaResult;
  callsign?: string;
  source: 'assigned' | 'recommended';
}

export function ImpactPanel() {
  const missions = useOps((s) => s.missions);
  const masterVersion = useOps((s) => s.masterVersion);
  const minute = useOps((s) => Math.floor(s.now / 60_000));
  const now = useOps((s) => s.now);
  const tz = useTz();

  // Pick a stable, varied set of open missions (prefer unassigned + different profiles).
  const picks = useMemo(() => {
    const open = missions.filter((m) => m.status !== 'completed' && m.status !== 'active');
    const out: Mission[] = [];
    const seen = new Set<string>();
    const ranked = [...open].sort((a, b) => (a.assignedUnitIds.length ? 1 : 0) - (b.assignedUnitIds.length ? 1 : 0) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank);
    for (const m of ranked) {
      if (out.length >= 4) break;
      if (seen.has(m.type)) continue;
      seen.add(m.type);
      out.push(m);
    }
    for (const m of ranked) if (out.length < 4 && !out.includes(m)) out.push(m);
    return out.map((m) => m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions.length]);

  const rows: Row[] = useMemo(() => {
    const S = ops.get();
    return picks
      .map((id) => S.missions.find((m) => m.id === id))
      .filter((m): m is Mission => !!m)
      .map((m) => {
        const r = m.assignedUnitIds.length ? missionEta(m, S) : recommended(m, S);
        return { m, r, callsign: r ? S.units.find((u) => u.id === r.unitId)?.callsign : undefined, source: m.assignedUnitIds.length ? ('assigned' as const) : ('recommended' as const) };
      });
  }, [picks, masterVersion, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track previous values per mission to show deltas after edits.
  const prev = useRef(new Map<string, { v: number; deploy: number; completion: number; ind: boolean }>());
  const deltas = useMemo(() => {
    const out = new Map<string, { deploy: number; completion: number; flipped: boolean }>();
    for (const row of rows) {
      if (!row.r) continue;
      const p = prev.current.get(row.m.id);
      if (p && p.v !== masterVersion) {
        out.set(row.m.id, { deploy: row.r.deployEta - p.deploy, completion: row.r.completion - p.completion, flipped: p.ind !== row.r.indicative });
      }
    }
    return out;
  }, [rows, masterVersion]);
  const lastDelta = useRef(new Map<string, { deploy: number; completion: number; flipped: boolean; at: number }>());
  for (const [k, d] of deltas) {
    if (Math.abs(d.deploy) > 30_000 || (isFinite(d.completion) && Math.abs(d.completion) > 30_000) || d.flipped) lastDelta.current.set(k, { ...d, at: masterVersion });
  }
  for (const row of rows) if (row.r) prev.current.set(row.m.id, { v: masterVersion, deploy: row.r.deployEta, completion: row.r.completion, ind: row.r.indicative });

  return (
    <Panel index="06" title="Live impact on Deployment ETA" icon="activity" subtitle="recomputed on every master-data change" actions={<span className="num text-[10.5px] text-dim">MD v{masterVersion}</span>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.10)' }}>
        {rows.map(({ m, r, callsign, source }) => {
          const d = lastDelta.current.get(m.id);
          const af = r ? AIRFRAME[ops.get().units.find((u) => u.id === r.unitId)?.modelId ?? ''] : undefined;
          return (
            <div key={m.id} className="bg-card p-3 min-w-0">
              <div className="flex items-start gap-2">
                <Icon name={MISSION_PROFILES[m.type].icon} size={14} style={{ color: MISSION_PROFILES[m.type].color }} className="mt-[2px]" />
                <div className="min-w-0 flex-1">
                  <div className="num text-[10.5px] text-dim">{m.code}</div>
                  <div className="text-[12px] text-white font-semibold truncate" title={m.name}>
                    {m.name}
                  </div>
                </div>
                {r && <DataBadge indicative={r.indicative} unverified={r.unverified} />}
              </div>
              {r ? (
                <>
                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                    <span className="num text-white">{callsign}</span>
                    <span className="text-dim truncate">{af?.name}</span>
                    <Badge tone={source === 'assigned' ? 'live' : 'idle'} className="ml-auto">
                      {source === 'assigned' ? 'Assigned' : 'AI rec.'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <div className="label">Deploy ETA</div>
                      <div className="num text-[13px] text-white">{fmtStamp(r.deployEta, tz).replace(` ${tz}`, '')}</div>
                      <div className="num text-[10px] text-dim">{fmtRel(r.deployEta, now)}</div>
                    </div>
                    <div>
                      <div className="label">Completion</div>
                      <div className={cx('num text-[13px]', isFinite(r.completion) ? 'text-white' : 'text-alert')}>{isFinite(r.completion) ? fmtStamp(r.completion, tz).replace(` ${tz}`, '') : 'No window'}</div>
                      <div className="num text-[10px] text-dim">{isFinite(r.completion) ? (r.completion < m.slaDue ? 'within SLA' : 'SLA breach') : '8-day horizon'}</div>
                    </div>
                    <div>
                      <div className="label">Breakdown</div>
                      <div className="num text-[10.5px] text-muted leading-tight">
                        <span className="inline-flex items-center gap-1">
                          <Icon name={TRANSPORT_ICON[r.transit.mode]} size={10} />
                          {fmtDur(r.tTransit)}
                        </span>
                        <br />
                        setup {fmtDur(r.tSetup)}
                        <br />
                        {r.sorties}× sortie · {fmtDur(r.tExec)}
                      </div>
                    </div>
                  </div>
                  {d && (
                    <div className="mt-2 pt-1.5 border-t border-line flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                      <span className="text-dim">Last edit</span>
                      <DeltaMs ms={d.deploy} label="ETA" />
                      {isFinite(d.completion) && <DeltaMs ms={d.completion} label="completion" />}
                      {d.flipped && <span className={r.indicative ? 'text-warn' : 'text-ok'}>badge → {r.indicative ? 'INDICATIVE' : 'VERIFIED'}</span>}
                    </div>
                  )}
                  {r.indicative && (
                    <div className="mt-1.5 text-[10px] text-warn/90 truncate" title={r.unverified.join('\n')}>
                      Unverified: {r.unverified.join(' · ')}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-2 text-[11px] text-alert">No feasible unit in the planning horizon</div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DeltaMs({ ms, label }: { ms: number; label: string }) {
  if (Math.abs(ms) < 30_000) return <span className="num text-dim">{label} ±0</span>;
  const later = ms > 0;
  return (
    <span className={cx('num', later ? 'text-alert' : 'text-ok')}>
      {label} {later ? '+' : '−'}
      {fmtDur(Math.abs(ms))}
    </span>
  );
}

export function MasterAudit() {
  const audit = useOps((s) => s.audit);
  const now = useOps((s) => Math.floor(s.now / 10_000) * 10_000);
  const tz = useTz();
  const rows = useMemo(() => audit.filter((a) => a.kind === 'master-data'), [audit]);
  return (
    <Panel index="07" title="Master-data audit trail" icon="file-text" subtitle={`${rows.length} change${rows.length === 1 ? '' : 's'} this session`}>
      {rows.length ? (
        <div className="overflow-auto max-h-[360px]">
          <table className="tbl text-[11.5px]">
            <thead>
              <tr>
                <th className="w-[150px]">Timestamp</th>
                <th className="w-[110px]">Actor</th>
                <th>Change</th>
                <th className="text-right w-[90px]">Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="num text-muted whitespace-nowrap">{fmtStamp(a.ts, tz)}</td>
                  <td className="text-text whitespace-nowrap">{a.actor}</td>
                  <td className="text-text">
                    <span className="inline-flex items-start gap-1.5">
                      <Icon name={/^Verified/.test(a.text) ? 'shield-check' : /unverified/i.test(a.text) ? 'triangle-alert' : 'sliders-horizontal'} size={12} className={cx('mt-[2px]', /^Verified/.test(a.text) ? 'text-ok' : /unverified/i.test(a.text) ? 'text-warn' : 'text-muted')} />
                      <span className="num-ish">{a.text}</span>
                    </span>
                  </td>
                  <td className="num text-right text-dim whitespace-nowrap">{fmtRel(a.ts, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="file-text" text="No master-data changes yet" sub="Edits and verifications are logged here with actor and timestamp." />
      )}
    </Panel>
  );
}
