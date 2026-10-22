// Two-week calendar: mission chips spanning days, conflicts & weather risk per day.
import { memo, useMemo } from 'react';
import type { Mission } from '../../types';
import { MISSION_PROFILES, MISSION_STATUS, TONE_COLOR } from '../../data/catalog';
import { Icon, cx } from '../../ui/kit';
import { DAY, fmtClock, fmtDateShort, fmtDow, fmtStamp, type Tz } from '../../lib/time';
import type { CalDay } from './model';
import { TipCard, barKind, barStyle, tipProps } from './shared';

interface Props {
  days: CalDay[];
  missions: Mission[];
  now: number;
  tz: Tz;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const LANE_H = 20;

export const CalendarView = memo(function CalendarView({ days, missions, now, tz, selectedId, onSelect }: Props) {
  const weeks = useMemo(() => {
    const out: CalDay[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 border-l border-t border-line">
        {weeks[0]?.map((d) => (
          <div key={d.start} className="label px-2 py-1.5 border-r border-b border-line bg-card-2">
            {fmtDow(d.start, tz)}
          </div>
        ))}
      </div>
      {weeks.map((w, wi) => {
        const ws = w[0].start;
        const we = ws + 7 * DAY;
        const ms = missions.filter((m) => m.scheduledEnd > ws && m.scheduledStart < we).sort((a, b) => a.scheduledStart - b.scheduledStart || b.scheduledEnd - a.scheduledEnd);
        // Lane packing (by whole days)
        const lanes: number[] = [];
        const placed = ms.map((m) => {
          const c0 = Math.max(0, Math.floor((m.scheduledStart - ws) / DAY));
          const c1 = Math.min(6, Math.floor((Math.min(m.scheduledEnd, we) - 1 - ws) / DAY));
          let lane = lanes.findIndex((end) => end < c0);
          if (lane < 0) {
            lane = lanes.length;
            lanes.push(c1);
          } else lanes[lane] = c1;
          return { m, c0, c1, lane, contL: m.scheduledStart < ws, contR: m.scheduledEnd > we };
        });
        const h = 36 + Math.max(3, lanes.length) * (LANE_H + 3) + 26;
        return (
          <div key={wi} className="relative grid grid-cols-7 border-l border-line" style={{ height: h }}>
            {w.map((d) => {
              const today = now >= d.start && now < d.start + DAY;
              const risk = d.wxRisk;
              const riskTone = risk === undefined ? undefined : risk > 0.35 ? 'alert' : risk > 0.12 ? 'warn' : 'ok';
              return (
                <div key={d.start} className={cx('relative border-r border-b border-line', today ? 'bg-white/[0.04]' : d.start < now ? 'bg-black/10' : '')}>
                  {today && <span className="absolute left-0 right-0 top-0 h-[2px]" style={{ background: 'var(--view-accent)' }} />}
                  <div className="flex items-center gap-1.5 px-2 pt-1.5">
                    <span className={cx('num text-[12px] font-semibold', today ? 'text-white' : 'text-muted')}>{fmtDateShort(d.start, tz)}</span>
                    {today && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--view-accent)' }}>Today</span>}
                  </div>
                  <div className="absolute left-2 right-2 bottom-1.5 flex items-center gap-2">
                    {riskTone ? (
                      <span
                        className="flex items-center gap-1 text-[10px]"
                        style={{ color: TONE_COLOR[riskTone] }}
                        {...tipProps(() => (
                          <TipCard
                            title={`Weather risk ${fmtDateShort(d.start, tz)}`}
                            tone={riskTone}
                            rows={[
                              ['No-go daylight site-hours', `${Math.round((risk ?? 0) * 100)}%`],
                              ['Dominant limiter', d.wxWorst ?? '—'],
                            ]}
                            foot="Share of daylight hours, across all open mission sites, that breach the lead airframe's wind / gust / rain / visibility / ceiling limits."
                          />
                        ))}
                      >
                        <Icon name={riskTone === 'ok' ? 'sun' : riskTone === 'warn' ? 'cloud-rain' : 'cloud-lightning'} size={11} />
                        <span className="num">{Math.round((risk ?? 0) * 100)}%</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-dim" title={d.start <= now ? 'No remaining daylight site-hours today' : 'Beyond the 8-day forecast horizon'}>
                        <Icon name={d.start <= now ? 'moon' : 'cloud'} size={11} className="inline" /> <span className="num">{d.start <= now ? 'after dark' : 'no fcst'}</span>
                      </span>
                    )}
                    {d.conflicts > 0 && (
                      <span className={cx('ml-auto flex items-center gap-1 text-[10px] num', d.blocking ? 'text-alert' : 'text-warn')} title={`${d.conflicts} conflict(s), ${d.blocking} blocking`}>
                        <Icon name="triangle-alert" size={10} />
                        {d.conflicts}
                        {d.blocking > 0 && <span className="text-dim">/{d.blocking}B</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Mission chips */}
            {placed.map(({ m, c0, c1, lane, contL, contR }) => {
              const prof = MISSION_PROFILES[m.type];
              const st = barStyle(barKind(m.status), prof.color);
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={cx('absolute flex items-center gap-1 px-1.5 text-[10px] leading-none overflow-hidden whitespace-nowrap hover:brightness-125', selectedId === m.id && 'outline outline-1 outline-white')}
                  style={{ ...st, left: `calc(${(c0 / 7) * 100}% + 3px)`, width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 6px)`, top: 30 + lane * (LANE_H + 3), height: LANE_H, borderLeftWidth: contL ? 0 : 1, borderRightWidth: contR ? 0 : 1 }}
                  {...tipProps(() => (
                    <TipCard kicker={m.code} title={m.name} tone={MISSION_STATUS[m.status].tone} rows={[['Status', MISSION_STATUS[m.status].label], ['Start', fmtStamp(m.scheduledStart, tz)], ['End', fmtStamp(m.scheduledEnd, tz)], ['SLA due', fmtStamp(m.slaDue, tz)]]} />
                  ))}
                >
                  {contL && <Icon name="chevron-left" size={10} />}
                  <span className="num font-semibold">{m.code.replace(/^(MSN|REQ|RFL)-\d{4}-/, '$1·')}</span>
                  <span className="num opacity-75">{fmtClock(m.scheduledStart, tz, false)}</span>
                  <span className="truncate opacity-80">{m.name}</span>
                  {contR && <Icon name="chevron-right" size={10} className="ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});
