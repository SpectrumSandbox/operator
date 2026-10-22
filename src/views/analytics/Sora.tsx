// SORA pre-flight Operational Risk Assessment — GRC + ARC → SAIL → dispatch decision, with checklist gate.
import { useEffect, useMemo, useState } from 'react';
import { actions, useOps, ops } from '../../store';
import { AIRFRAME, AIRFRAME_CLASS_LABEL, MISSION_PROFILES, MISSION_STATUS, PRIORITY, TONE_COLOR, ZONE_META } from '../../data/catalog';
import { computeSora, defaultMitigations, SORA_CHECKLIST, type Arc, type SoraMitigations } from '../../engine/sora';
import { candidatesFor } from '../../engine/eta';
import { Badge, Empty, Icon, KV, Meter, Panel, Select, cx, type Tone } from '../../ui/kit';
import { fmtNum } from '../../lib/format';

const GRC_ROWS = [
  'VLOS · controlled ground area',
  'BVLOS · controlled ground area',
  'VLOS · sparsely populated',
  'BVLOS · sparsely populated',
  'VLOS · populated',
  'BVLOS · populated',
  'VLOS · gathering of people',
  'BVLOS · gathering of people',
];
const GRC_TABLE: number[][] = [
  [1, 2, 3, 4],
  [1, 2, 3, 4],
  [2, 3, 4, 5],
  [3, 4, 5, 6],
  [4, 5, 6, 8],
  [5, 6, 8, 10],
  [7, 7, 7, 7],
  [8, 8, 8, 8],
];
const DIM_COLS = ['1 m · < 700 J', '3 m · < 34 kJ', '8 m · < 1 084 kJ', '> 8 m · > 1 084 kJ'];
const SAIL_ROWS: [string, string[]][] = [
  ['≤ 2', ['I', 'II', 'IV', 'VI']],
  ['3', ['II', 'II', 'IV', 'VI']],
  ['4', ['III', 'III', 'IV', 'VI']],
  ['5', ['IV', 'IV', 'IV', 'VI']],
  ['6', ['V', 'V', 'V', 'VI']],
  ['7', ['VI', 'VI', 'VI', 'VI']],
];
const ARCS: Arc[] = ['a', 'b', 'c', 'd'];
const SAIL_IDX: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, Certified: 7 };
const sailColor = (s: string) => {
  const i = SAIL_IDX[s] ?? 7;
  return i <= 2 ? TONE_COLOR.ok : i <= 4 ? TONE_COLOR.warn : TONE_COLOR.alert;
};
const DISPATCH: Record<string, { label: string; tone: Tone; icon: 'shield-check' | 'shield-alert' | 'octagon-x' }> = {
  approved: { label: 'Dispatch approved', tone: 'ok', icon: 'shield-check' },
  authorisation: { label: 'Requires DKPPU authorisation', tone: 'warn', icon: 'shield-alert' },
  prohibited: { label: 'Dispatch prohibited', tone: 'alert', icon: 'octagon-x' },
};

/** Per-mission checklist state survives tab switches for the session. */
const checklistStore = new Map<string, Set<string>>();
const mitigationStore = new Map<string, SoraMitigations>();

