# 1. The exfiltration-chain invariant is a new companion on dsh-invariants

Date: 2026-09-05

## Status

Accepted

## Context

The attack succeeds because a secret from an earlier tool result reappears in a later tool-call URL
with no human approval in between. No single call is anomalous; only the pair is.

`dsh-invariants` accepts companions over the `dsh-session` log, and `dsh-session-query` serves the
read-then-post window that pair lives in. So the harness offers a place to stand, and nothing that
stands there.

## Decision

A new companion, registered rather than patched. Its state is Proposal: unlike the scorer, there is
no empty seat to fill — this is a component the harness has no opinion about.

## Consequences

The invariant is the only defence that can see the pair, so it is also the only one that can catch a
payload the scorer's patterns miss.

It tests reappearance across a window, which is a heuristic and is named as one: a payload
transformed between the read and the post — base64 is already in the attack — weakens a string test.
Closing that needs value-level provenance rather than a wider window, and that is a different
proposal.

Being a Proposal rather than a Modified is the honest signal of what it costs to land: a new
registration, reviewed on its own, not a row in a file dsh already reads.
