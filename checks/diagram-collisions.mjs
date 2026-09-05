#!/usr/bin/env node
/* diagram-collisions — a rendered diagram whose labels overprint each other, or cross a box they do
 * not belong to, is refused. Counted on the RENDERED SVG, never inferred from source.
 *
 *   node checks/diagram-collisions.mjs <file.html> [--json] [--allow <n>]
 *
 * WHY THIS EXISTS. 2026-09-03: a mermaid C4 sheet rendered with 6 label-over-label collisions and 3
 * labels crossing boxes, and mermaid-lint reported it clean. The lint reads grammar; nothing in the
 * loop read the picture. The operator saw it before any instrument did. This is the instrument.
 *
 * WHAT IT COUNTS, per drawing:
 *   textOverText     pairs of visible text boxes whose rectangles intersect
 *   textCrossingBox  a text that is neither inside any box nor clear of every box — it straddles an edge
 *   textOutsideOwnBox  a label that has escaped the element it belongs to
 *
 * THE THIRD RULE EXISTS BECAUSE THE FIRST TWO REPORTED 1 ON A PLATE THE OPERATOR CALLED UNREADABLE.
 * Measured 2026-09-04 on a component view whose descriptions were long: the text ran off the bottom
 * of its own rectangle and printed over the element name below it, and neither rule saw it — it was not
 * over another text it had been paired with, and it was not straddling a DIFFERENT box. A label
 * escaping its OWN box needs ownership, which the flat pass threw away. The DOM keeps it: an
 * element is one <g model-id> holding its rect and its texts together.
 * A drawing with no text is UNEVALUABLE, never clean: an unrendered sheet must not pass by being empty.
 *
 * Exit 0 clean · 1 collisions above --allow (default 0) · 2 usage · 3 UNEVALUABLE (no drawing rendered) */
/* THE ONE MODULE OF THIS SET WITH A DEPENDENCY, and it says so rather than crashing. The palette
   check, the trace suggester and the viewer are node builtins and plain HTML; this one has to
   RENDER, so it needs a browser. Copied into a fresh repo it used to die with
   "Cannot find package 'playwright'" and a stack trace — which reads as the check being broken
   rather than as a missing install. A dynamic import turns that into an answer.

   IT ALSO DOES NOT NEED TO BE COPIED AT ALL: it takes a url, so one install can measure any repo's
   served site from wherever it already lives. */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('UNEVALUABLE — this check renders the page, so it needs playwright: npm i -D playwright && npx playwright install chromium');
  console.log('             or run it from a checkout that already has it — it accepts a url, so it does not have to live in this repo');
  process.exit(3);
}
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const flags = { json: false, negative: false, allow: 0, width: 1280, height: 900 };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') flags.json = true;
  else if (a === '--negative') flags.negative = true;
  else if (a === '--allow') flags.allow = Number(argv[++i] ?? 0);
  /* THE VIEWPORT IS A MEASUREMENT CONDITION, NOT A CONSTANT. It was hardcoded at 1280x900, and a
     collision the operator could see on screen came back 0 from here: the viewer scales the drawing
     to fit, so a wider window spreads the same plate further apart and the labels stop touching.
     A verdict that depends on an unstated window size is a verdict about this script's taste in
     windows. It is a flag now, it is printed with the result, and the default is stated. */
  else if (a === '--viewport') { const [w, h] = String(argv[++i] ?? '').split('x').map(Number); if (w && h) { flags.width = w; flags.height = h; } }
  else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2); }
  else positional.push(a);
}
/* ── THE PLANTED FAULTS ───────────────────────────────────────────────────────────────────────
   This check had none until it was caught missing a collision the operator could see on screen, and
   reporting five that were not there. Every case below is one of those two, built as a page rather
   than described, because the defect was never in the arithmetic — it was in what counted as a box.

   The fixtures are inline SVG served as a data URL: no server, no workspace, no exporter. What is
   being tested is this file's reading of a drawing, so anything else in the loop would be a second
   subject. */