export function SoraTab() {
  const missions = useOps((s) => s.missions);
  const units = useOps((s) => s.units);
  const zones = useOps((s) => s.zones);
  const selectedMissionId = useOps((s) => s.selectedMissionId);
  const minute = useOps((s) => Math.floor(s.now / 60_000));
  const masterVersion = useOps((s) => s.masterVersion);

  const open = useMemo(() => missions.filter((m) => m.status !== 'completed').sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.scheduledStart - b.scheduledStart), [missions]);
  const [mid, setMid] = useState<string>(() => (open.find((m) => m.id === selectedMissionId) ?? open.find((m) => m.status !== 'active') ?? open[0])?.id ?? '');
  const m = open.find((x) => x.id === mid) ?? open[0];

  // Airframe: assigned lead unit, else engine recommendation.
  const unitInfo = useMemo(() => {
    if (!m) return undefined;
    const assigned = units.find((u) => m.assignedUnitIds.includes(u.id));
    if (assigned) return { unit: assigned, source: 'assigned' as const };
    const best = candidatesFor(m, ops.get()).find((c) => c.feasible);
    const u = best ? units.find((x) => x.id === best.unitId) : undefined;
    return u ? { unit: u, source: 'recommended' as const } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, m?.assignedUnitIds.join(), minute, masterVersion]);

  const af = unitInfo ? AIRFRAME[unitInfo.unit.modelId] : undefined;
  const [mit, setMitState] = useState<SoraMitigations | undefined>();
  useEffect(() => {
    if (!m || !af) return setMitState(undefined);
    setMitState(mitigationStore.get(`${m.id}:${af.id}`) ?? defaultMitigations(m, af));
  }, [m?.id, af?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMit = (p: Partial<SoraMitigations>) => {
    if (!m || !af || !mit) return;
    const next = { ...mit, ...p };
    mitigationStore.set(`${m.id}:${af.id}`, next);
    setMitState(next);
  };

  const [, force] = useState(0);
  const checked = (m && checklistStore.get(m.id)) || new Set<string>();
  const toggle = (id: string) => {
    if (!m) return;
    const s = new Set(checked);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    checklistStore.set(m.id, s);
    force((x) => x + 1);
  };
  const setAll = (on: boolean) => {
    if (!m) return;
    checklistStore.set(m.id, on ? new Set(SORA_CHECKLIST.map((c) => c.id)) : new Set());
    force((x) => x + 1);
  };

  const res = useMemo(() => (m && af && mit ? computeSora(m, af, zones, mit) : undefined), [m, af, zones, mit]);

  if (!open.length) return <Empty icon="shield-check" text="No open missions to assess" />;
  if (!m) return null;

  const allChecked = SORA_CHECKLIST.every((c) => checked.has(c.id));
  const canDispatch = !!res && allChecked && res.dispatch !== 'prohibited' && m.status !== 'active';
  const scenarioRow = res ? GRC_ROWS.indexOf(res.scenario) : -1;
  const sailRow = res ? (res.finalGrc <= 2 ? 0 : res.finalGrc - 2) : -1;
  const arcCol = res ? ARCS.indexOf(res.residualArc) : -1;
  const disp = res ? DISPATCH[res.dispatch] : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Mission selector */}
      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
        <Select<string>
          label="Mission"
          value={m.id}
          onChange={setMid}
          options={open.map((x) => ({ value: x.id, label: `${x.code} · ${x.name.length > 54 ? x.name.slice(0, 52) + '…' : x.name}` }))}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={MISSION_STATUS[m.status].tone}>{MISSION_STATUS[m.status].label}</Badge>
          <Badge tone={PRIORITY[m.priority].tone}>{PRIORITY[m.priority].label}</Badge>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Icon name={MISSION_PROFILES[m.type].icon} size={12} style={{ color: MISSION_PROFILES[m.type].color }} />
            {MISSION_PROFILES[m.type].short} · {m.subtype}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px]">
          <span className="text-dim">
            Ops <span className="num text-text">{m.bvlos ? 'BVLOS' : 'VLOS'}</span>
          </span>
          <span className="text-dim">
            Max alt <span className="num text-text">{fmtNum(m.maxAltFt)} ft AGL</span>
          </span>
          <span className="text-dim">
            Ground <span className="text-text capitalize">{m.population}</span>
          </span>
        </div>
      </div>

      {!af || !res || !mit || !unitInfo ? (
        <div className="panel">
          <Empty icon="circle-x" text="No feasible airframe for this mission" sub="Assign a unit in the Scheduler to run the SORA assessment." />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          {/* Left: inputs */}
          <div className="xl:col-span-4 flex flex-col gap-3">
            <Panel index="01" title="Operation & airframe" icon="drone">
              <div className="p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-white font-bold text-[13px] truncate">{unitInfo.unit.callsign}</div>
                    <div className="text-[11px] text-muted truncate">
                      {af.name} · {AIRFRAME_CLASS_LABEL[af.cls]}
                    </div>
                  </div>
                  <Badge tone={unitInfo.source === 'assigned' ? 'live' : 'idle'}>{unitInfo.source === 'assigned' ? 'Assigned' : 'AI recommended'}</Badge>
                </div>
                <KV k="MTOW" v={`${af.mtowKg} kg`} />
                <KV k="Cruise speed" v={`${af.cruiseKmh} km/h`} />
                <KV k="Characteristic dimension" v={`${af.spanM.toFixed(2)} m`} />
                <KV k="Kinetic energy (½·m·v²)" v={`${fmtNum(res.kineticJ / 1000, 1)} kJ`} />
                <KV k="UA dimension class" v={<span className="text-white">{res.dimClass}</span>} />
                <KV k="Operational scenario" v={res.scenario} mono={false} />
              </div>
            </Panel>
            <Panel index="02" title="Mitigations" icon="sliders-horizontal" actions={<button className="text-[10.5px] text-dim hover:text-white" onClick={() => setMit(defaultMitigations(m, af))}>Reset defaults</button>}>
              <div className="p-3 flex flex-col gap-3">
                <MitRow label="M1 · Strategic ground-risk" hint="Buffers, sheltering, ground-risk area control" value={mit.m1} options={[[0, 'None'], [-1, 'Medium −1'], [-2, 'High −2']]} onChange={(v) => setMit({ m1: v as SoraMitigations['m1'] })} />
                <MitRow label="M2 · Effects of impact" hint="Parachute / frangible airframe" value={mit.m2} options={[[0, 'None'], [-1, 'Medium −1']]} onChange={(v) => setMit({ m2: v as SoraMitigations['m2'] })} />
                <MitRow label="M3 · Emergency Response Plan" hint="ERP validated & rehearsed" value={mit.m3} options={[[1, 'None +1'], [0, 'Medium 0'], [-1, 'High −1']]} onChange={(v) => setMit({ m3: v as SoraMitigations['m3'] })} />
                <MitRow label="Strategic air-risk reduction" hint="NOTAM, segregation, time-of-day" value={mit.arcReduction} options={[[0, 'None'], [1, '−1 ARC']]} onChange={(v) => setMit({ arcReduction: v as SoraMitigations['arcReduction'] })} />
              </div>
            </Panel>
          </div>

          {/* Middle: results */}
          <div className="xl:col-span-5 flex flex-col gap-3">
            <Panel index="03" title="Risk score" icon="gauge" actions={<Badge tone="idle">JARUS SORA 2.0</Badge>}>
              <div className="grid grid-cols-[1fr_1fr_128px] gap-px" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <div className="bg-card p-3">
                  <div className="label truncate">Ground risk · GRC</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="num text-[13px] text-dim">iGRC {res.intrinsicGrc}</span>
                    <Icon name="arrow-right" size={12} className="text-dim" />
                    <span className="num text-[28px] font-semibold text-white leading-none">{res.finalGrc}</span>
                  </div>
                  <div className="num text-[10.5px] text-dim mt-1">
                    M1 {mit.m1} · M2 {mit.m2} · M3 {mit.m3 > 0 ? '+' : ''}
                    {mit.m3}
                  </div>
                </div>
                <div className="bg-card p-3">
                  <div className="label truncate">Air risk · ARC</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="num text-[13px] text-dim">ARC-{res.initialArc}</span>
                    <Icon name="arrow-right" size={12} className="text-dim" />
                    <span className="num text-[28px] font-semibold text-white leading-none">ARC-{res.residualArc}</span>
                  </div>
                  <div className="text-[10.5px] text-dim mt-1 truncate" title={res.arcReason}>
                    {res.arcReason}
                  </div>
                </div>
                <div className="bg-card p-3 flex flex-col items-center justify-center text-center" style={{ boxShadow: `inset 0 -2px 0 ${sailColor(res.sail)}` }}>
                  <div className="label">SAIL</div>
                  <div className="num font-bold leading-none mt-1" style={{ color: sailColor(res.sail), fontSize: res.sail === 'Certified' ? 18 : 40 }}>
                    {res.sail}
                  </div>
                  <div className="text-[10px] text-dim mt-1">
                    OSO robustness <span className="text-text">{res.osoRobustness}</span>
                  </div>
                </div>
              </div>
              {disp && (
                <div className={cx('flex items-center gap-3 px-3 py-2.5 border-t', res.dispatch === 'approved' ? 'bg-ok-bg border-ok/40' : res.dispatch === 'authorisation' ? 'bg-warn-bg border-warn/40' : 'bg-alert-bg border-alert/40')}>
                  <Icon name={disp.icon} size={20} style={{ color: TONE_COLOR[disp.tone] }} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: TONE_COLOR[disp.tone] }}>
                      {disp.label}
                    </div>
                    <div className="text-[11px] text-muted">{res.dispatchText}</div>
                  </div>
                </div>
              )}
            </Panel>

            <Panel index="04" title="SORA tables" icon="grid-3x3" subtitle="current cell highlighted">
              <div className="p-3 grid grid-cols-1 2xl:grid-cols-[1.35fr_1fr] gap-4">
                <div className="min-w-0">
                  <div className="label mb-1.5">Intrinsic GRC · scenario × UA dimension</div>
                  <table className="w-full text-[10.5px] border-collapse">
                    <thead>
                      <tr>
                        <th />
                        {DIM_COLS.map((c, i) => (
                          <th key={c} className={cx('num font-medium px-1 pb-1 text-center', i === res.dimClass - 1 ? 'text-white' : 'text-dim')} title={c}>
                            {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GRC_ROWS.map((r, ri) => (
                        <tr key={r}>
                          <td className={cx('pr-2 py-[2px] whitespace-nowrap', ri === scenarioRow ? 'text-white font-semibold' : 'text-dim')}>{r}</td>
                          {GRC_TABLE[ri].map((v, ci) => {
                            const on = ri === scenarioRow && ci === res.dimClass - 1;
                            return (
                              <td key={ci} className={cx('num text-center border border-line h-[20px] w-[30px]', on ? 'text-ink font-bold' : ri === scenarioRow || ci === res.dimClass - 1 ? 'text-text bg-white/[0.05]' : 'text-dim')} style={on ? { background: '#c560c8' } : undefined}>
                                {v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="min-w-0">
                  <div className="label mb-1.5">SAIL · final GRC × residual ARC</div>
                  <table className="w-full text-[10.5px] border-collapse">
                    <thead>
                      <tr>
                        <th className="text-dim font-medium text-left pb-1">GRC</th>
                        {ARCS.map((a, i) => (
                          <th key={a} className={cx('num font-medium pb-1 text-center', i === arcCol ? 'text-white' : 'text-dim')}>
                            ARC-{a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SAIL_ROWS.map(([g, row], ri) => (
                        <tr key={g}>
                          <td className={cx('num py-[2px]', ri === sailRow && res.finalGrc <= 7 ? 'text-white font-semibold' : 'text-dim')}>{g}</td>
                          {row.map((v, ci) => {
                            const on = ri === sailRow && ci === arcCol && res.finalGrc <= 7;
                            return (
                              <td key={ci} className={cx('num text-center border border-line h-[22px]', on ? 'font-bold text-ink' : 'text-muted')} style={on ? { background: sailColor(v) } : { color: sailColor(v), opacity: 0.75 }}>
                                {v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td className={cx('num py-[2px]', res.finalGrc > 7 ? 'text-alert font-semibold' : 'text-dim')}>&gt; 7</td>
                        <td colSpan={4} className={cx('text-center border border-line h-[22px] text-[10px] uppercase tracking-wider', res.finalGrc > 7 ? 'bg-alert text-ink font-bold' : 'text-dim')}>
                          Certified category
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>

            <Panel index="05" title="Intersecting airspace" icon="layers" subtitle={`${res.zones.length} zone${res.zones.length === 1 ? '' : 's'}`}>
              {res.zones.length ? (
                <div className="divide-y divide-line">
                  {res.zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-3 px-3 py-2 text-[11.5px]">
                      <i className="w-2.5 h-2.5 shrink-0 border" style={{ background: ZONE_META[z.kind].color + '55', borderColor: ZONE_META[z.kind].color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-text truncate">{z.name}</div>
                        <div className="text-[10.5px] text-dim truncate">
                          {ZONE_META[z.kind].label} · {z.authority}
                          {z.ref ? ` · ${z.ref}` : ''}
                        </div>
                      </div>
                      <span className={cx('num text-[10.5px] shrink-0', z.maxUasFt === 0 ? 'text-alert' : 'text-muted')}>{z.maxUasFt === 0 ? 'UAS PROHIBITED' : `UAS ≤ ${z.maxUasFt} ft`}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-3 text-[11.5px] text-muted flex items-center gap-2">
                  <Icon name="circle-check" size={13} className="text-ok" /> Uncontrolled class G airspace — no zone intersections on the flight geometry.
                </div>
              )}
            </Panel>
          </div>

          {/* Right: checklist + dispatch */}
          <div className="xl:col-span-3">
            <Panel
              index="06"
              title="Pre-flight checklist"
              icon="clipboard-check"
              className="xl:sticky xl:top-0"
              actions={
                <button className="text-[10.5px] text-dim hover:text-white" onClick={() => setAll(!allChecked)}>
                  {allChecked ? 'Clear all' : 'Check all'}
                </button>
              }
            >
              <div className="px-3 pt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-dim">Progress</span>
                  <span className="num text-text">
                    {checked.size} / {SORA_CHECKLIST.length}
                  </span>
                </div>
                <Meter value={checked.size} max={SORA_CHECKLIST.length} color={allChecked ? TONE_COLOR.ok : '#c560c8'} height={4} />
              </div>
              <ul className="p-2">
                {SORA_CHECKLIST.map((c, i) => {
                  const on = checked.has(c.id);
                  return (
                    <li key={c.id}>
                      <button onClick={() => toggle(c.id)} className="w-full flex items-start gap-2.5 px-1.5 py-1.5 text-left hover:bg-white/[0.03]">
                        <span className={cx('mt-[1px] w-[15px] h-[15px] shrink-0 border flex items-center justify-center', on ? 'bg-ok border-ok text-ink' : 'border-line-2')}>{on && <Icon name="check" size={11} strokeWidth={3} />}</span>
                        <span className="num text-[10px] text-dim mt-[2px] w-4 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                        <span className={cx('text-[11.5px] leading-snug', on ? 'text-muted' : 'text-text')}>{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line p-3 flex flex-col gap-2">
                <button className="btn btn-solid w-full justify-center h-9" disabled={!canDispatch} onClick={() => actions.dispatchMission(m.id)}>
                  <Icon name="plane-takeoff" size={14} /> {m.status === 'active' ? 'Mission active' : 'Dispatch mission'}
                </button>
                <p className="text-[10.5px] text-dim leading-snug">
                  {m.status === 'active'
                    ? 'Mission is already airborne — assessment retained for the flight record.'
                    : res.dispatch === 'prohibited'
                      ? 'Blocked — reduce GRC/ARC with additional mitigations or re-plan the operation.'
                      : !allChecked
                        ? `Complete all ${SORA_CHECKLIST.length} checklist items to enable dispatch.`
                        : res.dispatch === 'authorisation'
                          ? 'Dispatch under DKPPU operational authorisation on file.'
                          : 'Ready for dispatch.'}{' '}
                  Dispatch is written to the audit trail with operator identity and timestamp.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function MitRow({ label, hint, value, options, onChange }: { label: string; hint: string; value: number; options: [number, string][]; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-text font-medium">{label}</span>
      </div>
      <div className="text-[10.5px] text-dim mb-1.5">{hint}</div>
      <div className="flex gap-1">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} className={cx('pill num text-[10.5px] px-2.5', value === v && 'pill-on')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

