/**
 * CONTROL for checks/trace-suggest.mjs.
 *
 * WHY A SEPARATE FILE when the module already has --negative: prongs/deep-check.mjs refuses to be
 * evidence about a module with no control, and it recognises one by IMPORT or by a quoted path —
 * deliberately not by a mention in a comment, because prose is not a guard. Run against the
 * suggester with only its own --negative, the census returned exit 3, "an untested module and a
 * clean one are indistinguishable here". That refusal is correct and this file is the answer to it.
 *
 * IT DOES NOT RESTATE THE NEGATIVE CASES. Those live in the module, in one place; this runs them as
 * a subprocess and asserts the exit code, then adds the assertions that need an import: that the
 * declared states are the ones actually returned, and that the DSL it emits is the DSL a reader
 * would paste. Two homes for one fixture is the fault this repo keeps paying for.
 *
 * exit 0 all held · 1 something did not
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, suggest, dslFor, identifiers } from './trace-suggest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (n, c, saw) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c || saw === undefined ? '' : `\n       saw: ${JSON.stringify(saw)?.slice(0, 220)}`}`); if (!c) bad++; };

/* The module's own planted cases, run through its CLI so this control cannot drift from them. */
let negCode = 0, negOut = '';
try { negOut = execFileSync('node', [path.join(ROOT, 'checks', 'trace-suggest.mjs'), '--negative'], { encoding: 'utf8' }); }
catch (e) { negCode = e.status ?? 1; negOut = (e.stdout ?? '') + (e.stderr ?? ''); }
/* THE COUNT IS COMPARED TO ITSELF, not to a number typed here. Pinning "6 of 6" meant this control
   broke the moment a seventh case was added — a green control turning red for a reason that is not
   a defect teaches its reader to edit the control rather than read it. "N of N" still catches the
   thing that matters, a case that did not hold. */
ok('--negative holds every case it plants', negCode === 0 && /(\d+) of \1 held/.test(negOut), negOut.trim().split('\n').pop());

/* THE DECLARED STATES ARE THE RETURNED ONES. A module that declares four states and can only reach
   two reads as more careful than it is; this pins the two that suggest() itself can return. */
const empty = suggest({ model: {}, views: {} });
ok('a model with nothing in it is ABSENT, never a silent empty pass', empty.state === 'ABSENT', empty);
ok('every returned state is one of the declared ones', STATES.includes(empty.state), { STATES, got: empty.state });

const one = {
  model: {
    people: [{ id: '1', name: 'Reader', relationships: [{ destinationId: '3', description: 'reads with' }] }],
    softwareSystems: [{ id: '2', name: 'Sys', containers: [
      { id: '3', name: 'App', relationships: [{ destinationId: '4', description: 'stores in' }] },
      { id: '4', name: 'Store', tags: 'Element,Container,Data Store' },
    ] }],
  }, views: {},
};
const DSL = 'reader = person "Reader"\nsys = softwareSystem "Sys"\napp = container "App"\nstore = container "Store"';
const r = suggest(one, { dsl: DSL });
ok('a two-hop path from a person to a store is a feature', r.state === 'measured' && r.picks.length > 0, r);
ok('the scope is resolved to a named element', r.picks[0]?.scope === 'Sys', r.picks[0]?.scope);
ok('names map to the identifiers the DSL declared', identifiers(DSL).get('Demo Runner') === undefined && identifiers(DSL).get('App') === 'app', [...identifiers(DSL)]);

/* THE EMITTED DSL IS WHAT A READER PASTES, so it is asserted as text rather than as intent. */
const dsl = dslFor(r.picks[0]);
ok('the emitted block is scoped by identifier, so it compiles as pasted', /^ *dynamic sys "/m.test(dsl), dsl.split('\n')[0]);
ok('no placeholder survives when the DSL was readable', !/<identifier for/.test(dsl), dsl);
ok('every step appears in the order it runs', dsl.indexOf('reader -> app') < dsl.indexOf('app -> store'), dsl);
ok('the return legs are offered commented out, never live', (dsl.match(/^\s*\/\/ /gm) ?? []).length === r.picks[0].steps.length, dsl);

console.log(`\n${bad ? `${bad} FAIL` : 'all ok'}`);
process.exit(bad ? 1 : 0);
