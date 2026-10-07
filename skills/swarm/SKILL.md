---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Write a visible checklist with one entry per phase before launching anything.

Every launch below follows `../poteto-mode/references/fan-out.md`.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not a concurrency limit.
4. Pick the worker model by the work, as a task category per `../poteto-mode/references/fan-out.md` section 3: `task:qa` to verify or measure, `task:recon` to explore, `task:coding` to write. For a model race, name each arm's exact `provider/model-id` from the live catalog up front.
5. Give each worker its own writable output when it writes: its own `worktree` branch, per `../poteto-mode/references/fan-out.md` section 5. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Launch all N workers as N independent bare `subagent` calls in one turn, then end the turn. The host delivers each result. Pi child processes run locally with isolated context, so give each brief explicit file pointers and prevent concurrent writes to shared paths.

When a writer must start from another committed revision, set `base` in its `worktree`.

```json subagent
{
  "name": "<slug>-worker-1",
  "task": "<goal>. Slice: <exact slice or race arm>. Verify at <exact SHAs> with <method>. Claims: <each claim to verify, one per item>. Report every listed claim as pass, fail or inconclusive before the overall status. A listed claim with no result counts as inconclusive. Then give one overall status, in this order. A proved fail always means ISSUES, even when other checks could not run: list every proved issue, not only the first, and inconclusive claims stay inconclusive. Otherwise PASS only when at least one claim is listed, every listed claim passes, and the worker proves no other defect. Otherwise BLOCKED, and state why: zero listed claims, an inconclusive claim, or no check could run. Record the SHAs and method. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Verifier prompt in ../poteto-mode/references/delegation.md, verbatim>",
  "model": "task:qa",
  "thinking": "medium",
  "tools": "read, bash",
  "fork": false
}
```

A writing worker takes the Implementer prompt, `task:coding` and a `worktree` instead. An exploring worker takes the Investigator prompt and `task:recon`.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, the claims to verify listed one per item before any result, and what to report. The parent writes the claims, and together they cover the slice's share of the done predicate from Phase A step 1, so one trivial claim such as "the file exists" cannot stand for the slice. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first. The Verifier prompt in `../poteto-mode/references/delegation.md` reports pass, fail or inconclusive for each claim. A listed claim with no result counts as inconclusive. Map the claims onto one overall status, in this order. A proved fail always means `ISSUES`, even when other checks could not run, and inconclusive claims stay inconclusive. Otherwise `PASS` requires at least one listed claim and a pass for every listed claim. Otherwise the status is `BLOCKED`, with the reason stated: zero listed claims, an inconclusive claim, or a worker that cannot run any check.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. Recompute each result's status from its per-claim results, in the worker order: any proved fail, or any other defect the worker proves, means `ISSUES`; otherwise `PASS` only when at least one claim is listed in its brief and every such claim passes; otherwise `BLOCKED`. Whenever the recomputed status differs from the reported one, use the recomputed status, whether the worker reported `PASS`, `ISSUES` or `BLOCKED`. Never change a status on judgment alone. Treat a `PASS` that lists no claims, or that gives no result for a claim listed in its brief, as `BLOCKED`. For a `first pass` race, only an overall `PASS` wins. `ISSUES` and `BLOCKED` are not a pass. For coverage, every required slice needs a result. A `BLOCKED` slice is unverified. Report it with its reason next to the gaps, never as covered. An `ISSUES` slice carries its inconclusive claims into the gaps. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
