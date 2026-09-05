# 1. The read-then-post window is pushed, not polled

Date: 2026-09-05

## Status

Proposed

## Context

The exfiltration-chain invariant tests a PAIR: a secret from an earlier tool result reappearing in a
later tool-call URL with no human approval between them. Today it asks the session store for that
window — `invariant -> store "reads read-then-post windows from"`. A poll.

A poll has a period, and the period is the attack's headroom. The guard is synchronous and must
refuse at assembly, so a window that completes between two polls is a window the guard never sees
in time to matter.

## Decision

A reactive index maintains the open windows and pushes a completed one to the invariant the moment
the second half arrives. The store keeps its job — the durable event log — and the index is a
derived, subscribable projection over it.

Convex is the named technology because the shape is its default rather than an add-on: queries are
functions over an ACID relational store, subscribers are pushed on write with no polling, and the
write and the notification sit inside one transaction boundary. The guard's monotonic, synchronous
contract needs that boundary; a log tailer does not have one.

## Consequences

The invariant fires on the write that completes a pair, so its verdict is available while the URL is
still an argument — which is the only moment the guard can use it.

This is a Proposal, not a Modification: the Deepseek Harness offers a plugin point for the invariant
and none for a reactive projection, so it is a component the harness has no opinion about.

The cost is a hosted dependency on the detection path, and it should be stated rather than hidden:
the store remains the record and the index is derived, so losing the index degrades the invariant to
the poll it replaces rather than losing evidence.

Modelled as a container rather than a deployment node deliberately. Where the index RUNS is a thin
statement about a hosted service; what changes is the direction of the arrow, and an arrow lives in
the container view.
