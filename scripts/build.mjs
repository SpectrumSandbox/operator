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
const dist = path.join(root, 'dist');
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
    for (const m of text.matchAll(/[^\s"'`{}<>;,()\\]+/g)) candidates.add(m[0]);
  }
  return compiler.build([...candidates]);
}

async function writeIndex(jsName, cssNames) {
  const tpl = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const links = cssNames.map((c) => `<link rel="stylesheet" href="/assets/${c}" />`).join('\n    ');
  const html = tpl
    .replace('<!-- STYLES -->', links)
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
  entryPoints: { app: path.join(src, 'main.tsx') },
  bundle: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16', 'firefox115'],
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  write: false,
  outdir: path.join(dist, 'assets'),
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
  let jsName = '';
  const cssNames = [];
  for (const f of result.outputFiles) {
    const ext = path.extname(f.path);
    const base = path.basename(f.path, ext);
    let name = path.basename(f.path);
    if (ext === '.js' || ext === '.css') name = `${base}-${hash(f.contents)}${ext}`;
    await fs.writeFile(path.join(dist, 'assets', name), f.contents);
    if (ext === '.js') jsName = name;
    if (ext === '.css') cssNames.push(name);
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
  await writeIndex(jsName, [...cssNames, twName]);
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
  const sizes = await Promise.all(
    [out.jsName, ...out.cssNames].map(async (n) => `${n} ${((await fs.stat(path.join(dist, 'assets', n))).size / 1024).toFixed(1)} kB`),
  );
  console.log(`✓ built in ${Date.now() - t0} ms\n  ${sizes.join('\n  ')}`);
  if (args.has('--preview')) serve(4173);
}
