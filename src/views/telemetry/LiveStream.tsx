import type { Mission, Unit } from '../../types';
import { AIRFRAME, MISSION_PROFILES, TONE_COLOR, type Tone } from '../../data/catalog';
import { Empty, Icon, Panel, Sparkline, StatusDot, TONE_TEXT, cx } from '../../ui/kit';
import { gnssTone, linkTone, energyTone, energyKind, type TelSample } from '../fleet/shared';

const LINK_WARN = 70;
const LINK_CRIT = 50;
const MIN_SATS = 14;

interface Check {
  label: string;
  tone: Tone;
  text: string;
}

function validation(u: Unit): Check[] {
  const af = AIRFRAME[u.modelId];
  const out: Check[] = [];
  out.push({
    label: 'GNSS',
    tone: gnssTone(u.gnssFix),
    text: u.gnssFix === 'RTK Fixed' ? `RTK Fixed · ${u.satellites} sats — cm-level geotags` : u.gnssFix === 'RTK Float' ? `RTK Float — geotag σ degraded; flag lines for PPK` : u.gnssFix === '3D Fix' ? `3D Fix only (no RTK) — PPK post-processing required` : 'No fix — data unusable',
  });
  if (u.satellites < MIN_SATS) out.push({ label: 'Sats', tone: 'warn', text: `${u.satellites} satellites < ${MIN_SATS} minimum` });
  out.push({
    label: 'C2',
    tone: linkTone(u.linkQuality),
    text: u.linkQuality >= LINK_WARN ? `Link ${Math.round(u.linkQuality)}% ≥ ${LINK_WARN}% threshold` : u.linkQuality >= LINK_CRIT ? `Link ${Math.round(u.linkQuality)}% below ${LINK_WARN}% — telemetry gap risk` : `Link ${Math.round(u.linkQuality)}% below ${LINK_CRIT}% — lost-link failsafe armed`,
  });
  const e = u.energyPct;
  out.push({ label: energyKind(u) === 'fuel' ? 'Fuel' : 'Batt', tone: e >= 30 ? 'ok' : e >= 25 ? 'warn' : 'alert', text: e >= 30 ? `${Math.round(e)}% — above RTL reserve` : `${Math.round(e)}% — approaching RTL reserve (22%)` });
  if (!af.isVessel && u.altM > 0) {
    out.push({ label: 'Alt', tone: 'ok', text: `${Math.round(u.altM)} m AGL (${Math.round(u.altM / 0.3048)} ft)` });
  }
  if (u.contingency) out.push({ label: 'FAILSAFE', tone: 'alert', text: `${u.contingency.action} → ${u.contingency.targetName}` });
  return out;
}

