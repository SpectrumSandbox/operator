// Mission Control — quiet map chrome: one top-left control cluster (region jump +
// layers popover), a legend button bottom-left, and the selection card. KP and
// weather-severity controls live inside the layers panel.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type * as L from 'leaflet';
import { actions, useOps } from '../../store';
import type { MapLayers } from '../../store';
import { MISSION_HEALTH, REGIONS, TONE_COLOR, UNIT_STATUS, ZONE_META } from '../../data/catalog';
import { kpLabel } from '../../engine/weather';
import { Icon, cx, type IconName } from '../../ui/kit';
import type { MissionHealth, TransportMode } from '../../types';
import { TRANSPORT_COLOR, TRANSPORT_SHORT } from './util';
import { SelectionBar } from './SelectionBar';
import { INDONESIA_BOUNDS } from './mapLayers';
import { NAV_LAYERS, navEarthVersion, navEntry, onNavEarthChange, retryNav } from './navearth';
import { uiPrefs, useRegionTags } from './uiState';

const SEV_LABEL = (v: number) => (v < 0.5 ? 'Calm' : v < 1.25 ? 'Forecast' : v < 1.75 ? 'Unsettled' : 'Severe');

/** Close on outside pointer-down and/or Escape. */
function useDismiss<T extends HTMLElement>(open: boolean, close: () => void, outside = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    if (outside) document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close, outside]);
  return ref;
}

function Check({ on }: { on: boolean }) {
  return <span className={cx('w-3 h-3 border flex items-center justify-center shrink-0', on ? 'border-white bg-white' : 'border-line-2')}>{on && <Icon name="check" size={9} className="text-ink" strokeWidth={3} />}</span>;
}

function Row({ k, on, set, color, dash, icon, sub, disabled, label }: { k?: keyof MapLayers; on: boolean; set?: (v: boolean) => void; color?: string; dash?: boolean; icon?: IconName; sub?: string; disabled?: boolean; label?: string }) {
  const text = label ?? (k ? ROW_LABEL[k] ?? k : '');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => (set ? set(!on) : k && actions.setLayer(k, !on as never))}
      className={cx('w-full flex items-center gap-2 h-[26px] px-2.5 text-left text-[11.5px] transition-colors', disabled ? 'opacity-35 cursor-not-allowed' : 'hover:bg-white/[0.04]', on ? 'text-text' : 'text-dim')}
    >
      <Check on={on} />
      {color ? <span className="w-3 h-[7px] shrink-0" style={{ background: dash ? 'transparent' : color + '55', border: `1px ${dash ? 'dashed' : 'solid'} ${color}` }} /> : icon ? <Icon name={icon} size={12} className="shrink-0 text-muted" /> : null}
      <span className="truncate">{text}</span>
      {sub && <span className="ml-auto num text-[10px] text-dim shrink-0">{sub}</span>}
    </button>
  );
}

const ROW_LABEL: Partial<Record<keyof MapLayers, string>> = {
  missions: 'Mission areas & routes',
  tracks: 'Flight tracks & coverage',
  bases: 'Operating bases',
  crews: 'Field crews',
  radar: 'Precipitation radar',
  wind: 'Wind speed / gust vectors',
  ceilingVis: 'Cloud ceiling & visibility',
  airspace: 'Airspace & regulatory',
  ctr: 'Controlled airspace (CTR)',
  kkop: 'KKOP airport safety zones',
  tfr: 'TFR / NOTAM (time-windowed)',
  military: 'Military restricted',
  population: 'Population density buffers',
  navearth: 'Live AIP airspace & NOTAM',
  ...Object.fromEntries(NAV_LAYERS.map((d) => [d.toggle, d.label])),
};

