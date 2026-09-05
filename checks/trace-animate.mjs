/**
 * TRACE ANIMATE — give a dynamic view the animation frames its exporter does not write.
 *
 * WHY THIS EXISTS, and it corrects a record. PR-032 filed the claim "a feature trace can be stepped
 * with , and ." as DEAD: the keys did nothing, the DSL refused an `animation` block inside
 * `dynamic`, and the export carried `animations: false`. All three observations were right and the
 * conclusion was half wrong. Measured 2026-09-04 against the live viewer: `structurizr.diagram`
 * exposes currentViewHasAnimation, startAnimation, stepForwardInAnimation and
 * stepBackwardInAnimation. The STEPPING ENGINE WAS ALWAYS THERE. Nobody had given it frames.
 *
 * A frame is the reveal set for one step: the elements that first appear at that step, and the one
 * relationship that fires. The viewer accumulates them, so frame k shows everything up to k — which
 * is exactly what a reader walking a kill chain wants, and it is derivable from the order the DSL
 * already wrote. Nothing here invents a sequence; it re-expresses the one in the export.
 *
 * WHY IT IS A SEPARATE PASS AND NOT PART OF THE EXPORT. structurizr-cli has no verb for it, and the
 * DSL grammar rejects `animation` inside `dynamic` — measured, with the parser's own words: "The
 * relationship animation does not exist". So the frames are written after export, and this module is
 * the one place that happens.
 *
 * THE WORKSPACE HAS TWO HOMES AND THEY ARE NOT COPIES OF EACH OTHER. workspace.json is the export;
 * site/workspace.js is a DIFFERENT workspace with the same name — base64 in a one-line script, and
 * crucially it carries LAYOUT. The static export runs Graphviz and writes coordinates into the
 * bundle; the JSON export does not, and every element in it reads x:0, y:0.
 *
 * TWO DRAFTS, TWO FAILURES, AND THE SECOND WAS WORSE. Draft one wrote frames only to the JSON, so
 * the walk was dead on screen while every command reported success. Draft two "fixed" that by
 * re-embedding the JSON into the bundle — which overwrote real coordinates with zeros and collapsed
 * every element of the diagram onto one point, six step labels stacked on top of each other. It
 * passed its own check, because the check asked whether the bundle was still a valid one-liner and
 * not whether the diagram still had a layout.
 *
 * SO THE RULE IS: PATCH THE FIELD, NEVER REPLACE THE DOCUMENT. The bundle owns its layout and this
 * module owns nothing but `animations`. It decodes what is there, copies frames onto the matching
 * views by key, and re-encodes — so anything the exporter put in the bundle that the JSON lacks
 * survives, whether or not this module knows what it is.
 *
 * exit 0 frames written · 1 nothing to write · 2 usage · 3 UNEVALUABLE, with the reason
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STATES = Object.freeze(['written', 'ABSENT', 'UNEVALUABLE']);

/** Every relationship in the model, by id, with the two elements it joins. */
function relationshipIndex(ws) {
  const byId = new Map();
  const take = (owner) => { for (const r of owner.relationships ?? []) byId.set(String(r.id), { source: String(owner.id), destination: String(r.destinationId) }); };
  for (const p of ws.model?.people ?? []) take(p);
  for (const s of ws.model?.softwareSystems ?? []) {
    take(s);
    for (const c of s.containers ?? []) {
      take(c);
      for (const k of c.components ?? []) take(k);
    }
  }
  for (const n of ws.model?.deploymentNodes ?? []) take(n);
  return byId;
}

/**
 * Frames for one dynamic view: one per step, in step order, each revealing the elements that had
 * not appeared yet and the relationship that fires.
 *
 * A STEP WHOSE RELATIONSHIP IS NOT IN THE MODEL IS REPORTED, NOT SKIPPED. It would leave a hole in
 * the walk — the reader presses forward and nothing changes — and a silent skip is how that ships.
 */
export function framesFor(view, rels) {
  const seen = new Set();
  const frames = [];
  const orphans = [];
  const steps = [...(view.relationships ?? [])].sort((a, b) => Number(a.order) - Number(b.order));
  for (const s of steps) {
    const r = rels.get(String(s.id));
    if (!r) { orphans.push({ order: s.order, id: s.id, description: s.description }); continue; }
    const fresh = [r.source, r.destination].filter((id) => !seen.has(id));
    for (const id of fresh) seen.add(id);
    frames.push({ order: frames.length + 1, elements: fresh, relationships: [String(s.id)] });
  }
  return { frames, orphans };
}

