// Spectrum Operator — Cloudflare Worker.
// Static assets are served by Workers Assets; this script only handles /api/*.
//
// /api/navearth/<layer> — server-side proxy for AirNav Indonesia's public NavEarth
// GeoServer (WFS, GeoJSON). The upstream sends no CORS headers, so browsers on
// operator.spectrumgroup.id cannot read it directly. The proxy:
//   • only allows a fixed whitelist of layers,
//   • keeps the properties the map uses and drops duplicated geometry fields,
//   • rounds coordinates to 4 decimals (~11 m) and drops repeated vertices,
//   • caches at the edge (NOTAM/ASHTAM 5 min, AIP layers 12 h).

const UPSTREAM =
  'https://app-pia.airnavindonesia.co.id/geoserver/enroute_chart/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json&typeName=enroute_chart:';

const AIRSPACE_PROPS = ['layer', 'name', 'identifier', 'upper', 'lower', 'class', 'unt_srvc', 'callsign', 'hos', 'freq', 'remarks', 'source_aip'];

export const LAYERS = {
  fir: { types: ['fir_polygon', 'areadel_polygon'], ttl: 43200, props: AIRSPACE_PROPS },
  uta: { types: ['uta_polygon'], ttl: 43200, props: AIRSPACE_PROPS },
  tma: { types: ['tma_polygon'], ttl: 43200, props: AIRSPACE_PROPS },
  ctr: { types: ['ctr_polygon'], ttl: 43200, props: AIRSPACE_PROPS },
  danger: { types: ['danger_areas'], ttl: 43200, props: AIRSPACE_PROPS },
  restricted: { types: ['restricted_areas'], ttl: 43200, props: AIRSPACE_PROPS },
  prohibited: { types: ['prohibited_areas'], ttl: 43200, props: AIRSPACE_PROPS },
  notam: {
    types: ['notam_active'],
    ttl: 300,
    props: ['notam_no', 'notam_req_no', 'location', 'start_datetime_utc', 'end_datetime_utc', 'upper_limit', 'lower_limit', 'item_d', 'item_e', 'radius_nm', 'coord_center', 'status'],
  },
  ashtam: { types: ['ashtam_airspace'], ttl: 300, props: ['ashtam_no', 'volcano_name', 'start_datetime_utc', 'end_datetime_utc', 'remarks', 'status'] },
  routes: {
    types: ['ats_route_international', 'ats_route_rnp_upper'],
    ttl: 43200,
    props: ['name_route', 'name_segment', 'from_name', 'to_name', 'distance', 'upper_limit', 'lower_limit', 'airspace_class', 'direction', 'min_flt_alt'],
  },
  navaids: { types: ['nav_aid_enr'], ttl: 43200, props: ['designator_nav', 'name_nav', 'station', 'freq_ch', 'svc_hr', 'remarks_nav'] },
  points: { types: ['rep_point'], ttl: 43200, props: ['name_rep', 'type_rep'] },
};

const round = (n) => Math.round(n * 1e4) / 1e4;

function roundCoords(c) {
  if (typeof c[0] === 'number') return [round(c[0]), round(c[1])];
  const out = [];
  for (const x of c) {
    const r = roundCoords(x);
    const prev = out[out.length - 1];
    // drop consecutive duplicate vertices (only for positions)
    if (typeof r[0] === 'number' && prev && prev[0] === r[0] && prev[1] === r[1]) continue;
    out.push(r);
  }
  return out;
}

/** Pure transform — exported for tests. */
export function slimFeatures(features, props) {
  const out = [];
  for (const f of features || []) {
    if (!f || !f.geometry || !f.geometry.coordinates) continue;
    const p = {};
    for (const k of props) {
      const v = f.properties ? f.properties[k] : undefined;
      if (v !== undefined && v !== null && v !== '') p[k] = typeof v === 'string' ? v.trim() : v;
    }
    out.push({ type: 'Feature', properties: p, geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) } });
  }
  return out;
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${Math.min(maxAge, 300)}, s-maxage=${maxAge}` : 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function navearth(request, key, ctx) {
  const spec = LAYERS[key];
  if (!spec) return json({ error: 'unknown layer', layers: Object.keys(LAYERS) }, 404);

  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/navearth/${key}`, request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const parts = await Promise.all(
      spec.types.map(async (t) => {
        const r = await fetch(UPSTREAM + t, {
          headers: { accept: 'application/json', 'user-agent': 'SpectrumOperator/1.0 (+https://operator.spectrumgroup.id)' },
          cf: { cacheTtl: spec.ttl, cacheEverything: true },
        });
        if (!r.ok) throw new Error(`upstream ${t} ${r.status}`);
        const j = await r.json();
        return slimFeatures(j.features, spec.props).map((f) => ({ ...f, properties: { ...f.properties, _src: t } }));
      }),
    );
    const body = {
      type: 'FeatureCollection',
      layer: key,
      fetchedAt: new Date().toISOString(),
      source: 'AirNav Indonesia — NavEarth (AIP / NOTAM)',
      features: parts.flat(),
    };
    const res = json(body, 200, spec.ttl);
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return json({ error: 'NavEarth upstream unavailable', detail: String(e && e.message ? e.message : e) }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/navearth\/([a-z]+)\/?$/);
    if (m) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405);
      return navearth(request, m[1], ctx);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
