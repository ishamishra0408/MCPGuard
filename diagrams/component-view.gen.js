const fs = require('fs')

const lanes = [
  { id: 'slack', t: 'Slack workspace', k: '[Software system]', p: 'external', ext: true, cx: 110 },
  { id: 'mcp',   t: 'MCP bridge',      k: '[Component]', p: 'dsh-mcp-client', cx: 330 },
  { id: 'loop',  t: 'Agent loop',      k: '[Component]', p: 'dsh-agent-loop', cx: 520 },
  { id: 'tools', t: 'Tool pipeline',   k: '[Component]', p: 'dsh-tools', cx: 710 },
  { id: 'guard', t: 'Compose guard',   k: '[Component: new]', p: 'dsh-mcp-guard', star: true, cx: 900 },
  { id: 'log',   t: 'Session log',     k: '[Component]', p: 'dsh-session', cx: 1130 },
  { id: 'reads', t: 'Session reads',   k: '[Component]', p: 'dsh-session-query', cx: 1320 },
  { id: 'score', t: 'Injection scorer',k: '[Component: new]', p: 'dsh-session-telemetry', star: true, cx: 1550 },
  { id: 'inv',   t: 'Chain invariant', k: '[Component: new]', p: 'dsh-invariants', star: true, cx: 1740 },
  { id: 'otlp',  t: 'OTLP exporter',   k: '[Component]', p: 'dsh-session-telemetry-otel', cx: 1930 },
  { id: 'coll',  t: 'OTel collector',  k: '[Software system]', p: 'external', ext: true, cx: 2160 },
  { id: 'ctrl',  t: 'Network controls',k: '[Software system]', p: 'firewall / EDR / vault', ext: true, cx: 2350 },
]
const L = Object.fromEntries(lanes.map(l => [l.id, l]))

const steps = [
  { n: 1,  a: 'slack', b: 'mcp',   l1: 'Returns the Slack message content to', l2: '[MCP/stdio]' },
  { n: 2,  a: 'mcp',   b: 'loop',  l1: 'Hands the tool result to' },
  { n: 3,  a: 'loop',  b: 'log',   l1: 'Appends tool/result to', l2: '[durable event]' },
  { n: 4,  a: 'log',   b: 'reads', l1: 'Projects and deep-copies the record for' },
  { n: 5,  a: 'reads', b: 'score', l1: 'Hands the redacted copy to', l2: '[sessionTelemetry/record]', hi: true },
  { n: 6,  a: 'loop',  b: 'tools', l1: 'Requests slack post_message through' },
  { n: 7,  self: 'tools', l1: 'Finds no approval policy that matches', l2: '[dsh-user-approval]' },
  { n: 8,  a: 'tools', b: 'guard', l1: 'Runs the monotonic guard in', l2: '[ctx.tools.guard]' },
  { n: 9,  a: 'guard', b: 'tools', l1: 'Denies the url carrying the tagged secret to', deny: true },
  { n: 10, a: 'tools', b: 'log',   l1: 'Records the denial in' },
  { n: 11, a: 'inv',   b: 'reads', l1: 'Reads the read-then-post window from', hi: true },
  { n: 12, a: 'inv',   b: 'otlp',  l1: 'Fails the chain invariant and reports to', hi: true },
  { n: 13, a: 'score', b: 'otlp',  l1: 'Adds the injection score to' },
  { n: 14, a: 'otlp',  b: 'coll',  l1: 'Emits the indicator record to', l2: '[OTLP/HTTP]' },
  { n: 15, a: 'coll',  b: 'ctrl',  l1: 'Routes the host and canary hash to' },
  { n: 16, a: 'reads', b: 'ctrl',  l1: 'Exports the evidence bundle to', l2: '[download]' },
]

const BW = 170, BH = 76, HBY = 160, FBY = 1380
const Y0 = 300, PITCH = 68
const stepY = i => Y0 + i * PITCH

const groups = [
  { t: 'Agent runtime', k: '[Container: dsh-agent-loop]', from: 'mcp', to: 'guard' },
  { t: 'Session store', k: '[Container: event-sourced JSONL]', from: 'log', to: 'reads' },
  { t: 'Observability', k: '[Container: telemetry seam]', from: 'score', to: 'otlp' },
]

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const out = []
const push = s => out.push(s)

