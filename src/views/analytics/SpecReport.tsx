// Printable "Operations Performance Report" — styled after the designer.spectrumgroup.id
// Design Specification Sheet: white paper, ink text, blue/amber accents, hairline rules.
import type { CSSProperties, ReactNode } from 'react';
import { useOps } from '../../store';
import { MISSION_PROFILES, MISSION_TYPES } from '../../data/catalog';
import { SPECTRUM } from '../../ui/kit';
import { fmtDate, fmtDateShort, fmtClock, DAY } from '../../lib/time';
import { fmtIdr, fmtNum } from '../../lib/format';
import { adoption, aggregate, DELIVERY_WINDOW_H, AIRFRAME_DAY_H, CREW_DAY_H, filterLabel, meanSignoff, meanTat, pctDelta, SLA_TARGET, slaPct, type Filters } from './metrics';
import { usePerf, type PerfData } from './usePerf';

const C = {
  paper: '#ffffff',
  ink: '#14181f',
  accent: '#1d4ed8',
  second: '#b45309',
  line: '#d5d9e0',
  muted: '#5b6472',
  panel: '#f4f5f7',
  ok: '#15803d',
  bad: '#b91c1c',
};
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = 'Montserrat, "Helvetica Neue", Arial, sans-serif';

const PRINT_CSS = `
@media print {
  html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
  #root > div { display: block !important; height: auto !important; }
  main { display: block !important; min-height: 0 !important; }
  .sg-sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; }
  .sg-sheet + .sg-sheet { break-before: page; page-break-before: always; }
  .sg-keep { break-inside: avoid; page-break-inside: avoid; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

export function SpecReport({ f, mode }: { f: Filters; mode: 'print' | 'preview' }) {
  const d = usePerf(f);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const tz = useOps((s) => s.tz);
  const aiToday = useOps((s) => s.aiToday);
  const reportId = `SG-OPR-${fmtDate(now, tz).replace(/\s/g, '').toUpperCase().slice(0, 9)}-${f.period}${f.region === 'all' ? 'ID' : f.region.slice(0, 3).toUpperCase()}${f.type === 'all' ? 'X' : f.type[0].toUpperCase()}`;
  const meta = { reportId, issued: `${fmtDate(now, tz)} ${fmtClock(now, tz, false)} ${tz}`, window: `${fmtDateShort(d.start, tz)} – ${fmtDateShort(d.today - DAY, tz)} ${new Date(d.today).getUTCFullYear()}`, filters: filterLabel(f) };
  const pages = 3;
  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      {mode === 'print' && <style>{PRINT_CSS}</style>}
      <Sheet mode={mode} page={1} pages={pages} meta={meta}>
        <ReportHeader meta={meta} />
        <Summary d={d} f={f} aiToday={aiToday} />
        <ServiceLevels d={d} f={f} tz={tz} />
      </Sheet>
      <Sheet mode={mode} page={2} pages={pages} meta={meta}>
        <MiniHeader meta={meta} />
        <UnitEconomics d={d} f={f} />
        <Utilisation d={d} f={f} />
      </Sheet>
      <Sheet mode={mode} page={3} pages={pages} meta={meta}>
        <MiniHeader meta={meta} />
        <AiAdoption d={d} tz={tz} aiToday={aiToday} />
        <ClientDeliverables d={d} tz={tz} />
        <SignOff />
      </Sheet>
    </div>
  );
}

type Meta = { reportId: string; issued: string; window: string; filters: string };

function Sheet({ children, mode, page, pages, meta }: { children: ReactNode; mode: 'print' | 'preview'; page: number; pages: number; meta: Meta }) {
  const preview: CSSProperties = { width: 794, minHeight: 1123, padding: '46px 52px 40px', margin: '0 auto 18px', boxShadow: '0 2px 18px rgba(0,0,0,.35)' };
  return (
    <section className="sg-sheet" style={{ background: C.paper, color: C.ink, position: 'relative', display: 'flex', flexDirection: 'column', ...(mode === 'preview' ? preview : {}) }}>
      <div style={{ flex: 1 }}>{children}</div>
      <footer style={{ marginTop: 18, paddingTop: 6, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: C.muted, fontFamily: MONO }}>
        <span>PT SPECTRUM GROUP INDONESIA · operator.spectrumgroup.id</span>
        <span>{meta.reportId}</span>
        <span>
          PAGE {page} / {pages}
        </span>
      </footer>
    </section>
  );
}

function Bar({ h = 4 }: { h?: number }) {
  return (
    <div style={{ display: 'flex', height: h }}>
      {SPECTRUM.map((c) => (
        <i key={c} style={{ flex: 1, background: c }} />
      ))}
    </div>
  );
}

function ReportHeader({ meta }: { meta: Meta }) {
  return (
    <header className="sg-keep" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '0.02em', lineHeight: 1 }}>SPECTRUM</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <div style={{ width: 66 }}>
              <Bar h={3} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.2em' }}>GROUP</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: C.muted, fontFamily: MONO, lineHeight: 1.6 }}>
          <div>OPERATOR · UNMANNED SYSTEMS FLEET MANAGEMENT</div>
          <div>DOCUMENT CLASS: CLIENT / INTERNAL</div>
        </div>
      </div>
      <div style={{ marginTop: 18, borderTop: `2px solid ${C.ink}`, paddingTop: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, letterSpacing: '0.04em' }}>05 · OPERATIONS ANALYTICS</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.015em', margin: '2px 0 0', lineHeight: 1.15 }}>Operations Performance Report</h1>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Service levels, unit economics, utilisation, AI adoption and client deliverables.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 1.1fr 2.2fr', marginTop: 12, border: `1px solid ${C.line}`, background: C.panel }}>
        {[
          ['Report ID', meta.reportId],
          ['Issued', meta.issued],
          ['Reporting window', meta.window],
          ['Filters', meta.filters],
        ].map(([k, v], i) => (
          <div key={k} style={{ padding: '6px 9px', borderLeft: i ? `1px solid ${C.line}` : undefined }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>{k}</div>
            <div style={{ fontFamily: i < 3 ? MONO : SANS, fontSize: 9.5, marginTop: 2, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
    </header>
  );
}

function MiniHeader({ meta }: { meta: Meta }) {
  return (
    <header style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.02em' }}>SPECTRUM</span>
          <div style={{ width: 40 }}>
            <Bar h={2} />
          </div>
          <span style={{ fontSize: 9.5, color: C.muted }}>Operations Performance Report</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted }}>{meta.filters}</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.ink}` }} />
    </header>
  );
}

