# proposalIM — dsh-mcp-guard

**Silent Egress: Observability & Governance for the MCP Slack surface.**
An AI-security tool, built from DeepSeek Harness (`dsh`) internals, that detects and blocks
silent credential exfiltration by an agent through its Slack MCP surface — and proves it with a
hard before/after metric.

**Hackathon:** Burning Token · **Tracks targeted (multi-entry allowed):**
- 🥇 **Applied AI · Nebius** ($500) — *"an AI tool for a specific task, measure how well it works"*
- 🥈 **Workflows · Render** ($900 credits) — *"a background process that completes a task and recovers when a step fails"*
- 🥉 **Multiplayer · Convex** ($500) — *"same app, multiple users, in sync, in realtime"*

---

## 1. The problem

Agents treat retrieved content as instructions. A poisoned message in a shared Slack channel drives a
victim's agent to read a secret it legitimately holds, encode it into a URL, and post it — Slack's
link-unfurl service then fetches that URL **server-side**, shipping the secret to an attacker. Nothing
appears in the channel; the victim sees a normal standup summary.

Maps to **CVE-2025-34072** (Anthropic Slack MCP, exfiltration via link unfurling, CVSS 9.3),
**EchoLeak / CVE-2025-32711** (zero-click M365 Copilot exfil), and the MCPTox tool-poisoning
findings. Root cause is architectural: the trust model, not auth.

## 2. What is already PROVEN (real infrastructure, not mock)

Reproduced end-to-end on a live self-owned Slack workspace + real `dsh` 0.1.1-rc.2 + a live victim model:

- **Claude refuses this injection** — 4/4 runs (Opus, default, Haiku), overt and disguised payloads, all flagged.
- **An un-hardened capable model obeys it** — Nemotron-120B (via OpenRouter) executed the injected
  instruction deterministically, on the real harness.
- **Full keyring exfiltrated** — a poisoned Slack "runbook note" made the agent read its own
  `agent-credentials.env`, base64 it, and leak Google Workspace + Jira + Todoist + AWS + Slack tokens.
- **Two exfil modes captured:**
  - *CVE mode:* opaque probe link posted → **Slack's own servers** (`Slackbot-LinkExpanding`, Slack IPs)
    fetched it → secret delivered. Server-side, silent.
  - *Stealth mode:* agent `curl`ed the endpoint directly → **nothing** in the channel at all.
- **Attacker receipt automated** — a harvester polls the drop and base64-decodes the keyring.

**Key finding:** the dangerous victim is a *capable-but-not-safety-hardened* model — not a tiny one
(too weak to drive tools), not Claude (refuses). The defense therefore cannot live in the model.

## 3. The fix — dsh-mcp-guard (harness spare parts as governance)

Three controls, each a first-class `dsh` plugin registration (not a patch), composed via one config layer:

| Control | dsh seam | Catches |
|---|---|---|
| **Injection-Signal scorer** | `dsh-session-telemetry` redact/score waterfall (ships empty) | instruction patterns in ingested Slack content |
| **Payload-Compose guard** | `dsh-tools` `ctx.tools.guard` (monotonic, synchronous) | a tagged secret assembled into an outbound tool argument — **the kill point** |
| **Exfiltration-Chain invariant** | `dsh-invariants` companion over the `dsh-session` log | secret read → same secret in a later outbound URL, no human approval in the window |

The guard is **model-independent**: it keys on the mechanical fact *"a tagged secret is leaving in an
outbound argument"* — so it holds whether the model refuses, obeys, or never judged the call at all.
It denies at **assembly time**, before any post or fetch, so it blocks the CVE unfurl vector, the
EchoLeak image vector, and the direct-fetch vector identically.

## 4. Three-sponsor architecture

```
Nebius victim agent (dsh)
   |- reads poisoned Slack -> Nebius injection-scorer flags it --------> Convex (event #2)
   |- reads keyring, builds exfil ------------------------------------> Convex (events #3-4)
   |- GUARD denies the outbound call -----> Convex (#8) + OTLP -> Render collector/worker
   |- bundle OFF: exfil hits the Render-hosted listener (success=1)
      bundle ON : listener stays dark                     (success=0)
Convex-backed dashboard (hosted on Render) -> viewers watch attack-success flip 1->0 in realtime
```