export function LiveStream({ units, missionById, ring }: { units: Unit[]; missionById: Map<string, Mission>; ring: Map<string, TelSample[]> }) {
  const live = units.filter((u) => u.status === 'in-flight' || u.contingency).sort((a, b) => a.callsign.localeCompare(b.callsign));
  const nominal = live.filter((u) => validation(u).every((c) => c.tone === 'ok')).length;

  return (
    <Panel
      title="Live telemetry"
      index="E"
      className="@container"
      bodyClassName="overflow-auto"
      actions={
        <span className="flex items-center gap-2 text-[10.5px] text-dim">
          <StatusDot tone="live" pulse size={6} />
          <span className="num text-live">{live.length}</span> airborne · <span className="num text-ok">{nominal}</span> nominal · 1 Hz
        </span>
      }
    >
      {live.length === 0 ? (
        <Empty icon="plane-landing" text="No units airborne" sub="Telemetry resumes when a mission is dispatched." />
      ) : (
        <table className="tbl text-[11.5px]">
          <thead>
            <tr>
              <th>Unit</th>
              <th className="@max-[700px]:hidden">Mission</th>
              <th className="text-right">Alt m</th>
              <th className="text-right @max-[600px]:hidden">km/h</th>
              <th className="text-right @max-[1100px]:hidden">Hdg</th>
              <th className="text-right">Energy</th>
              <th className="text-right">Link</th>
              <th className="@max-[900px]:hidden">GNSS</th>
              <th className="min-w-[90px] @max-[1000px]:hidden">Progress</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            {live.map((u) => {
              const m = u.missionId ? missionById.get(u.missionId) : undefined;
              const prof = m ? MISSION_PROFILES[m.type] : undefined;
              const s = ring.get(u.id) ?? [];
              const checks = validation(u);
              const issues = checks.filter((c) => c.tone !== 'ok');
              const eTone = energyTone(u.energyPct);
              const lTone = linkTone(u.linkQuality);
              return (
                <tr key={u.id} className="[&>td]:whitespace-nowrap">
                  <td title={AIRFRAME[u.modelId].name}>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={u.contingency ? 'alert' : 'live'} pulse size={6} />
                      <span className="font-semibold text-white">{u.callsign}</span>
                    </span>
                  </td>
                  <td className="@max-[700px]:hidden" title={m ? `${m.name} · ${prof?.short} · ${m.subtype}` : undefined}>
                    {prof && <i className="inline-block w-1.5 h-1.5 mr-1.5 align-middle" style={{ background: prof.color }} />}
                    <span className="num text-[11px] text-muted">{m?.code ?? (u.contingency ? 'contingency' : 'drill')}</span>
                  </td>
                  <td className="num text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <Sparkline values={s.map((x) => x.alt)} color="#8384e2" width={32} height={12} />
                      <span className="w-[30px]">{u.altM.toFixed(0)}</span>
                    </span>
                  </td>
                  <td className="num text-right @max-[600px]:hidden">{u.speedKmh.toFixed(0)}</td>
                  <td className="num text-right text-dim @max-[1100px]:hidden">{String(Math.round(u.headingDeg)).padStart(3, '0')}°</td>
                  <td className={cx('num text-right', eTone === 'ok' ? 'text-text' : TONE_TEXT[eTone])}>{Math.round(u.energyPct)}%</td>
                  <td className="num text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <Sparkline values={s.map((x) => x.link)} color={TONE_COLOR[lTone]} width={32} height={12} />
                      <span className={cx('w-[34px]', lTone === 'ok' ? 'text-text' : TONE_TEXT[lTone])}>{Math.round(u.linkQuality)}%</span>
                    </span>
                  </td>
                  <td className="@max-[900px]:hidden" title={`${u.satellites} satellites`}>
                    <span className={cx('text-[11px]', gnssTone(u.gnssFix) === 'ok' ? 'text-muted' : TONE_TEXT[gnssTone(u.gnssFix)])}>{u.gnssFix}</span>
                    <span className={cx('num text-[10.5px] ml-1.5', u.satellites < MIN_SATS ? 'text-warn' : 'text-dim')}>{u.satellites}</span>
                  </td>
                  <td className="@max-[1000px]:hidden">
                    {m ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-[3px] bg-white/[0.08]">
                          <div className="h-full w-full origin-left transition-transform duration-700" style={{ transform: `scaleX(${Math.min(1, m.progress)})`, background: prof?.color }} />
                        </div>
                        <span className="num text-[10.5px] text-muted w-8 text-right">{Math.round(m.progress * 100)}%</span>
                      </div>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="max-w-[320px] truncate" title={checks.map((c) => `${c.label}: ${c.text}`).join('\n')}>
                    {issues.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ok">
                        <Icon name="circle-check" size={11} /> nominal
                      </span>
                    ) : (
                      <span className="text-[10.5px]">
                        <span className={cx('num font-semibold mr-1.5', TONE_TEXT[issues[0].tone])}>{issues[0].label}</span>
                        <span className="text-muted">{issues[0].text}</span>
                        {issues.length > 1 && <span className="num text-dim"> +{issues.length - 1}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
