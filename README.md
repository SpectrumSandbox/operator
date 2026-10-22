# Spectrum Operator

**SPECTRUM GROUP // OPERATOR** — multi-mission unmanned systems & drone fleet management for **PT Spectrum Group Indonesia**.
Live at **https://operator.spectrumgroup.id**

A single operational picture for every airframe class (fixed-wing VTOL, multirotor quad/hexa/octo, heavy-lift cargo, long-endurance fixed-wing, tactical ISR, USV) and every mission profile (survey & mapping, linear/corridor inspection, ISR & maritime patrol, SAR & emergency response, cargo & medical logistics, precision agriculture & forestry) — with a deterministic deployment-ETA engine, airspace/permit awareness for Indonesian regulation (KKOP, CTR, NOTAM/TFR, military areas, SINKAP / AirNav / TNI AU clearances) and a live simulation.

## Views

| | View | What it does |
|---|---|---|
| 01 | **Mission Control** | KPI strip, interactive map of Indonesia (AOIs, corridors, routes, bases, live UAVs with heading vectors and breadcrumbs, crews), weather & airspace layers, regional quick-jumps, prioritised work queue, AI operational briefing, fleet readiness and the selected-mission deployment calculator with candidate transit vectors. |
| 02 | **Fleet & Assets** | Unit registry & health (status, energy/SoH, cycles, cell balance, airframe/motor hours, service interval, firmware, fault codes), modular payload & sensor calibration tracker, crew roster with ratings and duty limits. |
| 03 | **Scheduler & Airspace** | Multi-resource Gantt and calendar with hourly weather-suitability bands, permit windows and NOTAM overlays; automated conflict detection with resolutions; AI "Auto-Propose Schedule"; full Deployment ETA engine matrix with operator override + audit trail; permit tracker. |
| 04 | **Telemetry & QA Pipeline** | Ingest → validation → processing → QA scoring → publish per run, quarantined datasets with failure reasons, flagged-cell / segment QA map, dual-approver sign-off, live telemetry stream. |
| 05 | **Operations Analytics** | Turnaround, SLA, utilisation, unit economics (per ha / km / kg / flight hour), AI adoption vs overrides, client deliverables — filterable, with CSV and printable spec-sheet report. Also: SORA risk assessment (GRC/ARC/SAIL) with pre-flight checklist, battery & component lifecycle ledger, in-flight contingency simulator. |
| 06 | **Master Data** | Chapter 7 configuration: regional travel speeds, mode overheads, airframe coverage/sortie/turnaround/set-up, weather limits — each parameter marked *verified* or *unverified*, driving the `INDICATIVE` / `VERIFIED` ETA badge. |

## Deployment ETA engine

```
Deployment ETA       = T_avail + T_transit + T_setup
Sorties              = ⌈ Workload / Effective capacity per sortie ⌉
T_exec               = Sorties × (Sortie flight time + Battery/payload swap & turnaround)
Earliest completion  = Deployment ETA + T_exec, executed only inside contiguous
                       weather + airspace clearance windows
```

`T_transit` picks the fastest feasible mode — road, ferry/speedboat, air freight or direct self-ferry flight — from regional speeds and handling overheads. The window scheduler walks hourly forecasts (wind, gust, rain, visibility, ceiling, daylight for optical sensors) and airspace legality (permit windows, clearance lead times, active NOTAM/TFR). Any unverified master-data parameter used in a result marks the ETA `INDICATIVE`.

Source: `src/engine/` — `eta.ts`, `conflicts.ts`, `optimizer.ts`, `sora.ts`, `briefing.ts`, `weather.ts`, `airspace.ts`.

## Stack

React 19 · TypeScript (strict) · Tailwind CSS v4 · Leaflet 1.9 · d3 (scale/shape) charts · Lucide icons (vendored SVG, ISC) · esbuild bundling · Cloudflare Workers static assets.

Brand tokens (Montserrat, `#202020` base, hairline `rgba(255,255,255,.10)` borders, the seven-colour spectrum bar, status semantics) mirror the live CSS custom properties of spectrumgroup.id and designer.spectrumgroup.id — see `src/styles/app.css`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (esbuild watch + static server)
npm run build      # tsc --noEmit && production bundle → dist/
npm run preview    # build + serve dist on http://localhost:4173
```

`scripts/build.mjs` bundles with esbuild and compiles Tailwind v4 through its `compile()` API (class candidates are scanned from `src/`). `scripts/gen-icons.mjs` regenerates `src/ui/icons.tsx` from a checkout of the Lucide icon set.

## Deploy (Cloudflare)

`wrangler.jsonc` serves `dist/` as Workers static assets with SPA fallback and binds the custom domain `operator.spectrumgroup.id` (the `spectrumgroup.id` zone must be in the same Cloudflare account; Wrangler creates the DNS record on deploy).

- **Git integration (recommended):** Cloudflare dashboard → Workers & Pages → Create → Import a repository → `SpectrumSandbox/operator`, Worker name `spectrum-operator`, build command `npm run build`, deploy command `npx wrangler deploy`. Every push to `main` deploys.
- **Manual:** `npm run deploy` (requires `wrangler login` or `CLOUDFLARE_API_TOKEN`).

## Data

All operational data is seeded in `src/data/seed.ts` relative to the current time: real Indonesian bases (Jakarta/Halim periphery, Cikarang–Bekasi, Bandung highlands, Balikpapan–IKN corridor, Morowali/IMIP, Surabaya port, Denpasar coast, Timika, Pekanbaru), real airports and KKOP areas, and a mixed fleet including the ELANG E-1 VTOL. Figures are representative; replace the seed and `sampleWeather` with live fleet telemetry, BMKG/NWP and AirNav feeds for production use. The simulation (header ▶ / 1× – 300×) moves aircraft along their flight patterns, drains and swaps batteries, advances pipelines, drifts storm cells and re-evaluates holds and dispatches in real time.