const GB_TOP = 96, GB_BOT = 1476
const sysL = L.mcp.cx - BW / 2 - 40, sysR = L.otlp.cx + BW / 2 + 40
const SYS_TOP = 30, SYS_BOT = 1585

push(`<svg class="plate-svg" viewBox="0 0 2470 1660" role="img" aria-labelledby="plateTitle plateDesc" xmlns="http://www.w3.org/2000/svg">`)
push(`<title id="plateTitle">C4 dynamic view of the dsh-mcp-guard exfiltration chain</title>`)
push(`<desc id="plateDesc">A sequence-style C4 dynamic diagram with twelve participants. A Slack message enters through the MCP bridge, is appended to the durable session log, is scored by the injection scorer, and a later post attempt carrying the secret is denied by the compose guard. The chain invariant reads the window and reports, the OTLP exporter emits an indicator record across the harness boundary to an OpenTelemetry collector, which routes it to network and endpoint controls.</desc>`)
push(`<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker>
</defs>`)

// system boundary
push(`<rect x="${sysL}" y="${SYS_TOP}" width="${sysR - sysL}" height="${SYS_BOT - SYS_TOP}" rx="14" fill="none" stroke="var(--rule)" stroke-width="2" stroke-dasharray="12 7"/>`)
const sysMid = (sysL + sysR) / 2
push(`<text class="bd-t" x="${sysMid}" y="60" text-anchor="middle">DeepSeek Harness</text>`)
push(`<text class="bd-k" x="${sysMid}" y="80" text-anchor="middle">[Software system]</text>`)

// container boundaries
for (const g of groups) {
  const x1 = L[g.from].cx - BW / 2 - 20, x2 = L[g.to].cx + BW / 2 + 20
  push(`<rect x="${x1}" y="${GB_TOP}" width="${x2 - x1}" height="${GB_BOT - GB_TOP}" rx="10" fill="none" stroke="var(--rule)" stroke-width="1.5" stroke-dasharray="3 5"/>`)
  const m = (x1 + x2) / 2
  push(`<text class="bd-t2" x="${m}" y="124">${esc(g.t)}</text>`)
  push(`<text class="bd-k" x="${m}" y="144">${esc(g.k)}</text>`)
}

// lifelines
for (const l of lanes) {
  push(`<line x1="${l.cx}" y1="${HBY + BH}" x2="${l.cx}" y2="${FBY}" stroke="var(--rule)" stroke-width="1.5" stroke-dasharray="2 6"/>`)
}

// participant boxes, top and bottom
function box(l, y) {
  const x = l.cx - BW / 2
  const stroke = l.star ? 'var(--accent)' : 'var(--ink)'
  const fill = l.ext ? 'var(--ext)' : (l.star ? 'var(--accent-soft)' : 'var(--surface)')
  push(`<rect x="${x}" y="${y}" width="${BW}" height="${BH}" fill="${fill}" stroke="${stroke}" stroke-width="${l.star ? 2 : 1.6}"/>`)
  push(`<text class="pb-t${l.star ? ' acc' : ''}" x="${l.cx}" y="${y + 24}" text-anchor="middle">${esc(l.t)}</text>`)
  push(`<text class="pb-k" x="${l.cx}" y="${y + 44}" text-anchor="middle">${esc(l.k)}</text>`)
  push(`<text class="pb-p${l.star ? ' acc' : ''}" x="${l.cx}" y="${y + 63}" text-anchor="middle">${esc(l.p)}</text>`)
}
for (const l of lanes) { box(l, HBY); box(l, FBY) }

