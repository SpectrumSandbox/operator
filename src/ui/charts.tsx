// d3-powered SVG charts styled to the Spectrum hairline aesthetic.
import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { cx } from './kit';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(120, Math.floor(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const AXIS = '#7a7a7a';
const GRID = 'rgba(255,255,255,0.07)';

export interface Series {
  name: string;
  color: string;
  values: { x: number; y: number }[];
  dashed?: boolean;
  area?: boolean;
}

export function LineChart({
  series,
  height = 200,
  yFormat = (v) => String(Math.round(v)),
  xFormat,
  yDomain,
  target,
  className,
  legend = true,
}: {
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  yDomain?: [number, number];
  target?: { y: number; label: string };
  className?: string;
  legend?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 10, r: 12, b: 22, l: 42 };
  const all = series.flatMap((s) => s.values);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x = scaleTime()
    .domain([Math.min(...xs), Math.max(...xs)])
    .range([m.l, width - m.r]);
  const yd = yDomain ?? [Math.min(0, ...ys, target?.y ?? Infinity), Math.max(...ys, target?.y ?? -Infinity) * 1.08];
  const y = scaleLinear().domain(yd).nice().range([height - m.b, m.t]);
  const ln = line<{ x: number; y: number }>()
    .x((d) => x(d.x))
    .y((d) => y(d.y))
    .curve(curveMonotoneX);
  const ar = area<{ x: number; y: number }>()
    .x((d) => x(d.x))
    .y0(y(yd[0]))
    .y1((d) => y(d.y))
    .curve(curveMonotoneX);
  const xTicks = x.ticks(Math.max(2, Math.floor(width / 110)));
  const hoverX = hover !== null ? x.invert(hover).getTime() : null;
  const nearest = (s: Series) => (hoverX === null ? null : s.values.reduce((a, b) => (Math.abs(b.x - hoverX) < Math.abs(a.x - hoverX) ? b : a), s.values[0]));
  if (!all.length) return <div ref={ref} style={{ height }} />;
  return (
    <div ref={ref} className={cx('relative w-full', className)}>
      {legend && series.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <i className="w-3 h-[2px] inline-block" style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} onMouseMove={(e) => setHover(e.nativeEvent.offsetX)} onMouseLeave={() => setHover(null)} className="block">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9.5} fill={AXIS} fontFamily="JetBrains Mono, monospace">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={+t} x={x(t)} y={height - 6} textAnchor="middle" fontSize={9.5} fill={AXIS} fontFamily="JetBrains Mono, monospace">
            {xFormat ? xFormat(+t) : `${t.getUTCDate()}/${t.getUTCMonth() + 1}`}
          </text>
        ))}
        {target && (
          <g>
            <line x1={m.l} x2={width - m.r} y1={y(target.y)} y2={y(target.y)} stroke="#e8a33a" strokeDasharray="4 3" />
            <text x={width - m.r} y={y(target.y) - 4} textAnchor="end" fontSize={9.5} fill="#e8a33a">
              {target.label}
            </text>
          </g>
        )}
        {series.map((s) => (
          <g key={s.name}>
            {s.area && <path d={ar(s.values) ?? ''} fill={s.color} opacity={0.1} />}
            <path d={ln(s.values) ?? ''} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? '4 3' : undefined} />
          </g>
        ))}
        {hover !== null && hover > m.l && hover < width - m.r && (
          <g>
            <line x1={hover} x2={hover} y1={m.t} y2={height - m.b} stroke="rgba(255,255,255,0.25)" />
            {series.map((s) => {
              const p = nearest(s);
              return p ? <circle key={s.name} cx={x(p.x)} cy={y(p.y)} r={3} fill={s.color} stroke="#202020" /> : null;
            })}
          </g>
        )}
      </svg>
      {hover !== null && hoverX !== null && (
        <div className="absolute pointer-events-none glass px-2 py-1.5 text-[10.5px] z-10" style={{ left: Math.min(hover + 10, width - 170), top: 18 }}>
          <div className="text-dim num mb-0.5">{xFormat ? xFormat(nearest(series[0])?.x ?? hoverX) : new Date(nearest(series[0])?.x ?? hoverX).toISOString().slice(0, 10)}</div>
          {series.map((s) => {
            const p = nearest(s);
            return (
              <div key={s.name} className="flex items-center gap-2">
                <i className="w-2 h-2 inline-block" style={{ background: s.color }} />
                <span className="text-muted">{s.name}</span>
                <span className="num ml-auto pl-3 text-white">{p ? yFormat(p.y) : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface BarDatum {
  label: string;
  values: Record<string, number>;
}

export function BarChart({
  data,
  keys,
  colors,
  height = 200,
  stacked = true,
  yFormat = (v) => String(Math.round(v)),
  className,
  legendLabels,
}: {
  data: BarDatum[];
  keys: string[];
  colors: Record<string, string>;
  height?: number;
  stacked?: boolean;
  yFormat?: (v: number) => string;
  className?: string;
  legendLabels?: Record<string, string>;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 10, r: 8, b: 26, l: 42 };
  const x = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([m.l, width - m.r])
    .padding(0.28);
  const max = Math.max(1, ...data.map((d) => (stacked ? keys.reduce((s, k) => s + (d.values[k] ?? 0), 0) : Math.max(...keys.map((k) => d.values[k] ?? 0)))));
  const y = scaleLinear().domain([0, max * 1.08]).nice().range([height - m.b, m.t]);
  const inner = scaleBand<string>().domain(keys).range([0, x.bandwidth()]).padding(0.12);
  const skip = Math.ceil(data.length / Math.max(1, Math.floor(width / 54)));
  return (
    <div ref={ref} className={cx('relative w-full', className)}>
      {keys.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
          {keys.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <i className="w-2 h-2 inline-block" style={{ background: colors[k] }} />
              {legendLabels?.[k] ?? k}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} className="block" onMouseLeave={() => setHover(null)}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9.5} fill={AXIS} fontFamily="JetBrains Mono, monospace">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={(x(d.label) ?? 0) - 2} y={m.t} width={x.bandwidth() + 4} height={height - m.b - m.t} fill={hover === i ? 'rgba(255,255,255,0.04)' : 'transparent'} />
              {keys.map((k) => {
                const v = d.values[k] ?? 0;
                if (stacked) {
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  return <rect key={k} x={x(d.label)} y={y1} width={x.bandwidth()} height={Math.max(0, y0 - y1)} fill={colors[k]} />;
                }
                return <rect key={k} x={(x(d.label) ?? 0) + (inner(k) ?? 0)} y={y(v)} width={inner.bandwidth()} height={Math.max(0, y(0) - y(v))} fill={colors[k]} />;
              })}
              {i % skip === 0 && (
                <text x={(x(d.label) ?? 0) + x.bandwidth() / 2} y={height - 8} textAnchor="middle" fontSize={9.5} fill={AXIS} fontFamily="JetBrains Mono, monospace">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute pointer-events-none glass px-2 py-1.5 text-[10.5px] z-10" style={{ left: Math.min((x(data[hover].label) ?? 0) + x.bandwidth() + 6, width - 170), top: 14 }}>
          <div className="text-dim num mb-0.5">{data[hover].label}</div>
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <i className="w-2 h-2 inline-block" style={{ background: colors[k] }} />
              <span className="text-muted">{legendLabels?.[k] ?? k}</span>
              <span className="num ml-auto pl-3 text-white">{yFormat(data[hover].values[k] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with labels — for rankings / utilisation. */
export function HBars({ rows, max, format = (v) => String(v), color = '#26d8d9', right }: { rows: { label: ReactNode; value: number; color?: string; sub?: ReactNode }[]; max?: number; format?: (v: number) => string; color?: string; right?: (i: number) => ReactNode }) {
  const mx = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="text-text truncate">{r.label}</span>
            <span className="num text-white shrink-0">{format(r.value)}</span>
            {right?.(i)}
          </div>
          <div className="h-[5px] bg-white/[0.07] mt-1">
            <div className="h-full" style={{ width: `${Math.min(100, (r.value / mx) * 100)}%`, background: r.color ?? color }} />
          </div>
          {r.sub && <div className="text-[10px] text-dim mt-0.5">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Ring gauge for single percentages. */
export function Ring({ value, size = 64, color = '#3ccf6e', label }: { value: number; size?: number; color?: string; label?: ReactNode }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return useMemo(
    () => (
      <svg width={size} height={size} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={4} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={4} fill="none" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize={size / 4.6} fill="#fff" fontFamily="JetBrains Mono, monospace">
          {label ?? `${Math.round(v * 100)}%`}
        </text>
      </svg>
    ),
    [size, r, c, v, color, label],
  );
}
