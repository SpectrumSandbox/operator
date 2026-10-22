// Airspace & Permits — clearance tracker, NOTAM/TFR windows, permanent zones.
import { useMemo, useState } from 'react';
import { actions } from '../../store';
import type { OpsState } from '../../store';
import type { AirspaceZone, Mission, Permit, ZoneKind } from '../../types';
import { permitRequired, restrictiveZones, zonesForMission } from '../../engine/airspace';
import { MISSION_PROFILES, TONE_COLOR, ZONE_META } from '../../data/catalog';
import { Badge, Empty, Icon, Kpi, Panel, Segmented, Stamp, cx } from '../../ui/kit';
import { DAY, HOUR, fmtDur, fmtRel } from '../../lib/time';
import { PERMIT_TONE, TipCard, tipProps } from './shared';

const KIND_ICON: Record<Permit['kind'], 'file-check' | 'radio-tower' | 'shield' | 'plane'> = {
  'SINKAP Clearance': 'file-check',
  'NOTAM Request': 'radio-tower',
  'Security Clearance (SC)': 'shield',
  'Flight Approval (FA)': 'plane',
};

type PFilter = 'all' | 'action' | 'approved';

export function AirspaceTab({ S, onSelect, onPropose }: { S: OpsState; onSelect: (id: string) => void; onPropose: () => void }) {
  const [filter, setFilter] = useState<PFilter>('all');
  const now = S.now;
  const hourKey = Math.floor(now / (5 * 60_000));
  const missionById = useMemo(() => new Map(S.missions.map((m) => [m.id, m])), [S.missions]);
  const open = useMemo(() => S.missions.filter((m) => m.status !== 'completed'), [S.missions]);

  const missing = useMemo(() => open.filter((m) => permitRequired(m, S.zones) && !S.permits.some((p) => p.missionId === m.id)), [open, S.zones, S.permits]);
  const permits = useMemo(() => {
    const ord: Record<Permit['status'], number> = { expired: 0, rejected: 0, pending: 1, approved: 2 };
    return [...S.permits]
      .filter((p) => missionById.get(p.missionId)?.status !== 'completed')
      .filter((p) => (filter === 'all' ? true : filter === 'approved' ? p.status === 'approved' : p.status !== 'approved'))
      .sort((a, b) => ord[a.status] - ord[b.status] || a.windowStart - b.windowStart);
  }, [S.permits, filter, missionById]);

  // Timeline scale for mini bars: now − 1 d … now + 7 d
  const s0 = now - DAY;
  const s1 = now + 7 * DAY;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - s0) / (s1 - s0)) * 100));

  const windowed = useMemo(() => S.zones.filter((z) => z.activeFrom !== undefined && z.activeTo !== undefined && z.activeTo > now - HOUR).sort((a, b) => a.activeFrom! - b.activeFrom!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S.zones, hourKey]);
  const affected = (z: AirspaceZone) => open.filter((m) => zonesForMission(m, S.zones).some((x) => x.id === z.id));

  const permanentKinds: ZoneKind[] = ['kkop', 'military', 'ctr'];
  const permanent = permanentKinds.map((k) => {
    const zs = S.zones.filter((z) => z.kind === k && z.activeFrom === undefined);
    const ms = open.filter((m) => (k === 'ctr' ? restrictiveZones(m, S.zones) : zonesForMission(m, S.zones)).some((z) => z.kind === k));
    return { k, zs, ms };
  });

  const counts = {
    approved: S.permits.filter((p) => p.status === 'approved' && missionById.get(p.missionId)?.status !== 'completed').length,
    pending: S.permits.filter((p) => p.status === 'pending').length,
    bad: S.permits.filter((p) => p.status === 'expired' || p.status === 'rejected').length,
  };
  const activeNow = windowed.filter((z) => z.activeFrom! <= now && z.activeTo! >= now).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Approved clearances" value={counts.approved} tone="ok" icon="shield-check" />
        <Kpi label="Pending" value={counts.pending} tone={counts.pending ? 'warn' : undefined} icon="hourglass" sub="dispatch gated until approved" />
        <Kpi label="Expired / rejected" value={counts.bad} tone={counts.bad ? 'alert' : undefined} icon="circle-x" />
        <Kpi label="Missing clearance" value={missing.length} tone={missing.length ? 'alert' : 'ok'} icon="octagon-alert" sub="permit required, none filed" />
        <Kpi label="NOTAM / TFR active" value={activeNow} tone={activeNow ? 'alert' : undefined} icon="ban" sub={`${windowed.length - activeNow} upcoming`} />
        <Kpi label="Permanent zones" value={permanent.reduce((n, p) => n + p.zs.length, 0)} icon="shield" sub="KKOP · military · CTR" />
      </div>

      <Panel
        title="Clearance & permit tracker"
        index="A1"
        icon="file-check"
        subtitle="DGCA / DKPPU SINKAP · AirNav Indonesia NOTAM · TNI AU SC · Otoritas Bandara FA"
        actions={<Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'action', label: 'Needs action' }, { value: 'approved', label: 'Approved' }]} />}
        bodyClassName="overflow-auto"
      >
        <table className="tbl text-[11px]">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Clearance</th>
              <th>Authority</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Window</th>
              <th className="min-w-[220px]">
                <div className="flex justify-between">
                  <span>−1 d</span>
                  <span>now</span>
                  <span>+7 d</span>
                </div>
              </th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {missing.map((m) => (
              <tr key={`missing-${m.id}`} className="bg-alert-bg">
                <td>
                  <MissionCell m={m} onSelect={onSelect} />
                </td>
                <td colSpan={3} className="text-alert">
                  <Icon name="octagon-alert" size={11} className="inline -mt-0.5 mr-1" />
                  No clearance filed — {m.bvlos ? 'BVLOS operation' : 'restricted airspace'} requires {m.priority === 'urgent' ? 'expedited emergency clearance (BNPB / Basarnas ≈ 1 h)' : 'SINKAP / NOTAM request (≈ 48 h lead)'}
                </td>
                <td>
                  <Badge tone="alert">Missing</Badge>
                </td>
                <td className="whitespace-nowrap text-dim">
                  Mission <Stamp ts={m.scheduledStart} />
                </td>
                <td>
                  <MiniBar a={pct(m.scheduledStart)} b={pct(m.scheduledEnd)} now={pct(now)} color={TONE_COLOR.alert} dashed />
                </td>
                <td className="text-dim">—</td>
                <td>
                  <button className="btn h-6" onClick={onPropose} title="Auto-Propose files the clearance as part of the plan">
                    <Icon name="sparkles" size={11} /> Plan filing
                  </button>
                </td>
              </tr>
            ))}
            {permits.map((p) => {
              const m = missionById.get(p.missionId);
              const tone = PERMIT_TONE[p.status];
              const covers = m ? p.windowStart <= Math.max(now, m.scheduledStart) && p.windowEnd >= m.scheduledEnd : true;
              return (
                <tr key={p.id}>
                  <td>{m ? <MissionCell m={m} onSelect={onSelect} /> : <span className="text-dim">—</span>}</td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-text">
                      <Icon name={KIND_ICON[p.kind]} size={12} className="text-muted" />
                      {p.kind}
                    </span>
                  </td>
                  <td className="text-muted whitespace-nowrap">{p.authority}</td>
                  <td className="num text-text whitespace-nowrap">{p.ref}</td>
                  <td>
                    <Badge tone={tone} dot>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="text-text">
                      <Stamp ts={p.windowStart} /> <span className="text-dim">→</span> <Stamp ts={p.windowEnd} />
                    </div>
                    <div className={cx('text-[10px]', covers ? 'text-dim' : 'text-warn')}>
                      {fmtDur(p.windowEnd - p.windowStart)}
                      {!covers && ' · does not cover mission span'}
                    </div>
                  </td>
                  <td>
                    <div
                      {...tipProps(() => (
                        <TipCard
                          kicker={p.ref}
                          title={`${p.kind} · ${p.status}`}
                          tone={tone}
                          rows={[
                            ['Opens', fmtRel(p.windowStart, now)],
                            ['Closes', fmtRel(p.windowEnd, now)],
                            ...(m ? ([['Mission', `${fmtRel(m.scheduledStart, now)} → ${fmtRel(m.scheduledEnd, now)}`]] as [string, string][]) : []),
                          ]}
                          foot="Bar = clearance window; thin white line = mission span; cyan tick = now."
                        />
                      ))}
                    >
                      <MiniBar a={pct(p.windowStart)} b={pct(p.windowEnd)} now={pct(now)} color={TONE_COLOR[tone]} dashed={p.status === 'pending'} ma={m ? pct(m.scheduledStart) : undefined} mb={m ? pct(m.scheduledEnd) : undefined} />
                    </div>
                  </td>
                  <td className="text-dim whitespace-nowrap">{fmtRel(p.submittedAt, now)}</td>
                  <td className="text-right">
                    {p.status === 'pending' && (
                      <button className="btn h-6" onClick={() => actions.approvePermit(p.id)}>
                        <Icon name="check" size={11} /> Mark approved
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {permits.length === 0 && missing.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <Empty icon="shield-check" text="No clearances match this filter" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 2xl:grid-cols-[3fr_2fr] gap-3 items-start">
        <Panel title="Time-windowed restrictions · NOTAM / TFR" index="A2" icon="ban" className="min-w-0" bodyClassName="overflow-auto">
          <table className="tbl text-[11px]">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Area</th>
                <th>Authority</th>
                <th>Window</th>
                <th>State</th>
                <th>Affected missions</th>
              </tr>
            </thead>
            <tbody>
              {windowed.map((z) => {
                const active = z.activeFrom! <= now && z.activeTo! >= now;
                const ms = affected(z);
                return (
                  <tr key={z.id}>
                    <td className="num whitespace-nowrap" style={{ color: ZONE_META[z.kind].color }}>
                      {z.ref ?? z.kind.toUpperCase()}
                    </td>
                    <td className="min-w-[220px]">
                      <div className="text-white font-semibold">{z.name}</div>
                      <div className="text-[10px] text-dim">
                        {ZONE_META[z.kind].label} · SFC–{z.ceilingFt >= 99999 ? 'UNL' : `${z.ceilingFt.toLocaleString()} ft`} · UAS {z.maxUasFt === 0 ? 'prohibited' : `≤ ${z.maxUasFt} ft`}
                      </div>
                    </td>
                    <td className="text-muted whitespace-nowrap">{z.authority}</td>
                    <td className="whitespace-nowrap">
                      <div>
                        <Stamp ts={z.activeFrom!} /> <span className="text-dim">→</span> <Stamp ts={z.activeTo!} />
                      </div>
                      <div className="text-[10px] text-dim">{active ? `ends ${fmtRel(z.activeTo!, now)}` : `starts ${fmtRel(z.activeFrom!, now)}`} · {fmtDur(z.activeTo! - z.activeFrom!)}</div>
                    </td>
                    <td>{active ? <Badge tone="alert" dot>Active</Badge> : z.activeTo! < now ? <Badge tone="idle">Lapsed</Badge> : <Badge tone="warn">Upcoming</Badge>}</td>
                    <td>
                      {ms.length ? (
                        <div className="flex flex-wrap gap-1">
                          {ms.map((m) => {
                            const overlap = m.scheduledStart < z.activeTo! && m.scheduledEnd > z.activeFrom!;
                            return (
                              <button key={m.id} onClick={() => onSelect(m.id)} className={cx('num text-[10px] px-1 h-[17px] border hover:bg-white/5', overlap ? 'border-alert/60 text-alert' : 'border-line-2 text-muted')} title={overlap ? 'Mission span overlaps the restriction window' : 'Geometry intersects; no time overlap'}>
                                {m.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·')}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-dim">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Permanent restricted airspace" index="A3" icon="shield" className="min-w-0">
          {permanent.map(({ k, zs, ms }) => (
            <div key={k} className="px-3 py-2.5 border-b border-line last:border-b-0">
              <div className="flex items-center gap-2">
                <i className="w-2.5 h-2.5 border" style={{ borderColor: ZONE_META[k].color, background: `${ZONE_META[k].color}33` }} />
                <span className="text-[12px] font-semibold text-white">{ZONE_META[k].label}</span>
                <span className="num text-[11px] text-muted ml-auto">{zs.length} zones</span>
              </div>
              <div className="text-[10.5px] text-dim mt-1 leading-snug">{zs.slice(0, 4).map((z) => z.name.replace(/\s*\(.*\)$/, '')).join(' · ')}{zs.length > 4 && ` · +${zs.length - 4}`}</div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="label">{k === 'ctr' ? 'Above 400 ft' : 'Intersecting'}</span>
                {ms.length ? (
                  ms.map((m) => (
                    <button key={m.id} onClick={() => onSelect(m.id)} className="num text-[10px] px-1 h-[17px] border border-line-2 text-muted hover:text-white hover:bg-white/5" title={m.name}>
                      {m.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·')}
                    </button>
                  ))
                ) : (
                  <span className="text-[10.5px] text-dim">no open missions</span>
                )}
              </div>
            </div>
          ))}
          <div className="px-3 py-2 text-[10.5px] text-dim leading-snug border-t border-line">
            KKOP (PM 37/2020) & military areas prohibit UAS without AirNav + authority clearance. CTR allows ≤ 400 ft AGL; higher operations need ATC coordination.
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MissionCell({ m, onSelect }: { m: Mission; onSelect: (id: string) => void }) {
  return (
    <button onClick={() => onSelect(m.id)} className="text-left group">
      <div className="flex items-center gap-1.5">
        <i className="w-2 h-2" style={{ background: MISSION_PROFILES[m.type].color }} />
        <span className="num text-muted group-hover:text-white">{m.code}</span>
      </div>
      <div className="text-white truncate max-w-[220px]">{m.name}</div>
    </button>
  );
}

function MiniBar({ a, b, now, color, dashed, ma, mb }: { a: number; b: number; now: number; color: string; dashed?: boolean; ma?: number; mb?: number }) {
  return (
    <div className="relative h-[14px] bg-white/[0.04]">
      {b > a && <div className="absolute top-[3px] bottom-[3px]" style={{ left: `${a}%`, width: `${Math.max(0.6, b - a)}%`, background: dashed ? 'transparent' : `${color}55`, border: `1px ${dashed ? 'dashed' : 'solid'} ${color}` }} />}
      {ma !== undefined && mb !== undefined && mb > ma && <div className="absolute bottom-0 h-[2px] bg-white/80" style={{ left: `${ma}%`, width: `${Math.max(0.6, mb - ma)}%` }} />}
      <div className="absolute inset-y-0 w-px bg-live" style={{ left: `${now}%` }} />
    </div>
  );
}
