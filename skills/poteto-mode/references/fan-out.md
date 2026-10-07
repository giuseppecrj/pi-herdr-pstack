# Fan-out

The shared protocol for any skill or playbook step that launches more than one child, or that waits on something outside this session. Skills and playbooks cite this file instead of restating it. Paths here are relative to the poteto-mode skill directory. `references/delegation.md` covers a single child: who to launch, the brief, models and the reference prompts. This file covers many children at once.

Pstack uses only the public pi-herdr-agents surface:

- **Launch.** A bare `subagent` call with `name`, `task`, `systemPrompt`, `model`, `thinking`, `tools`, `cwd`, `fork: false` and an optional `worktree`. Never `agent`, and never `persistent`.
- **Results.** Delivered automatically as a new turn, including the child's `Session:` path.
- **Liveness.** Host stall and no-progress advisory wakes.
- **Control.** `subagent_cancel` and `subagent_interrupt` from the parent, and `caller_ping` from a child.
- **Tools.** A child launched without a `tools` key sees the MCP tools configured for Pi. A child given a `tools` list sees none. Omit `tools` for a child that needs an MCP server, as the why investigators do.
- **Worktrees.** Retained after the child finishes, listed with `worktree_list` and removed only with `worktree_remove`.
- **Session files.** `$PI_SESSION_FILE` in bash, and the per-cwd session directory rule in `playbooks/session-pickup.md`.

There is no scheduler, timer, durable ledger, remote worker, parallel task array or child-side wait. A bare child exits once its turn settles, so it cannot wait for children of its own. Its result reaches you before any grandchild it launched finishes, and that grandchild's result reaches no one. Children are leaves because of how the host works, not only by preference.

## 1. Fan-out lives in the parent session only

- Launch the N children as N independent `subagent` calls in one turn, then end the turn. The host wakes you with each result.
- Before the calls, write a visible checklist of the expected child names. Pi has no todo tool; the checklist in your reply is the record.
- Tick a name off only when it has a terminal result: delivered, failed, or cancelled and recorded as a dropout. Synthesize only after every name on the checklist is terminal.
- A child that receives a fan-out skill runs that skill's single-pass path itself and launches nothing. This covers the comment delegate that no-comments launches and the delegates of the hillclimb and autopilot playbooks. No brief can grant a child further delegation. A child that needs more children hands that need back to the root in its result, or through `caller_ping`, and the root launches the next child.

## 2. Prompts

- **Fixed prompt.** A reference file written as a complete prompt goes verbatim in `systemPrompt`, with `fork: false`, even when it contains placeholder tokens. The values for those placeholders, and every other specific, go in `task`. Examples: `../architect/references/runner-prompt.md`, `../interrogate/references/reviewer-prompt.md` and the reflect reviewers. In a `json subagent` example, write the placeholder as `<the full text of references/<file>.md, verbatim>`, with the path relative to the launching skill's directory.
- **Template.** A reference file written as a brief to fill in is filled in and sent as `task`. Its `systemPrompt` is the matching Investigator, Reviewer or Verifier prompt from `references/delegation.md`, again with `fork: false`. Examples: the how explorer and explainer, and the why investigator and synthesizer. In an example, write `<the Investigator prompt in references/delegation.md, verbatim>` from inside poteto-mode, or `<the Investigator prompt in ../poteto-mode/references/delegation.md, verbatim>` from any other skill. Use Reviewer or Verifier in place of Investigator as the seat requires.
- Every `systemPrompt` needs `fork: false`. The host drops a bare child's `systemPrompt` in a forked session.

## 3. Models

- **Ordinary seats** use a task category as the entire `model` value: explorers and investigators `task:recon`, reviewers and judges `task:review`, design runners and judgment or prose synthesis `task:architecture`, code candidates `task:coding`, verifiers `task:qa`. Judgment or prose synthesis is the how explainer, the why synthesizer, and reflect's judgment, divergent and synthesizer lenses, each with `thinking: high`. `references/delegation.md` says why that work uses `task:architecture`.
- **Diversity seats** are seats whose value is that they think differently: arena and architect runners, interrogate reviewers, a cross-judge, the show-me-your-work trail reviewer, and reflect's tooling lens. Each gets an exact authenticated `provider/model-id` from the live catalog in your system prompt, one model family per seat, and none from the author's family when the seat judges the author. The tooling lens's family differs from the family `task:architecture` resolves to.
- **Too few families.** With fewer authenticated families than seats, run fewer seats, or run same-family seats and say they are context-isolated, not cross-family. A gate that requires cross-family judgment then reports itself incomplete.
- Never inherit the parent's model implicitly, never guess a family from a model-name prefix, and never cite a per-skill "configured" model. `/setup-pstack` writes only the task categories. Model defaults change through `/setup-pstack`, not through a pull request.

