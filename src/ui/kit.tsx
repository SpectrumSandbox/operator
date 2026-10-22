// Spectrum Operator UI kit — hairline panels, indexed sections, status semantics.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { TONE_COLOR, type Tone } from '../data/catalog';
import { useOps } from '../store';
import { fmtStamp, fmtClock, fmtDateShort } from '../lib/time';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok', live: 'text-live', warn: 'text-warn', alert: 'text-alert', idle: 'text-idle' };
export const TONE_BG: Record<Tone, string> = { ok: 'bg-ok-bg', live: 'bg-live-bg', warn: 'bg-warn-bg', alert: 'bg-alert-bg', idle: 'bg-idle-bg' };
export const TONE_BORDER: Record<Tone, string> = { ok: 'border-ok/40', live: 'border-live/40', warn: 'border-warn/40', alert: 'border-alert/40', idle: 'border-idle/40' };

export const SPECTRUM = ['#2626D9', '#26D8D9', '#26D92A', '#D8D926', '#D97D26', '#D92626', '#D926D8'];

export function SpectrumBar({ className, height = 3 }: { className?: string; height?: number }) {
  return (
    <div className={cx('spectrum-bar', className)} style={{ height }} aria-hidden>
      {SPECTRUM.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </div>
  );
}

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <a href="#/mission-control" className="flex items-center gap-3 select-none" aria-label="Spectrum Group Operator — home">
      <div className="flex flex-col leading-none">
        <span className="font-extrabold tracking-[0.02em] text-[15px] text-white">SPECTRUM</span>
        <div className="flex items-center gap-1 mt-[3px]">
          <SpectrumBar className="w-[52px]" height={3} />
          <span className="font-bold text-[8.5px] tracking-[0.18em] text-white">GROUP</span>
        </div>
      </div>
      {!compact && (
        <span className="hidden md:inline font-mono text-[11px] text-muted tracking-wide">
          <span className="text-dim">//</span> OPERATOR
        </span>
      )}
    </a>
  );
}

export function Badge({ tone = 'idle', children, dot, solid, className, title }: { tone?: Tone; children: ReactNode; dot?: boolean; solid?: boolean; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 h-[20px] px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border whitespace-nowrap leading-none',
        solid ? 'text-ink border-transparent' : cx(TONE_TEXT[tone], TONE_BG[tone], TONE_BORDER[tone]),
        className,
      )}
      style={solid ? { background: TONE_COLOR[tone] } : undefined}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: solid ? '#161616' : TONE_COLOR[tone] }} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse, size = 8 }: { tone: Tone; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && <span className="absolute inset-0 rounded-full pulse-ring" style={{ background: TONE_COLOR[tone] }} />}
      <span className="relative rounded-full" style={{ width: size, height: size, background: TONE_COLOR[tone] }} />
    </span>
  );
}

export function Idx({ n, className }: { n: number | string; className?: string }) {
  return <span className={cx('idx', className)}>{typeof n === 'number' ? String(n).padStart(2, '0') : n} ·</span>;
}

