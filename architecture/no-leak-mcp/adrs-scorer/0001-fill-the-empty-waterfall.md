# 1. The injection scorer is a rule in a waterfall dsh already ships

Date: 2026-09-05

## Status

Accepted

## Context

`dsh-session-telemetry` carries a redact/score waterfall in `@deepseek-ai/dsh` 0.1.1-rc.2, and it
ships empty. The seat exists and nothing is sitting in it.

The alternative was a new plugin beside it, which would need its own registration, its own fiber and
its own disposal, and would duplicate the point at which ingested text is already being walked.

## Decision

The scorer is a new **rule** in that existing waterfall, not a new plugin. Its state is Modified: the
harness offers the extension point and we are filling it.

## Consequences

Nothing in the agent loop changes and no patch is carried against dsh. Toggling the defence is
editing a config row.

The cost is that the scorer inherits the waterfall's position — it sees ingested text at redaction
time and nothing earlier. A pattern that only becomes visible after a tool call cannot be scored here
and needs the invariant instead.

This is the cheap half of the three defences, and the diagram says so: a darker, thinner amber stroke
than the two Proposals.
