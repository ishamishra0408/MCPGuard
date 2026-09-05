# 1. The realtime metric lives outside the harness

Date: 2026-09-05

## Status

Accepted

## Context

The session log is durable, strictly local, and written before anyone asks — which is what makes the
chain invariant provable after the fact. It is the wrong shape for the thing that has to be watched
WHILE a run is happening. A second person tailing the same file sees a different moment from the
first, and neither can be pointed at.

Claude Code ships OTel metrics and logs to a collector, which is one-way and per-install. Neither
harness has a shared, subscribable view of a single run.

## Decision

A hosted reactive database holds the live event stream and the attack-success metric, and every
viewer subscribes to it. The reactive window index publishes to it rather than a poller asking.

The harness keeps its local log as the source of truth; this plane is a projection and may be
rebuilt from it.

## Consequences

Two people watch attack-success flip 1 to 0 in the same instant, which is the demonstration. The
cost is a second store that can disagree with the log; it is accepted because the log stays
authoritative and the projection is rebuildable from it, so a disagreement is a bug in the
projection and never a lost fact.
