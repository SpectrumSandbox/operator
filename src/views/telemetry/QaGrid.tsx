import { useMemo, useRef, useState } from 'react';
import type { Mission, PipelineRun } from '../../types';
import { MISSION_PROFILES, TONE_COLOR } from '../../data/catalog';
import { Badge, Icon, Panel, TONE_TEXT, cx } from '../../ui/kit';
import { geometryPoints, lineLengthKm, polygonAreaHa } from '../../lib/geo';
import { FLAG_THRESHOLD, qaColor, qaTone, suggestedAction } from './shared';

interface Cell {
  i: number;
  r: number;
  c: number;
  id: string;
  score: number;
  extent: string;
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function cellsFor(run: PipelineRun, mission?: Mission): { cells: Cell[]; spanKm?: number } {
  const { cols, scores, layout } = run.grid;
  let spanKm: number | undefined;
  if (layout === 'corridor' && mission) {
    const g = mission.geometry;
    spanKm = g.kind === 'corridor' || g.kind === 'route' ? lineLengthKm(g.line) : mission.workload;
  }
  const segKm = spanKm ? spanKm / cols : undefined;
  const cells: Cell[] = scores.map((score, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const id = layout === 'corridor' ? `L${r + 1}·S${String(c + 1).padStart(2, '0')}` : `${ROW_LETTERS[r] ?? r}${String(c + 1).padStart(2, '0')}`;
    const extent = layout === 'corridor' && segKm ? `km ${(c * segKm).toFixed(1)}–${((c + 1) * segKm).toFixed(1)} · lane ${r + 1}` : `row ${ROW_LETTERS[r]} · col ${c + 1}`;
    return { i, r, c, id, score, extent };
  });
  return { cells, spanKm };
}

export function QaGrid({ run, mission }: { run: PipelineRun; mission?: Mission }) {
  const { cells, spanKm } = useMemo(() => cellsFor(run, mission), [run, mission]);
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { rows, cols, layout } = run.grid;
  const corridor = layout === 'corridor';

  const flagged = cells.filter((c) => c.score < FLAG_THRESHOLD).sort((a, b) => a.score - b.score);
  const reflight = flagged.filter((c) => c.score < 60);
  const review = flagged.filter((c) => c.score >= 60);
  const mean = cells.reduce((a, c) => a + c.score, 0) / Math.max(1, cells.length);
  const pass = cells.filter((c) => c.score >= 80).length;

  // Geometry of the SVG
  const cw = corridor ? 30 : 34;
  const ch = corridor ? 24 : 34;
  const gap = corridor ? 1 : 2;
  const padL = corridor ? 26 : 22;
  const padT = corridor ? 22 : 18;
  const padB = corridor ? 26 : 6;
  const W = padL + cols * (cw + gap) + 8;
  const H = padT + rows * (ch + gap) + padB;
  const x = (c: number) => padL + c * (cw + gap);
  const y = (r: number) => padT + r * (ch + gap);

  const markerEvery = Math.max(1, Math.ceil(cols / 8));
  const segKm = spanKm ? spanKm / cols : undefined;
  const prof = mission ? MISSION_PROFILES[mission.type] : undefined;
  const geomCtx = mission
    ? mission.geometry.kind === 'aoi'
      ? `AOI ${polygonAreaHa(mission.geometry.polygon).toFixed(0)} ha · ${geometryPoints(mission.geometry).length}-vertex polygon`
      : mission.geometry.kind === 'loiter'
        ? `Loiter r ${mission.geometry.radiusKm} km`
        : `${lineLengthKm(mission.geometry.line).toFixed(1)} km ${mission.geometry.kind}`
    : '';

  const onMove = (e: React.MouseEvent, cell: Cell) => {
    const b = wrap.current?.getBoundingClientRect();
    if (!b) return;
    setHover({ cell, x: e.clientX - b.left, y: e.clientY - b.top });
  };
  const focus = pinned !== null ? cells[pinned] : undefined;

  return (
    <Panel
      title={corridor ? 'Segment QA map' : 'Cell QA map'}
      index="C.1"
      subtitle={
        <span className="num">
          {rows}×{cols} {corridor ? 'lanes × segments' : 'cells'}
        </span>
      }
      actions={<span className={cx('num text-[11px]', TONE_TEXT[qaTone(mean)])}>mean {mean.toFixed(1)}</span>}
    >
      <div className="grid lg:grid-cols-[1fr_250px]">
        <div className="p-3 min-w-0 border-b lg:border-b-0 lg:border-r border-line">
          <div className="flex items-center gap-2 text-[10.5px] text-dim mb-2 flex-wrap">
            {mission && prof && (
              <span className="flex items-center gap-1" style={{ color: prof.color }}>
                <Icon name={prof.icon} size={11} /> {mission.code} · {prof.short} · {mission.subtype}
              </span>
            )}
            {geomCtx && <span className="num">· {geomCtx}</span>}
            <span className="ml-auto num">
              {pass}/{cells.length} cells ≥ 80
            </span>
          </div>
          <div ref={wrap} className="relative overflow-x-auto" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" style={{ minWidth: corridor ? 560 : 260, maxHeight: corridor ? 260 : 380, maxWidth: corridor ? undefined : Math.max(320, W * 1.8) }} role="img" aria-label="QA score grid">
              {corridor ? (
                <>
                  {/* corridor band */}
                  <rect x={padL - 6} y={padT - 6} width={cols * (cw + gap) + 11} height={rows * (ch + gap) + 11} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.18)" strokeDasharray="4 3" />
                  {/* centreline */}
                  <line x1={padL - 6} x2={padL + cols * (cw + gap) + 5} y1={padT + (rows * (ch + gap)) / 2 - gap / 2} y2={padT + (rows * (ch + gap)) / 2 - gap / 2} stroke="rgba(255,255,255,0.35)" strokeDasharray="1 3" />
                  {Array.from({ length: rows }, (_, r) => (
                    <text key={r} x={padL - 10} y={y(r) + ch / 2 + 3} textAnchor="end" className="num" fontSize={8.5} fill="#7a7a7a">
                      L{r + 1}
                    </text>
                  ))}
                  {Array.from({ length: cols + 1 }, (_, c) =>
                    c % markerEvery === 0 || c === cols ? (
                      <g key={c}>
                        <line x1={x(c) - gap / 2} x2={x(c) - gap / 2} y1={padT + rows * (ch + gap) + 4} y2={padT + rows * (ch + gap) + 9} stroke="#7a7a7a" />
                        <text x={x(c) - gap / 2} y={padT + rows * (ch + gap) + 19} textAnchor="middle" className="num" fontSize={8.5} fill="#7a7a7a">
                          {segKm ? `${(c * segKm).toFixed(c * segKm >= 100 ? 0 : 1)}` : `WP${c}`}
                        </text>
                      </g>
                    ) : null,
                  )}
                  <text x={padL - 6} y={10} className="num" fontSize={8.5} fill="#7a7a7a">
                    {segKm ? `KM ALONG CORRIDOR · ${segKm.toFixed(2)} km/segment` : 'WAYPOINT SEGMENTS'}
                  </text>
                  <text x={padL + cols * (cw + gap) + 5} y={10} textAnchor="end" className="num" fontSize={8.5} fill="#7a7a7a">
                    {spanKm ? `${spanKm.toFixed(1)} km` : ''}
                  </text>
                </>
              ) : (
                <>
                  {Array.from({ length: cols }, (_, c) => (
                    <text key={c} x={x(c) + cw / 2} y={padT - 6} textAnchor="middle" className="num" fontSize={8.5} fill="#7a7a7a">
                      {c + 1}
                    </text>
                  ))}
                  {Array.from({ length: rows }, (_, r) => (
                    <text key={r} x={padL - 8} y={y(r) + ch / 2 + 3} textAnchor="middle" className="num" fontSize={8.5} fill="#7a7a7a">
                      {ROW_LETTERS[r]}
                    </text>
                  ))}
                </>
              )}
              {cells.map((cell) => {
                const flag = cell.score < FLAG_THRESHOLD;
                const isHover = hover?.cell.i === cell.i || pinned === cell.i;
                return (
                  <g key={cell.i} onMouseMove={(e) => onMove(e, cell)} onClick={() => setPinned(pinned === cell.i ? null : cell.i)} className="cursor-pointer">
                    <rect x={x(cell.c)} y={y(cell.r)} width={cw} height={ch} fill={qaColor(cell.score)} opacity={flag ? 0.95 : 0.78} />
                    {flag && <rect x={x(cell.c) + 1} y={y(cell.r) + 1} width={cw - 2} height={ch - 2} fill="none" stroke="#fff" strokeWidth={1.4} />}
                    {isHover && <rect x={x(cell.c) - 1.5} y={y(cell.r) - 1.5} width={cw + 3} height={ch + 3} fill="none" stroke="#fff" strokeWidth={1.5} />}
                    {(!corridor || flag) && (
                      <text x={x(cell.c) + cw / 2} y={y(cell.r) + ch / 2 + 3} textAnchor="middle" className="num pointer-events-none" fontSize={corridor ? 8 : 9} fontWeight={600} fill={flag ? '#fff' : 'rgba(22,22,22,0.75)'}>
                        {cell.score}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {hover && (
              <div
                className="absolute z-10 pointer-events-none glass px-2.5 py-2 text-[11px] w-[210px]"
                style={{ left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 400) - 220), top: hover.y + 14 }}
              >
                <div className="flex items-center justify-between">
                  <span className="num font-semibold text-white">{hover.cell.id}</span>
                  <span className="num font-semibold" style={{ color: qaColor(hover.cell.score) }}>
                    {hover.cell.score}
                    <span className="text-dim font-normal">/100</span>
                  </span>
                </div>
                <div className="num text-[10px] text-dim">{hover.cell.extent}</div>
                <div className={cx('mt-1', TONE_TEXT[suggestedAction(hover.cell.score).tone])}>{suggestedAction(hover.cell.score).text}</div>
              </div>
            )}
          </div>
          {/* legend */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-[10.5px] text-dim">QA score</span>
            <div className="flex items-center gap-1.5">
              <span className="num text-[10px] text-dim">0</span>
              <div className="w-[160px] h-[8px]" style={{ background: `linear-gradient(90deg, ${[0, 30, 50, 60, 70, 80, 90, 100].map((v) => `${qaColor(v)} ${v}%`).join(', ')})` }} />
              <span className="num text-[10px] text-dim">100</span>
            </div>
            <span className="flex items-center gap-1 text-[10.5px] text-muted">
              <span className="w-2.5 h-2.5" style={{ background: TONE_COLOR.alert }} /> &lt; 60 re-flight
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-muted">
              <span className="w-2.5 h-2.5" style={{ background: TONE_COLOR.warn }} /> 60–80 marginal
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-muted">
              <span className="w-2.5 h-2.5" style={{ background: TONE_COLOR.ok }} /> ≥ 80 pass
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-muted">
              <span className="w-2.5 h-2.5 border-[1.5px] border-white" /> flagged &lt; {FLAG_THRESHOLD}
            </span>
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-3 h-8 border-b border-line text-[11px]">
            <span className="text-dim">
              <span className={cx('num font-semibold', reflight.length ? 'text-alert' : 'text-dim')}>{reflight.length}</span> re-flight
            </span>
            <span className="text-dim">
              <span className={cx('num font-semibold', review.length ? 'text-warn' : 'text-dim')}>{review.length}</span> review
            </span>
            <span className="ml-auto text-dim">
              <span className="num">{flagged.length}</span> flagged
            </span>
          </div>
          <ul className="flex-1 min-h-0 overflow-auto max-h-[260px] px-1 pb-2">
            {flagged.length === 0 && (
              <li className="px-2 py-4 text-[11.5px] text-dim flex items-center gap-1.5">
                <Icon name="circle-check" size={12} className="text-ok" /> No cells below {FLAG_THRESHOLD} — dataset passes spatial QA.
              </li>
            )}
            {flagged.map((c) => {
              const a = suggestedAction(c.score);
              return (
                <li key={c.i}>
                  <button
                    onClick={() => setPinned(pinned === c.i ? null : c.i)}
                    className={cx('w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.04]', pinned === c.i && 'bg-white/[0.07]')}
                  >
                    <span className="w-2 h-2 shrink-0" style={{ background: qaColor(c.score) }} />
                    <span className="num text-[11px] text-white w-[52px]">{c.id}</span>
                    <span className={cx('text-[10.5px] truncate flex-1', TONE_TEXT[a.tone])}>{c.score < 60 ? 'requires re-flight' : 'manual review'}</span>
                    <span className="num text-[11px] text-muted">{c.score}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {focus && (
            <div className="border-t border-line px-3 py-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="num text-white font-semibold">{focus.id}</span>
                <Badge tone={qaTone(focus.score)}>{focus.score}</Badge>
              </div>
              <div className="num text-[10px] text-dim mt-0.5">{focus.extent}</div>
              <div className={cx('mt-1', TONE_TEXT[suggestedAction(focus.score).tone])}>{suggestedAction(focus.score).text}</div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