export function Panel({
  title,
  index,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  subtitle,
}: {
  title?: ReactNode;
  index?: number | string;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  subtitle?: ReactNode;
}) {
  return (
    <section className={cx('panel flex flex-col min-h-0', className)}>
      {(title || actions) && (
        <header className="flex items-center gap-2 px-3 h-10 border-b border-line shrink-0">
          {index !== undefined && <Idx n={index} />}
          {icon && <Icon name={icon} size={13} className="text-muted" />}
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-text truncate">{title}</h3>
          {subtitle && <span className="text-[11px] text-dim truncate hidden sm:inline">{subtitle}</span>}
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionTitle({ index, title, subtitle, right }: { index: number | string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 min-h-8">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="idx">{typeof index === 'number' ? String(index).padStart(2, '0') : index} ·</span>
        <h2 className="text-[18px] leading-tight font-extrabold tracking-[-0.015em] text-white whitespace-nowrap">{title}</h2>
        {subtitle && (
          <span className="hidden xl:inline text-[11.5px] text-dim truncate max-w-[52ch]" title={subtitle}>
            {subtitle}
          </span>
        )}
      </div>
      {right && <div className="ml-auto flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}

export function Kpi({ label, value, unit, sub, tone, icon, onClick, active }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone; icon?: IconName; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('text-left px-3 py-2 min-w-0 border-r border-line last:border-r-0 transition-colors', onClick && 'hover:bg-white/[0.03]', active && 'bg-white/[0.05]')}>
      <div className="flex items-center gap-1.5 label truncate">
        {icon && <Icon name={icon} size={11} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={cx('num text-[20px] font-semibold leading-tight', tone ? TONE_TEXT[tone] : 'text-white')}>{value}</span>
        {unit && <span className="text-[11px] text-dim">{unit}</span>}
      </div>
      {sub && <div className="text-[10.5px] text-dim truncate">{sub}</div>}
    </Tag>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className, size = 'md' }: { tabs: { id: T; label: ReactNode; count?: number; icon?: IconName }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('flex items-stretch border-b border-line overflow-x-auto', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'relative flex items-center gap-1.5 px-3 font-semibold whitespace-nowrap transition-colors',
            size === 'sm' ? 'h-8 text-[11px]' : 'h-9 text-[12px]',
            value === t.id ? 'text-white' : 'text-dim hover:text-muted',
          )}
        >
          {t.icon && <Icon name={t.icon} size={12} />}
          {t.label}
          {t.count !== undefined && <span className={cx('num text-[10px] px-1 border', value === t.id ? 'border-line-2 text-text' : 'border-line text-dim')}>{t.count}</span>}
          {value === t.id && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px]" style={{ background: 'var(--view-accent, #26d8d9)' }} />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, className }: { options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex items-center gap-1', className)}>
      {options.map((o) => (
        <button key={String(o.value)} title={o.title} onClick={() => onChange(o.value)} className={cx('pill', value === o.value && 'pill-on')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100, tone, color, className, height = 4 }: { value: number; max?: number; tone?: Tone; color?: string; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx('bg-white/[0.08] w-full overflow-hidden', className)} style={{ height }}>
      <div className="h-full w-full origin-left transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})`, background: color ?? (tone ? TONE_COLOR[tone] : '#f2f2f2') }} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, color, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; color?: string; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-2 cursor-pointer select-none text-[12px] py-1', disabled && 'opacity-40 pointer-events-none')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-7 h-4 border transition-colors shrink-0', checked ? 'border-transparent' : 'border-line-2 bg-transparent')}
        style={checked ? { background: color ?? '#26d8d9' } : undefined}
      >
        <span className={cx('absolute top-[2px] w-[10px] h-[10px] transition-all', checked ? 'left-[14px] bg-ink' : 'left-[2px] bg-muted')} />
      </button>
      <span className={checked ? 'text-text' : 'text-muted'}>{label}</span>
    </label>
  );
}

export function Empty({ icon = 'circle-check', text, sub }: { icon?: IconName; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 text-dim">
      <Icon name={icon} size={22} className="mb-2" />
      <div className="text-[12px] text-muted">{text}</div>
      {sub && <div className="text-[11px] mt-1">{sub}</div>}
    </div>
  );
}

export function KV({ k, v, mono = true, className }: { k: ReactNode; v: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 py-[3px]', className)}>
      <span className="text-[11px] text-dim shrink-0">{k}</span>
      <span className={cx('text-[12px] text-text text-right truncate', mono && 'num')}>{v}</span>
    </div>
  );
}

/** INDICATIVE vs VERIFIED master-data badge for ETAs. */
export function DataBadge({ indicative, unverified }: { indicative: boolean; unverified?: string[] }) {
  return indicative ? (
    <Badge tone="warn" title={`Uses unverified master data:\n• ${(unverified ?? []).join('\n• ')}`}>
      <Icon name="triangle-alert" size={10} /> Indicative
    </Badge>
  ) : (
    <Badge tone="ok" title="All parameters verified in Master Data">
      <Icon name="shield-check" size={10} /> Verified
    </Badge>
  );
}

export function LinkArrow({ children, onClick, href, external }: { children: ReactNode; onClick?: () => void; href?: string; external?: boolean }) {
  const cls = 'inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-white transition-colors';
  if (href)
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className={cls}>
        {children} <span className="font-mono">{external ? '↗' : '→'}</span>
      </a>
    );
  return (
    <button onClick={onClick} className={cls}>
      {children} <span className="font-mono">→</span>
    </button>
  );
}

export function Modal({ open, onClose, title, children, width = 520, index }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; index?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="panel w-full max-h-[90vh] flex flex-col shadow-2xl" style={{ maxWidth: width, background: '#262626' }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <SpectrumBar height={2} />
        <header className="flex items-center gap-2 px-4 h-11 border-b border-line">
          {index && <span className="idx">{index} ·</span>}
          <h3 className="text-[12px] font-bold uppercase tracking-[0.1em]">{title}</h3>
          <button onClick={onClose} className="ml-auto text-dim hover:text-white" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Sparkline({ values, color = '#26d8d9', width = 80, height = 22, fill }: { values: number[]; color?: string; width?: number; height?: number; fill?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const r = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / r) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} className="overflow-visible shrink-0">
      {fill && <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}

// ── time helpers bound to store tz ─────────────────────────────────────────
export function useNow(granularityMs = 1000): number {
  return useOps((s) => Math.floor(s.now / granularityMs) * granularityMs);
}
export function useTz() {
  return useOps((s) => s.tz);
}
export function Stamp({ ts, mode = 'stamp' }: { ts: number; mode?: 'stamp' | 'clock' | 'date' }) {
  const tz = useTz();
  if (!isFinite(ts)) return <span className="num text-dim">—</span>;
  return <span className="num">{mode === 'clock' ? `${fmtClock(ts, tz, false)}` : mode === 'date' ? fmtDateShort(ts, tz) : fmtStamp(ts, tz)}</span>;
}

/** Small "copy/expand" helper: keeps a value fixed while the user is interacting. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t.current);
  }, [value, ms]);
  return v;
}

export function Select<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; label?: string }) {
  return (
    <label className={cx('inline-flex items-center gap-1.5', className)}>
      {label && <span className="label">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="field pr-6 cursor-pointer appearance-none bg-[length:10px] bg-no-repeat bg-[right_6px_center]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b4b4b4' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-card">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { Icon };
export type { IconName, Tone };