/**
 * Copy animation frames into the static site's bundle, leaving everything else in it alone.
 *
 * A MISSING BUNDLE IS ABSENT, NOT AN ERROR: a workspace can be exported to JSON without a site.
 */
function embed(bundleFile, ws) {
  if (!fs.existsSync(bundleFile)) return { state: 'ABSENT', why: 'no static site beside this workspace — export -f static first if you want the walk in a browser' };
  const js = fs.readFileSync(bundleFile, 'utf8');
  /* ANCHORED ON THE NAME THE BUNDLE GIVES IT, not on how long the payload happens to be. The first
     draft matched any quoted base64 run of 200+ characters, which is a magic number standing in for
     "this looks big enough to be a workspace" — and a genuinely small model falls under it. Its own
     --negative caught that: a two-view fixture encoded to well under 200 characters and the write
     was refused as UNEVALUABLE. The bundle declares `const jsonAsString = '...'`; that is the
     handle, and matching it means the size of the model stops mattering. */
  const m = js.match(/(jsonAsString\s*=\s*)(['"])([A-Za-z0-9+/=]*)\2/);
  if (!m) return { state: 'UNEVALUABLE', why: 'the bundle declares no jsonAsString where one was expected — its shape changed, and guessing would corrupt the site' };
  let bundled;
  try { bundled = JSON.parse(Buffer.from(m[3], 'base64').toString('utf8')); }
  catch (e) { return { state: 'UNEVALUABLE', why: `the bundle's payload does not parse (${e.message}) — refusing to write over something unreadable` }; }

  /* ONLY THE FRAMES CROSS. Everything else in the bundle — above all the coordinates the exporter's
     Graphviz run computed — is left exactly as found. */
  const ours = new Map((ws.views?.dynamicViews ?? []).map((v) => [v.key, v.animations]));
  let copied = 0;
  for (const v of bundled.views?.dynamicViews ?? []) {
    const frames = ours.get(v.key);
    if (!frames?.length) continue;
    v.animations = frames;
    copied++;
  }
  if (!copied) return { state: 'ABSENT', why: 'the bundle has no dynamic view matching one we framed' };

  const next = Buffer.from(JSON.stringify(bundled), 'utf8').toString('base64');
  const at = m.index + m[1].length;
  fs.writeFileSync(bundleFile, js.slice(0, at) + m[2] + next + m[2] + js.slice(at + m[2].length + m[3].length + m[2].length));
  return { state: 'written', why: `${copied} view(s) framed in the bundle, its layout untouched` };
}

/** Write frames into every dynamic view of every workspace under <root>/architecture. */
export function run({ root = HERE, dryRun = false } = {}) {
  const dir = path.join(root, 'architecture');
  if (!fs.existsSync(dir)) return { state: 'UNEVALUABLE', why: `${path.relative(root, dir)} does not exist, so there is no export to animate` };

  const rows = [];
  let touched = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const file = path.join(dir, d.name, 'workspace.json');
    if (!fs.existsSync(file)) continue;

    let ws;
    try { ws = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { rows.push({ workspace: d.name, state: 'UNEVALUABLE', why: `does not parse: ${e.message}` }); continue; }

    const views = ws.views?.dynamicViews ?? [];
    if (!views.length) { rows.push({ workspace: d.name, state: 'ABSENT', why: 'no dynamic view — an answer about this model, not a failure' }); continue; }

    const rels = relationshipIndex(ws);
    let changed = false;
    for (const v of views) {
      const { frames, orphans } = framesFor(v, rels);
      if (!frames.length) { rows.push({ workspace: d.name, view: v.key, state: 'ABSENT', why: 'the view has no ordered steps' }); continue; }
      v.animations = frames;
      changed = true;
      rows.push({ workspace: d.name, view: v.key, state: 'written', frames: frames.length, orphans });
    }
    if (changed && !dryRun) {
      fs.writeFileSync(file, JSON.stringify(ws, null, 4) + '\n');
      touched++;
      const bundle = path.join(dir, d.name, 'site', 'workspace.js');
      const r = embed(bundle, ws);
      rows.push({ workspace: d.name, view: 'site/workspace.js', state: r.state, why: r.why });
    }
  }

  if (!rows.length) return { state: 'UNEVALUABLE', why: 'no exported workspace was found; run the export first' };
  const wrote = rows.filter((r) => r.state === 'written');
  return { state: wrote.length ? 'written' : 'ABSENT', rows, files: touched,
           why: wrote.length ? `${wrote.length} view(s) given frames across ${touched} file(s)` : 'nothing to animate' };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--root');
  const root = i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : HERE;

  if (argv.includes('--negative')) {
    /* THE FRAMES MUST FOLLOW THE STEPS, and must not paper over a step the model cannot resolve. */
    let ok = 0;
    const say = (n, pass, saw) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${n}${pass ? '' : `\n       saw: ${JSON.stringify(saw)?.slice(0, 220)}`}`); if (pass) ok++; };
    const rels = new Map([['r1', { source: 'a', destination: 'b' }], ['r2', { source: 'b', destination: 'c' }]]);

    const two = framesFor({ relationships: [{ id: 'r1', order: '1' }, { id: 'r2', order: '2' }] }, rels);
    say('one frame per step, in order', two.frames.length === 2 && two.frames[0].order === 1 && two.frames[1].order === 2, two.frames);
    say('an element is revealed once, at the step it first appears', JSON.stringify(two.frames.map((f) => f.elements)) === JSON.stringify([['a', 'b'], ['c']]), two.frames);

    const outOfOrder = framesFor({ relationships: [{ id: 'r2', order: '2' }, { id: 'r1', order: '1' }] }, rels);
    say('the export listing steps out of order does not reorder the walk', JSON.stringify(outOfOrder.frames.map((f) => f.relationships[0])) === JSON.stringify(['r1', 'r2']), outOfOrder.frames);

    const missing = framesFor({ relationships: [{ id: 'r1', order: '1' }, { id: 'nope', order: '2', description: 'ghost' }] }, rels);
    say('a step whose relationship is not in the model is reported, not silently dropped', missing.orphans.length === 1 && missing.frames.length === 1, missing);

    /* THE BUNDLE IS THE COPY THE BROWSER READS, so the round trip is asserted rather than assumed. */
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'animate-'));
    const bundleFile = path.join(tmp, 'workspace.js');
    fs.writeFileSync(bundleFile, "const jsonAsString = '" + Buffer.from(JSON.stringify({ views: { dynamicViews: [{ key: 'X', elements: [{ id: '1', x: 2683, y: 1183 }] }] } })).toString('base64') + "';\nmore();\n");
    const e = embed(bundleFile, { views: { dynamicViews: [{ key: 'X', animations: [{ order: 1, elements: ['a'], relationships: ['r1'] }] }] } });
    const back = JSON.parse(Buffer.from(fs.readFileSync(bundleFile, 'utf8').match(/jsonAsString\s*=\s*'([A-Za-z0-9+/=]*)'/)[1], 'base64').toString('utf8'));
    say('the bundle gains the frames the export was given',
      e.state === 'written' && back.views.dynamicViews[0].animations.length === 1 && /more\(\);/.test(fs.readFileSync(bundleFile, 'utf8')), { e, back });
    /* THE ONE THAT MATTERS. Draft two replaced the whole document and zeroed every coordinate; the
       diagram collapsed to a point and the check still passed, because it only asked whether the
       file was still a one-liner. This asks whether the layout survived. */
    say('the layout in the bundle survives being framed', back.views.dynamicViews[0].elements[0].x === 2683 && back.views.dynamicViews[0].elements[0].y === 1183, back.views.dynamicViews[0].elements);
    say('a workspace with no site beside it is ABSENT, not an error', embed(path.join(tmp, 'nope.js'), {}).state === 'ABSENT', embed(path.join(tmp, 'nope.js'), {}));
    fs.rmSync(tmp, { recursive: true, force: true });

    console.log(`\n${ok} of 7 held`);
    process.exit(ok === 7 ? 0 : 1);
  }

  const r = run({ root, dryRun: argv.includes('--dry-run') });
  console.log(`\n  trace-animate · ${r.state}\n     ${r.why}`);
  for (const row of r.rows ?? []) {
    console.log(`    ${row.state === 'written' ? 'ok  ' : row.state} ${row.workspace}${row.view ? '/' + row.view : ''}${row.frames ? ` · ${row.frames} frame(s)` : ''}${row.why ? ` · ${row.why}` : ''}`);
    for (const o of row.orphans ?? []) console.log(`       step ${o.order} "${o.description}" names relationship ${o.id}, which is not in the model — the walk would stall here`);
  }
  process.exit(r.state === 'written' ? 0 : r.state === 'ABSENT' ? 1 : 3);
}
