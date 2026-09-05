# 1. Deny at assembly, not at egress

Date: 2026-09-05

## Status

Accepted

## Context

Every other place this chain could be stopped is too late or cannot see it.

The link-unfurl vector never sends a packet from the victim's host: Slack's own servers fetch the
URL after the message is posted, so a firewall, an EDR agent and an egress proxy on that laptop all
see nothing. The stealth vector does leave the host, but by then the secret is already in the URL.
Detecting either one afterwards produces an alert about a theft that has happened.

The model cannot be the control. Claude refuses the injection 4 of 4; a capable but
not-safety-hardened model obeys it deterministically on the same harness. A defence that depends on
the victim's judgement fails exactly when the victim is the model that does not have it.

## Decision

The guard runs at the `dsh-tools` seam, `ctx.tools.guard`, and refuses a tool call whose outbound
argument carries a tagged secret — while the URL is still an argument and before any post or fetch.

It keys on the mechanical fact, not on intent: a value that was read as a secret is being assembled
into an outbound argument. That holds whether the model refuses, obeys, or never judged the call.

## Consequences

One denial point covers the unfurl vector, the image vector and the direct-fetch vector identically,
because all three assemble the secret into an argument first. Nothing leaves, so there is nothing to
detect later — which is why the invariant beside it proves a NEGATIVE and the exporter carries a
denial rather than a breach.

The cost is a synchronous, monotonic check on the hot path of every tool call. Monotonic is the
load-bearing word: the guard may only ever refuse more, never less, so a later plugin cannot widen
what an earlier one denied. It disposes with its fiber, so an unmounted bundle leaves no half-guard.

A secret must be TAGGED to be caught. Tagging is upstream of this decision and is where the
false-negative risk lives; the guard is only as good as the set it is given.
