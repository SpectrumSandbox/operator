// Multi-resource Gantt timeline with environmental & regulatory overlays:
// hourly weather suitability bands, clearance/permit brackets, NOTAM/TFR
// windows, conflict highlights, AI proposal ghosts and a live "now" line.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Conflict } from '../../engine/conflicts';
import { CONFLICT_LABEL } from '../../engine/conflicts';
import { AIRFRAME, MISSION_PROFILES, MISSION_STATUS, PAYLOAD_META, PRIORITY, TONE_COLOR, UNIT_STATUS } from '../../data/catalog';
import { Icon, cx } from '../../ui/kit';
import { DAY, HOUR, fmtClock, fmtDateShort, fmtDow, fmtDur, fmtStamp, startOfDay, type Tz } from '../../lib/time';
import type { GanttModel, GBar, GRow, GroupId } from './model';
import { HATCH_NOTAM, HATCH_UNAVAIL, LABEL_W, PERMIT_TONE, TipCard, WX_COLOR, WX_LABEL, barKind, barStyle, hideTip, rgba, tipProps } from './shared';

export type Lens = 'all' | 'missions' | 'resources';

const GROUPS: { id: GroupId; label: string; icon: 'clipboard-list' | 'drone' | 'aperture' | 'users' }[] = [
  { id: 'missions', label: 'Missions', icon: 'clipboard-list' },
  { id: 'units', label: 'Drones', icon: 'drone' },
  { id: 'payloads', label: 'Payloads', icon: 'aperture' },
  { id: 'crews', label: 'Crews', icon: 'users' },
];
const STATUS_SHORT: Record<string, string> = { request: 'Request', planned: 'Planned', scheduled: 'Scheduled', active: 'Active', 'hold-weather': 'WX hold', 'hold-airspace': 'ATC hold', delayed: 'Delayed', completed: 'Done' };
const MIN_PX: Record<number, number> = { 24: 34, 72: 13, 168: 6 };

export interface FocusRequest {
  missionId: string;
  t: number;
  nonce: number;
}

interface Props {
  model: GanttModel;
  t0: number;
  t1: number;
  horizonH: number;
  now: number;
  tz: Tz;
  lens: Lens;
  selectedId?: string;
  focus?: FocusRequest;
  onSelect: (missionId: string) => void;
  onConflict: (c: Conflict) => void;
}

