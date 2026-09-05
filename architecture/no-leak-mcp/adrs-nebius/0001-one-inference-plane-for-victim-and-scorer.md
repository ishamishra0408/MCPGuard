# 1. One inference plane serves both the victim and the scorer

Date: 2026-09-05

## Status

Accepted

## Context

The finding this project rests on is that a capable-but-not-safety-hardened model obeys the
injection while Claude refuses it, 4 of 4. That is a claim about models, so it only means something
against a fixed inference substrate: if the victim run and the scoring run sit on different
providers, an attack-success number is a statement about two vendors' availability rather than about
the guard.

The harness names no inference provider. Whatever the operator wired is what runs, and the scorer —
which needs a second model call on every ingested message — has no seat that owns it at all.

## Decision

One managed inference plane serves both the victim model and the injection scorer. The headline
metric is then a comparison on one substrate: same provider, same config, bundle off then on.

## Consequences

The provider becomes a single point of failure for the demo, which is accepted: a run that cannot
reach inference reports UNEVALUABLE rather than a success of 0, and a 0 that means "the model was
unreachable" is the one result that would falsely flatter the guard.

It also couples the scorer's cost to the victim's traffic. That is the honest shape — the scorer
reads everything the agent ingests — and it is why the scorer is a scoring call rather than a second
agent.
