### Orchestrate

**You own the program, never the code. Author briefs, drain the queue, keep the frontier green, decide.** For a whole project handed to one coordinator chat: many stacked PRs, many subagents, the human checking in between waves instead of every five minutes. One task driven to a predicate is Autonomous run. One ambitious run needing a bespoke workflow is the **figure-it-out** skill. Route here when the work outlives any single child. Work one agent could finish inside the session's budget is not a program.

**Scope in this release.** Say this to the operator when you frame the program. This playbook is a depth-1, single-session coordinator. It is not an unattended runner.

- This session is the only coordinator, and it launches every child. Children are leaves (`references/fan-out.md`). There are no sub-coordinators and no nesting.
- Nothing wakes the coordinator except a child's delivered result, a stall or no-progress advisory, or the operator. The program runs while this session is open and something it launched is running. It does not run for days on its own, and nothing in pstack schedules it.
- The store is plain files the coordinator keeps by hand under the **show-me-your-work** skill's append-only rules. There is no ledger tool, lock or event queue.
- The frontier comes from `gh` PR bases. Graphite is never required, and there are no remote workers.
- A session that ends pauses the program. It resumes through Session pickup from the store and the pushed branches, never by reattaching a child.
- Each push, PR creation, retarget, close, merge and thread reply needs an operator grant that names it (`references/authorization.md`).

Ceremony must scale with the program. On cheap near-identical units, collapse it as each section directs.

Three rules carry the rest.

- Completions are queue events, not interrupts.
- Every launch carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly, because a child cannot see your conversation and calls `caller_ping` only at an authorization boundary.

#### Roles and placement

