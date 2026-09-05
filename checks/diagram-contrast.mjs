/**
 * DIAGRAM CONTRAST — the palette has ONE home, every workspace binds it, and both are measured.
 *
 * WHY THIS EXISTS, in the operator's own words: "are you fixing this render or the machine which
 * will make repeatable trusted diagrams?" It was the render. The colours lived inside one
 * workspace.dsl, so the second repo to draw a diagram would have inherited nothing, and the first
 * one could have drifted with nobody noticing. This module is the machine:
 *
 *   architecture/theme.json is the palette. It is the only place a colour is chosen.
 *   Every tracked workspace's EXPORTED styles must equal it — drift is refused, not warned about.
 *   Every colour in it must clear a contrast floor — the palette itself cannot regress.
 *   Its LIGHTNESS LADDER must survive black and white, which is a number and so is checkable.
 *   Every dynamic view's steps are 1..n, contiguous, in the order the DSL wrote them.
 *   --write regenerates a DSL's styles block from the theme, so a new repo binds it without copying.
 *   --root <dir> points all of that at another checkout; the palette is always <root>/architecture/
 *   theme.json, because a second way to name it is a second palette waiting to be edited by mistake.
 *
 * THE SCHEME IS B+A, ruled by the operator 2026-09-04: hue says whether we own a thing, lightness
 * says how deep it sits. An earlier draft used colour to promise a descent — slate meant "there is a
 * diagram beneath this box" — and that rule lived here as a fourth check. It was removed with the
 * scheme it served, because The C4 Model ch10 asks colour to encode a dimension the reader cannot
 * already read off the page, and which level you are on is the one thing the diagram already says.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: it reads the EXPORT, not the pixels. A renderer
 * that ignores a declared style, a theme layered on top at view time, or a viewer in light mode with
 * a different ground would all pass here and could still be unreadable. The pixel-level instrument
 * is core/doc/design-probe.mjs, and it answers a different question.
 *
 * exit 0 measured · 1 REFUSED · 2 usage · 3 UNEVALUABLE
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* THE ROOT AND THE PALETTE ARE ARGUMENTS OF run(), NOT OF THE PROCESS.
   They were read from process.argv at module scope, which is a decision belonging to the CLI and
   leaked into the module. MEASURED: a program that imports this module and whose OWN argv carries
   --root retargeted the palette lookup and got "UNEVALUABLE · architecture/theme.json is not on
   disk" about a palette sitting on disk. A module that reads a process global at import time cannot
   be reasoned about by its caller, and this one silently reported an absence it had invented.
   Parsing now happens once, inside the CLI block at the bottom, and reaches everything else as
   ordinary arguments. */
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themeIn = (root) => path.join(root, 'architecture', 'theme.json');

/* A path a reader can act on: relative when it is inside the tree, absolute when it is not.
   The old line was path.relative(ROOT, file) unconditionally, which printed a palette outside the
   repo as ../../../../private/tmp/... — technically correct and unreadable. */
const short = (file, root) => {
  const rel = path.relative(root, file);
  return rel.startsWith('..') ? file : rel;
};

export const STATES = Object.freeze(['measured', 'REFUSED', 'ABSENT', 'UNEVALUABLE']);

/* The WCAG relative-luminance formula, written out rather than imported, because the whole point of
   this file is that the numbers can be re-derived by anyone reading it. */
const luminance = (hex) => {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The theme, or a state saying why there is none. A missing palette is UNEVALUABLE, never a pass. */
function readTheme(file) {
  if (!fs.existsSync(file)) return { state: 'UNEVALUABLE', why: `${short(file, HERE)} is not on disk — the palette has no home to check against` };
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(t.elements) || !t.canvas) return { state: 'UNEVALUABLE', why: 'the theme parses but declares no elements or no canvas' };
    return { state: 'measured', theme: t };
  } catch (e) {
    return { state: 'UNEVALUABLE', why: `the theme does not parse: ${e.message}` };
  }
}

/* One shape for a style row, so a theme row and an exported row are compared as values rather than
   as objects that happen to have the same keys in a different order. */
