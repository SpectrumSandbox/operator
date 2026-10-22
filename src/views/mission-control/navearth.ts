// NavEarth overlay — live Indonesian AIP airspace, NOTAM and ASHTAM data from
// AirNav Indonesia (app-pia.airnavindonesia.co.id/navearth), fetched through the
// Worker proxy at /api/navearth/<layer> and drawn on the Mission Control map.
import * as L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import type { MapLayers } from '../../store';

export type NavKey = 'fir' | 'uta' | 'tma' | 'ctr' | 'danger' | 'restricted' | 'prohibited' | 'notam' | 'ashtam' | 'routes' | 'navaids';

export interface NavLayerDef {
  key: NavKey;
  toggle: keyof MapLayers;
  label: string;
  color: string;
  dash?: string;
  fill: number;
  /** Additional upstream layer fetched with this toggle (reporting points with navaids). */
  extra?: 'points';
  /** Refresh interval (ms) while visible. */
  refreshMs: number;
}

export const NAV_LAYERS: NavLayerDef[] = [
  { key: 'fir', toggle: 'naFir', label: 'FIR boundaries', color: '#b4b4b4', dash: '10 6', fill: 0, refreshMs: 0 },
  { key: 'uta', toggle: 'naUta', label: 'Upper control areas (UTA)', color: '#8384e2', dash: '2 6', fill: 0, refreshMs: 0 },
  { key: 'tma', toggle: 'naTma', label: 'Terminal areas (TMA)', color: '#5ebfc0', dash: '6 4', fill: 0.03, refreshMs: 0 },
  { key: 'ctr', toggle: 'naCtr', label: 'Control zones (CTR)', color: '#4f8cff', fill: 0.08, refreshMs: 0 },
  { key: 'danger', toggle: 'naDanger', label: 'Danger areas (WSD)', color: '#e8a33a', dash: '5 3', fill: 0.1, refreshMs: 0 },
  { key: 'restricted', toggle: 'naRestricted', label: 'Restricted areas (WAR)', color: '#ff7a45', fill: 0.1, refreshMs: 0 },
  { key: 'prohibited', toggle: 'naProhibited', label: 'Prohibited areas (WAP)', color: '#ff4d55', fill: 0.22, refreshMs: 0 },
  { key: 'notam', toggle: 'naNotam', label: 'Active NOTAM areas', color: '#d926d8', dash: '4 3', fill: 0.07, refreshMs: 10 * 60_000 },
  { key: 'ashtam', toggle: 'naAshtam', label: 'Volcanic ash (ASHTAM)', color: '#d8d926', dash: '3 3', fill: 0.16, refreshMs: 10 * 60_000 },
  { key: 'routes', toggle: 'naRoutes', label: 'ATS routes', color: '#7a8fa8', fill: 0, refreshMs: 0 },
  { key: 'navaids', toggle: 'naNavaids', label: 'Navaids & reporting points', color: '#9fb4c8', fill: 0, extra: 'points', refreshMs: 0 },
];

type FC = { type: 'FeatureCollection'; features: Feature[]; fetchedAt?: string };
type Entry = { status: 'idle' | 'loading' | 'ok' | 'error'; data?: FC; error?: string; loadedAt?: number; ver: number };

const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function onNavEarthChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const navEarthVersion = () => version;

export function navEntry(key: string): Entry {
  return store.get(key) ?? { status: 'idle', ver: 0 };
}

/** Ensure a layer is loaded (and refreshed when stale). Safe to call every sync. */
export function ensureNav(key: string, refreshMs: number) {
  const e = store.get(key);
  const stale = e?.status === 'ok' && refreshMs > 0 && Date.now() - (e.loadedAt ?? 0) > refreshMs;
  const retry = e?.status === 'error' && Date.now() - (e.loadedAt ?? 0) > 60_000;
  if (e && e.status !== 'idle' && !stale && !retry) return;
  if (e?.status === 'loading') return;
  store.set(key, { ...(e ?? { ver: 0 }), status: 'loading' });
  emit();
  fetch(`/api/navearth/${key}?v=2`, { headers: { accept: 'application/json' } })
    .then(async (r) => {
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error(`unavailable (${r.status})`);
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.features)) throw new Error(j.error ?? `HTTP ${r.status}`);
      store.set(key, { status: 'ok', data: j as FC, loadedAt: Date.now(), ver: (store.get(key)?.ver ?? 0) + 1 });
    })
    .catch((err: unknown) => {
      const prev = store.get(key);
      // keep previous data if a refresh fails
      store.set(key, { status: prev?.data ? 'ok' : 'error', data: prev?.data, error: err instanceof Error ? err.message : String(err), loadedAt: Date.now(), ver: prev?.ver ?? 0 });
    })
    .finally(emit);
}

export function retryNav(key: string) {
  store.delete(key);
  emit();
}

// ── rendering ───────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const trim = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const fmtUtc = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) + 'Z' : '—');

function kv(k: string, v: unknown) {
  if (v === undefined || v === null || v === '' || v === 'NIL' || v === '-') return '';
  return `<div style="display:flex;gap:8px;justify-content:space-between"><span style="color:#7a7a7a">${k}</span><span style="font-family:'JetBrains Mono',monospace;text-align:right">${esc(v)}</span></div>`;
}

