import type { Mission, Unit } from '../../types';
import { AIRFRAME, MISSION_PROFILES, TONE_COLOR, type Tone } from '../../data/catalog';
import { Badge, Empty, Icon, Panel, Sparkline, StatusDot, TONE_TEXT, cx } from '../../ui/kit';
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
      title="Live Telemetry Stream"
      index="E"
      icon="activity"
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
              <th>Mission</th>
              <th className="text-right">Alt m</th>
              <th className="text-right">Speed km/h</th>
              <th className="text-right">Hdg</th>
              <th className="text-right">Energy</th>
              <th className="text-right">Link</th>
              <th>GNSS</th>
              <th className="text-right">Sats</th>
              <th className="min-w-[110px]">Progress</th>
              <th>Telemetry & flight-log validation</th>
            </tr>
          </thead>
          <tbody>
            {live.map((u) => {
              const m = u.missionId ? missionById.get(u.missionId) : undefined;
              const prof = m ? MISSION_PROFILES[m.type] : undefined;
              const s = ring.get(u.id) ?? [];
              const checks = validation(u);
              const issues = checks.filter((c) => c.tone !== 'ok');
              return (
                <tr key={u.id}>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <StatusDot tone={u.contingency ? 'alert' : 'live'} pulse size={6} />
                      <span className="font-semibold text-white">{u.callsign}</span>
                    </div>
                    <div className="text-[10.5px] text-dim pl-3">{AIRFRAME[u.modelId].name}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="num text-[11px] text-text">{m?.code ?? (u.contingency ? 'contingency' : 'drill')}</div>
                    {prof && (
                      <div className="text-[10.5px]" style={{ color: prof.color }}>
                        {prof.short} · {m?.subtype}
                      </div>
                    )}
                  </td>
                  <td className="num text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Sparkline values={s.map((x) => x.alt)} color="#8384e2" width={36} height={14} />
                      <span className="w-[34px]">{u.altM.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="num text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Sparkline values={s.map((x) => x.spd)} color="#26d8d9" width={36} height={14} />
                      <span className="w-[34px]">{u.speedKmh.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="num text-right text-muted">{String(Math.round(u.headingDeg)).padStart(3, '0')}°</td>
                  <td className={cx('num text-right', TONE_TEXT[energyTone(u.energyPct)])}>{Math.round(u.energyPct)}%</td>
                  <td className="num text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Sparkline values={s.map((x) => x.link)} color={TONE_COLOR[linkTone(u.linkQuality)]} width={36} height={14} />
                      <span className={cx('w-[34px]', TONE_TEXT[linkTone(u.linkQuality)])}>{Math.round(u.linkQuality)}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge tone={gnssTone(u.gnssFix)}>{u.gnssFix}</Badge>
                  </td>
                  <td className={cx('num text-right', u.satellites < MIN_SATS ? 'text-warn' : 'text-muted')}>{u.satellites}</td>
                  <td>
                    {m ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-[4px] bg-white/[0.08]">
                          <div className="h-full transition-[width] duration-700" style={{ width: `${m.progress * 100}%`, background: prof?.color }} />
                        </div>
                        <span className="num text-[10.5px] text-muted w-8 text-right">{Math.round(m.progress * 100)}%</span>
                      </div>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="min-w-[260px]">
                    {issues.length === 0 ? (
                      <div className="flex items-center gap-1.5 text-[10.5px] text-ok">
                        <Icon name="circle-check" size={11} />
                        <span className="text-muted">{checks.map((c) => c.text.split(' — ')[0]).slice(0, 2).join(' · ')}</span>
                      </div>
                    ) : (
                      <ul className="space-y-0.5">
                        {issues.map((c) => (
                          <li key={c.label} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                            <span className={cx('num font-semibold w-[44px] shrink-0', TONE_TEXT[c.tone])}>{c.label}</span>
                            <span className="text-muted">{c.text}</span>
                          </li>
                        ))}
                      </ul>
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