const norm = (row) => {
  const out = {};
  for (const k of ['tag', 'background', 'stroke', 'color', 'shape', 'fontSize', 'strokeWidth']) {
    if (row[k] === undefined || row[k] === null) continue;
    out[k] = typeof row[k] === 'string' && row[k].startsWith('#') ? row[k].toLowerCase() : row[k];
  }
  return out;
};
const key = (rows) => rows.map(norm).sort((a, b) => String(a.tag).localeCompare(String(b.tag)));

/**
 * THE PALETTE ITSELF: does every declared colour clear the floor?
 * Text is measured against the fill it sits on, and a stroke against the canvas, because those are
 * the two pairs a reader actually looks at. A row with no fill inherits the base row's colour, which
 * is why the base row is resolved first rather than skipped.
 */
function paletteRows(theme) {
  const base = theme.elements.find((e) => e.tag === 'Element') ?? {};
  const rows = [];
  for (const el of theme.elements) {
    if (el.tag === 'Element') continue;
    const ink = el.color ?? base.color;
    const fill = el.background;
    const stroke = el.stroke;
    if (fill && ink) rows.push({ tag: el.tag, pair: 'text on fill', a: ink, b: fill, ratio: contrast(ink, fill), floor: theme.floors?.textOnFill ?? 4.5 });
    if (stroke) rows.push({ tag: el.tag, pair: 'stroke on canvas', a: stroke, b: theme.canvas, ratio: contrast(stroke, theme.canvas), floor: theme.floors?.strokeOnCanvas ?? 3 });
  }
  for (const rel of theme.relationships ?? []) {
    if (rel.color) rows.push({ tag: rel.tag, pair: 'label on canvas', a: rel.color, b: theme.canvas, ratio: contrast(rel.color, theme.canvas), floor: theme.floors?.textOnFill ?? 4.5 });
  }
  return rows;
}

/**
 * A DYNAMIC VIEW'S STEPS ARE 1..n, CONTIGUOUS, IN THE ORDER THE DSL WROTE THEM.
 *
 * A feature trace is the one diagram whose meaning IS its order, and the order survives three hops
 * before a reader sees it: DSL text, exported JSON, rendered SVG. Reading the picture proves the
 * order in one browser on one day; this proves it for every workspace, every run.
 *
 * WHAT IT CATCHES, and each of the three has a different cause: a gap (a step was dropped between
 * DSL and export), a duplicate (two steps claim one position, so the animation stalls on it), and
 * an order that disagrees with the sequence the steps are listed in (the exporter reordered them).
 *
 * WHAT IT CANNOT SEE: whether the RENDERER draws those numbers. That needs pixels, and it is the
 * design probe's question, not this one's.
 */
function stepOrder(ws) {
  const bad = [];
  for (const v of ws.views?.dynamicViews ?? []) {
    const steps = v.relationships ?? [];
    if (!steps.length) { bad.push({ view: v.key, why: 'a dynamic view with no steps — a feature trace that traces nothing' }); continue; }
    const orders = steps.map((s) => Number(s.order));
    if (orders.some((n) => !Number.isFinite(n))) { bad.push({ view: v.key, why: 'a step carries no readable order' }); continue; }
    const seen = new Set(orders);
    if (seen.size !== orders.length) { bad.push({ view: v.key, why: `two steps claim one position: ${orders.join(', ')}` }); continue; }
    const sorted = [...orders].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) { bad.push({ view: v.key, why: `the steps are ${sorted.join(', ')} — not 1..${sorted.length}, so one is missing or numbered past the end` }); break; }
    }
    if (orders.some((n, i) => n !== sorted[i])) bad.push({ view: v.key, why: `the export lists the steps as ${orders.join(', ')}, which is not the order they run in` });
  }
  return bad;
}

/** Every tracked workspace export: architecture/<name>/workspace.json beside its .dsl. */
function workspaces(root) {
  const dir = path.join(root, 'architecture');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, dsl: path.join(dir, d.name, 'workspace.dsl'), json: path.join(dir, d.name, 'workspace.json') }))
    .filter((w) => fs.existsSync(w.json));
}

