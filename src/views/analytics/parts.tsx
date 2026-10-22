// Small presentational helpers shared by the analytics sub-tabs.
import type { ReactNode } from 'react';
import { Icon, Sparkline, cx, type IconName, type Tone } from '../../ui/kit';
import { TONE_COLOR } from '../../data/catalog';

/** Signed percentage change, coloured by whether the direction is good. */
export function Delta({ pct, goodWhen = 'up', className, suffix = 'vs prev' }: { pct: number; goodWhen?: 'up' | 'down'; className?: string; suffix?: string }) {
  if (!isFinite(pct)) return <span className={cx('num text-[10.5px] text-dim', className)}>— {suffix}</span>;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : (pct > 0) === (goodWhen === 'up');
  return (
    <span className={cx('num text-[10.5px] inline-flex items-center gap-1', flat ? 'text-dim' : good ? 'text-ok' : 'text-alert', className)}>
      {!flat && <Icon name={pct > 0 ? 'trending-up' : 'trending-down'} size={11} />}
      {pct > 0 ? '+' : flat ? '±' : '−'}
      {Math.abs(pct).toFixed(1)}%<span className="text-dim font-sans"> {suffix}</span>
    </span>
  );
}

/** Absolute-point delta (e.g. SLA percentage points). */
export function DeltaPts({ pts, goodWhen = 'up', unit = 'pp' }: { pts: number; goodWhen?: 'up' | 'down'; unit?: string }) {
  if (!isFinite(pts)) return <span className="num text-[10.5px] text-dim">— vs prev</span>;
  const flat = Math.abs(pts) < 0.05;
  const good = flat ? null : (pts > 0) === (goodWhen === 'up');
  return (
    <span className={cx('num text-[10.5px] inline-flex items-center gap-1', flat ? 'text-dim' : good ? 'text-ok' : 'text-alert')}>
      {!flat && <Icon name={pts > 0 ? 'trending-up' : 'trending-down'} size={11} />}
      {pts > 0 ? '+' : flat ? '±' : '−'}
      {Math.abs(pts).toFixed(1)} {unit}
      <span className="text-dim font-sans"> vs prev</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  spark,
  sparkColor = '#c560c8',
  sub,
  tone,
  title,
}: {
  label: string;
  /** @deprecated icons were removed from tiles for a quieter look; kept for call-site compatibility. */
  icon?: IconName;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  sub?: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="px-3 py-2 min-w-0 flex flex-col gap-0.5" title={title}>
      <div className="text-[11px] text-muted truncate">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="num text-[19px] font-semibold leading-none truncate" style={{ color: tone ? TONE_COLOR[tone] : '#fff' }}>
            {value}
          </span>
          {unit && <span className="text-[10.5px] text-dim shrink-0">{unit}</span>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor} width={64} height={18} />}
      </div>
      {(delta || sub) && (
        <div className="flex items-center gap-2 min-h-[15px]">
          {delta}
          {sub && <span className="text-[10.5px] text-dim truncate">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── Compact KPI strip (one 44 px row; captions live in the tooltip) ────────
const HIDE_BELOW = { lg: 'max-lg:hidden', xl: 'max-xl:hidden', '2xl': 'max-2xl:hidden' } as const;

/** One-row KPI strip. Scrolls horizontally inside itself when it can't fit. */
export function KpiStrip({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cx('panel flex items-stretch overflow-x-auto overflow-y-hidden shrink-0', className)} role={label ? 'toolbar' : undefined} aria-label={label}>
      {children}
    </div>
  );
}

/**
 * Inline KPI: value + label on one line. `title` carries the old caption.
 * `hide` drops low-priority cells below a viewport breakpoint.
 */
export function KpiCell({
  label,
  value,
  unit,
  tone,
  title,
  onClick,
  active,
  dot,
  pulse,
  hide,
  extra,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  title?: string;
  onClick?: () => void;
  active?: boolean;
  dot?: Tone;
  pulse?: boolean;
  hide?: keyof typeof HIDE_BELOW;
  extra?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!active : undefined}
      className={cx(
        'relative flex items-center gap-2 h-11 px-3 flex-1 min-w-max border-r border-line last:border-r-0 text-left transition-colors',
        onClick && 'hover:bg-white/[0.03]',
        active && 'bg-white/[0.05]',
        hide && HIDE_BELOW[hide],
      )}
    >
      {dot && (
        <span className="relative inline-flex shrink-0 w-1.5 h-1.5">
          {pulse && <span className="absolute inset-0 rounded-full pulse-ring" style={{ background: TONE_COLOR[dot] }} />}
          <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR[dot] }} />
        </span>
      )}
      <span className="flex items-baseline gap-0.5">
        <span className={cx('num text-[17px] font-semibold leading-none', tone ? TONE_TEXT_CLS[tone] : 'text-white')}>{value}</span>
        {unit && <span className="text-[10.5px] text-dim">{unit}</span>}
      </span>
      <span className="text-[11.5px] text-muted whitespace-nowrap">{label}</span>
      {extra}
      {active && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: 'var(--view-accent)' }} />}
    </Tag>
  );
}
const TONE_TEXT_CLS: Record<Tone, string> = { ok: 'text-ok', live: 'text-live', warn: 'text-warn', alert: 'text-alert', idle: 'text-idle' };

/** Small (i) icon that carries explanatory text in its tooltip. */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cx('inline-flex text-dim hover:text-muted cursor-help', className)} title={text} aria-label={text}>
      <Icon name="info" size={12} />
    </span>
  );
}

/** Hairline grid of tiles (borders between cells, no outer double borders). */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('panel grid gap-px bg-line', className)} style={{ background: 'rgba(255,255,255,0.10)' }}>{children}</div>;
}

export function TileCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bg-card', className)}>{children}</div>;
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <i className="w-3 h-[2px] inline-block" style={{ background: i.color, opacity: i.dashed ? 0.6 : 1 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Sort header button for dense tables. */
export function SortTh<K extends string>({ k, sort, setSort, children, right, className }: { k: K; sort: { k: K; dir: 1 | -1 }; setSort: (s: { k: K; dir: 1 | -1 }) => void; children: ReactNode; right?: boolean; className?: string }) {
  const on = sort.k === k;
  return (
    <th className={cx(right && 'text-right', className)}>
      <button className={cx('inline-flex items-center gap-1 uppercase tracking-[0.12em]', on ? 'text-text' : 'hover:text-muted')} onClick={() => setSort({ k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })}>
        {children}
        <span className="font-mono text-[9px] w-2">{on ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
      </button>
    </th>
  );
}