function tooltipHtml(def: NavLayerDef, p: Record<string, unknown>): string {
  const head = (title: string, tag: string) =>
    `<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px"><b>${esc(title)}</b><span style="margin-left:auto;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${def.color}">${esc(tag)}</span></div>`;
  const foot = `<div style="margin-top:4px;font-size:9.5px;color:#7a7a7a">AirNav Indonesia · NavEarth${p.source_aip ? ' · ' + esc(trim(p.source_aip, 48)) : ''}</div>`;
  switch (def.key) {
    case 'notam':
      return (
        head(String(p.notam_no ?? 'NOTAM'), `NOTAM · ${p.location ?? ''}`) +
        `<div style="max-width:300px;white-space:normal;margin-bottom:3px">${esc(trim(p.item_e, 220))}</div>` +
        kv('Valid', `${fmtUtc(p.start_datetime_utc as string)} → ${fmtUtc(p.end_datetime_utc as string)}`) +
        kv('Schedule', p.item_d) +
        kv('Limits', `${p.lower_limit ?? 'SFC'} – ${p.upper_limit ?? 'UNL'}`) +
        kv('Radius', p.radius_nm ? `${p.radius_nm} NM` : '') +
        foot
      );
    case 'ashtam':
      return head(`${p.volcano_name ?? 'Volcano'} ash`, `ASHTAM ${p.ashtam_no ?? ''}`) + kv('Valid', `${fmtUtc(p.start_datetime_utc as string)} → ${fmtUtc(p.end_datetime_utc as string)}`) + kv('Status', p.status) + foot;
    case 'routes':
      return head(String(p.name_route ?? 'ATS route'), String(p.name_segment ?? '')) + kv('Segment', `${p.from_name ?? '?'} → ${p.to_name ?? '?'}`) + kv('Distance', p.distance ? `${p.distance} NM` : '') + kv('Limits', `${p.lower_limit ?? ''} – ${p.upper_limit ?? ''}`) + kv('Class', p.airspace_class) + kv('MFA', p.min_flt_alt) + foot;
    case 'navaids':
      if (p._src === 'rep_point') return head(String(p.name_rep ?? 'Point'), `Reporting point`) + kv('Type', p.type_rep) + foot;
      return head(`${p.designator_nav ?? ''} ${p.name_nav ?? ''}`.trim(), String(p.station ?? 'Navaid')) + kv('Freq / Ch', p.freq_ch) + kv('Hours', p.svc_hr) + foot;
    default: {
      const title = String(p.name ?? p.layer ?? def.label);
      const lim = p.lower || p.upper ? `${p.lower ?? 'SFC'} – ${p.upper ?? 'UNL'}` : '';
      return (
        head(title, def.label.replace(/\s*\(.*\)/, '')) +
        kv('Limits', lim) +
        kv('Class', p.class) +
        kv('Unit', p.unt_srvc) +
        kv('Callsign', trim(p.callsign, 60)) +
        kv('Freq', trim(p.freq, 60)) +
        kv('Hours', p.hos) +
        (p.remarks && p.remarks !== 'NIL' && p.remarks !== 'null' ? `<div style="max-width:300px;white-space:normal;margin-top:3px;color:#b4b4b4">${esc(trim(p.remarks, 200))}</div>` : '') +
        foot
      );
    }
  }
}

const TIP: L.TooltipOptions = { className: 'so-tip', sticky: true, direction: 'top', opacity: 1 };

/** Build a Leaflet layer for one NavEarth dataset. */
/**
 * Build a Leaflet layer for one NavEarth dataset. All NavEarth layers share one
 * Canvas renderer: tens of thousands of vertices redraw in one pass instead of
 * re-serialising hundreds of SVG path strings after every pan/zoom.
 */
export function buildNavLayer(def: NavLayerDef, fc: FC, renderer: L.Renderer, extra?: FC): L.Layer {
  const group = L.layerGroup();
  const isLine = def.key === 'routes';
  const gj = L.geoJSON(fc as FeatureCollection, {
    pane: 'mc-nav',
    style: () => ({
      renderer,
      smoothFactor: 1.5,
      color: def.color,
      weight: isLine ? 1 : def.key === 'fir' ? 1.6 : def.key === 'prohibited' ? 1.6 : 1.2,
      opacity: isLine ? 0.55 : 0.9,
      dashArray: def.dash,
      fillColor: def.color,
      fillOpacity: def.fill,
      interactive: true,
    }),
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, { renderer, pane: 'mc-nav', radius: 3.5, color: def.color, weight: 1.2, fillColor: '#161616', fillOpacity: 1 }),
    onEachFeature: (f, layer) => layer.bindTooltip(tooltipHtml(def, (f.properties ?? {}) as Record<string, unknown>), TIP),
  });
  group.addLayer(gj);
  if (extra) {
    group.addLayer(
      L.geoJSON(extra as FeatureCollection, {
        pane: 'mc-nav',
        pointToLayer: (_f, latlng) => L.circleMarker(latlng, { renderer, pane: 'mc-nav', radius: 2, color: def.color, weight: 1, opacity: 0.7, fillColor: def.color, fillOpacity: 0.5 }),
        onEachFeature: (f, layer) => layer.bindTooltip(tooltipHtml(def, { ...(f.properties ?? {}), _src: 'rep_point' } as Record<string, unknown>), TIP),
      }),
    );
  }
  return group;
}

export const NAV_ATTRIBUTION = 'Airspace &copy; <a href="https://app-pia.airnavindonesia.co.id/navearth/" target="_blank" rel="noopener noreferrer">AirNav Indonesia NavEarth</a> (AIP/NOTAM, not for navigation)';
