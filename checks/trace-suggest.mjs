/**
 * TRACE SUGGEST — the question a new repo should be asked, and the answer it can paste.
 *
 * WHY IT EXISTS, in the operator's words: "if in a new repo, this module should ask a question — any
 * specific feature you want in trace view? recommended - feature 1, feature 2 etc". A dynamic view
 * is the one C4 diagram nobody can generate FOR you, because which features are worth tracing is a
 * judgement about the product, not a fact about the code. What a machine CAN do is read the model,
 * find the paths that look like features, and hand back the DSL for each — so the human decides and
 * does not also have to type it.
 *
 * THE BOOK IS WHY THIS RECOMMENDS RATHER THAN GENERATES. ch07 is explicit that a system with a
 * hundred features has no business owning a hundred dynamic diagrams: they are for the interesting
 * or recurring interactions, used sparingly. A tool that emitted every path would be arguing with
 * the chapter. This one ranks and offers, and the count it proposes is deliberately small.
 *
 * WHAT A CANDIDATE IS, stated so a reader can disagree with it: a path that STARTS outside the
 * system — a person, or another software system — and ENDS where data rests or leaves: a data store,
 * or an external system. Those are the paths that cross a boundary, and a boundary crossing is what
 * a reader of a feature trace came for. A path that never leaves one container is not a feature, it
 * is an implementation detail.
 *
 * ONE WORD FOR ONE THING. This file was `flow-suggest.mjs` and used `flow` while the viewer said
 * "Feature trace" and the DSL says `dynamic` — three names for one concept, which is the fault the
 * red-flag catalog calls Inconsistency. The repo's word is TRACE; `dynamic` stays only where
 * Structurizr's grammar requires it. The old file is subsumed by this one, not abandoned: every
 * behaviour it had is here, with four defects fixed.
 *
 * exit 0  candidates printed, or a stated ABSENT · 1 --negative found a case it should have refused
 *      2  usage · 3 UNEVALUABLE, with the reason
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STATES = Object.freeze(['measured', 'ABSENT', 'UNEVALUABLE']);

/* Everything the model says, flattened into what a path walk needs: who each id is, who it points
   at, which ids rest data, and which sit outside the system. Nothing else is carried — an earlier
   version also built an `inSystem` set and a `tags` string that no caller ever read. */
function graph(ws) {
  const name = new Map(), kind = new Map(), store = new Set(), outside = new Set(), parent = new Map();
  const edges = [];
  const addRels = (from, rels) => { for (const r of rels ?? []) edges.push({ from, to: r.destinationId, description: r.description }); };

  for (const p of ws.model?.people ?? []) {
    name.set(p.id, p.name); kind.set(p.id, 'Person'); outside.add(p.id);
    addRels(p.id, p.relationships);
  }
  for (const s of ws.model?.softwareSystems ?? []) {
    name.set(s.id, s.name); kind.set(s.id, 'Software System');
    if (!(s.containers ?? []).length) outside.add(s.id);          // nothing modelled inside: external to us
    addRels(s.id, s.relationships);
    for (const c of s.containers ?? []) {
      name.set(c.id, c.name); kind.set(c.id, 'Container'); parent.set(c.id, s.id);
      if (/Data Store/.test(String(c.tags ?? ''))) store.add(c.id);
      addRels(c.id, c.relationships);
      for (const k of c.components ?? []) {
        name.set(k.id, k.name); kind.set(k.id, 'Component'); parent.set(k.id, c.id);
        addRels(k.id, k.relationships);
      }
    }
  }
  return { name, kind, store, outside, parent, edges };
}

/**
 * Paths from outside, through the system, to a resting place. Depth-first, no revisits, capped —
 * a cap rather than a cycle detector alone, because a model with a loop would otherwise hand back a
 * path long enough that nobody reads it, which is a worse failure than missing one.
 */
/**
 * THE DSL IDENTIFIERS, READ FROM THE DSL. The export carries element NAMES and numeric ids and no
 * identifiers at all, so a suggestion built from the export alone emits names — and Structurizr's
 * grammar wants identifiers. Measured in UAT on a second repo, 2026-09-04: the block this module
 * printed was pasted verbatim, exactly as its own instructions said, and the export died with
 * "Too many tokens, expected: dynamic <*|software system identifier|container identifier>".
 * A recommender whose recommendation does not compile has recommended nothing.
 *
 * The map is built from the assignments the DSL already makes — `demo = container "Demo Runner"` —
 * which is the one place both halves of the pair appear together.
 */