const FIXTURES = {
  clean: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400">
    <g model-id="a" data-type="structurizr.box"><rect x="40" y="40" width="200" height="120"/><text x="60" y="90">Alpha</text></g>
    <g model-id="b" data-type="structurizr.box"><rect x="600" y="40" width="200" height="120"/><text x="620" y="90">Beta</text></g>
    <g model-id="r1" data-type="link"><path d="M240,100 L600,100"/><text x="380" y="90">calls</text></g>
  </svg>`,

  /* TWO LABELS ON TOP OF EACH OTHER, WITH A LONG LINK CROSSING BOTH. This is the shape that was
     dismissed: the link's bounding box spans the whole plate, so a rule that excludes pairs sharing
     a box swallowed a genuine overlap. */
  overText: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400">
    <g model-id="a" data-type="structurizr.box"><rect x="40" y="40" width="200" height="120"/><text x="60" y="90">Alpha</text></g>
    <g model-id="b" data-type="structurizr.box"><rect x="600" y="40" width="200" height="120"/><text x="620" y="90">Beta</text></g>
    <g model-id="r1" data-type="link"><path d="M240,100 L600,300"/><text x="380" y="200">5: issues a session token</text></g>
    <g model-id="r2" data-type="link"><path d="M240,300 L600,100"/><text x="392" y="205">6: sends back a session token</text></g>
  </svg>`,

  /* A LABEL LYING ACROSS AN ELEMENT EDGE. The first fixture put the text at x=330 inside a box
     spanning 300 to 600, and it rendered narrow enough to sit wholly INSIDE — so it was neither
     crossing nor colliding, and the case failed for being wrong rather than for finding a defect.
     It now starts left of the box and runs past its edge. */
  overBox: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400">
    <g model-id="a" data-type="structurizr.box"><rect x="300" y="40" width="300" height="160"/><text x="320" y="90">Alpha</text></g>
    <g model-id="r1" data-type="link"><path d="M40,120 L860,120"/><text x="180" y="130">a description that starts outside and lies across the box edge</text></g>
  </svg>`,

  /* A DESCRIPTION TALLER THAN THE BOX THAT HOLDS IT — the component view's original defect. */
  escapes: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400">
    <g model-id="a" data-type="structurizr.box"><rect x="100" y="100" width="240" height="60"/>
      <text x="120" y="130">Alpha</text><text x="120" y="230">a description that runs off the bottom</text></g>
  </svg>`,
};