| Plane | Sponsor | Role | Track ask it satisfies |
|---|---|---|---|
| **Inference** | **Nebius** | victim model **and** injection-scorer LLM | *AI tool for a specific task + measure how well it works* |
| **Delivery + hosting** | **Render** | attacker listener, OTLP collector, detection worker, dashboard host | *background process that completes a task and recovers when a step fails* |
| **Realtime state** | **Convex** | live event stream + attack-success metric, synced to all viewers | *same app, multiple users, in sync, realtime* |

**Recovery story (Workflows/Render):** the detection worker rebuilds its state from the durable
`dsh-session` log and re-subscribes to the OTLP/Convex streams when a step dies — recovery from
durable state, not restart-from-zero.

## 5. Success criteria

- Silent leak reproduced with a deterministic flag. **(done, on real infra)**
- Exfiltration-Chain alert fires on the live (Convex) dashboard.
- **Attack-success-rate → 0 with the bundle on**, unchanged agent behavior otherwise. Headline metric.
- One-page recommended-controls writeup mapping each control to its CVE.

## 6. Build plan

| Phase | Sponsor | Deliverable |
|---|---|---|
| 0 | — | Claim Nebius $25 + Render $50 credits |
| 1 | **Nebius** | Point dsh victim + scorer at Nebius inference (fixes reliability) |
| 2 | core | Compose guard (`ctx.tools.guard`) — registered, disposes with its fiber |
| 3 | **Convex** | Realtime event store + reactive, multi-viewer dashboard |
| 4 | **Render** | Deploy detection worker (with recovery) + host dashboard |
| 5 | — | Eval harness: N runs → attack-success-rate 1→0 |

## 7. Evidence appendix (captured)

- Poisoned Slack "runbook note" (disguised as a build-health sync check).
- Decoy keyring `agent-credentials.env` (all canary values).
- Beeceptor/webhook.site capture of `GET /sync/<base64>` → decodes to the full keyring.
- dsh trajectory: `slack_get_channel_history` → read file → `cat | base64` → `slack_post_message`.
- `attacker_receiver.py` — the attacker's harvester (polls the drop, decodes).
- **The model, as code**: `architecture/no-leak-mcp/workspace.dsl` — one Structurizr DSL that yields
  **six views**: SystemContext, Containers, the Observability component view, two dynamic traces
  (KillChain, ExfiltrationSignal) and a Deployment view. Exported, not drawn: the pictures cannot
  disagree with the model because there is only one source.
- **The Deployment view carries the sponsor architecture**, each plane appearing once as a node:
  Nebius serves inference to the victim and the scorer, Render carries what must outlive a laptop
  (OTLP collector, detection worker, attacker listener), Convex holds the realtime state. It also
  states the boundary the threat model rests on — the harness and its session log never leave
  Engineer B's machine, and the unfurl fetch happens on **Slack's** servers, which is why no egress
  control on that laptop can see it.
- **Five ADRs beside the boxes they govern**, each reachable from its element: the compose guard as a
  companion rather than a patch, filling the empty telemetry waterfall, pushing the read-then-post
  window instead of polling it, one inference plane for victim and scorer, and the realtime metric
  living outside the harness.
- **Every box marked `Proposal` or `Modified` is ours**, in stroke and in words, so a reader can see
  at a glance what DSH ships and what this project adds.
- **The diagrams are checked, not just drawn**: eight controls run against this model and all eight
  are green — the notation is explained on the key, no queue is drawn as an application, no
  asynchronous hop is drawn solid, every proposal is governed by a decision, every element carries a
  hover rationale, the palette claims no false ownership, and the page served matches the model the
  checks judged.

---

*Status: attack fully proven on real infrastructure. The ARCHITECTURE is now modelled as code and
checked — six views, five ADRs, eight controls green. The defense itself (the three-control guard)
is the remaining build. This document is the handoff brief for the build session.*

*Analysis, reproduction, and diagrams produced with Claude Code.*