function H2({ n, title, note }: { n: string; title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `1px solid ${C.line}`, paddingBottom: 4, marginBottom: 9, marginTop: 4 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 600 }}>{n} ·</span>
      <h2 style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.005em', margin: 0 }}>{title}</h2>
      {note && <span style={{ marginLeft: 'auto', fontSize: 8.5, color: C.muted }}>{note}</span>}
    </div>
  );
}

const lbl: CSSProperties = { fontSize: 7.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted };
const th: CSSProperties = { ...lbl, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.ink}`, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '3.5px 6px', borderBottom: `1px solid ${C.line}`, fontSize: 9.5, verticalAlign: 'middle' };
const tdn: CSSProperties = { ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' };

function DeltaTxt({ pct, goodWhen = 'up', pts }: { pct: number; goodWhen?: 'up' | 'down'; pts?: boolean }) {
  if (!isFinite(pct)) return <span style={{ color: C.muted }}>—</span>;
  const good = pct === 0 ? null : (pct > 0) === (goodWhen === 'up');
  return (
    <span style={{ color: good === null ? C.muted : good ? C.ok : C.bad, fontFamily: MONO }}>
      {pct > 0 ? '▲ +' : pct < 0 ? '▼ −' : ''}
      {Math.abs(pct).toFixed(1)}
      {pts ? ' pp' : '%'}
    </span>
  );
}

function Summary({ d, f, aiToday }: { d: PerfData; f: Filters; aiToday: { accepted: number; overridden: number } }) {
  const sla = slaPct(d.cur);
  const tat = meanTat(d.cur);
  const ad = adoption(d.cur.aiAccepted, d.cur.aiOverridden);
  const tiles: [string, string, string, ReactNode][] = [
    ['Sorties flown', fmtNum(d.cur.sorties), '', <DeltaTxt pct={pctDelta(d.cur.sorties, d.prev.sorties)} />],
    ['Flight hours', fmtNum(d.cur.flightHrs, 1), 'FH', <DeltaTxt pct={pctDelta(d.cur.flightHrs, d.prev.flightHrs)} />],
    ['Deliverables', fmtNum(d.cur.deliverables), '', <DeltaTxt pct={pctDelta(d.cur.deliverables, d.prev.deliverables)} />],
    ['SLA adherence', isFinite(sla) ? sla.toFixed(1) : '—', '%', <DeltaTxt pct={sla - slaPct(d.prev)} pts />],
    ['Mean turnaround', isFinite(tat) ? tat.toFixed(1) : '—', 'h', <DeltaTxt pct={pctDelta(tat, meanTat(d.prev))} goodWhen="down" />],
    ['AI adoption', isFinite(ad) ? ad.toFixed(1) : '—', '%', <DeltaTxt pct={ad - adoption(d.prev.aiAccepted, d.prev.aiOverridden)} pts />],
  ];
  const best = d.clients.filter((c) => isFinite(c.sla)).sort((a, b) => b.sla - a.sla)[0];
  const worst = d.clients.filter((c) => isFinite(c.sla) && c.sla < c.target).sort((a, b) => a.sla - a.target - (b.sla - b.target))[0];
  const fh = d.econ.find((e) => e.def.id === 'fh')!;
  return (
    <section className="sg-keep" style={{ marginBottom: 16 }}>
      <H2 n="01" title="Summary" note={`vs previous ${f.period}-day window`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', border: `1px solid ${C.line}` }}>
        {tiles.map(([k, v, u, dl], i) => (
          <div key={k} style={{ padding: '7px 8px', borderLeft: i ? `1px solid ${C.line}` : undefined }}>
            <div style={lbl}>{k}</div>
            <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, marginTop: 3, lineHeight: 1.1 }}>
              {v}
              <span style={{ fontSize: 9, color: C.muted, marginLeft: 2 }}>{u}</span>
            </div>
            <div style={{ fontSize: 8.5, marginTop: 2 }}>{dl}</div>
          </div>
        ))}
      </div>
      <ul style={{ margin: '9px 0 0', paddingLeft: 14, fontSize: 9.5, lineHeight: 1.6 }}>
        <li>
          SLA adherence of <b style={{ fontFamily: MONO }}>{isFinite(sla) ? sla.toFixed(1) : '—'}%</b> against the {SLA_TARGET}% operator target — {fmtNum(d.cur.slaTotal - d.cur.slaMet)} of {fmtNum(d.cur.slaTotal)} commitments breached.
        </li>
        <li>
          Fully-loaded cost per flight hour <b style={{ fontFamily: MONO }}>{isFinite(fh.cur) ? fmtIdr(fh.cur) : '—'}</b> ({isFinite(pctDelta(fh.cur, fh.prev)) ? `${pctDelta(fh.cur, fh.prev) > 0 ? '+' : ''}${pctDelta(fh.cur, fh.prev).toFixed(1)}%` : 'n/a'} vs previous window).
        </li>
        {best && (
          <li>
            Strongest service level: <b>{best.name}</b> at <span style={{ fontFamily: MONO }}>{best.sla.toFixed(1)}%</span>
            {worst ? (
              <>
                ; attention required: <b>{worst.name}</b> at <span style={{ fontFamily: MONO, color: C.bad }}>{worst.sla.toFixed(1)}%</span> vs {worst.target}% contractual.
              </>
            ) : (
              '; all clients at or above contractual SLA.'
            )}
          </li>
        )}
        <li>
          AI schedule & unit recommendations accepted in <b style={{ fontFamily: MONO }}>{isFinite(ad) ? ad.toFixed(1) : '—'}%</b> of decisions (today: {aiToday.accepted} accepted, {aiToday.overridden} overridden with logged reason).
        </li>
      </ul>
    </section>
  );
}

/** Simple vertical bar chart (inline SVG, print-safe). */
function VBars({ data, height = 120, yMin = 0, yMax, target, color = C.accent, fmt, labelEvery = 1 }: { data: { label: string; v: number }[]; height?: number; yMin?: number; yMax?: number; target?: number; color?: string; fmt: (v: number) => string; labelEvery?: number }) {
  const W = 680;
  const m = { l: 34, r: 6, t: 8, b: 16 };
  const max = yMax ?? Math.max(1, ...data.map((x) => x.v)) * 1.1;
  const y = (v: number) => m.t + (1 - (v - yMin) / (max - yMin)) * (height - m.t - m.b);
  const bw = (W - m.l - m.r) / Math.max(1, data.length);
  const ticks = [0, 0.5, 1].map((k) => yMin + k * (max - yMin));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={0.6} />
          <text x={m.l - 4} y={y(t)} dy="0.32em" textAnchor="end" fontSize={7.5} fill={C.muted} fontFamily={MONO}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {data.map((x, i) => (
        <g key={i}>
          <rect x={m.l + i * bw + bw * 0.16} y={y(Math.max(yMin, x.v))} width={bw * 0.68} height={Math.max(0, y(yMin) - y(Math.max(yMin, x.v)))} fill={target !== undefined && x.v < target ? C.second : color} />
          {i % labelEvery === 0 && (
            <text x={m.l + i * bw + bw / 2} y={height - 4} textAnchor="middle" fontSize={7} fill={C.muted} fontFamily={MONO}>
              {x.label}
            </text>
          )}
        </g>
      ))}
      {target !== undefined && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={y(target)} y2={y(target)} stroke={C.ink} strokeDasharray="3 2" strokeWidth={0.8} />
          <rect x={m.l + 2} y={y(target) - 11} width={62} height={10} fill={C.paper} />
          <text x={m.l + 4} y={y(target) - 3} fontSize={7.5} fill={C.ink} fontFamily={MONO}>
            TARGET {target}%
          </text>
        </g>
      )}
    </svg>
  );
}

function ServiceLevels({ d, f, tz }: { d: PerfData; f: Filters; tz: 'WIB' | 'UTC' }) {
  const weekly = f.period > 30 ? d.buckets : d.aiBuckets;
  const slaData = weekly.map((b) => ({ label: fmtDateShort(b.t, tz), v: slaPct(aggregate(b.recs)) })).filter((x) => isFinite(x.v));
  const tatData = weekly.map((b) => ({ label: fmtDateShort(b.t, tz), v: meanTat(aggregate(b.recs)) })).filter((x) => isFinite(x.v));
  const minSla = Math.max(0, Math.floor(Math.min(80, ...slaData.map((x) => x.v)) / 10) * 10);
  const every = Math.ceil(slaData.length / 12);
  const types = MISSION_TYPES.map((t) => ({ t, a: aggregate(d.recs.filter((r) => r.type === t)), p: aggregate(d.prevRecs.filter((r) => r.type === t)) })).filter((x) => x.a.n);
  return (
    <section style={{ marginBottom: 6 }}>
      <H2 n="02" title="Service Levels" note={`${f.period <= 7 ? 'daily' : 'weekly'} buckets · amber bars below target`} />
      <p style={{ fontSize: 8.5, color: C.muted, margin: '-4px 0 8px' }}>
        A commitment is met when the mission flies on schedule and its deliverable is published within the contracted window ({Object.entries(DELIVERY_WINDOW_H).map(([t, h]) => `${MISSION_PROFILES[t as keyof typeof MISSION_PROFILES].short} ${h} h`).join(' · ')}).
      </p>
      <div className="sg-keep" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ ...lbl, marginBottom: 3 }}>SLA adherence %</div>
          <VBars data={slaData} yMin={minSla} yMax={100} target={SLA_TARGET} fmt={(v) => `${v.toFixed(0)}`} labelEvery={every} height={124} />
        </div>
        <div>
          <div style={{ ...lbl, marginBottom: 3 }}>Flight-to-publish turnaround (h, mean)</div>
          <VBars data={tatData} color={C.ink} fmt={(v) => v.toFixed(0)} labelEvery={every} height={124} />
        </div>
      </div>
      <table className="sg-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr>
            <th style={th}>Mission profile</th>
            <th style={{ ...th, textAlign: 'right' }}>Sorties</th>
            <th style={{ ...th, textAlign: 'right' }}>Flight h</th>
            <th style={{ ...th, textAlign: 'right' }}>Deliverables</th>
            <th style={{ ...th, textAlign: 'right' }}>SLA %</th>
            <th style={{ ...th, textAlign: 'right' }}>Δ SLA</th>
            <th style={{ ...th, textAlign: 'right' }}>Turnaround h</th>
            <th style={{ ...th, textAlign: 'right' }}>Δ TAT</th>
          </tr>
        </thead>
        <tbody>
          {types.map(({ t, a, p }) => (
            <tr key={t}>
              <td style={td}>
                <span style={{ display: 'inline-block', width: 6, height: 6, background: MISSION_PROFILES[t].color, marginRight: 6 }} />
                {MISSION_PROFILES[t].label}
              </td>
              <td style={tdn}>{fmtNum(a.sorties)}</td>
              <td style={tdn}>{fmtNum(a.flightHrs, 1)}</td>
              <td style={tdn}>{fmtNum(a.deliverables)}</td>
              <td style={{ ...tdn, color: slaPct(a) >= SLA_TARGET ? C.ink : C.second, fontWeight: 600 }}>{slaPct(a).toFixed(1)}</td>
              <td style={tdn}>
                <DeltaTxt pct={slaPct(a) - slaPct(p)} pts />
              </td>
              <td style={tdn}>{meanTat(a).toFixed(1)}</td>
              <td style={tdn}>
                <DeltaTxt pct={pctDelta(meanTat(a), meanTat(p))} goodWhen="down" />
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>All profiles</td>
            <td style={{ ...tdn, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>{fmtNum(d.cur.sorties)}</td>
            <td style={{ ...tdn, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>{fmtNum(d.cur.flightHrs, 1)}</td>
            <td style={{ ...tdn, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>{fmtNum(d.cur.deliverables)}</td>
            <td style={{ ...tdn, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>{slaPct(d.cur).toFixed(1)}</td>
            <td style={{ ...tdn, borderBottom: `1px solid ${C.ink}` }}>
              <DeltaTxt pct={slaPct(d.cur) - slaPct(d.prev)} pts />
            </td>
            <td style={{ ...tdn, fontWeight: 700, borderBottom: `1px solid ${C.ink}` }}>{meanTat(d.cur).toFixed(1)}</td>
            <td style={{ ...tdn, borderBottom: `1px solid ${C.ink}` }}>
              <DeltaTxt pct={pctDelta(meanTat(d.cur), meanTat(d.prev))} goodWhen="down" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function UnitEconomics({ d, f }: { d: PerfData; f: Filters }) {
  const maxFh = Math.max(1, ...MISSION_TYPES.map((t) => {
    const a = aggregate(d.recs.filter((r) => r.type === t));
    return a.flightHrs ? a.costIdr / a.flightHrs : 0;
  }));
  return (
    <section className="sg-keep" style={{ marginBottom: 18 }}>
      <H2 n="03" title="Unit Economics" note="IDR · fully-loaded direct operating cost" />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Metric</th>
            <th style={th}>Basis</th>
            <th style={{ ...th, textAlign: 'right' }}>This period</th>
            <th style={{ ...th, textAlign: 'right' }}>Previous {f.period} d</th>
            <th style={{ ...th, textAlign: 'right' }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {d.econ.map((e) => (
            <tr key={e.def.id}>
              <td style={{ ...td, fontWeight: 600 }}>{e.def.label}</td>
              <td style={{ ...td, color: C.muted }}>{e.def.basis}</td>
              <td style={{ ...tdn, fontWeight: 700 }}>{isFinite(e.cur) ? fmtIdr(e.cur, false) : '—'}</td>
              <td style={{ ...tdn, color: C.muted }}>{isFinite(e.prev) ? fmtIdr(e.prev, false) : '—'}</td>
              <td style={tdn}>
                <DeltaTxt pct={pctDelta(e.cur, e.prev)} goodWhen="down" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ ...lbl, margin: '12px 0 5px' }}>Cost per flight hour by mission profile</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {MISSION_TYPES.map((t) => {
          const a = aggregate(d.recs.filter((r) => r.type === t));
          if (!a.flightHrs) return null;
          const v = a.costIdr / a.flightHrs;
          return (
            <div key={t} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px', alignItems: 'center', gap: 8, fontSize: 9.5 }}>
              <span>{MISSION_PROFILES[t].short}</span>
              <div style={{ height: 8, background: C.panel, border: `1px solid ${C.line}` }}>
                <div style={{ height: '100%', width: `${(v / maxFh) * 100}%`, background: C.accent }} />
              </div>
              <span style={{ fontFamily: MONO, textAlign: 'right' }}>{fmtIdr(v)}/FH</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${C.line}`, background: C.panel }}>
        {[
          ['Total direct cost', fmtIdr(d.cur.costIdr, false)],
          ['Cost per sortie', d.cur.sorties ? fmtIdr(d.cur.costIdr / d.cur.sorties, false) : '—'],
          ['Cost per deliverable', d.cur.deliverables ? fmtIdr(d.cur.costIdr / d.cur.deliverables, false) : '—'],
        ].map(([k, v], i) => (
          <div key={k} style={{ padding: '6px 9px', borderLeft: i ? `1px solid ${C.line}` : undefined }}>
            <div style={lbl}>{k}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Utilisation({ d, f }: { d: PerfData; f: Filters }) {
  return (
    <section className="sg-keep">
      <H2 n="04" title="Fleet & Crew Utilisation" note={`fleet: FH ÷ (airframes × ${f.period} d × ${AIRFRAME_DAY_H} h) · crew: duty h ÷ rostered (${CREW_DAY_H.toFixed(1)} h/day)`} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Region</th>
            <th style={{ ...th, textAlign: 'right' }}>Airframes</th>
            <th style={{ ...th, textAlign: 'right' }}>Flight h</th>
            <th style={{ ...th, width: '24%' }}>Fleet utilisation</th>
            <th style={{ ...th, textAlign: 'right' }}>Crew</th>
            <th style={{ ...th, textAlign: 'right' }}>Duty h</th>
            <th style={{ ...th, width: '24%' }}>Crew utilisation</th>
          </tr>
        </thead>
        <tbody>
          {d.util.map((u) => (
            <tr key={u.id}>
              <td style={td}>
                <span style={{ fontFamily: MONO, color: C.muted, marginRight: 5 }}>{u.short}</span>
                {u.label}
              </td>
              <td style={tdn}>{u.airframes}</td>
              <td style={tdn}>{fmtNum(u.flightHrs, 0)}</td>
              <td style={td}>
                <UBar v={u.fleetPct} color={C.accent} />
              </td>
              <td style={tdn}>{u.crews}</td>
              <td style={tdn}>{fmtNum(u.crewHrs, 0)}</td>
              <td style={td}>
                <UBar v={u.crewPct} color={C.ink} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UBar({ v, color }: { v: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 7, background: C.panel, border: `1px solid ${C.line}` }}>
        <div style={{ height: '100%', width: `${Math.min(100, v)}%`, background: v > 90 ? C.bad : v > 75 ? C.second : color }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 9, width: 30, textAlign: 'right' }}>{v.toFixed(0)}%</span>
    </div>
  );
}

function AiAdoption({ d, tz, aiToday }: { d: PerfData; tz: 'WIB' | 'UTC'; aiToday: { accepted: number; overridden: number } }) {
  const W = 680;
  const H = 120;
  const m = { l: 30, r: 6, t: 8, b: 16 };
  const data = d.aiBuckets.map((b) => {
    const a = aggregate(b.recs);
    return { label: fmtDateShort(b.t, tz), acc: a.aiAccepted, ovr: a.aiOverridden };
  });
  const max = Math.max(1, ...data.map((x) => x.acc + x.ovr)) * 1.1;
  const y = (v: number) => m.t + (1 - v / max) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / Math.max(1, data.length);
  const every = Math.ceil(data.length / 12);
  const ad = adoption(d.cur.aiAccepted, d.cur.aiOverridden);
  const total = d.overrides.reduce((s, o) => s + o.count, 0);
  return (
    <section className="sg-keep" style={{ marginBottom: 18 }}>
      <H2 n="05" title="AI Adoption" note="schedule proposals & unit recommendations · accepted vs manual override" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', gap: 14 }}>
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            {[0, 0.5, 1].map((k) => (
              <g key={k}>
                <line x1={m.l} x2={W - m.r} y1={y(k * max)} y2={y(k * max)} stroke={C.line} strokeWidth={0.6} />
                <text x={m.l - 4} y={y(k * max)} dy="0.32em" textAnchor="end" fontSize={7.5} fill={C.muted} fontFamily={MONO}>
                  {Math.round(k * max)}
                </text>
              </g>
            ))}
            {data.map((x, i) => (
              <g key={i}>
                <rect x={m.l + i * bw + bw * 0.16} y={y(x.acc)} width={bw * 0.68} height={y(0) - y(x.acc)} fill={C.accent} />
                <rect x={m.l + i * bw + bw * 0.16} y={y(x.acc + x.ovr)} width={bw * 0.68} height={y(x.acc) - y(x.acc + x.ovr)} fill={C.second} />
                {i % every === 0 && (
                  <text x={m.l + i * bw + bw / 2} y={H - 4} textAnchor="middle" fontSize={7} fill={C.muted} fontFamily={MONO}>
                    {x.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 14, fontSize: 8.5, color: C.muted, marginTop: 3 }}>
            <span>
              <i style={{ display: 'inline-block', width: 8, height: 8, background: C.accent, marginRight: 4, verticalAlign: -1 }} />
              AI accepted
            </span>
            <span>
              <i style={{ display: 'inline-block', width: 8, height: 8, background: C.second, marginRight: 4, verticalAlign: -1 }} />
              Manual override
            </span>
          </div>
        </div>
        <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: '8px 10px' }}>
          <div style={lbl}>Period adoption</div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600 }}>{isFinite(ad) ? ad.toFixed(1) : '—'}%</div>
          <div style={{ fontSize: 8.5, color: C.muted, fontFamily: MONO }}>
            {fmtNum(d.cur.aiAccepted)} acc · {fmtNum(d.cur.aiOverridden)} ovr
          </div>
          <div style={{ ...lbl, marginTop: 8 }}>Today (live)</div>
          <div style={{ fontFamily: MONO, fontSize: 11 }}>
            {aiToday.accepted} acc · {aiToday.overridden} ovr
          </div>
          <div style={{ ...lbl, marginTop: 8, marginBottom: 2 }}>Override reasons ({total})</div>
          {d.overrides.map((o) => (
            <div key={o.reason} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: o.count ? C.ink : C.muted }}>{o.reason}</span>
              <span style={{ fontFamily: MONO }}>{o.count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClientDeliverables({ d, tz }: { d: PerfData; tz: 'WIB' | 'UTC' }) {
  const rows = d.clients.slice(0, 18);
  return (
    <section className="sg-keep" style={{ marginBottom: 14 }}>
      <H2 n="06" title="Client Deliverables" note={`mean sign-off ${meanSignoff(d.cur).toFixed(1)} h · ${d.clients.length} clients`} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Client</th>
            <th style={th}>Sector</th>
            <th style={{ ...th, textAlign: 'right' }}>Sorties</th>
            <th style={{ ...th, textAlign: 'right' }}>Deliverables</th>
            <th style={{ ...th, textAlign: 'right' }}>SLA %</th>
            <th style={{ ...th, textAlign: 'right' }}>Target</th>
            <th style={{ ...th, textAlign: 'right' }}>Sign-off h</th>
            <th style={{ ...th, textAlign: 'right' }}>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
              <td style={{ ...td, color: C.muted }}>{c.sector}</td>
              <td style={tdn}>{fmtNum(c.agg.sorties)}</td>
              <td style={tdn}>{fmtNum(c.agg.deliverables)}</td>
              <td style={{ ...tdn, fontWeight: 700, color: c.sla >= c.target ? C.ok : C.second }}>{c.sla.toFixed(1)}</td>
              <td style={{ ...tdn, color: C.muted }}>{c.target}</td>
              <td style={tdn}>{c.signoff.toFixed(1)}</td>
              <td style={tdn}>{fmtDateShort(c.agg.lastDay, tz)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SignOff() {
  return (
    <section className="sg-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 8 }}>
      {['Prepared — Ops Duty Officer', 'Reviewed — Chief Pilot', 'Approved — Ops Director'].map((r) => (
        <div key={r}>
          <div style={{ height: 30, borderBottom: `1px solid ${C.ink}` }} />
          <div style={{ ...lbl, marginTop: 4 }}>{r}</div>
          <div style={{ fontSize: 8.5, color: C.muted, fontFamily: MONO, marginTop: 1 }}>Name · Date</div>
        </div>
      ))}
    </section>
  );
}