export function identifiers(dslText) {
  const map = new Map();
  const re = /(\w+)\s*=\s*(?:person|softwareSystem|container|component)\s+"([^"]+)"/g;
  for (const m of String(dslText ?? '').matchAll(re)) map.set(m[2], m[1]);
  return map;
}

export function suggest(ws, { max = 6, maxDepth = 5, dsl = null } = {}) {
  const g = graph(ws);
  const ident = identifiers(dsl);
  const out = new Map();
  for (const e of g.edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }

  /* WHAT IS ALREADY DRAWN IS COMPARED BY ITS ELEMENTS, NOT BY ITS NAME. Measured 2026-09-04: the
     bank's SignIn trace existed and was still the top recommendation, because the comparison was
     key-against-label. It then failed a second time reading r.sourceId off a dynamic step, which
     carries a RELATIONSHIP id and a response flag and no endpoints — so the branch could never fire
     at all. The participants live in the view's `elements`. */
  const drawn = (ws.views?.dynamicViews ?? []).map((v) => ({
    key: v.key,
    ids: new Set((v.elements ?? []).map((e) => e.id).filter(Boolean)),
  }));

  const paths = [];
  const walk = (id, trail) => {
    if (trail.length > maxDepth) return;
    /* TWO HOPS IS A FEATURE. The floor was three, which looked harmless against this bank — every
       path here is four — and silently dropped the shortest real shape there is: somebody outside
       reaches a container, which reaches a store. It was found by a control that then passed
       VACUOUSLY on the empty result, so the floor and the blind test shipped together. */
    if (g.store.has(id) && trail.length >= 2) paths.push([...trail]);
    for (const e of out.get(id) ?? []) {
      if (trail.some((t) => t.to === e.to || t.from === e.to)) continue;   // no revisits
      /* AT MOST ONE OUTSIDER, AND IT IS THE ONE WHO STARTED IT. Measured: without this, every top
         candidate began "Amazon Simple Email Service → Personal Banking Customer → …", because the
         email system points at the customer and the walk passed straight through them. That is not
         one feature, it is two glued at a person: an email arriving, and a customer signing in. */
      if (g.outside.has(e.to)) { if (trail.length + 1 >= 2) paths.push([...trail, e]); continue; }
      walk(e.to, [...trail, e]);
    }
  };
  for (const start of g.outside) for (const e of out.get(start) ?? []) { if (g.outside.has(e.to)) continue; walk(e.to, [e]); }

  /* THREE KEYS, IN ORDER, AND NO COMPOSITE. A person starting the path outranks everything: a
     feature is something somebody asks for. Then a path that ends where data rests, because that is
     what a reviewer asks about first. Then length, because a longer path tells more of the story. */
  const startsWithPerson = (p) => (g.kind.get(p[0].from) === 'Person' ? 1 : 0);
  paths.sort((a, b) => (startsWithPerson(b) - startsWithPerson(a))
    || (g.store.has(b[b.length - 1].to) - g.store.has(a[a.length - 1].to))
    || (b.length - a.length));

  const seen = new Set(), picks = [];
  for (const p of paths) {
    const key = p.map((e) => e.to).join('>');
    if (seen.has(key)) continue;
    seen.add(key);

    /* THE NAME COMES FROM THE HOP THAT DISTINGUISHES THE PATH, not from where it ends. Three
       candidates here ended at one Database and read as three identical lines; what separates them
       is which API the page calls, which is the second hop, and the closest thing in the model to
       the feature's own name. */
    const via = p.length > 1 ? g.name.get(p[1].to) : null;
    const ids = new Set(p.flatMap((e) => [e.from, e.to]));
    const overlap = (d) => [...ids].filter((x) => d.ids.has(x)).length / ids.size;
    const match = drawn.find((d) => overlap(d) >= 0.8);

    picks.push({
      label: g.name.get(p[0].from) + (via ? ' → ' + via : '') + ' → ' + g.name.get(p[p.length - 1].to),
      suggestedKey: (via ?? g.name.get(p[p.length - 1].to) ?? 'Trace').replace(/[^A-Za-z0-9]/g, ''),
      alreadyTraced: !!match,
      tracedAs: match?.key ?? null,
      scope: scopeOf(p, g),
      scopeIdent: ident.get(scopeOf(p, g)) ?? null,
      steps: p.map((e) => ({
        from: g.name.get(e.from), to: g.name.get(e.to), description: e.description,
        fromIdent: ident.get(g.name.get(e.from)) ?? null, toIdent: ident.get(g.name.get(e.to)) ?? null,
      })),
      endsAtStore: g.store.has(p[p.length - 1].to),
    });
    if (picks.length >= max) break;
  }
  return { state: picks.length ? 'measured' : 'ABSENT', picks, traced: drawn.map((d) => d.key) };
}