## 4. Dropouts and stalls

- A failed child is a dropout. Proceed with N−1, record the dropout on the checklist and in the synthesis, and say what its absence costs.
- A no-progress advisory gets one `subagent_cancel`, except for a watcher in its bounded wait (section 6). If the work is still needed, launch one fresh replacement with consolidated scope, and record both on the checklist. Do not relaunch the same brief twice.
- Never poll, sleep, tail a session file or call a list tool to check on a child. Work on something independent or end your turn.

## 5. Writers

- Each code candidate and each parallel writer gets its own `worktree` branch, based on committed HEAD. Uncommitted parent changes are not copied, so commit what the children need first.
- A worktree result is a retained handoff, not an accepted change. Inspect the diff against the reported base and rerun the checks before integrating it.
- Removing a worktree or branch falls under `references/authorization.md`.

## 6. Watcher child: the only wait

When a step must wait for something outside the session, such as CI checks or a workflow run, launch one watcher child. It is a bare child with `tools: "read, bash"` that runs one bounded, blocking command, then reports what it saw. Its delivery is the wake.

- Examples: `gh pr checks <pr> --watch` and `gh run watch <run-id> --exit-status`. State the condition that ends the wait and bound each watch arm with a wall-clock timeout, such as `timeout <seconds> gh pr checks <pr> --watch`, or an enforced finite step cap, so the wait stays visibly finite. `gh pr checks --interval` sets only the refresh cadence and bounds nothing, because checks can stay pending indefinitely. The declared bound is the watcher's wait bound.
- While the watcher blocks, expect one informational no-progress advisory for each idle minute. It is not a stall. Do not cancel the watcher for it. Cancel only when the stated bound has passed.
- The watcher reads; it does not reply, push, merge or re-run anything.
- After each wave of work, re-arm the wait explicitly by launching a fresh watcher. It is one-shot: never a sleep loop, never a timer, and nothing in pstack schedules it.
- Without a delivery or an advisory, nothing wakes you. Audit at each wake, or when the operator asks.

## 7. Help and stop

- A child that reaches an authorization boundary calls `caller_ping`. It never guesses. An ordinary child exits after the ping and does not continue, so the ping carries everything: what it finished, what it found, where its work is, and the exact question. Answer from `references/authorization.md`, or ask the user, then give the work to a fresh child with consolidated scope.
- When the operator says "stop" or "hold", call `subagent_cancel` on every running child and launch nothing new. Report what each child had finished.
- "Release" means fresh children with consolidated scope, not resumed ones.

## Examples

A template seat: a filled-in explorer brief with the delegation Investigator prompt.

```json subagent
{
  "name": "login-explore-1",
  "task": "<the filled-in explorer template>. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Investigator prompt in references/delegation.md, verbatim>",
  "model": "task:recon",
  "thinking": "low",
  "tools": "read, bash",
  "fork": false
}
```

A diversity seat: an exact model from a family no other seat uses.

```json subagent
{
  "name": "login-judge-b",
  "task": "Judge candidates <A> and <B> against <rubric>. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Reviewer prompt in references/delegation.md, verbatim>",
  "model": "<provider>/<model-id>",
  "thinking": "high",
  "tools": "read, bash",
  "fork": false
}
```

A one-shot watcher child:

```json subagent
{
  "name": "pr-123-watch",
  "task": "Run `timeout 30m gh pr checks 123 --watch` once. Report each check's final state and the command's exit code. Do not reply, push, merge, re-run jobs or launch subagents.",
  "systemPrompt": "<the Investigator prompt in references/delegation.md, verbatim>",
  "model": "task:recon",
  "thinking": "minimal",
  "tools": "read, bash",
  "fork": false
}
```