export const Gantt = memo(function Gantt({ model, t0, t1, horizonH, now, tz, lens, selectedId, focus, onSelect, onConflict }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(1000);
  const [collapsed, setCollapsed] = useState<Record<GroupId, boolean>>({ missions: false, units: false, payloads: true, crews: true });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const totalH = (t1 - t0) / HOUR;
  const px = Math.max(MIN_PX[horizonH] ?? 8, (cw - LABEL_W - 2) / totalH);
  const W = Math.round(totalH * px);
  const x = (t: number) => ((t - t0) / HOUR) * px;
  const clampX = (t: number) => Math.max(0, Math.min(W, x(t)));

  // Focus: scroll the requested mission row + time into view.
  useEffect(() => {
    if (!focus || !scroller.current) return;
    const el = scroller.current;
    const row = el.querySelector<HTMLElement>(`[data-row="m:${focus.missionId}"]`);
    if (row) {
      const top = row.offsetTop - 80;
      el.scrollTo({ top: Math.max(0, top), left: Math.max(0, x(focus.t) - (el.clientWidth - LABEL_W) / 3), behavior: 'smooth' });
      row.animate?.([{ background: 'rgba(199,196,93,0.22)' }, { background: 'transparent' }], { duration: 1400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Axis ticks
  const step = [1, 2, 3, 6, 12, 24].find((s) => s * px >= 38) ?? 24;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = t0; t <= t1; t += HOUR) {
      const h = Math.round(((t + (tz === 'WIB' ? 7 * HOUR : 0)) / HOUR) % 24);
      if (h % step === 0) out.push(t);
    }
    return out;
  }, [t0, t1, step, tz]);
  const days = useMemo(() => {
    const out: { from: number; to: number; start: number }[] = [];
    for (let d = startOfDay(t0, tz); d < t1; d += DAY) out.push({ from: Math.max(d, t0), to: Math.min(d + DAY, t1), start: d });
    return out;
  }, [t0, t1, tz]);

  const visibleGroups = GROUPS.filter((g) => (lens === 'all' ? true : lens === 'missions' ? g.id === 'missions' : g.id !== 'missions'));

  const toggle = (g: GroupId) => setCollapsed((c) => ({ ...c, [g]: !c[g] }));

  return (
    <div ref={scroller} className="relative overflow-auto bg-bg-deep/40" style={{ maxHeight: 'max(420px, calc(100vh - 330px))' }} onMouseLeave={hideTip}>
      <div className="relative" style={{ width: LABEL_W + W }}>
        {/* ── Axis header ── */}
        <div className="sticky top-0 z-30 flex border-b border-line-2 bg-card" style={{ height: 42 }}>
          <div className="sticky left-0 z-40 shrink-0 bg-card border-r border-line-2 flex flex-col justify-end px-3 pb-1.5" style={{ width: LABEL_W }}>
            <span className="label">Resource · {tz}</span>
            <span className="num text-[10px] text-dim">
              {fmtDateShort(t0, tz)} {fmtClock(t0, tz, false)} → {fmtDateShort(t1, tz)} {fmtClock(t1, tz, false)}
            </span>
          </div>
          <div className="relative shrink-0" style={{ width: W }}>
            {days.map((d) => (
              <div key={d.start} className="absolute top-0 h-[19px] border-l border-line-2 overflow-hidden" style={{ left: x(d.from), width: x(d.to) - x(d.from) }}>
                {x(d.to) - x(d.from) >= 76 && (
                  <span className="sticky left-0 inline-block px-1.5 pt-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-muted whitespace-nowrap">
                    {fmtDow(d.start, tz)} <span className="num">{fmtDateShort(d.start, tz)}</span>
                  </span>
                )}
              </div>
            ))}
            <div className="absolute left-0 right-0 top-[19px] border-t border-line" />
            {ticks.filter((t) => x(t) > 16 && Math.abs(x(t) - x(now)) > 30).map((t) => (
              <span key={t} className="absolute top-[22px] num text-[10px] text-dim -translate-x-1/2 whitespace-nowrap" style={{ left: x(t) }}>
                {fmtClock(t, tz, false)}
              </span>
            ))}
            <div className="absolute top-[19px] -translate-x-1/2 px-1 h-[15px] bg-live text-ink num text-[9.5px] font-bold leading-[15px] z-10" style={{ left: x(now) }}>
              {fmtClock(now, tz, false)}
            </div>
          </div>
        </div>

        {/* ── Grid background (ticks + day lines) ── */}
        <div className="absolute pointer-events-none" style={{ left: LABEL_W, top: 42, bottom: 0, width: W }}>
          <div className="absolute inset-y-0 left-0 bg-white/[0.018]" style={{ width: x(now) }} />
          {ticks.map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-white/[0.045]" style={{ left: x(t) }} />
          ))}
          {days.map((d) => (
            <div key={d.start} className="absolute inset-y-0 w-px bg-white/[0.16]" style={{ left: x(d.from) }} />
          ))}
        </div>

        {/* ── Groups ── */}
        {visibleGroups.map((g) => {
          const rows = model.rows[g.id];
          const nConf = rows.reduce((n, r) => n + r.conflicts.length, 0);
          return (
            <div key={g.id}>
              <div className="flex border-b border-line bg-card-2/90 relative z-[12]" style={{ height: 26 }}>
                <button onClick={() => toggle(g.id)} className="sticky left-0 z-20 shrink-0 flex items-center gap-2 px-2.5 bg-card-2 border-r border-line-2 text-left hover:bg-raise transition-colors" style={{ width: LABEL_W }}>
                  <Icon name={collapsed[g.id] ? 'chevron-right' : 'chevron-down'} size={12} className="text-dim" />
                  <Icon name={g.icon} size={12} className="text-muted" />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-text">{g.label}</span>
                  <span className="num text-[10px] text-dim">{rows.length}</span>
                  {nConf > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 num text-[10px] text-alert">
                      <Icon name="triangle-alert" size={10} />
                      {nConf}
                    </span>
                  )}
                </button>
                <div className="shrink-0" style={{ width: W }} />
              </div>
              {!collapsed[g.id] &&
                rows.map((r) => (
                  <Row key={r.id} r={r} W={W} x={x} clampX={clampX} t0={t0} t1={t1} now={now} tz={tz} selected={!!selectedId && (r.missionId === selectedId || r.bars.some((b) => b.missionId === selectedId))} selectedId={selectedId} onSelect={onSelect} onConflict={onConflict} />
                ))}
              {!collapsed[g.id] && rows.length === 0 && (
                <div className="flex border-b border-line" style={{ height: 28 }}>
                  <div className="sticky left-0 z-20 shrink-0 bg-card border-r border-line-2 px-3 flex items-center text-[11px] text-dim" style={{ width: LABEL_W }}>
                    No {g.label.toLowerCase()} committed
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Now line ── */}
        <div className="absolute z-[15] pointer-events-none" style={{ left: LABEL_W + x(now), top: 42, bottom: 0 }}>
          <div className="absolute inset-y-0 w-px bg-live" style={{ boxShadow: '0 0 6px rgba(38,216,217,0.6)' }} />
        </div>
      </div>
    </div>
  );
});

// ── Row ─────────────────────────────────────────────────────────────────────
function Row({ r, W, x, clampX, t0, t1, now, tz, selected, selectedId, onSelect, onConflict }: { r: GRow; W: number; x: (t: number) => number; clampX: (t: number) => number; t0: number; t1: number; now: number; tz: Tz; selected: boolean; selectedId?: string; onSelect: (id: string) => void; onConflict: (c: Conflict) => void }) {
  const isMission = r.group === 'missions';
  const barTop = isMission ? 5 : 6;
  const barH = isMission ? 19 : 16;
  const vis = (a: number, b: number) => b > t0 && a < t1;
  const S = (t: number) => fmtStamp(t, tz);
  return (
    <div data-row={r.id} className={cx('flex border-b border-line relative', selected && 'bg-white/[0.035]')} style={{ height: r.height }}>
      <div className={cx('sticky left-0 z-20 shrink-0 border-r border-line-2 px-2.5 flex flex-col justify-center min-w-0', selected ? 'bg-[#2e2e2a]' : 'bg-card')} style={{ width: LABEL_W }}>
        {selected && <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: 'var(--view-accent)' }} />}
        <RowLabel r={r} onSelect={onSelect} />
      </div>
      <div className="relative shrink-0" style={{ width: W }}>
        {/* Unavailable (grounded / maintenance) */}
        {r.unavailable && vis(r.unavailable.from, r.unavailable.to) && (
          <div className="absolute inset-y-[3px]" style={{ left: clampX(r.unavailable.from), width: clampX(r.unavailable.to) - clampX(r.unavailable.from), background: HATCH_UNAVAIL }} {...tipProps(() => <TipCard title={r.unavailable!.label} tone="alert" foot="Unit not serviceable — assignments on this row cannot be dispatched." />)} />
        )}

        {/* NOTAM / TFR windows */}
        {r.notams?.map((z) =>
          vis(z.activeFrom!, z.activeTo!) ? (
            <div
              key={z.id}
              className="absolute top-[2px] bottom-[2px] border-x border-alert/70"
              style={{ left: clampX(z.activeFrom!), width: Math.max(2, clampX(z.activeTo!) - clampX(z.activeFrom!)), background: HATCH_NOTAM }}
              {...tipProps(() => (
                <TipCard
                  kicker={z.ref}
                  title={`${z.kind === 'tfr' ? 'TFR' : 'NOTAM'} · ${z.name}`}
                  tone="alert"
                  rows={[
                    ['Authority', z.authority],
                    ['From', S(z.activeFrom!)],
                    ['To', S(z.activeTo!)],
                    ['UAS limit', z.maxUasFt === 0 ? 'Prohibited' : `${z.maxUasFt} ft`],
                  ]}
                  foot="No-fly window intersects the mission geometry — sorties cannot be dispatched inside this span."
                />
              ))}
            >
              {clampX(z.activeTo!) - clampX(z.activeFrom!) > 70 && <span className="absolute right-1 bottom-0 num text-[8.5px] font-semibold text-alert whitespace-nowrap">{z.ref?.replace('NOTAM ', '')}</span>}
            </div>
          ) : null,
        )}

        {/* Weather suitability band (missions) */}
        {isMission && r.wx && r.mission && (
          <div className="absolute left-0 right-0" style={{ top: 27, height: 6 }}>
            {r.wx.map((w) =>
              vis(w.from, w.to) ? (
                <div
                  key={w.from}
                  className="absolute inset-y-0"
                  style={{
                    left: clampX(w.from),
                    width: Math.max(1, clampX(w.to) - clampX(w.from) - 0.5),
                    background: WX_COLOR[w.cls],
                    opacity: w.to > r.mission!.scheduledStart && w.from < r.mission!.scheduledEnd ? 0.92 : 0.28,
                  }}
                  {...tipProps(() => (
                    <TipCard
                      kicker={`${r.mission!.code} · ${r.lead?.recommended ? 'recommended' : 'lead'} ${r.lead?.callsign ?? ''}`}
                      title={`${WX_LABEL[w.cls]} · ${fmtClock(w.from, tz, false)}–${fmtClock(w.to, tz, false)} ${tz}`}
                      tone={w.cls === 'ok' ? 'ok' : w.cls === 'marginal' ? 'warn' : w.cls === 'nogo' ? 'alert' : 'idle'}
                      rows={[
                        ['Duration', fmtDur(w.to - w.from)],
                        ['Max wind / gust', `${w.maxWind.toFixed(0)} / ${w.maxGust.toFixed(0)} kt`],
                        ['Max rain', `${w.maxRain.toFixed(1)} mm/h`],
                        ['Airframe', r.lead?.model ?? '—'],
                      ]}
                      foot={w.reasons.length ? w.reasons.slice(0, 4).join(' · ') : 'Within airframe wind, gust, rain, visibility & ceiling limits.'}
                    />
                  ))}
                />
              ) : null,
            )}
          </div>
        )}

        {/* Permit / clearance bracket */}
        {isMission && r.permit && vis(r.permit.windowStart, r.permit.windowEnd) && (
          <PermitBracket r={r} x0={clampX(r.permit.windowStart)} x1={clampX(r.permit.windowEnd)} openL={r.permit.windowStart < t0} openR={r.permit.windowEnd > t1} tz={tz} />
        )}
        {isMission && r.permitNeeded && !r.permit && r.mission && vis(r.mission.scheduledStart, r.mission.scheduledEnd) && (
          <div className="absolute flex items-center gap-1 text-alert" style={{ left: clampX(r.mission.scheduledStart) + 2, top: 34 }} {...tipProps(() => <TipCard title="Airspace clearance missing" tone="alert" foot={`${r.mission!.code} requires a SINKAP / NOTAM clearance (${r.mission!.bvlos ? 'BVLOS' : 'restricted airspace'}). Dispatch is blocked until filed and approved.`} />)}>
            <Icon name="octagon-alert" size={8} />
            <span className="num text-[8px] font-bold tracking-wider">NO CLEARANCE</span>
          </div>
        )}

        {/* AI proposal ghost */}
        {isMission && r.proposed && r.proposed.changed && vis(r.proposed.start, r.proposed.end) && (
          <div className="absolute border border-dashed border-white/70 pointer-events-none" style={{ left: clampX(r.proposed.start), width: Math.max(4, clampX(r.proposed.end) - clampX(r.proposed.start)), top: barTop - 2, height: barH + 4 }}>
            <Icon name="sparkles" size={9} className="absolute -top-[5px] -right-[5px] text-white bg-bg-deep" />
          </div>
        )}

        {/* Bars */}
        {r.bars.map((b) => (vis(b.from, b.to) ? <Bar key={b.missionId + b.from} b={b} left={clampX(b.from)} width={Math.max(3, clampX(b.to) - clampX(b.from))} top={barTop} h={barH} isMission={isMission} r={r} tz={tz} now={now} dim={!!selectedId && !isMission && b.missionId !== selectedId} onSelect={onSelect} /> : null))}

        {/* Resource markers (calibration due, duty limit, charge complete) */}
        {r.markers?.map((mk, i) =>
          vis(mk.t, mk.t + 1) ? (
            <div key={i} className="absolute top-0 bottom-0 z-[3]" style={{ left: x(mk.t) }} {...tipProps(() => <TipCard title={mk.detail} tone={mk.tone} rows={[['At', S(mk.t)], ['In', fmtDur(mk.t - now)]]} />)}>
              <div className="absolute inset-y-0 w-px" style={{ background: TONE_COLOR[mk.tone] }} />
              <span className="absolute top-0 left-px px-[3px] num text-[8px] font-bold leading-[11px] text-ink" style={{ background: TONE_COLOR[mk.tone] }}>
                {mk.label}
              </span>
            </div>
          ) : null,
        )}

        {/* Conflict overlays — one outlined span per conflict, badges clustered by position */}
        {r.conflicts.map((c) => {
          const a = Math.max(c.from, t0);
          const bnd = Math.min(Math.max(c.to, c.from + HOUR / 4), t1);
          if (bnd <= a) return null;
          const tone = c.severity === 'critical' ? 'alert' : 'warn';
          return <div key={c.id} className="absolute z-[4] pointer-events-none" style={{ left: clampX(a), width: Math.max(6, clampX(bnd) - clampX(a)), top: barTop - 3, height: barH + 6, border: `1px solid ${rgba(TONE_COLOR[tone], 0.9)}`, background: c.blocking ? rgba(TONE_COLOR[tone], 0.1) : 'transparent' }} />;
        })}
        {conflictClusters(r.conflicts, t0, t1, clampX).map((cl) => {
          const lead = cl.items[0];
          const tone = cl.items.some((c) => c.severity === 'critical') ? 'alert' : 'warn';
          return (
            <button
              key={lead.id}
              className="absolute z-[6] flex items-center gap-[2px] px-[2px] text-ink"
              style={{ left: cl.x - 1, top: barTop - 9, height: 12, background: TONE_COLOR[tone] }}
              onClick={(e) => {
                e.stopPropagation();
                onConflict(lead);
              }}
              aria-label={lead.title}
              {...tipProps(() => (
                <div className="min-w-[240px]">
                  {cl.items.slice(0, 4).map((c, k) => (
                    <div key={c.id} className={k ? 'mt-2 pt-2 border-t border-line' : ''}>
                      <div className="num text-[10px] text-dim">
                        {CONFLICT_LABEL[c.kind]}
                        {c.blocking && <span className="text-alert font-semibold"> · BLOCKING</span>}
                      </div>
                      <div className="font-bold" style={{ color: TONE_COLOR[c.severity === 'critical' ? 'alert' : 'warn'] }}>
                        {c.title}
                      </div>
                      <div className="text-muted leading-snug">{c.detail}</div>
                      <div className="text-white leading-snug mt-0.5">
                        <span className="text-live font-semibold">Resolution → </span>
                        {c.resolution}
                      </div>
                      <div className="num text-[10px] text-dim mt-0.5">
                        {S(c.from)} → {S(c.to)}
                      </div>
                    </div>
                  ))}
                  {cl.items.length > 4 && <div className="mt-1.5 text-dim">+{cl.items.length - 4} more</div>}
                  <div className="mt-1.5 text-dim text-[10px]">Click to open in conflict engine</div>
                </div>
              ))}
            >
              <Icon name="triangle-alert" size={9} strokeWidth={2.6} />
              {cl.items.length > 1 && <span className="num text-[8.5px] font-bold leading-none">{cl.items.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function conflictClusters(cs: Conflict[], t0: number, t1: number, clampX: (t: number) => number): { x: number; items: Conflict[] }[] {
  const sorted = cs
    .filter((c) => Math.min(Math.max(c.to, c.from + HOUR / 4), t1) > Math.max(c.from, t0))
    .map((c) => ({ c, x: clampX(Math.max(c.from, t0)) }))
    .sort((a, b) => a.x - b.x);
  const out: { x: number; items: Conflict[] }[] = [];
  for (const { c, x } of sorted) {
    const last = out[out.length - 1];
    if (last && x - last.x < 26) last.items.push(c);
    else out.push({ x, items: [c] });
  }
  for (const o of out) o.items.sort((a, b) => Number(b.blocking) - Number(a.blocking) || (a.severity === 'critical' ? -1 : 1));
  return out;
}

function PermitBracket({ r, x0, x1, openL, openR, tz }: { r: GRow; x0: number; x1: number; openL: boolean; openR: boolean; tz: Tz }) {
  const p = r.permit!;
  const c = TONE_COLOR[PERMIT_TONE[p.status]];
  return (
    <div
      className="absolute"
      style={{ left: x0, width: Math.max(2, x1 - x0), top: 36, height: 6 }}
      {...tipProps(() => (
        <TipCard
          kicker={p.ref}
          title={`${p.kind} · ${p.status.toUpperCase()}`}
          tone={PERMIT_TONE[p.status]}
          rows={[
            ['Authority', p.authority],
            ['Window from', fmtStamp(p.windowStart, tz)],
            ['Window to', fmtStamp(p.windowEnd, tz)],
            ['Submitted', fmtStamp(p.submittedAt, tz)],
          ]}
          foot={p.status === 'approved' ? 'Operations legal inside this window.' : p.status === 'pending' ? 'Requested window — dispatch blocked until approved.' : 'Clearance not valid — re-submission required (≈ 48 h lead).'}
        />
      ))}
    >
      <div className="absolute left-0 right-0 bottom-0 h-0" style={{ borderBottom: `1px ${p.status === 'pending' ? 'dashed' : 'solid'} ${c}` }} />
      {!openL && <div className="absolute left-0 top-0 bottom-[1px] w-px" style={{ background: c }} />}
      {!openR && <div className="absolute right-0 top-0 bottom-[1px] w-px" style={{ background: c }} />}
    </div>
  );
}

function Bar({ b, left, width, top, h, isMission, r, tz, now, dim, onSelect }: { b: GBar; left: number; width: number; top: number; h: number; isMission: boolean; r: GRow; tz: Tz; now: number; dim: boolean; onSelect: (id: string) => void }) {
  const kind = barKind(b.status);
  const st = barStyle(kind, b.color);
  const m = r.mission;
  const short = b.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·');
  const inside = width >= 64;
  const label: ReactNode = (
    <>
      <span className="num font-semibold">{short}</span>
      {isMission && width > 150 && <span className="ml-1.5 opacity-80 font-medium">{b.name}</span>}
    </>
  );
  return (
    <>
    {!inside && (
      <span className={cx('absolute z-[2] num text-[10px] font-semibold whitespace-nowrap pointer-events-none leading-none', dim ? 'text-dim' : 'text-muted')} style={{ left: left + width + 5, top: top + h / 2 - 5 }}>
        {short}
      </span>
    )}
    <button
      onClick={() => onSelect(b.missionId)}
      className={cx('absolute z-[2] flex items-center overflow-hidden text-left px-1.5 text-[10px] leading-none whitespace-nowrap transition hover:brightness-125', dim && 'opacity-45')}
      style={{ left, width, top, height: h, ...st }}
      {...tipProps(() => (
        <TipCard
          kicker={`${b.code} · ${MISSION_PROFILES[(m ?? { type: 'survey' }).type as keyof typeof MISSION_PROFILES]?.short ?? ''}`}
          title={b.name}
          tone={MISSION_STATUS[b.status].tone}
          rows={[
            ['Status', MISSION_STATUS[b.status].label],
            ['Start', fmtStamp(b.from, tz)],
            ['End', fmtStamp(b.to, tz)],
            ['Duration', fmtDur(b.to - b.from)],
            ...(b.status === 'active' ? ([['Progress', `${Math.round(b.progress * 100)}%`]] as [string, string][]) : []),
            ...(m ? ([['Priority', PRIORITY[m.priority].label]] as [string, string][]) : []),
            ...(r.lead ? ([[r.lead.recommended ? 'Recommended' : 'Lead unit', r.lead.callsign]] as [string, string][]) : []),
            ...(b.from > now ? ([['Starts in', fmtDur(b.from - now)]] as [string, string][]) : []),
          ]}
          foot={r.conflicts.length ? `${r.conflicts.length} conflict(s) — ${r.conflicts.filter((c) => c.blocking).length} blocking` : 'No conflicts detected'}
        />
      ))}
    >
      {kind === 'active' && b.progress > 0 && <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${(1 - b.progress) * 100}%`, left: `${b.progress * 100}%` }} />}
      {kind === 'active' && <span className="absolute left-0 bottom-0 h-[2px] bg-white/80" style={{ width: `${b.progress * 100}%` }} />}
      {inside && <span className="relative truncate">{label}</span>}
    </button>
    </>
  );
}

function RowLabel({ r, onSelect }: { r: GRow; onSelect: (id: string) => void }) {
  if (r.mission) {
    const m = r.mission;
    const prof = MISSION_PROFILES[m.type];
    const st = MISSION_STATUS[m.status];
    return (
      <button onClick={() => onSelect(m.id)} className="text-left min-w-0 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          <i className="w-2 h-2 shrink-0" style={{ background: prof.color }} />
          <span className="num text-[10.5px] text-muted whitespace-nowrap">{m.code}</span>
          {m.priority !== 'routine' && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: TONE_COLOR[PRIORITY[m.priority].tone] }}>{m.priority === 'urgent' ? 'URG' : 'HIGH'}</span>}
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider shrink-0 whitespace-nowrap" style={{ color: TONE_COLOR[st.tone] }}>
            {STATUS_SHORT[m.status]}
          </span>
        </div>
        <div className="text-[11.5px] font-semibold text-white truncate leading-tight mt-[2px]">{m.name}</div>
      </button>
    );
  }
  if (r.unit) {
    const u = r.unit;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE_COLOR[UNIT_STATUS[u.status].tone] }} title={UNIT_STATUS[u.status].label} />
        <span className="text-[11.5px] font-semibold text-white truncate">{u.callsign}</span>
        <span className="text-[10px] text-dim truncate">{AIRFRAME[u.modelId].name}</span>
      </div>
    );
  }
  if (r.payload) {
    const p = r.payload;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon name={PAYLOAD_META[p.type].icon} size={11} className="text-muted shrink-0" />
        <span className="text-[11px] font-semibold text-white">{PAYLOAD_META[p.type].short}</span>
        <span className="num text-[10px] text-dim truncate">{p.serial}</span>
      </div>
    );
  }
  if (r.crew) {
    const c = r.crew;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon name="user" size={11} className="text-muted shrink-0" />
        <span className="text-[11.5px] font-semibold text-white truncate">{c.name}</span>
        <span className="text-[10px] text-dim truncate">{c.role === 'Visual Observer' ? 'VO' : c.role === 'Payload Operator' ? 'PO' : c.role === 'Field Technician' ? 'Tech' : 'PIC'}</span>
        <span className={cx('ml-auto num text-[9.5px]', c.dutyHrsToday >= c.maxDutyHrs * 0.85 ? 'text-warn' : 'text-dim')}>
          {c.dutyHrsToday.toFixed(1)}/{c.maxDutyHrs}h
        </span>
      </div>
    );
  }
  return null;
}

export function GanttLegend() {
  const sw = (style: CSSProperties) => <i className="inline-block w-5 h-[9px] shrink-0" style={style} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted">
      <span className="label">Bars</span>
      <span className="flex items-center gap-1.5">{sw(barStyle('active', '#8384E2'))}Active</span>
      <span className="flex items-center gap-1.5">{sw(barStyle('scheduled', '#8384E2'))}Scheduled</span>
      <span className="flex items-center gap-1.5">{sw(barStyle('tentative', '#8384E2'))}Request / planned</span>
      <span className="flex items-center gap-1.5">{sw(barStyle('hold', '#8384E2'))}Hold</span>
      <span className="flex items-center gap-1.5">{sw({ border: '1px dashed rgba(255,255,255,.7)' })}AI proposal</span>
      <span className="w-px h-3 bg-line-2" />
      <span className="label">Weather</span>
      {(['ok', 'marginal', 'nogo', 'dark'] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <i className="inline-block w-3 h-[5px]" style={{ background: WX_COLOR[k] }} />
          {WX_LABEL[k]}
        </span>
      ))}
      <span className="w-px h-3 bg-line-2" />
      <span className="label">Airspace</span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block w-5 h-[6px] border-x border-b border-ok" />
        Clearance window
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block w-5 h-[6px] border-x border-b border-dashed border-warn" />
        Pending
      </span>
      <span className="flex items-center gap-1.5">{sw({ background: HATCH_NOTAM, border: '1px solid rgba(255,77,85,.7)' })}NOTAM / TFR no-fly</span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block w-5 h-[9px] border border-alert bg-alert-bg" />
        Conflict
      </span>
    </div>
  );
}
