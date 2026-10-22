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
  icon,
  value,
  unit,
  delta,
  spark,
  sparkColor = '#c560c8',
  sub,
  tone,
}: {
  label: string;
  icon?: IconName;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="px-3 py-2.5 min-w-0 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 label truncate">
        {icon && <Icon name={icon} size={11} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="num text-[21px] font-semibold leading-none truncate" style={{ color: tone ? TONE_COLOR[tone] : '#fff' }}>
            {value}
          </span>
          {unit && <span className="text-[11px] text-dim shrink-0">{unit}</span>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor} width={72} height={22} fill />}
      </div>
      <div className="flex items-center gap-2 min-h-[16px]">
        {delta}
        {sub && <span className="text-[10.5px] text-dim truncate">{sub}</span>}
      </div>
    </div>
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