/**
 * THE SCOPE IS COMPUTED, NOT ASKED FOR. `dslFor` used to take an `ids` argument and read `ids.scope`
 * from it; every caller passed `{}`, so the emitted DSL always said `<container or system>` and the
 * parameter existed only to hand the caller a decision the module was better placed to make.
 *
 * The rule: a dynamic view is scoped to the smallest element that contains every in-system
 * participant. If the path only touches components of one container, that container; otherwise the
 * software system they all sit in.
 */
function scopeOf(pathSteps, g) {
  const inside = [...new Set(pathSteps.flatMap((e) => [e.from, e.to]))].filter((id) => !g.outside.has(id));
  if (!inside.length) return null;
  const containers = new Set(inside.map((id) => (g.kind.get(id) === 'Component' ? g.parent.get(id) : id)));
  if (containers.size === 1) return g.name.get([...containers][0]) ?? null;
  const systems = new Set([...containers].map((id) => g.parent.get(id) ?? id));
  return systems.size === 1 ? (g.name.get([...systems][0]) ?? null) : null;
}

/**
 * The DSL a reader pastes. Return legs are offered commented out, because a trace usually wants the
 * way back and the model usually has no relationship for it — and a dynamic step reuses a
 * relationship that already exists, so an uncommented return renders as a response.
 *
 * IT COMPILES, OR IT SAYS WHY NOT. When the DSL was read, every element is emitted as the identifier
 * that DSL already gave it and the block can be pasted and exported unchanged. When it was not — no
 * DSL beside the export — the placeholder returns, and it is a placeholder rather than a plausible
 * guess on purpose: a name that looks like an identifier and is not would fail further down the
 * file, where the error names a line the reader did not write.
 */