/**
 * THE LADDER, which is the book's black-and-white test made mechanical.
 *
 * ch10 requires that a colour scheme survive colour vision deficiency and printing in black and
 * white. Strip the hue from a palette and all that is left is LIGHTNESS, so the scheme only
 * survives if its steps are ordered and far enough apart — which is a number, and therefore
 * checkable. Two rules, and the second is the one that caught a real fault:
 *
 *   1. the ramp lightens monotonically in its declared order, each step clearing greyscaleStep;
 *   2. everything outside the ramp sits BELOW all of it by the same step.
 *
 * MEASURED 2026-09-04, before this existed: the first B+A draft put the not-ours green at
 * luminance 0.0674 and the ours violet at 0.0671 — a greyscale ratio of 1.00. The one dimension a
 * reviewer most needs, ours against not ours, was invisible the moment the colour came off. It
 * looked right on screen, which is exactly why a rule and not an eye.
 */
function ladder(theme) {
  const fill = (tag) => theme.elements.find((e) => e.tag === tag)?.background ?? null;
  const step = theme.floors?.greyscaleStep ?? 1.3;
  const order = theme.ramp ?? [];
  const bad = [];
  if (order.length < 2) return bad;               // no ramp declared is not a broken ramp

  for (let i = 0; i < order.length - 1; i++) {
    const a = fill(order[i]), b = fill(order[i + 1]);
    if (!a || !b) { bad.push({ pair: `${order[i]} → ${order[i + 1]}`, why: 'a ramp tag has no background' }); continue; }
    const la = luminance(a), lb = luminance(b);
    const ratio = contrast(a, b);
    if (lb <= la) bad.push({ pair: `${order[i]} → ${order[i + 1]}`, ratio, why: 'the ramp does not lighten with depth here' });
    else if (ratio < step) bad.push({ pair: `${order[i]} → ${order[i + 1]}`, ratio, why: `${ratio}:1 in greyscale, under the ${step} step — the two levels merge when the colour comes off` });
  }

  const top = fill(order[0]);
  for (const tag of theme.notOurs ?? []) {
    const f = fill(tag);
    if (!f || !top) continue;
    const ratio = contrast(f, top);
    if (luminance(f) >= luminance(top)) bad.push({ pair: `${tag} vs ${order[0]}`, ratio, why: 'a not-ours element is not darker than the whole ramp, so it reads as part of it' });
    else if (ratio < step) bad.push({ pair: `${tag} vs ${order[0]}`, ratio, why: `${ratio}:1 in greyscale, under the ${step} step — ours and not-ours merge in black and white` });
  }
  return bad;
}

