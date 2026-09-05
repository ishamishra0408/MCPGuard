# mcp-guard — Silent Egress Observability & Governance for the MCP Slack Surface

Blue-team observability + governance layer that detects and blocks a **silent
credential leak** through an AI agent's Slack MCP surface — assembled entirely
from DeepSeek Harness (`dsh`) internals that were never meant to be a security
product. Plugins, not patches; config rows, not agent-loop edits.

Grounded in a real local install: `@deepseek-ai/dsh` **0.1.1-rc.2**.

---

## The attack in one paragraph

Two engineers compete for one director seat; each hands a personal agent the
open-ended goal *"win."* The attacker's agent plants a poisoned message in a
shared Slack channel. The victim's agent reads it, treats the retrieved text as
an instruction, finds a credential already in its own session, base64-encodes it
into a URL, and posts that URL to Slack. Slack's link-unfurl service fetches the
URL **server-side** to build a preview — shipping the secret to the attacker's
host. Nothing renders in the channel. The victim sees a normal standup summary.
The theft already happened.

Maps to **CVE-2025-34072** (Anthropic Slack MCP, exfiltration via link
unfurling) — cite as reported, not independently verified here.

---

## The fix — three controls from three unrelated plugins

| Control | dsh spare part | Catches (kill-chain #) |
|---|---|---|
| **Injection-Signal scorer** | `dsh-session-telemetry` redact/score waterfall (ships empty) | Instruction patterns in ingested Slack content (#2) |
| **Payload-Compose guard** | `dsh-tools` `ctx.tools.guard` (monotonic, synchronous) | A tagged secret assembled into an outbound URL argument (#4) — **the kill point** |
| **Exfiltration-Chain invariant** | `dsh-invariants` companion over the `dsh-session` log | Secret from a prior tool result reappearing in a later tool-call URL with no human approval in the window (#8) |

All three are **registrations, not patches** — each disposes with its own fiber.
Compose into one control plane through a single config file, zero agent-loop
edits. Toggle each defense by editing a row.

### Why the guard blocks at *assembly*, not at the fetch

The defense assumes **no link is ever auto-opened**. It blocks the moment a
tagged secret appears in an outbound tool argument — *before* any post, whether
or not a downstream service (Slack unfurl, an image proxy, another MCP fetcher)
would have fetched it. Sink-agnostic by design.

---

## Honest scope boundary (architecture, not gap)

- **In-harness, provable:** kill-chain events #1–#5 and the "no human action"
  clause of #8.
- **Outside the harness:** the terminal covert egress (#6 unfurl fetch) and DNS
  (#7). The `dsh` sandbox governs file effects only — not reads, not network —
  and the fetch originates from Slack's servers, not the victim's host. An
  external listener / egress proxy captures the delivery.
- **The deliverable is the join:** the harness proves intent + assembly; the wire
  proves delivery; correlate them by the planted canary.

### What the guard does *not* catch (state this before a judge asks)

- Exfil that never passes through a tool argument as a recognizable secret
  (natural-language prose a human acts on; multi-turn chunking below the matcher
  window).
- Anything where the secret carries no taint/canary tag at read time.
- Deployments where secrets legitimately ride in outbound URLs (false-positive
  base rate).

---

## Data flow: point A → point B

- **A** — a Slack tool result arrives into the session via `dsh-mcp-client`.
- **B** — an enforceable indicator reaches standard network/endpoint controls
  (firewall DNS sinkhole, EDR egress block, secret-vault rotation), emitted over
  OTLP by `dsh-session-telemetry-otel`.

The harness never blocks a packet — it converts an in-process observation into
an indicator (`net.peer.name`, `dsh.canary.sha256`, `dsh.secret.ref`,
`session.id`, `severity`) that a control which *can* block a packet already knows
how to consume.

### The 15 plugins on the path

| Plugin | Role in this flow |
|---|---|
| `dsh-mcp-client` | Point A. Returns the Slack message as an ordinary tool result — no provenance tag. |
| `dsh-agent-loop` | Carries the result into model context; drives the post attempt. |
| `dsh-tools` | Owns the pre-execute gate + monotonic guard slot. The kill point. |
| `dsh-user-approval` | Fail-closed human gate. Nothing asks it about tool arguments. |
| `dsh-permission-presets` | Bundles sandbox mode + approval policy. Governs shell/files, not arguments. |
| `dsh-mcp-guard` *(new)* | Denies a call whose URL carries a tagged secret. |
| `dsh-session` | Event-sourced store. Every step is already written down here. |
| `dsh-session-persistence-jsonl` | Writes the canonical log to disk as JSONL. |
| `dsh-session-projection` | Builds the record shape telemetry deep-copies before redaction. |
| `dsh-session-query` | Serves the read-then-post window the invariant tests. |
| `dsh-session-log-export` | Produces the evidence bundle joined against the listener hit. |
| `dsh-session-telemetry` *(new rule)* | Injection scorer in the empty redact waterfall. First signal. |
| `dsh-invariants` *(new companion)* | Asserts no secret reaches a URL without a human in the window. |
| `dsh-session-telemetry-otel` | The only plugin that crosses the boundary. Emits the indicator. |
| `dsh-sandbox-policy` / `dsh-tool-web` | *In the system, not on this path* — file-effects-only sandbox; the one URL tool ships no domain policy. |

---

## vs. the ClaudeCode-Leak archive

Compared against [0PeterAdel/ClaudeCode-Leak](https://github.com/0PeterAdel/ClaudeCode-Leak)
(a narrative archive of the March 31 2026 npm source-map leak — does **not** host
source, and does not document MCP/telemetry/session internals):

- **dsh wins:** first-class `dsh-invariants` runtime-assertion registry; the
  event-sourced `dsh-session` store — no public CC analogue.
- **CC wins:** argument-level permission rules; `WebFetch` domain allowlists.
- **Both fail identically:** no MCP provenance tag distinguishing third-party
  content from trusted content. Shared architectural root cause.

---

## Success criteria

- Silent leak reproduced with a deterministic flag.
- Exfiltration-Chain alert fires on the live dashboard.
- **Attack-success-rate → 0** with the bundle on (measured at the external
  listener), unchanged agent behavior otherwise.
- One-page recommended-controls writeup mapping each control to its CVE.

---

## Repo contents

| Path | What |
|---|---|
| `diagrams/component-view.html` | C4 **component-level** dynamic view (sequence style): 15 plugins, point A → B. |
| `diagrams/container-view.html` | C4 **container-level** dynamic view: both runs (bundle off vs on) side by side, with a worked end-to-end example. |
| `diagrams/*.gen.js` | Node generators that emit the SVG plates + surrounding page. `node <file>.gen.js out.html`. |

Open the `.html` files in a browser. They are self-contained (Google Fonts only),
theme-aware, and horizontally scrollable for the wide sequence plates.

---

*Analysis and diagrams produced with Claude Code.*