export function dslFor(pick) {
  const scope = pick.scopeIdent ?? (pick.scope ? `<identifier for "${pick.scope}">` : '<container or system>');
  const lines = [`        dynamic ${scope} "${pick.suggestedKey}" {`];
  const ref = (name, id) => id ?? `<identifier for "${name}">`;
  for (const s of pick.steps) lines.push(`            ${ref(s.from, s.fromIdent)} -> ${ref(s.to, s.toIdent)} "${s.description}"`);
  for (const s of [...pick.steps].reverse()) lines.push(`            // ${ref(s.to, s.toIdent)} -> ${ref(s.from, s.fromIdent)} "Returns ... to"`);
  lines.push('            autoLayout lr');
  lines.push(`            description "${pick.label}"`);
  lines.push('        }');
  return lines.join('\n');
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */
function report(name, r) {
  console.log(`\n  ${name} — which feature do you want as a trace?`);
  if (r.traced.length) console.log(`     already traced: ${r.traced.join(', ')}`);
  if (r.state === 'ABSENT') {
    console.log('     ABSENT — no path crosses a boundary in this model, so nothing here looks like a feature.');
    console.log('     That is an answer about the model, not a failure to look: add the relationships a feature follows.');
    return;
  }
  r.picks.forEach((p, n) => {
    console.log(`\n  ${n + 1}. ${p.label}${p.endsAtStore ? '  · ends at a data store' : ''}${p.alreadyTraced ? `  · ALREADY TRACED as ${p.tracedAs}` : ''}`);
    for (const s of p.steps) console.log(`       ${s.from} → ${s.to}: ${s.description}`);
  });
  const fresh = r.picks.find((p) => !p.alreadyTraced) ?? r.picks[0];
  console.log(`\n  Pick one, then paste this into the views block of ${name}/workspace.dsl:\n`);
  console.log(dslFor(fresh));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const ROOT = path.resolve(flag('--root', HERE));
  const max = Number(flag('--top', 4));

  if (argv.includes('--negative')) {
    /* A RECOMMENDER'S NEGATIVE IS WHAT IT MUST NOT SAY. It refuses nothing, so the control is the
       set of cases where a suggestion would be wrong: a model with no boundary, a feature already
       drawn, a path that hops through a second outsider, and a cycle. Each one shipped as a real
       defect in this module before it was a test. */
    let ok = 0;
    const say = (n, pass, saw) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${n}${pass ? '' : `\n       saw: ${JSON.stringify(saw)?.slice(0, 200)}`}`); if (pass) ok++; };

    const flat = { model: { softwareSystems: [{ id: '1', name: 'S', containers: [{ id: '2', name: 'A' }, { id: '3', name: 'B' }] }] }, views: {} };
    say('a model with no boundary crossing proposes nothing', suggest(flat).state === 'ABSENT', suggest(flat));

    const twoOutsiders = {
      model: {
        people: [{ id: '1', name: 'P', relationships: [{ destinationId: '4', description: 'uses' }] }],
        softwareSystems: [
          { id: '9', name: 'Mailer', relationships: [{ destinationId: '1', description: 'emails' }] },
          { id: '3', name: 'S', containers: [
            { id: '4', name: 'UI', relationships: [{ destinationId: '5', description: 'calls' }] },
            { id: '5', name: 'DB', tags: 'Element,Container,Data Store' }] },
        ],
      }, views: {},
    };
    const t = suggest(twoOutsiders);
    /* EVERY ASSERTION OVER A LIST FIRST ASSERTS THE LIST IS NOT EMPTY. Two of these passed on zero
       candidates — .every() over nothing is true — so the control reported ok while measuring
       nothing at all. A vacuous pass and a real one must never look the same. */
    say('the fixture produces candidates at all, so the rows below measure something', t.picks.length > 0, t.picks.length);
    say('no candidate routes through a second outsider', t.picks.length > 0 && t.picks.every((p) => !p.steps.some((s) => s.from === 'Mailer' || s.to === 'Mailer')), t.picks.map((p) => p.label));
    say('the scope is computed, not left to the caller', t.picks.length > 0 && t.picks.every((p) => p.scope !== null), t.picks.map((p) => p.scope));

    const cyclic = structuredClone(twoOutsiders);
    cyclic.model.softwareSystems[1].containers[1].relationships = [{ destinationId: '4', description: 'answers' }];
    const c = suggest(cyclic, { maxDepth: 4 });
    say('a cycle terminates and no path runs past the depth cap', c.picks.length > 0 && c.picks.every((p) => p.steps.length <= 4), c.picks.map((p) => p.steps.length));

    const traced = structuredClone(twoOutsiders);
    traced.views = { dynamicViews: [{ key: 'Existing', elements: [{ id: '1' }, { id: '4' }, { id: '5' }] }] };
    const d = suggest(traced);
    say('a feature already drawn is marked, not re-recommended', d.picks.length > 0 && d.picks[0].alreadyTraced === true, d.picks[0]);

    /* THE PASTED BLOCK MUST COMPILE, which is the defect UAT on a second repo found: the emitted
       DSL used element names where the grammar wants identifiers, so following the instructions
       exactly produced a parser error. */
    const withDsl = suggest(twoOutsiders, { dsl: 'ui = container "UI"\ndb = container "DB"\np = person "P"\nsys = softwareSystem "S"' });
    const emitted = withDsl.picks.length ? dslFor(withDsl.picks[0]) : '';
    say('the emitted DSL uses identifiers, not names, when the DSL was readable',
      withDsl.picks.length > 0 && /dynamic sys "/.test(emitted) && /p -> ui/.test(emitted) && !/<identifier for/.test(emitted), emitted);

    console.log(`\n${ok} of 7 held`);
    process.exit(ok === 7 ? 0 : 1);
  }

  const dir = path.join(ROOT, 'architecture');
  if (!fs.existsSync(dir)) { console.log(`UNEVALUABLE — ${path.relative(ROOT, dir)} does not exist, so there is no model to read`); process.exit(3); }

  let any = false;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = path.join(dir, d.name, 'workspace.json');
    if (!fs.existsSync(f)) continue;
    any = true;
    const dslFile = path.join(dir, d.name, 'workspace.dsl');
    const dsl = fs.existsSync(dslFile) ? fs.readFileSync(dslFile, 'utf8') : null;
    try { report(d.name, suggest(JSON.parse(fs.readFileSync(f, 'utf8')), { max, dsl })); }
    catch (e) { console.log(`  UNEVALUABLE ${d.name}: ${e.message}`); }
  }
  if (!any) { console.log('UNEVALUABLE — no exported workspace was found; run the export first'); process.exit(3); }
  process.exit(0);
}
