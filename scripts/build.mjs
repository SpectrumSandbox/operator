// Spectrum Operator build: esbuild (bundle + minify) + Tailwind v4 (compile API).
// Usage: node scripts/build.mjs [--serve | --preview]
import { build, context } from 'esbuild';
import { compile } from 'tailwindcss';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(root, 'dist');
const require = createRequire(import.meta.url);
const args = new Set(process.argv.slice(2));
const t0 = Date.now();

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

/** Tailwind v4: scan sources for candidate class tokens and compile. */
async function buildTailwind() {
  const entry = path.join(src, 'styles', 'app.css');
  const css = await fs.readFile(entry, 'utf8');
  const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
  const compiler = await compile(css, {
    base: path.dirname(entry),
    async loadStylesheet(id, base) {
      let file;
      if (id === 'tailwindcss') file = path.join(twDir, 'index.css');
      else if (id.startsWith('tailwindcss/')) file = path.join(twDir, id.slice('tailwindcss/'.length));
      else file = path.resolve(base, id);
      return { path: file, base: path.dirname(file), content: await fs.readFile(file, 'utf8') };
    },
  });
  const candidates = new Set();
  for (const f of await walk(src)) {
    if (!/\.(tsx?|html)$/.test(f)) continue;
    const text = await fs.readFile(f, 'utf8');
    // Coarse split keeps arbitrary values intact (e.g. grid-cols-[minmax(0,1fr)_300px]);
    // the fine split catches classes adjacent to JSX/TS punctuation. Tailwind ignores
    // anything that isn't a valid candidate.
    for (const m of text.matchAll(/[^\s"'`\\]+/g)) candidates.add(m[0]);
    for (const m of text.matchAll(/[^\s"'`{}<>;,()\\]+/g)) candidates.add(m[0]);
  }
  return compiler.build([...candidates]);
}

async function writeIndex(jsName, cssNames, routes = {}, entryImports = []) {
  const tpl = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const links = cssNames.map((c) => `<link rel="stylesheet" href="/assets/${c}" />`).join('\n    ');
  // Preload the entry's shared chunks, and — via a tiny inline script — the chunks
  // of whichever view the URL opens on, so they download in parallel with the entry.
  const preload = entryImports.map((c) => `<link rel="modulepreload" href="/assets/${c}" />`).join('\n    ');
  const routeScript = `<script>(function(){var r=${JSON.stringify(routes)};var v=(location.hash.replace(/^#\\/?/,'').split(/[\\/?]/)[0])||'mission-control';(r[v]||r['mission-control']||[]).forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href='/assets/'+f;document.head.appendChild(l);});})();</script>`;
  const html = tpl
    .replace('<!-- STYLES -->', [links, preload, routeScript].filter(Boolean).join('\n    '))
    .replace('<!-- SCRIPT -->', `<script type="module" src="/assets/${jsName}"></script>`);
  await fs.writeFile(path.join(dist, 'index.html'), html);
}

async function copyPublic() {
  const pub = path.join(root, 'public');
  try {
    await fs.cp(pub, dist, { recursive: true });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

const esbuildOptions = (dev) => ({
  absWorkingDir: root,
  entryPoints: { app: path.join(src, 'main.tsx') },
  bundle: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16', 'firefox115'],
  jsx: 'automatic',
  minify: !dev && process.env.MINIFY !== '0',
  sourcemap: dev ? 'inline' : false,
  write: false,
  // Code splitting: each view (and Leaflet) becomes its own chunk loaded on demand.
  splitting: true,
  metafile: true,
  outdir: path.join(dist, 'assets'),
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  loader: { '.png': 'file', '.svg': 'file' },
  assetNames: '[name]-[hash]',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  legalComments: 'none',
  logLevel: 'warning',
});

async function buildOnce(dev = false) {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
  await copyPublic();

  const result = await build(esbuildOptions(dev));
  const assetsDir = path.join(dist, 'assets');
  for (const f of result.outputFiles) {
    await fs.mkdir(path.dirname(f.path), { recursive: true });
    await fs.writeFile(f.path, f.contents);
  }
  // Entry script from the metafile; every emitted stylesheet is linked up-front
  // (esbuild does not inject CSS for lazily loaded chunks; they are small).
  const outs = Object.entries(result.metafile.outputs);
  const entry = outs.find(([, o]) => o.entryPoint && o.entryPoint.endsWith('main.tsx'));
  const jsName = path.relative(assetsDir, path.resolve(root, entry[0])).split(path.sep).join('/');
  const cssNames = outs.filter(([f]) => f.endsWith('.css')).map(([f]) => path.relative(assetsDir, path.resolve(root, f)).split(path.sep).join('/'));
  // Route → chunk files (each lazily loaded view chunk + its static imports).
  const rel = (f) => path.relative(assetsDir, path.resolve(root, f)).split(path.sep).join('/');
  const closure = (file, seen = new Set()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    for (const im of result.metafile.outputs[file]?.imports ?? []) if (im.kind === 'import-statement' && im.path.endsWith('.js')) closure(im.path, seen);
    return seen;
  };
  const entryImports = [...closure(entry[0])].filter((f) => f !== entry[0]).map(rel);
  const VIEW_FILES = { 'mission-control': 'MissionControl', fleet: 'Fleet', scheduler: 'Scheduler', telemetry: 'Telemetry', analytics: 'Analytics', 'master-data': 'MasterData' };
  const routes = {};
  for (const [route, name] of Object.entries(VIEW_FILES)) {
    const out = outs.find(([, o]) => Object.keys(o.inputs).some((i) => i.endsWith(`src/views/${name}.tsx`)));
    if (out) routes[route] = [...closure(out[0])].filter((f) => f !== entry[0] && !closure(entry[0]).has(f)).map(rel);
  }

  const twCss = await buildTailwind();
  const twMin = await build({
    stdin: { contents: twCss, loader: 'css', resolveDir: path.join(src, 'styles') },
    minify: !dev,
    write: false,
    bundle: true,
    logLevel: 'warning',
    outfile: 'tw.css',
  });
  const tw = twMin.outputFiles[0].contents;
  const twName = `tw-${hash(tw)}.css`;
  await fs.writeFile(path.join(dist, 'assets', twName), tw);
  // Leaflet / component CSS first, then Tailwind + brand layer on top.
  await writeIndex(jsName, [...cssNames, twName], routes, entryImports);
  return { jsName, cssNames: [...cssNames, twName] };
}

function serve(port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain' };
  http
    .createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(dist, url);
      try {
        const st = await fs.stat(file);
        if (st.isDirectory()) file = path.join(file, 'index.html');
      } catch {
        file = path.join(dist, 'index.html'); // SPA fallback
      }
      try {
        const body = await fs.readFile(file);
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    })
    .listen(port, () => console.log(`  ▸ http://localhost:${port}`));
}

if (args.has('--serve')) {
  await buildOnce(true);
  serve(5173);
  const ctx = await context({ ...esbuildOptions(true), write: false, plugins: [{ name: 'rebuild', setup(b) { b.onEnd(() => buildOnce(true).then(() => console.log('  ↻ rebuilt'))); } }] });
  await ctx.watch();
} else {
  const out = await buildOnce(false);
  const files = (await fs.readdir(path.join(dist, 'assets'))).filter((n) => /\.(js|css)$/.test(n));
  const sizes = await Promise.all(files.map(async (n) => `${n} ${((await fs.stat(path.join(dist, 'assets', n))).size / 1024).toFixed(1)} kB${n === out.jsName ? '  (entry)' : ''}`));
  console.log(`✓ built in ${Date.now() - t0} ms\n  ${sizes.join('\n  ')}`);
  if (args.has('--preview')) serve(Number(process.env.PORT) || 4173);
}