- **Coordinator (this session).** Frames, authors briefs, drains deliveries, owns the human report, makes judgment calls. It never authors or edits code. Conflicted merges, rebases, and code changes are always tasks. Mechanically landing a verified unit (fast-forward or clean cherry-pick of a worker's commit, then a push under the push grant) is bookkeeping the coordinator may do itself on repos where local git is cheap. Queueing finished work behind an idle stacker is how a deadline harvests nothing. Children are launched only through the `subagent` tool, and the results arrive on their own. Give follow-up work to a fresh child with consolidated scope rather than resuming an old one, per the hub's Subagents section. Store reads and writes happen at drain points, kept short to conserve context.
- **Worker and verifier.** Bare leaf children on this machine, launched per `references/delegation.md`. They share the machine but have isolated context, so their briefs inline what they need or point at repo paths. A child that reads session files uses the per-cwd rule in `playbooks/session-pickup.md`. Prefer fewer, broader workers. One writer per worktree or branch (**principle-separate-before-serializing-shared-state**). Run a unit's verifier on a different model family from its worker.
- **Stacker, babysitter, retro.** Roles, not standing agents. Each round of a role is a fresh child the coordinator launches.

Cap in-flight children at what one drain can process, roughly ten, as a rolling window. Never as blocking batches, which cost the slowest child of every batch. Author the track decomposition per project as labels in `units.tsv` (build, landing, and verification are common cuts, not a required shape). A program bigger than one coordinator's drains can manage splits into separate programs the operator runs one at a time.

#### Store layout

Create `orchestrate/<project-slug>/` in a directory the operator names. By default use `.orchestrate/<project-slug>/` at the repository root and list it in `.git/info/exclude`, so it stays untracked. The coordinator is the only writer of every file. Children report, and the coordinator records. Append TSV rows with `../show-me-your-work/scripts/log.sh` for the decision trail, and with the same cell rules for every other table: single-line cells, evidence as pointers, a quote before any cell that starts with `=`, `+`, `-` or `@`.

- `preferences.md` is the standing-orders register: numbered lines, one constraint each (model policy, stack shape and count, verification bar, forbidden paths, escalation policy, the grants the operator gave by name). Paste it verbatim into every launch. Directives decay across rounds, and each dropped one costs a human turn. When you catch yourself restating an instruction, append the line before you act (**principle-encode-lessons-in-structure**).
- `overview.md` is the durable PR and issue record. Append. Never rewrite wholesale per event.
- `units.tsv` has one row per unit change: id, track, state, branch, PR, head SHA, brief path. Append a new row when a unit changes. The latest row for an id is its current state.
- `frontier.tsv` is the computed merge frontier, per Stack safety. Append one row per generation.
- `ledger.tsv` is the verification ledger, per Verification.
- `inbox.tsv` gets one row per delivered result. `gates.md` parks human gates (question, options, default on no answer).
- `decisions.tsv` is the trail via the **show-me-your-work** skill.
- `status.md` is derived from `units.tsv` and `ledger.tsv` at each drain, never hand-maintained. Regenerate it from the tables instead of narrating events into it.

#### The brief

Your prompts to agents are your only product, and a sloppy brief compounds into slop across the whole program. Every launch carries all of it. A field you cannot fill is a unit you have not scoped yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; its exclusive worktree or branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the control-skill path, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no Graphite, no rebase, no force-push, no subagents, no push, PR or merge
             unless named here, no fixes outside scope, plus unit-specific bans
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <preferences.md pasted verbatim>
```

Size the brief to the unit. A one-command unit gets the template collapsed to a paragraph that still names goal, scope, the verify command, and the report shape. A 4KB scaffold around a two-line edit costs more to write and obey than the edit. A child that can read the store may get the standing orders by store path. Paste them verbatim otherwise.

A dependency is a context relay, not just ordering. Undeclared upstream context makes the worker guess. Missing fields are a refuse-to-launch condition. Audit one sampled brief per wave, concurrently with the wave it samples, never as a gate in front of it. A failing brief stops the next refill and fixes the template, not just that brief, because brief quality decays late in a run. Never chain a brief through resumes. Launch fresh with consolidated scope.

#### Steps

1. **Frame.** State the done predicate as something countable ("all 126 units merged, each ledger-verified `unit-test-verified` or better"). Quantify scope: units, rough effort, expected stacks, and the wall-clock budget this session can stay open. If one agent could finish inside that budget, stop here and run Autonomous run instead. Collapsing must not depend on another document being present. It means do the work directly in this session, plain workers where they help, verification inline, landing as you go, and none of the store, register, or pilot machinery below. Schedule landing against the budget. By roughly 70% of it, stop launching and land what is verified. Name the tracks per project. A contested decomposition or one-way door goes through the **arena** skill before the pilot. Present the framing once, with the scope limits above and the grants the program needs. Reversible prep proceeds without waiting.
2. **Set up the store.** Create the store files. Open the trail via the **show-me-your-work** skill, write the standing orders before any launch, and seed `frontier.tsv` from the open PRs with `gh pr list --state open --json number,headRefName,headRefOid,baseRefName`.
3. **Pilot.** Push one unit through the whole path: brief, worker, verification, stack entry, ledger row, merge. The pilot exists to falsify the brief template, the verify recipe, and the unit size while that costs one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit. On programs of near-identical cheap units, the first unit is the pilot, run as a normal unit with its verify command inline, and fan-out starts the moment it lands. The dedicated pilot pipeline (separate verifier agent, audit gate) is for expensive or novel unit shapes, not for clone-units where a serialized pilot has nothing to falsify.
4. **Scale.** Launch a rolling window of workers up to the in-flight cap, as independent `subagent` calls in one turn per `references/fan-out.md`, refilling as results arrive. Blocking batches pay the slowest child of every batch. Recompute ready work after each drain. Relay upstream reports into downstream briefs. Children never talk to each other; everything flows through you. The sampled brief audit runs alongside the wave it samples and stops the next refill on failure, not the current one.
5. **Drain.** Run the queue discipline below at every drain point.
6. **Land.** Landing is continuous, never a terminal phase. Integration starts with the first verified unit and runs alongside the remaining waves. On heavy repos the stacker role runs from wave one, one fresh round per integration, as units verify. On repos where local git is cheap, the coordinator lands verified units itself per Roles. Keep the frontier green before upper-stack work. Stack safety governs. Advance `frontier.tsv` only on a merge or a reported new head SHA.
7. **Close.** Drain the final inbox, reconcile every launched child to a terminal row (done, failed, cancelled), confirm the predicate on the real artifact, confirm every landed PR has a verdict for its current head SHA, audit the trail per the **show-me-your-work** skill including its cross-model review, encode recurring corrections into `preferences.md` or the brief template. Leave the store intact. It is the postmortem.

#### Queue and drain

- On a delivered result, append its row to `inbox.tsv` (child name, unit, status, report pointer) and return to what you were doing. Never deep-review inline. A completion that needs review becomes a verifier unit. Never review a diff inside a drain.
- Drain in batches at four points: the end of a critical section, a track rollup, a frontier watcher's delivery, and before a human report. The frontier watcher is the one-shot watcher child of `references/fan-out.md` section 6, re-armed after each wave. Nothing else wakes you. Begin each batch by reading the inbox rows since the last drain. Arrivals during a drain wait for the next one.
- Critical sections you finish first: authoring a brief, a stack operation, a conflict decision, writing a gate, updating the ledger or frontier.
- Each drain classifies every inbox row (landed, needs-verify, failed, cancelled, noise), appends the resulting rows to `units.tsv` and `ledger.tsv`, regenerates `status.md`, then launches the next wave in one turn.
- Account for every launched child at its track's rollup: delivered, replaced, or its scope explicitly absorbed, on the checklist that `references/fan-out.md` requires. Silently redoing a missing child's work hides both the wasted spend and the coverage gap its result existed to close.
- A drain turn ends with three lines from `status.md`: counts against the states, what changed, gates open. Detail lives in `status.md`. The full reply contract applies at checkpoints and close.

#### Stack safety

- The frontier is a computed object, never narrative. Recompute it from `gh` after every merge and stack mutation. For each open program PR, read `gh pr view <pr> --json number,headRefName,headRefOid,baseRefName,state,mergedAt`, then follow `baseRefName` from trunk upward. Record the ordered PR list, branch names, head SHAs, a generation number, and the lowest unmerged PR. GitHub base refs can drift mid-rebase, so a chain that does not connect back to trunk is broken. Report it rather than guessing.
- Exactly one stacker per stack may rebase or retarget it, serialized within its stack. Record that role in the standing orders.
- Workers never rebase. Babysitters follow `playbooks/babysit.md`, one per stack, scoped to one frontier generation. They report conflicts to the stacker rather than rebasing.
- PR closes and retargets go through the stacker only, under the grants that name them. Closing a base PR orphans every chain above it. Merges and stack surgery are units with briefs like any other.
- After each merge wave, a fresh retro child reads the merged PRs for reverts, post-merge CI breaks, and orphaned follow-ups.

#### Verification

Scale verification to the unit. When VERIFY is a single cheap command, the worker runs it and reports the output, and the coordinator spot-checks receipts. A dedicated verifier agent (on a different model family than the worker) is for units whose verification is expensive, judgment-laden, or high-blast-radius. A verifier agent whose entire product would be rerunning one command is ceremony, not verification.

`ledger.tsv` gets one appended row per verdict, keyed by PR number plus head SHA: `live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`. The current verdict for a PR is the latest row for its current head SHA. CI green is an input to a verdict, not a verdict. Behavioral work needs better than `type-check-only`. `verifier-blocked` is not a pass. Launch a fresh verifier when the environment heals. `verifier-failed` gets a fix unit, not a re-verify. A worker may self-report. A verifier's later row overrides it on the same key. A new head SHA voids the row, so re-verify after a rebase. The ledger answers "was this verified", not memory and not the transcript.

A unit is not done until its output is externalized the moment it lands, never batched to the end of the run. A worker commits on its branch and pushes it under the push grant, a verifier's verdict becomes a ledger row, and receipts land in the store. Work that exists only in a child's session was never done.

#### Liveness and failure

- Never resume or message a child to check on it. Judge it read-only by side effects: the ledger, `units.tsv`, `gh`, pushed branches, `worktree_list`. Transcript mtime is not liveness.
- A stall or no-progress advisory gets one `subagent_cancel` and, if the work is still needed, one fresh replacement with consolidated scope, per `references/fan-out.md` section 4.
- A failed or empty result gets a synthetic postmortem row in the inbox (unit, failure mode, last evidence, options). Replan on evidence as it arrives. Never wait for full quiescence.
- Retry by mode: cap-hit or oom, launch fresh with smaller scope. Network-drop, retry as-is. Tool-error, retry on a different model. Unknown, retry once. Two retries, then abandon the unit and replan around it.
- A result that arrives after you replaced its child reconciles against the current frontier and ledger before anything is accepted. Salvage unique findings through a fresh unit, never a blind merge.
- When continued launching would produce garbage program-wide (bad upstream output, broken acceptance, dead infra), write a stop line at the top of the standing orders, let in-flight work finish or cancel it, fix the cause, clear it.
- Bound your own infra retries the same way you bound a child's. After a few consecutive tool aborts, stop retrying. Write a terminal handoff per `playbooks/pause-safely.md` (what is done, where it lives, the exact resume step) and end the run.
- When this session ends or restarts, the program pauses, and nothing runs it in between. Resume with `playbooks/session-pickup.md`: re-read the standing orders and the store tables, recompute the frontier from `gh`, check `worktree_list` for retained worktrees, and reattach work by PR and branch, never by child name. Launch fresh children with consolidated scope for anything unfinished.

#### Escalation

Reaches the human, batched into the status page rather than per item: every external action no grant names yet (pushes, force-push to shared branches, PR creation or closing, merges, deploys, deletions), genuine product or preference calls no experiment settles, a standing order that contradicts observed reality, a program-level dead end that survived a replan. Park each as a `gates.md` entry before asking, and route work around it.

Never reaches the human: frontier nudges, rebase mechanics inside a granted stack, child retries, CI flake triage, review-thread triage, format fixes, scope the brief already forbids (refuse and continue), and "should I keep going". When in doubt about reversible work, act and log.

Mid-run discoveries fix only what blocks the frontier. Everything else parks in follow-ups. At this fan-out a small scope leak multiplies into PRs nobody asked for.

**Reply:** at checkpoints and close: the predicate and the count against it from `units.tsv` and `ledger.tsv`, tracks and what each landed, the frontier (PR list plus SHAs), verdicts summary, what was abandoned and why, gates awaiting the human (the only asks), the grants used, the store path, and the trail path. Numbers from the tables, not narrative. Include PR links.