async function negative() {
  const page = await (await chromium.launch()).newPage({ viewport: { width: flags.width, height: flags.height } });
  let ok = 0;
  const say = (n, pass, saw) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${n}${pass ? '' : `\n       saw: ${JSON.stringify(saw)}`}`); if (pass) ok++; };
  const read = async (svg) => {
    await page.goto('data:text/html,' + encodeURIComponent('<body style="margin:0">' + svg + '</body>'), { waitUntil: 'load' });
    const rows = await page.evaluate(MEASURE);
    return rows.find((r) => r.texts > 0) ?? { textOverText: 0, textCrossingBox: 0, textOutsideOwnBox: 0 };
  };

  const a = await read(FIXTURES.clean);
  say('a plate with room reports clean', a.textOverText === 0 && a.textCrossingBox === 0 && a.textOutsideOwnBox === 0, a);

  const b = await read(FIXTURES.overText);
  say('two labels on top of each other are caught even when a long link spans both', b.textOverText >= 1, b);
  say('a link label is never reported as escaping its own line', b.textOutsideOwnBox === 0, b);

  const c = await read(FIXTURES.overBox);
  say('a label lying across an element is caught', c.textCrossingBox >= 1 || c.textOverText >= 1, c);

  const d = await read(FIXTURES.escapes);
  say('a description taller than its box is caught', d.textOutsideOwnBox >= 1, d);

  await page.context().browser().close();
  console.log(`\n${ok} of 5 held`);
  process.exit(ok === 5 ? 0 : 1);
}

const target = positional[0];
/* A SERVED DIAGRAM IS A DIAGRAM. This took a local file only, which was right when the subject was
   a self-contained mermaid page and wrong the moment the subject became a Structurizr site: that
   site fetches its own workspace.js, so opening index.html from disk draws nothing and the honest
   verdict would have been UNEVALUABLE forever. A url is passed through untouched. */
const isUrl = /^https?:\/\//.test(String(target ?? ''));
/* --negative needs no target: its subject is a set of fixtures this file builds itself. */
if (!flags.negative && (!target || (!isUrl && !fs.existsSync(target)))) { console.error('usage: node checks/diagram-collisions.mjs <file.html | http url> [--json] [--allow <n>] [--viewport WxH] [--negative]'); process.exit(2); }

export const STATES = Object.freeze(['clean', 'COLLIDES', 'UNEVALUABLE']);

/** Runs inside the page. Returns one row per `.drawing svg`, or per `svg` when the page has none. */
const MEASURE = () => {
  const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const contains = (o, i) => i.left >= o.left && i.right <= o.right && i.top >= o.top && i.bottom <= o.bottom;
  /* A RELATIONSHIP IS NOT A BOX, and treating it as one broke this check in both directions at once.
     A link is drawn as a long diagonal <path>, whose bounding rectangle is large — often larger than
     any element — so it was collected as a "box" and then used two ways, both wrong:

       · textOverText EXCLUDED a pair of labels when some box contained both. A link's bbox spans
         half the plate, so two labels that genuinely overlap were dismissed as "inside one box".
         Measured on the bank's SignIn view: labels 5 and 6 intersect over x 262-280, y 426-433, and
         the check reported 0 over text.
       · textOutsideOwnBox then compared each link LABEL against its own link PATH, and a label sits
         beside a line rather than inside it, so every relationship reported as escaping. Five on the
         same plate, all false.

     One correction fixes both: only ELEMENT groups contribute boxes. A link group is measured for
     its text and never offered as a container. */
  const isLink = (g) => /^link$/i.test(g.getAttribute('data-type') || '') || /joint-type-link/.test(g.getAttribute('class') || '');

  const OWNED = (svg) => {
    /* One row per element group: its box, and the texts that belong to it. */
    const out = [];
    for (const g of svg.querySelectorAll('g[model-id]')) {
      if (isLink(g)) continue;
      const box = g.querySelector('rect, path');
      if (!box) continue;
      const r = box.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue;
      const texts = [...g.querySelectorAll('text')].map((t) => ({ r: t.getBoundingClientRect(), s: (t.textContent || '').trim() })).filter((t) => t.r.width > 0 && t.s);
      if (texts.length) out.push({ box: r, texts });
    }
    return out;
  };
  const svgs = [...document.querySelectorAll('.drawing svg')];
  const pool = svgs.length ? svgs : [...document.querySelectorAll('svg')];
  return pool.map((svg, n) => {
    const texts = [...svg.querySelectorAll('text, foreignObject')].map((t) => ({ r: t.getBoundingClientRect(), s: (t.textContent || '').trim() })).filter((t) => t.r.width > 0 && t.s);
    const rects = [...svg.querySelectorAll('g[model-id]')]
      .filter((g) => !isLink(g))
      .flatMap((g) => [...g.querySelectorAll('rect, path[data-shape], path')])
      .map((r) => r.getBoundingClientRect())
      .filter((r) => r.width > 40 && r.height > 20);
    let textOverText = 0, textCrossingBox = 0; const examples = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      /* TWO LABELS INSIDE ONE BOX ARE NOT A COLLISION. Measured 2026-09-04 against a Structurizr
         plate: 11 of 17 reported collisions were an element's NAME against its own [Type] line —
         two text nodes stacked inside the same rectangle, which is the notation working, not
         failing. A detector that cries on every element teaches its reader to ignore it, and the
         six real ones — a step label straddling a box edge — were sitting underneath that noise. */
      const shared = rects.find((b) => contains(b, texts[i].r) && contains(b, texts[j].r));
      if (!shared && inter(texts[i].r, texts[j].r)) { textOverText++; if (examples.length < 5) examples.push(`${texts[i].s.slice(0, 30)} × ${texts[j].s.slice(0, 30)}`); }
    }
    for (const t of texts) {
      const inside = rects.some((r) => contains(r, t.r));
      const crossing = rects.some((r) => inter(r, t.r) && !contains(r, t.r));
      if (!inside && crossing) { textCrossingBox++; if (examples.length < 8) examples.push(`crosses a box: ${t.s.slice(0, 40)}`); }
    }
    /* A LABEL THAT LEFT ITS OWN BOX. One pixel of slack: a glyph's reported box is a hair taller
       than its ink, and a rule that fires on that measures the font, not the diagram. */
    let textOutsideOwnBox = 0;
    for (const g of OWNED(svg)) {
      for (const t of g.texts) {
        const out = (t.r.bottom > g.box.bottom + 1) || (t.r.top < g.box.top - 1) || (t.r.left < g.box.left - 1) || (t.r.right > g.box.right + 1);
        if (!out) continue;
        textOutsideOwnBox++;
        if (examples.length < 12) examples.push(`escapes its own box: ${t.s.slice(0, 44)}`);
      }
    }
    return { sheet: n + 1, texts: texts.length, boxes: rects.length, textOverText, textCrossingBox, textOutsideOwnBox, examples };
  });
};

/* THE PLANTED FAULTS RUN HERE, not at the top: they call MEASURE, which is defined below the
   argument parsing, and a call placed above it threw before a single fixture was read. */
if (flags.negative) await negative();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: flags.width, height: flags.height } });
await page.goto(isUrl ? target : pathToFileURL(path.resolve(target)).href, { waitUntil: 'networkidle' });
/* The sheets render after a script loads mermaid from a CDN. Wait for a rendered state or give up
 * after 20s and report UNEVALUABLE — a page that never drew is not a clean page. */
/* Two renderers, two ready signals: the mermaid pages mark themselves rendered, and a Structurizr
   site simply has an svg inside #diagram-canvas once its layout has run. Waiting for either keeps
   one instrument over both rather than a second module for the second grammar. */
try { await page.waitForSelector('[data-state="rendered"] svg, .drawing svg, #diagram-canvas svg', { timeout: 20_000 }); } catch { /* fall through to the empty check */ }
await page.waitForTimeout(900);
const rows = await page.evaluate(MEASURE);
await browser.close();

const drawn = rows.filter((r) => r.texts > 0);
const total = drawn.reduce((n, r) => n + r.textOverText + r.textCrossingBox + (r.textOutsideOwnBox ?? 0), 0);
const state = !drawn.length ? 'UNEVALUABLE' : total > flags.allow ? 'COLLIDES' : 'clean';

if (flags.json) { console.log(JSON.stringify({ state, target, allow: flags.allow, total, rows }, null, 2)); }
else {
  console.log(`\n  diagram-collisions · ${target}\n    measured at ${flags.width}x${flags.height} — a narrower window crowds the same plate, so this is part of the reading`);
  for (const r of rows) console.log(`    sheet ${r.sheet}  ${String(r.texts).padStart(4)} texts · ${String(r.boxes).padStart(3)} boxes · ${r.textOverText} over text · ${r.textCrossingBox} crossing a box · ${r.textOutsideOwnBox ?? 0} escaping its own box${r.examples.length ? '\n      ' + r.examples.join('\n      ') : ''}`);
  console.log(`\n  ${state}${state === 'UNEVALUABLE' ? ' — no drawing rendered any text; an empty sheet is not a clean one' : ` — ${total} collision(s), allowed ${flags.allow}`}`);
}
process.exit(state === 'clean' ? 0 : state === 'COLLIDES' ? 1 : 3);
