/**
 * DIAGRAM EXPORT — every view of a site as an SVG file, so a diagram can be sent to someone.
 *
 * WHY IT EXISTS: a diagram you can only see by cloning a repo, installing a toolchain and starting
 * a server is a diagram nobody outside the team will look at. An SVG is one file, opens anywhere,
 * scales without blurring, and can be dropped into a pull request, a deck or a message.
 *
 * WHY IT IS NOT A SCREENSHOT. The viewer already knows how to serialise itself:
 * `structurizr.diagram.exportCurrentDiagramToSVG()` returns the drawing as a string — measured at
 * 35,892 characters for one view. That is the renderer's own geometry, not a picture of pixels, so
 * the text stays selectable, the file stays small, and nothing depends on a viewport size.
 *
 * IT NEEDS A BROWSER AND THAT IS NOT AN ACCIDENT. The site computes its own layout at render time;
 * there is no coordinate set on disk that a script could serialise instead. Measured twice: the
 * exported workspace.json has x:0,y:0 for every element, and the site bundle's positions are not the
 * layout Graphviz produces — Structurizr post-processes it. So something has to run the page.
 *
 * THE DIAGRAM KEY IS EXPORTED BESIDE EACH VIEW, because The C4 Model ch10 asks for a key wherever
 * the notation is not self-evident, and a diagram sent as a file has left every page that could
 * have explained it.
 *
 * THE COLOUR SCHEME IS SET, NOT INHERITED, and the first version inherited it. A fresh headless
 * Chromium reports prefers-color-scheme: light, so the viewer rendered light and baked
 * `background: #ffffff` into the file — while every colour in the palette is chosen for a dark
 * ground. The relationship labels are #d7dbe3, which is 11.5:1 on the canvas and about 1.3:1 on
 * white: the edges were legible on screen and invisible in the file anyone was sent. The same
 * export run against a browser already in dark mode produced #111111 instead, which is how the
 * cause was found — one artifact, two backgrounds, depending on the machine that made it.
 *
 * So the context is opened with colorScheme dark, the viewer is told setDarkMode(true) rather than
 * left to a media query, and the background is then replaced with the theme's own canvas so the
 * file matches the wrapper a reader saw. One palette, one home, and nothing about the colours
 * changes anywhere except inside the exported file.
 *
 * exit 0 files written · 1 nothing exported · 2 usage · 3 UNEVALUABLE, with the reason
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STATES = Object.freeze(['written', 'ABSENT', 'UNEVALUABLE']);

const slug = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');

/**
 * Open a Structurizr static site and write one SVG per view.
 *
 * A VIEW THAT WILL NOT EXPORT IS NAMED, NOT SKIPPED. The viewer reports isExportable() per view;
 * a silent skip would leave the caller believing a set is complete when one is missing.
 */
/**
 * The canvas the palette was designed against, read from the theme rather than typed here. A theme
 * that cannot be read is not a reason to bake a white ground into a dark palette, so the fallback
 * is the same value the theme ships with, and the caller is told which one was used.
 */
export function canvasOf(root = HERE) {
  const f = path.join(root, 'architecture', 'theme.json');
  try { return { canvas: JSON.parse(fs.readFileSync(f, 'utf8')).canvas, from: 'architecture/theme.json' }; }
  catch { return { canvas: '#1F2226', from: 'the built-in default — architecture/theme.json could not be read' }; }
}

/** Replace whatever ground the renderer baked in with the one the palette expects. */
export function ground(svg, canvas) {
  return svg.replace(/(<svg\b[^>]*style=")([^"]*)(")/, (m, a, style, b) =>
    a + (/background\s*:/.test(style) ? style.replace(/background\s*:\s*[^;"]+/, `background: ${canvas}`) : `${style};background: ${canvas}`) + b);
}

export async function exportSite(url, { out, key = true, only = null, canvas = canvasOf().canvas } = {}) {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    return { state: 'UNEVALUABLE', why: 'this reads the rendered diagram, so it needs playwright: npm i -D playwright && npx playwright install chromium' };
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, colorScheme: 'dark' });
  const rows = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => window.structurizr?.diagram?.isRendered?.(), null, { timeout: 30_000 }).catch(() => {});

    const views = await page.evaluate(() => {
      const w = window.structurizr?.workspace;
      const v = w?.views ?? {};
      const out = [];
      for (const k of ['systemLandscapeViews', 'systemContextViews', 'containerViews', 'componentViews', 'dynamicViews', 'deploymentViews']) {
        for (const view of v[k] ?? []) out.push({ key: view.key, kind: k.replace(/Views$/, '') });
      }
      return out;
    });
    if (!views.length) return { state: 'UNEVALUABLE', why: 'the page exposes no workspace views — is this a Structurizr static site?' };

    fs.mkdirSync(out, { recursive: true });
    for (const v of views) {
      if (only && !only.includes(v.key)) continue;
      const got = await page.evaluate(async (viewKey) => {
        const dg = window.structurizr.diagram;
        dg.setDarkMode?.(true);
        dg.changeView(viewKey);
        await new Promise((r) => setTimeout(r, 900));
        if (!dg.isExportable()) return { ok: false, why: 'the viewer reports this view as not exportable' };
        return { ok: true, svg: dg.exportCurrentDiagramToSVG(), keySvg: dg.exportCurrentDiagramKeyToSVG?.() ?? null };
      }, v.key);

      if (!got.ok) { rows.push({ view: v.key, kind: v.kind, state: 'ABSENT', why: got.why }); continue; }
      const file = path.join(out, `${slug(v.key)}.svg`);
      fs.writeFileSync(file, ground(got.svg, canvas));
      const row = { view: v.key, kind: v.kind, state: 'written', file, bytes: got.svg.length };
      if (key && got.keySvg) {
        const kf = path.join(out, `${slug(v.key)}-key.svg`);
        fs.writeFileSync(kf, ground(got.keySvg, canvas));
        row.keyFile = kf;
      }
      rows.push(row);
    }
  } finally {
    await browser.close();
  }

  const wrote = rows.filter((r) => r.state === 'written');
  return { state: wrote.length ? 'written' : 'ABSENT', rows,
           why: wrote.length ? `${wrote.length} view(s) written` : 'no view could be exported' };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const target = argv.find((a) => !a.startsWith('--') && a !== flag('--out', null) && a !== flag('--views', null));

  if (!target) {
    console.error('usage: node checks/diagram-export.mjs <site url | site/index.html> [--out <dir>] [--views a,b] [--no-key]');
    process.exit(2);
  }
  const url = /^https?:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href;
  const out = path.resolve(flag('--out', path.join(HERE, 'architecture', 'svg')));
  const only = flag('--views', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

  const c = canvasOf();
  const r = await exportSite(url, { out, key: !argv.includes('--no-key'), only, canvas: c.canvas });
  console.log(`\n  diagram-export · ${r.state}\n     ${r.why} · ground ${c.canvas} from ${c.from}`);
  for (const row of r.rows ?? []) {
    if (row.state === 'written') console.log(`    ok   ${row.view.padEnd(20)} ${String(row.bytes).padStart(7)} bytes · ${path.relative(process.cwd(), row.file)}${row.keyFile ? ' · + key' : ''}`);
    else console.log(`    ${row.state} ${row.view.padEnd(20)} ${row.why}`);
  }
  process.exit(r.state === 'written' ? 0 : r.state === 'ABSENT' ? 1 : 3);
}