function Section({ title, icon, children, right }: { title: string; icon: IconName; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0 py-1.5">
      <div className="flex items-center gap-1.5 px-2.5 pb-1 label">
        <Icon name={icon} size={11} />
        {title}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function LayerPanel({ onClose }: { onClose: () => void }) {
  const ly = useOps((s) => s.layers);
  const kp = useOps((s) => s.kpIndex);
  const sev = useOps((s) => s.weatherSeverity);
  const zones = useOps((s) => s.zones);
  const cells = useOps((s) => s.weatherCells);
  const now = useOps((s) => Math.floor(s.now / 60_000) * 60_000);
  const regionTags = useRegionTags();
  const k = kpLabel(kp);
  const storms = cells.filter((c) => c.kind !== 'rain').length;
  const activeTimed = zones.filter((z) => z.activeFrom !== undefined && z.activeFrom <= now && z.activeTo! >= now).length;
  const upcoming = zones.filter((z) => z.activeFrom !== undefined && z.activeFrom > now).length;
  return (
    <div className="glass mc-pop pointer-events-auto w-[268px] max-w-full min-h-0 flex flex-col" role="dialog" aria-label="Map layers">
      <div className="flex items-center gap-2 h-8 pl-2.5 pr-1 shrink-0 border-b border-line">
        <span className="label text-muted">Basemap</span>
        <div className="flex items-center border border-line-2" role="radiogroup" aria-label="Basemap">
          {(['dark', 'satellite'] as const).map((b) => (
            <button
              key={b}
              role="radio"
              aria-checked={ly.basemap === b}
              onClick={() => actions.setLayer('basemap', b)}
              className={cx('px-2 h-[20px] text-[9.5px] font-semibold uppercase tracking-[0.08em] transition-colors', ly.basemap === b ? 'bg-white text-ink' : 'text-muted hover:text-white')}
            >
              {b === 'dark' ? 'Dark' : 'Satellite'}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="ml-auto w-6 h-6 flex items-center justify-center text-dim hover:text-white" aria-label="Close layers" title="Close (Esc)">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="overflow-y-auto min-h-0">
        <Section title="Operations" icon="crosshair">
          <Row k="missions" on={ly.missions} icon="map" />
          <Row k="tracks" on={ly.tracks} icon="route" />
          <Row k="bases" on={ly.bases} icon="building" />
          <Row k="crews" on={ly.crews} icon="users" />
          <Row label="Region summaries" on={regionTags} set={(v) => uiPrefs.setRegionTags(v)} icon="grid-3x3" sub="national zoom" />
        </Section>
        <Section title="Weather" icon="cloud-rain" right={<span className="num text-[10px] text-dim normal-case tracking-normal">{storms} conv. cells</span>}>
          <Row k="radar" on={ly.radar} icon="radar" />
          <Row k="wind" on={ly.wind} icon="wind" />
          <Row k="ceilingVis" on={ly.ceilingVis} icon="cloud-fog" />
          <div className="px-2.5 pt-1.5">
            <div className="flex items-center text-[10.5px] text-dim">
              <span>Weather severity</span>
              <span className={cx('ml-auto num', sev >= 1.5 ? 'text-alert' : sev >= 0.75 ? 'text-warn' : 'text-ok')}>
                {sev.toFixed(2)} · {SEV_LABEL(sev)}
              </span>
            </div>
            <input type="range" min={0} max={2} step={0.25} value={sev} onChange={(e) => actions.setWeatherSeverity(+e.target.value)} className="w-full h-4" aria-label="Weather severity" />
          </div>
          <div className="px-2.5 pt-1.5 pb-0.5 grid grid-cols-[1fr_auto] items-center gap-x-2">
            <span className="text-[10.5px] text-dim flex items-center gap-1.5">
              <Icon name="satellite" size={11} style={{ color: TONE_COLOR[k.tone] }} className="shrink-0" />
              KP-index · GNSS
            </span>
            <div className="row-span-2 flex items-center border border-line-2 shrink-0">
              <button className="w-6 h-6 flex items-center justify-center hover:bg-white/[0.06] disabled:opacity-30" disabled={kp <= 0} onClick={() => actions.setKp(Math.max(0, kp - 1))} aria-label="Decrease KP">
                <Icon name="minus" size={11} />
              </button>
              <span className="num w-6 text-center text-[12px] font-semibold" style={{ color: TONE_COLOR[k.tone] }}>
                {kp}
              </span>
              <button className="w-6 h-6 flex items-center justify-center hover:bg-white/[0.06] disabled:opacity-30" disabled={kp >= 9} onClick={() => actions.setKp(Math.min(9, kp + 1))} aria-label="Increase KP">
                <Icon name="plus" size={11} />
              </button>
            </div>
            <span className="text-[10px] leading-tight mt-0.5" style={{ color: TONE_COLOR[k.tone] }}>
              {k.label}
            </span>
          </div>
        </Section>
        <Section title="Airspace" icon="shield" right={<span className="num text-[10px] text-dim normal-case tracking-normal">{activeTimed} active · {upcoming} upcoming</span>}>
          <Row k="airspace" on={ly.airspace} icon="tower-control" />
          <div className={cx('pl-3', !ly.airspace && 'pointer-events-none')}>
            <Row k="ctr" on={ly.ctr} color={ZONE_META.ctr.color} dash disabled={!ly.airspace} />
            <Row k="kkop" on={ly.kkop} color={ZONE_META.kkop.color} disabled={!ly.airspace} />
            <Row k="tfr" on={ly.tfr} color={ZONE_META.tfr.color} dash disabled={!ly.airspace} />
            <Row k="military" on={ly.military} color={ZONE_META.military.color} disabled={!ly.airspace} />
            <Row k="population" on={ly.population} color={ZONE_META.population.color} dash disabled={!ly.airspace} />
          </div>
        </Section>
        <NavEarthSection />
      </div>
    </div>
  );
}

function NavEarthSection() {
  const ly = useOps((s) => s.layers);
  useSyncExternalStore(onNavEarthChange, navEarthVersion, navEarthVersion);
  const on = ly.navearth;
  const loading = on && NAV_LAYERS.some((d) => ly[d.toggle] && navEntry(d.key).status === 'loading');
  const failed = on ? NAV_LAYERS.filter((d) => ly[d.toggle] && navEntry(d.key).status === 'error') : [];
  const notams = navEntry('notam');
  const updated = NAV_LAYERS.map((d) => navEntry(d.key).data?.fetchedAt).filter(Boolean).sort().pop();
  return (
    <Section
      title="NavEarth · AirNav Indonesia"
      icon="radio-tower"
      right={
        <span className="num text-[10px] text-dim normal-case tracking-normal">
          {!on ? 'off' : loading ? 'loading…' : notams.data ? `${notams.data.features.length} NOTAM` : 'live'}
        </span>
      }
    >
      <Row k="navearth" on={on} icon="satellite" />
      <div className={cx('pl-3', !on && 'pointer-events-none')}>
        {NAV_LAYERS.map((d) => {
          const e = navEntry(d.key);
          const n = e.data?.features.length;
          const sub = !on || !ly[d.toggle] ? undefined : e.status === 'loading' ? '…' : e.status === 'error' ? 'error' : n !== undefined ? String(n + (d.extra ? navEntry(d.extra).data?.features.length ?? 0 : 0)) : undefined;
          return <Row key={d.key} k={d.toggle} on={ly[d.toggle] === true} color={d.color} dash={!!d.dash} disabled={!on} sub={sub} />;
        })}
      </div>
      {on && (
        <div className="px-2.5 pt-1 text-[10px] leading-snug text-dim">
          {failed.length > 0 ? (
            <div className="text-alert flex items-start gap-1.5">
              <Icon name="triangle-alert" size={11} className="mt-[1px]" />
              <span>
                NavEarth unavailable for {failed.map((d) => d.label.split(' (')[0]).join(', ')}.{' '}
                <button className="underline hover:text-white" onClick={() => failed.forEach((d) => retryNav(d.key))}>
                  Retry
                </button>
              </span>
            </div>
          ) : (
            <span>
              Published AIP airspace, active NOTAMs and ASHTAMs{updated ? ` · fetched ${updated.slice(11, 16)}Z` : ''}. Hover for limits &amp; frequencies. Not for navigation.
            </span>
          )}
        </div>
      )}
    </Section>
  );
}

function Legend() {
  const sel = useOps((s) => s.selectedMissionId);
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const health: MissionHealth[] = ['nominal', 'at-risk', 'delayed', 'hold'];
  const unitTones = [
    { label: 'Airborne', c: TONE_COLOR.live },
    { label: UNIT_STATUS.available.label, c: TONE_COLOR.ok },
    { label: 'Charging', c: TONE_COLOR.idle },
    { label: UNIT_STATUS.maintenance.label, c: TONE_COLOR.warn },
    { label: 'Grounded / C2', c: TONE_COLOR.alert },
  ];
  const modes: TransportMode[] = ['road', 'ferry', 'air', 'self-ferry'];
  return (
    <div ref={ref} className="relative z-[2] pointer-events-auto shrink-0">
      {open && (
        <div className="glass mc-pop absolute left-0 bottom-[calc(100%+6px)] w-[236px] px-2.5 py-2 grid gap-2" role="dialog" aria-label="Map legend">
          <div>
            <div className="label mb-1 text-[9px]">Mission health</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {health.map((h) => (
                <span key={h} className="flex items-center gap-1.5 text-[10.5px] text-muted truncate">
                  <i className="w-2.5 h-2.5 shrink-0" style={{ background: MISSION_HEALTH[h].color + '55', border: `1.5px solid ${MISSION_HEALTH[h].color}` }} />
                  {h === 'hold' ? 'Wx / Airspace hold' : MISSION_HEALTH[h].label}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1 text-[9px]">UAS status</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {unitTones.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5 text-[10.5px] text-muted truncate">
                  <svg width="10" height="10" viewBox="-6 -6 12 12" className="shrink-0">
                    <path d="M0,-5.5 L4.5,5 L0,2.5 L-4.5,5 Z" fill={t.c} />
                  </svg>
                  {t.label}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1 text-[9px]">Transit vectors{sel ? '' : ' · on selection'}</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {modes.map((m) => (
                <span key={m} className="flex items-center gap-1.5 text-[10.5px] text-muted">
                  <i className="w-3 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: TRANSPORT_COLOR[m] }} />
                  {TRANSPORT_SHORT[m]}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className={cx('glass h-8 px-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] transition-colors', open ? 'text-white' : 'text-muted hover:text-white')}
        aria-expanded={open}
        title="Map legend"
      >
        <Icon name="info" size={13} />
        <span className="hidden min-[900px]:inline">Legend</span>
      </button>
    </div>
  );
}

const REGION_OPTS = [{ id: 'national', name: 'Indonesia', code: 'NAT' }, ...REGIONS.map((r) => ({ id: r.id as string, name: r.name, code: r.short }))];

function ControlCluster({ map }: { map: L.Map }) {
  const [cur, setCur] = useState<string>('national');
  const [menu, setMenu] = useState(false);
  const [layers, setLayers] = useState(false);
  const kp = useOps((s) => s.kpIndex);
  const sev = useOps((s) => s.weatherSeverity);
  const menuRef = useDismiss<HTMLDivElement>(menu, () => setMenu(false));
  useDismiss<HTMLDivElement>(layers, () => setLayers(false), false);
  useEffect(() => {
    const clear = () => setCur('');
    map.on('dragstart', clear);
    return () => {
      map.off('dragstart', clear);
    };
  }, [map]);
  const go = (id: string) => {
    setCur(id);
    setMenu(false);
    if (id === 'national') map.flyToBounds(INDONESIA_BOUNDS, { duration: 1, padding: [10, 10] });
    else {
      const r = REGIONS.find((x) => x.id === id)!;
      map.flyTo(r.center, r.zoom, { duration: 1 });
    }
  };
  const curOpt = REGION_OPTS.find((o) => o.id === cur);
  const envWarn = kp >= 5 || sev >= 1.5;
  return (
    <div className="absolute z-[3] left-2.5 top-2.5 bottom-3 flex flex-col items-start gap-1.5 max-w-[calc(100%-20px)] pointer-events-none">
      <div className="glass pointer-events-auto flex items-stretch h-8 shrink-0">
        <div ref={menuRef} className="relative flex">
          <button
            onClick={() => {
              setMenu(!menu);
              setLayers(false);
            }}
            className={cx('flex items-center gap-1.5 pl-2.5 pr-2 text-[11.5px] font-semibold transition-colors', menu ? 'text-white bg-white/[0.06]' : 'text-text hover:bg-white/[0.04]')}
            aria-haspopup="listbox"
            aria-expanded={menu}
            title="Jump to region"
          >
            <Icon name="locate-fixed" size={13} className="text-dim" />
            <span className={cx('max-w-[150px] truncate', !curOpt && 'text-muted font-medium')}>{curOpt?.name ?? 'Custom view'}</span>
            <Icon name="chevron-down" size={12} className="text-dim" />
          </button>
          {menu && (
            <div className="glass mc-pop absolute left-0 top-[calc(100%+6px)] w-[220px] py-1 z-[1]" role="listbox" aria-label="Regions">
              {REGION_OPTS.map((o, i) => (
                <button
                  key={o.id}
                  role="option"
                  aria-selected={cur === o.id}
                  onClick={() => go(o.id)}
                  className={cx('w-full flex items-center gap-2 h-7 px-2.5 text-left text-[11.5px] transition-colors', cur === o.id ? 'text-white bg-white/[0.07]' : 'text-muted hover:text-white hover:bg-white/[0.04]', i === 0 && 'border-b border-line mb-1')}
                >
                  <span className="num text-[10px] text-dim w-7">{o.code}</span>
                  <span className="truncate">{o.id === 'national' ? 'Indonesia · national' : o.name}</span>
                  {cur === o.id && <Icon name="check" size={12} className="ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="w-px bg-line-2 my-1.5" />
        <button
          onClick={() => {
            setLayers(!layers);
            setMenu(false);
          }}
          className={cx('relative flex items-center gap-1.5 px-2.5 text-[11.5px] font-semibold transition-colors', layers ? 'text-white bg-white/[0.06]' : 'text-text hover:bg-white/[0.04]')}
          aria-expanded={layers}
          title={`Map layers · KP ${kp} · weather ${SEV_LABEL(sev).toLowerCase()}`}
        >
          <Icon name="layers" size={13} className="text-dim" />
          Layers
          {envWarn && <span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR.warn }} aria-label="Space weather or severity warning" />}
        </button>
      </div>
      {layers && <LayerPanel onClose={() => setLayers(false)} />}
    </div>
  );
}

export function MapOverlays({ map, showSelection }: { map: L.Map; showSelection: boolean }) {
  return (
    <div className="absolute inset-0 z-[500] pointer-events-none">
      <ControlCluster map={map} />
      <div className="absolute left-2.5 right-[100px] bottom-[24px] flex items-end gap-2 pointer-events-none">
        <Legend />
        {showSelection && <SelectionBar />}
      </div>
    </div>
  );
}