// steps
steps.forEach((s, i) => {
  const y = stepY(i)
  const col = s.deny ? 'var(--danger)' : (s.hi ? 'var(--accent)' : 'var(--ink)')
  const cls = s.deny ? ' dn' : (s.hi ? ' acc' : '')
  if (s.self) {
    const cx = L[s.self].cx
    push(`<path d="M ${cx} ${y - 12} L ${cx + 74} ${y - 12} L ${cx + 74} ${y + 10} L ${cx + 8} ${y + 10}" fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="9 5" marker-end="url(#ah)"/>`)
    push(`<text class="ar${cls}" x="${cx + 88}" y="${y - 8}">${s.n}: ${esc(s.l1)}</text>`)
    if (s.l2) push(`<text class="ar2" x="${cx + 88}" y="${y + 10}" text-anchor="start">${esc(s.l2)}</text>`)
    return
  }
  const xa = L[s.a].cx, xb = L[s.b].cx
  const dir = xb > xa ? 1 : -1
  push(`<line x1="${xa}" y1="${y}" x2="${xb - dir * 6}" y2="${y}" stroke="${col}" stroke-width="1.8" stroke-dasharray="9 5" marker-end="url(#ah)"/>`)
  const mid = (xa + xb) / 2
  push(`<text class="ar${cls}" x="${mid}" y="${y - (s.l2 ? 40 : 22)}" text-anchor="middle">${s.n}: ${esc(s.l1)}</text>`)
  if (s.l2) push(`<text class="ar2" x="${mid}" y="${y - 22}" text-anchor="middle">${esc(s.l2)}</text>`)
})

// A / B markers
push(`<circle cx="${L.slack.cx}" cy="${Y0 - 40}" r="15" fill="var(--ink)"/><text class="ab" x="${L.slack.cx}" y="${Y0 - 34}" text-anchor="middle">A</text>`)
push(`<circle cx="${L.ctrl.cx}" cy="${stepY(14) - 46}" r="15" fill="var(--ink)"/><text class="ab" x="${L.ctrl.cx}" y="${stepY(14) - 40}" text-anchor="middle">B</text>`)

// scope note inside the system boundary
push(`<rect x="${sysL + 22}" y="1495" width="${sysR - sysL - 44}" height="66" fill="none" stroke="var(--rule)" stroke-width="1.5"/>`)
push(`<text class="nt-t" x="${sysL + 42}" y="1521">In the system, not in this path</text>`)
push(`<text class="nt" x="${sysL + 42}" y="1544">dsh-sandbox-policy confines file effects only — never reads or network.   dsh-tool-web is the one URL-taking tool and ships no domain policy.</text>`)

push(`</svg>`)

const svg = out.join('\n')

const stepRows = steps.map(s => {
  const owner = s.self ? 'dsh-user-approval · dsh-permission-presets' : `${L[s.a].p === 'external' ? L[s.a].t : L[s.a].p} → ${L[s.b].p === 'external' ? L[s.b].t : L[s.b].p}`
  return `<li${s.deny ? ' class="deny"' : (s.hi ? ' class="hi"' : '')}><span class="num">${s.n}</span><span class="txt">${esc(s.l1)}${s.l2 ? ' <em>' + esc(s.l2) + '</em>' : ''}</span><span class="own">${esc(owner)}</span></li>`
}).join('\n')

const roster = [
  ['dsh-mcp-client', 'MCP bridge', 'Point A. Returns the Slack message as an ordinary tool result — with no provenance tag.'],
  ['dsh-agent-loop', 'Agent runtime', 'Carries the result into model context and drives the post attempt.'],
  ['dsh-tools', 'Tool pipeline', 'Owns the pre-execute gate and the monotonic guard slot. The kill point sits here.'],
  ['dsh-user-approval', 'Tool pipeline', 'Fail-closed human gate. Nothing asks it about tool arguments, so nothing is asked.'],
  ['dsh-permission-presets', 'Tool pipeline', 'Bundles sandbox mode with approval policy. Governs shell and files, not arguments.'],
  ['dsh-mcp-guard', 'Compose guard', 'New. Denies a call whose URL carries a tagged secret. Cannot be reversed downstream.'],
  ['dsh-session', 'Session log', 'Event-sourced store. Every step in this diagram is already written down here.'],
  ['dsh-session-persistence-jsonl', 'Session log', 'Writes the canonical log to disk as JSONL.'],
  ['dsh-session-projection', 'Session reads', 'Builds the record shape telemetry deep-copies before redaction.'],
  ['dsh-session-query', 'Session reads', 'Serves the read-then-post window the chain invariant tests.'],
  ['dsh-session-log-export', 'Session reads', 'Produces the evidence bundle joined against the listener hit.'],
  ['dsh-session-telemetry', 'Injection scorer', 'New rule in an empty redact waterfall. First signal in the chain.'],
  ['dsh-invariants', 'Chain invariant', 'New companion. Asserts no secret reaches a URL without a human in the window.'],
  ['dsh-session-telemetry-otel', 'OTLP exporter', 'The only plugin that crosses the boundary. Turns a harness signal into an indicator.'],
  ['dsh-sandbox-policy', 'not in this path', 'Confines writes to the workspace. Not reads, not network — which is why B is external.'],
  ['dsh-tool-web', 'not in this path', 'The one URL-taking tool. No domain allowlist, never asks approval.'],
].map(([p, lane, why]) => `<tr><td><code>${p}</code></td><td class="lane">${lane}</td><td>${why}</td></tr>`).join('\n')

