// Scheduler view — shared helpers: bar styling, hatch patterns, weather-band
// classes, conflict icons and a lightweight floating tooltip layer that does
// not re-render the (heavy) timeline on hover.
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { MissionStatus, PermitStatus } from '../../types';
import type { ConflictKind } from '../../engine/conflicts';
import { TONE_COLOR, type Tone } from '../../data/catalog';
import { cx, type IconName } from '../../ui/kit';

export const LABEL_W = 224;

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ── Mission bar status styling ──────────────────────────────────────────────
export type BarKind = 'active' | 'scheduled' | 'hold' | 'tentative' | 'delayed';

export function barKind(s: MissionStatus): BarKind {
  if (s === 'active') return 'active';
  if (s === 'hold-weather' || s === 'hold-airspace') return 'hold';
  if (s === 'request' || s === 'planned') return 'tentative';
  if (s === 'delayed') return 'delayed';
  return 'scheduled';
}

export const HATCH_HOLD = 'repeating-linear-gradient(135deg, rgba(232,163,58,0.55) 0 3px, rgba(232,163,58,0.12) 3px 7px)';
export const HATCH_NOTAM = 'repeating-linear-gradient(135deg, rgba(255,77,85,0.5) 0 1.5px, rgba(255,77,85,0.06) 1.5px 6px)';
export const HATCH_UNAVAIL = 'repeating-linear-gradient(135deg, rgba(139,147,163,0.35) 0 1.5px, transparent 1.5px 6px)';

export function barStyle(kind: BarKind, color: string): CSSProperties {
  switch (kind) {
    case 'active':
      return { background: color, border: `1px solid ${color}`, color: '#161616' };
    case 'scheduled':
      return { background: rgba(color, 0.22), border: `1px solid ${color}`, color: '#f2f2f2' };
    case 'hold':
      return { background: HATCH_HOLD, border: `1px solid ${TONE_COLOR.warn}`, color: '#f2f2f2' };
    case 'delayed':
      return { background: rgba(color, 0.18), border: `1px solid ${TONE_COLOR.alert}`, color: '#f2f2f2' };
    case 'tentative':
      return { background: rgba(color, 0.07), border: `1px dashed ${rgba(color, 0.85)}`, color: '#b4b4b4' };
  }
}

// ── Weather suitability band ────────────────────────────────────────────────
export type WxClass = 'ok' | 'marginal' | 'nogo' | 'dark';
export const WX_COLOR: Record<WxClass, string> = {
  ok: '#3ccf6e',
  marginal: '#e8a33a',
  nogo: '#ff4d55',
  dark: '#2c3550',
};
export const WX_LABEL: Record<WxClass, string> = {
  ok: 'Flyable',
  marginal: 'Marginal',
  nogo: 'No-go',
  dark: 'No daylight (optical)',
};

// ── Conflicts / permits ─────────────────────────────────────────────────────
export const CONFLICT_ICON: Record<ConflictKind, IconName> = {
  'unit-double-booking': 'drone',
  'crew-double-booking': 'users',
  calibration: 'aperture',
  maintenance: 'wrench',
  'crew-fatigue': 'timer',
  'crew-rating': 'user-check',
  airspace: 'shield-alert',
  weather: 'cloud-lightning',
};
export const CONFLICT_ORDER: ConflictKind[] = ['unit-double-booking', 'crew-double-booking', 'calibration', 'maintenance', 'crew-fatigue', 'crew-rating', 'airspace', 'weather'];

export const PERMIT_TONE: Record<PermitStatus, Tone> = { approved: 'ok', pending: 'warn', expired: 'alert', rejected: 'alert' };

// ── Floating tooltip layer ──────────────────────────────────────────────────
type TipState = { x: number; y: number; content: ReactNode } | null;
let setTipGlobal: ((t: TipState) => void) | null = null;

export function showTip(e: MouseEvent, content: ReactNode) {
  setTipGlobal?.({ x: e.clientX, y: e.clientY, content });
}
export function hideTip() {
  setTipGlobal?.(null);
}
/** Props for an element that shows `content` as a hover tooltip. */
export function tipProps(content: () => ReactNode) {
  return {
    onMouseEnter: (e: MouseEvent) => showTip(e, content()),
    onMouseMove: (e: MouseEvent) => showTip(e, content()),
    onMouseLeave: hideTip,
  };
}

export function TipLayer() {
  const [t, setT] = useState<TipState>(null);
  useEffect(() => {
    setTipGlobal = setT;
    const off = () => setT(null);
    window.addEventListener('scroll', off, true);
    return () => {
      setTipGlobal = null;
      window.removeEventListener('scroll', off, true);
    };
  }, []);
  if (!t) return null;
  const flipX = t.x > window.innerWidth - 340;
  const flipY = t.y > window.innerHeight - 220;
  return (
    <div
      className="fixed z-[3000] pointer-events-none max-w-[320px] border border-line-2 bg-[#161616]/95 px-2.5 py-2 text-[11px] text-text"
      style={{ left: t.x + (flipX ? -14 : 14), top: t.y + (flipY ? -12 : 14), transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})` }}
    >
      {t.content}
    </div>
  );
}

export function TipCard({ title, kicker, rows, tone, foot }: { title: ReactNode; kicker?: ReactNode; rows?: [ReactNode, ReactNode][]; tone?: Tone; foot?: ReactNode }) {
  return (
    <div className="min-w-[200px]">
      {kicker && <div className="num text-[10px] text-dim mb-0.5">{kicker}</div>}
      <div className={cx('font-bold text-[11.5px] leading-snug', tone ? '' : 'text-white')} style={tone ? { color: TONE_COLOR[tone] } : undefined}>
        {title}
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <span className="text-dim">{k}</span>
              <span className="num text-text text-right">{v}</span>
            </div>
          ))}
        </div>
      )}
      {foot && <div className="mt-1.5 pt-1.5 border-t border-line text-muted leading-snug">{foot}</div>}
    </div>
  );
}

export function TypeSwatch({ color, size = 8 }: { color: string; size?: number }) {
  return <i className="inline-block shrink-0" style={{ width: size, height: size, background: color }} />;
}
