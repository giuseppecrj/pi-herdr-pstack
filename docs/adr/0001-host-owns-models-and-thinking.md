---
status: accepted
---

# pi-herdr-agents owns per-category models and thinking

Upstream Cursor pstack stores a model and a reasoning budget per role in its own always-applied rule file. This pack keeps no model configuration of its own: `/setup-pstack` follows the upstream steps, but it writes the pi-herdr-agents task preferences. The host gains a per-category thinking level, clamped to each candidate model's supported range. This keeps one source of truth that every pi-herdr-agents workflow shares, at the cost of upstream's per-role granularity, because the roles are folded into the host's six task categories.

## Considered Options

- **pstack writes its own rule file and injects it** (closest to upstream). Rejected: a second model store beside the host's.
- **Models only, no budget.** Rejected: it drops upstream's budget ladder.

## Consequences

- poteto-mode omits `thinking` on `task:<category>` calls, so the configured category thinking applies. An explicit `thinking` argument still overrides it.
- Supporting this needs a pi-herdr-agents minor release before pstack can depend on it.
