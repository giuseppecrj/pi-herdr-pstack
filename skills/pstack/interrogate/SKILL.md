---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent in your own words, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A steps 3 and 4 and Phase B of the **arena** skill, with four changes. Every launch follows `../poteto-mode/references/fan-out.md`. Adversaries are diversity seats like arena runners: one exact authenticated `provider/model-id` per family from the live catalog. Seat fallbacks, dropped seats, and topping up to two runners follow arena Phase A step 3. Commit or otherwise materialize the scope's uncommitted changes before worktree launches, because a Pi worktree starts from committed HEAD and does not copy the parent's dirty tree. Spawn each adversary as a bare `subagent` with the Implementer prompt from `../poteto-mode/references/delegation.md` as `systemPrompt` and `fork: false`. In place of the arena task and rationale, give each adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

```json subagent
{
  "name": "<slug>-adversary-1",
  "task": "Scope: <paths or diff summary>. Intent: <the intent paragraph>. <the break-this-change brief above>. Shared grounding: <path>. Write repros only in your worktree; do not push, merge or open a PR. You are a leaf: launch nothing.",
  "systemPrompt": "<the Implementer prompt in ../poteto-mode/references/delegation.md, verbatim>",
  "model": "<provider>/<model-id>",
  "thinking": "high",
  "fork": false,
  "worktree": { "branch": "<slug>-adversary-1" }
}
```

## Verify

Verify each finding per arena Phase F by rerunning its command. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.