/** The DSL styles block, generated from the theme. One writer, so no repo hand-copies a colour. */
function stylesBlock(theme, indent = '        ') {
  const i2 = indent + '    ';
  const lines = [`${indent}/* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.`,
                 `${indent}   Edit the theme, not this block: the check refuses any drift between them. */`,
                 `${indent}styles {`];
  for (const el of theme.elements) {
    lines.push(`${i2}element "${el.tag}" {`);
    if (el.shape) lines.push(`${i2}    shape ${el.shape}`);
    if (el.background) lines.push(`${i2}    background ${el.background}`);
    if (el.stroke) lines.push(`${i2}    stroke ${el.stroke}`);
    if (el.color) lines.push(`${i2}    color ${el.color}`);
    if (el.strokeWidth) lines.push(`${i2}    strokeWidth ${el.strokeWidth}`);
    if (el.fontSize) lines.push(`${i2}    fontSize ${el.fontSize}`);
    lines.push(`${i2}}`);
  }
  for (const rel of theme.relationships ?? []) {
    lines.push(`${i2}relationship "${rel.tag}" {`);
    if (rel.color) lines.push(`${i2}    color ${rel.color}`);
    if (rel.fontSize) lines.push(`${i2}    fontSize ${rel.fontSize}`);
    lines.push(`${i2}}`);
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

/** The whole verdict: palette floors, per-workspace drift, per-workspace navigation promise. */
export function run({ root = HERE, themeFile = themeIn(root) } = {}) {
  const t = readTheme(themeFile);
  if (t.state !== 'measured') return { state: 'UNEVALUABLE', why: t.why };
  const theme = t.theme;

  const palette = paletteRows(theme);
  const unreadable = palette.filter((r) => r.ratio === null || r.ratio < r.floor);
  const rungs = ladder(theme);

  const found = workspaces(root);
  if (!found.length) {
    return { state: 'ABSENT', palette, unreadable, rungs, workspaces: [],
             why: 'the palette was measured and no exported workspace was found to bind it — an answer about this tree, not a pass' };
  }

  const themeKey = JSON.stringify(key(theme.elements));
  const themeRel = JSON.stringify(key(theme.relationships ?? []));
  const rows = [];
  for (const w of found) {
    let ws;
    try { ws = JSON.parse(fs.readFileSync(w.json, 'utf8')); }
    catch (e) { rows.push({ name: w.name, state: 'UNEVALUABLE', why: `export does not parse: ${e.message}` }); continue; }
    const styles = ws.views?.configuration?.styles ?? {};
    const driftEl  = JSON.stringify(key(styles.elements ?? [])) !== themeKey;
    const driftRel = JSON.stringify(key(styles.relationships ?? [])) !== themeRel;
    const steps = stepOrder(ws);
    rows.push({ name: w.name, state: driftEl || driftRel || steps.length ? 'REFUSED' : 'measured', driftEl, driftRel, steps });
  }

  const bad = rows.filter((r) => r.state !== 'measured');
  return {
    state: unreadable.length || rungs.length || bad.length ? 'REFUSED' : 'measured',
    palette, unreadable, rungs, workspaces: rows,
    why: unreadable.length ? `${unreadable.length} colour pair(s) under the floor`
       : rungs.length     ? `${rungs.length} rung(s) of the lightness ladder do not survive black and white`
       : bad.length       ? `${bad.length} of ${rows.length} workspace(s) refused`
       : `${rows.length} workspace(s) bind the palette · ${palette.length} colour pair(s) clear their floor · the ladder holds in greyscale`,
  };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */
function report(r) {
  console.log(`\n  diagram-contrast · ${r.state}\n     ${r.why}`);
  for (const p of r.palette ?? []) {
    const ok = p.ratio !== null && p.ratio >= p.floor;
    console.log(`    ${ok ? 'ok  ' : 'UNDER'} ${String(p.tag).padEnd(16)} ${p.pair.padEnd(17)} ${p.a} on ${p.b}  ${p.ratio}:1 (floor ${p.floor})`);
  }
  for (const g of r.rungs ?? []) console.log(`    UNDER ${String(g.pair).padEnd(34)} ${g.why}`);
  for (const w of r.workspaces ?? []) {
    console.log(`    ${w.state === 'measured' ? 'ok  ' : w.state} ${w.name}`);
    if (w.driftEl)  console.log('       element styles differ from architecture/theme.json — run --write, or change the theme');
    if (w.driftRel) console.log('       relationship styles differ from architecture/theme.json');
    for (const s of w.steps ?? []) console.log(`       ${s.view}: ${s.why}`);
    if (w.why) console.log(`       ${w.why}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : fallback;
  };
  const ROOT = flag('--root', HERE);
  const THEME = themeIn(ROOT);

  if (argv.includes('--write')) {
    const target = argv[argv.indexOf('--write') + 1];
    const t = readTheme(THEME);
    if (t.state !== 'measured') { console.error(t.why); process.exit(3); }
    if (!target || !fs.existsSync(target)) { console.error('usage: --write <workspace.dsl>'); process.exit(2); }
    /* THE FILE'S OWN INDENTATION, not this repo's. The writer matched the literal eight spaces
       that happen to be in our DSL, so it refused every workspace formatted any other way — a
       machine that only works on files written by the machine. */
    const src = fs.readFileSync(target, 'utf8');
    const open = src.match(/^([ \t]*)styles[ \t]*\{[ \t]*$/m);
    if (!open) { console.error(`${target} has no styles block to replace — add "styles { }" inside views first`); process.exit(2); }
    const indent = open[1];
    const at = open.index;
    const close = '\n' + indent + '}';
    const end = src.indexOf(close, at);
    if (end < 0) { console.error('the styles block does not close at its own indentation; refusing to guess'); process.exit(2); }
    fs.writeFileSync(target, src.slice(0, at) + stylesBlock(t.theme, indent) + src.slice(end + close.length));
    console.log(`wrote the palette into ${target} — re-export before checking`);
    process.exit(0);
  }

  if (argv.includes('--negative')) {
    /* THE CHECK MUST REFUSE. Four planted faults, each the shape of one that really happened.
       EACH FAULT GETS ITS OWN THROWAWAY ROOT, laid out exactly as a repo is: architecture/theme.json
       beside architecture/<project>/workspace.json. That is the same path the real run takes, so the
       proof cannot pass through a door the check does not use in production. */
    const t = readTheme(THEME);
    if (t.state !== 'measured') { console.error(t.why); process.exit(3); }
    const t0 = t.theme;
    const base = {
      model: { softwareSystems: [{ id: '1', name: 'S', containers: [{ id: '2', name: 'C', tags: 'Element,Container' }] }] },
      views: { configuration: { styles: { elements: structuredClone(t0.elements), relationships: structuredClone(t0.relationships) } } },
    };

    const roots = [];
    const plant = (theme, ws) => {
      const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'dcontrast-'));
      roots.push(dir);
      fs.mkdirSync(path.join(dir, 'architecture', 'x'), { recursive: true });
      fs.writeFileSync(themeIn(dir), JSON.stringify(theme));
      fs.writeFileSync(path.join(dir, 'architecture', 'x', 'workspace.json'), JSON.stringify(ws));
      return dir;
    };
    let refused = 0;
    const say = (n, r) => { const ok = r.state === 'REFUSED'; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n} → ${r.state}`); if (ok) refused++; };

    const drifted = structuredClone(base);
    drifted.views.configuration.styles.elements.find((e) => e.tag === t0.ramp[0]).background = '#999999';
    say('a workspace whose fill drifts from the theme', run({ root: plant(t0, drifted) }));

    const flat = structuredClone(t0);
    flat.elements.find((e) => e.tag === t0.ramp[1]).background = flat.elements.find((e) => e.tag === t0.ramp[0]).background;
    say('a ramp that stops lightening, so two levels merge in black and white', run({ root: plant(flat, base) }));

    const collide = structuredClone(t0);
    collide.elements.find((e) => e.tag === t0.notOurs[0]).background = t0.elements.find((e) => e.tag === t0.ramp[0]).background.replace(/.$/, '4');
    say('a not-ours colour at the same lightness as ours', run({ root: plant(collide, base) }));

    const dim = structuredClone(t0);
    dim.elements.find((e) => e.tag === t0.notOurs[0]).background = '#999999';
    say('a palette colour under the contrast floor', run({ root: plant(dim, base) }));

    /* A FEATURE TRACE WHOSE STEPS SKIP A NUMBER. The order is the whole content of this diagram, so
       a gap is not cosmetic: the reader is looking at a sequence with a hole and nothing says so. */
    const gappy = structuredClone(base);
    gappy.views.dynamicViews = [{ key: 'Flow', elementId: '2', relationships: [{ order: '1' }, { order: '2' }, { order: '4' }] }];
    say('a feature trace whose steps are 1, 2, 4', run({ root: plant(t0, gappy) }));

    for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
    console.log(`\n${refused} of 5 refused`);
    process.exit(refused === 5 ? 0 : 1);
  }

  if (argv.includes('--index')) {
    /* THE VIEWER CANNOT LIST A DIRECTORY OVER HTTP, so the directory listing is written down for it.
       Generated from what is on disk each time, because a hand-kept list of projects is a second
       home for a fact the filesystem already holds, and it drifts the first time someone adds one. */
    const found = workspaces(ROOT);
    const out = path.join(ROOT, 'architecture', 'index.json');
    const projects = found.map((w) => {
      let name = w.name, description = '';
      try { const ws = JSON.parse(fs.readFileSync(w.json, 'utf8')); name = ws.name || name; description = ws.description || ''; } catch { /* keep the directory name */ }
      return { dir: w.name, name, description };
    });
    fs.writeFileSync(out, JSON.stringify({ generated: 'checks/diagram-contrast.mjs --index', projects }, null, 2) + '\n');
    console.log(`wrote ${projects.length} project(s) to ${path.relative(ROOT, out)}`);
    process.exit(projects.length ? 0 : 3);
  }

  const r = run({ root: ROOT, themeFile: THEME });
  report(r);
  process.exit(r.state === 'measured' ? 0 : r.state === 'REFUSED' ? 1 : 3);
}