const html = `<title>dsh-mcp-guard Dynamic View</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&display=swap">
<style>
:root{
  --paper:#FAF8F3; --surface:#FFFFFF; --ext:#EEEAE0;
  --ink:#1A1815; --ink-2:#59524A; --ink-3:#8A8175;
  --rule:#C6BFB1; --rule-soft:#E3DDD1;
  --accent:#4A3FB0; --accent-soft:#EDEBFA;
  --danger:#A02C25; --danger-soft:#F7E9E7;
  --sans:'Archivo Narrow','Arial Narrow',Arial,sans-serif;
  --serif:'Newsreader',Georgia,'Times New Roman',serif;
  --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#131209; --surface:#1D1B15; --ext:#26231B;
  --ink:#EFEBE0; --ink-2:#B0A897; --ink-3:#847C6D;
  --rule:#4E4839; --rule-soft:#332F26;
  --accent:#ABA2F2; --accent-soft:#262149;
  --danger:#E58A80; --danger-soft:#3A211E;
}}
:root[data-theme="dark"]{
  --paper:#131209; --surface:#1D1B15; --ext:#26231B;
  --ink:#EFEBE0; --ink-2:#B0A897; --ink-3:#847C6D;
  --rule:#4E4839; --rule-soft:#332F26;
  --accent:#ABA2F2; --accent-soft:#262149;
  --danger:#E58A80; --danger-soft:#3A211E;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--serif);margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:56px 28px 96px;display:flex;flex-direction:column;gap:44px}
header{display:flex;flex-direction:column;gap:14px;max-width:64ch}
.eyebrow{font-family:var(--sans);font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3)}
h1{font-family:var(--sans);font-weight:700;font-size:clamp(30px,4.4vw,46px);line-height:1.06;letter-spacing:-.01em;margin:0;text-wrap:balance}
.standfirst{font-size:19px;line-height:1.65;color:var(--ink-2);margin:0;font-weight:300}
.standfirst strong{color:var(--ink);font-weight:500}

.plate{border:1px solid var(--rule);background:var(--surface);padding:0}
.plate-scroll{overflow-x:auto;padding:22px 22px 6px}
.plate-svg{display:block;width:2470px;max-width:none;height:auto}
.plate figcaption{border-top:1px solid var(--rule-soft);padding:14px 22px 16px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline}
.fig{font-family:var(--sans);font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.figtxt{font-size:15px;color:var(--ink-2);font-style:italic}
.hint{font-family:var(--sans);font-size:13px;color:var(--ink-3);letter-spacing:.02em}

h2{font-family:var(--sans);font-weight:600;font-size:24px;letter-spacing:-.005em;margin:0 0 4px}
section{display:flex;flex-direction:column;gap:18px}
.lede{font-size:17px;line-height:1.6;color:var(--ink-2);margin:0;max-width:66ch;font-weight:300}

ol.ledger{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:0 34px}
ol.ledger li{display:grid;grid-template-columns:30px 1fr;gap:0 10px;padding:11px 0;border-bottom:1px solid var(--rule-soft);align-items:baseline}
ol.ledger .num{font-family:var(--mono);font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}
ol.ledger .txt{font-size:16px;line-height:1.45}
ol.ledger .txt em{font-family:var(--mono);font-style:normal;font-size:12.5px;color:var(--ink-3)}
ol.ledger .own{grid-column:2;font-family:var(--mono);font-size:11.5px;color:var(--ink-3);margin-top:3px;word-break:break-word}
ol.ledger li.hi .num,ol.ledger li.hi .txt{color:var(--accent)}
ol.ledger li.deny .num,ol.ledger li.deny .txt{color:var(--danger)}

.tw{overflow-x:auto;border:1px solid var(--rule-soft)}
table{border-collapse:collapse;width:100%;min-width:660px;background:var(--surface)}
th{font-family:var(--sans);font-size:11.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);text-align:left;padding:12px 16px;border-bottom:1px solid var(--rule)}
td{padding:12px 16px;border-bottom:1px solid var(--rule-soft);font-size:15.5px;line-height:1.5;vertical-align:top;color:var(--ink-2)}
tr:last-child td{border-bottom:0}
td code{font-family:var(--mono);font-size:12.5px;color:var(--ink);white-space:nowrap}
td.lane{font-family:var(--sans);font-size:14px;color:var(--ink-3);white-space:nowrap}

.closer{border-left:3px solid var(--accent);padding:4px 0 4px 20px;max-width:62ch}
.closer p{margin:0;font-size:18px;line-height:1.6;font-style:italic;color:var(--ink)}

/* SVG lettering */
.plate-svg text{font-family:var(--sans);fill:var(--ink)}
.bd-t{font-size:19px;font-weight:700;letter-spacing:.01em}
.bd-t2{font-size:17px;font-weight:600;text-anchor:middle}
.bd-k{font-size:13px;fill:var(--ink-3);text-anchor:middle}
.pb-t{font-size:15.5px;font-weight:600}
.pb-k{font-size:11.5px;fill:var(--ink-3)}
.pb-p{font-family:var(--mono);font-size:10px;fill:var(--ink-2)}
.pb-t.acc,.pb-p.acc{fill:var(--accent)}
.ar{font-size:13.5px;font-weight:500}
.ar.acc{fill:var(--accent)}
.ar.dn{fill:var(--danger)}
.ar2{font-family:var(--mono);font-size:11px;fill:var(--ink-3);text-anchor:middle}
.ab{font-family:var(--sans);font-size:15px;font-weight:700;fill:var(--paper)}
.nt-t{font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;fill:var(--ink-3)}
.nt{font-size:14px;fill:var(--ink-2)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap">
<header>
  <div class="eyebrow">C4 dynamic view · sequence style</div>
  <h1>From a Slack read to a firewall rule</h1>
  <p class="standfirst">Fifteen DeepSeek Harness plugins carry one poisoned message from the MCP bridge to an enforceable indicator. <strong>Point A</strong> is the tool result arriving in the session. <strong>Point B</strong> is the moment a firewall, an EDR agent or a secret vault can act on it. Everything in indigo is new; everything else already ships in <code style="font-family:var(--mono);font-size:15px">dsh 0.1.1-rc.2</code>.</p>
</header>

<figure class="plate">
  <div class="plate-scroll">
${svg}
  </div>
  <figcaption>
    <span class="fig">Figure 1</span>
    <span class="figtxt">Dynamic view — DeepSeek Harness — silent egress, point A to point B</span>
    <span class="hint">Scroll the plate sideways to follow the full chain.</span>
  </figcaption>
</figure>

<section>
  <h2>The sixteen messages</h2>
  <p class="lede">Steps 1–5 are ingestion and scoring. Steps 6–10 are the post attempt and the denial. Steps 11–13 assemble the indicator. Steps 14–16 cross the harness boundary into controls that can actually stop a packet.</p>
  <ol class="ledger">
${stepRows}
  </ol>
</section>

<section>
  <h2>The roster</h2>
  <p class="lede">Every plugin named in the chain, the lane it occupies, and the job it does here. Three are new; the rest are existing parts asked to hold an opinion for the first time.</p>
  <div class="tw">
  <table>
    <thead><tr><th>Plugin</th><th>Lane</th><th>Job in this flow</th></tr></thead>
    <tbody>
${roster}
    </tbody>
  </table>
  </div>
</section>

<section>
  <h2>Where the boundary really sits</h2>
  <p class="lede">The harness never blocks a packet, and nothing in it can. <code style="font-family:var(--mono);font-size:14px">dsh-sandbox-policy</code> confines writes to the workspace — not reads, not network — and the fetch that completes the theft is made by Slack's own servers, on infrastructure no local control can see. So the deliverable is not a network control. It is a signal precise enough that an existing network control can act on it: a destination host, a canary hash, a session id and a severity, emitted over OTLP at step 14.</p>
  <div class="closer"><p>The harness proves intent at the API layer. The wire proves delivery. The canary hash is the join.</p></div>
</section>
</div>`

fs.writeFileSync(process.argv[2], html)
console.log('bytes', html.length)
