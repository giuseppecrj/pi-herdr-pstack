# Wave 4 execution contract

Status: **approved by the user on 2026-10-06.** Decisions: autopilot-full and autopilot-stack ship scoped down (D1); orchestrate ships as the depth-1 single-session coordinator (D2); no timers (D3); `make-bot-ui` is re-authored for Pi as a loopback-bound local page that starts a Pi run (D4); `gh` only (D5); watcher-child wait semantics (D6); no live-model evaluation without further authorization (D7); deterministic `gh` stub for forge evidence (D8); implementation may start (D9). Routine calls are in [the notes](./14-wave4-notes.md). Pushes, PRs and merges of the result still need the user. This contract follows the style of `12-wave3-contract.md`. It inherits AGENTS.md, plan 09 (no `poteto` role), plan 10 (unconditional writer gate) and the W3 edit-class rules unchanged.

## Accepted inputs (proposed I3 vector)

| Component | Revision |
| pstack `main` | `b82bcfd` (docs only: the AGENTS.md scope line and a status note) on top of `1cbf75f` (merge of W3 PR #3). Its `skills/`, `test/`, `pi-extension/`, `package.json`, inventory and provenance are byte-identical to the W3 candidate `d611b6a` |
| host `pi-herdr-agents` `main` | `7d35371` (public `subagent`, `subagent_cancel`, `subagent_interrupt`, `subagent_resume`, `subagent_send`/`subagent_stop`, parent-only `worktree_list`/`worktree_remove`, child `caller_ping`) |
| roles `pi-herdr-roles` `main` | `3b75aa4` (unchanged, not a dependency) |
| Pi CLI / pack SDK | 1.0.3 (the installed CLI documents `PI_SESSION_FILE` for the bash tool, per-cwd session storage, MCP support, and no `/loop`). Host `node_modules` holds a stale 0.84 SDK, so it is not evidence |
| Mimir source | `casualjim/pi-mimir` `f07dd981…`, `packages/pi-pstack/skills` |
| Cursor source | `cursor/plugins` `2cbf5850…`, `pstack/skills` |

## Exact scope

There are 14 inventory rows still `planned`, 11 playbooks listed under `planned` in `test/fixtures/skill-provenance/w2.json`, and 20 script files under `excluded`. Every file below exists at the pinned commits, and `git ls-files` lists no others. "Copy" means the file needs none of the W3 edit classes, judged by a scan of the pinned bytes. The writer confirms each case.

### W4-A: 8 rows, 33 files, all with Mimir as primary source

| Row | Source files | Disposition and non-portable content |
| `how` | `SKILL.md`, `references/{explainer-prompt,explorer-prompt}.md` | SKILL adapted (`agent: poteto-agent`, `inherit-parent`, "configured how-explorer model"); 2 references copy |
| `why` | `SKILL.md`, `references/{epistemics,investigator-prompt,source-playbook,synthesizer-prompt}.md`, `references/sources/{code-archaeology,databricks,datadog,incident-postmortem,linear,notion,sentry,slack}.md` | SKILL adapted (same APIs; MCP-capable children); `source-playbook`, `synthesizer-prompt` adapted (relative links); 10 copy |
| `architect` | `SKILL.md`, `references/{design-red-flags,rationale-template,runner-prompt}.md` | SKILL, template and runner prompt adapted (relative links, short principle names, `inherit-parent`); red-flags copy |
| `arena` | `SKILL.md` | adapted (`inherit-parent`, model-name-prefix family rule, "todolist") |
| `swarm` | `SKILL.md` | adapted (parallel `tasks` array, `role`, `agent: poteto-agent`, cloud workers, `cloud_base_branch`) |
| `interrogate` | `SKILL.md`, `references/{code-quality-review,lead-judgment,reviewer-prompt,rubric}.md` | SKILL adapted (`poteto-agent`, alias table, "open a separate PR to update the default table"); 4 copy |
| `reflect` | `SKILL.md`, `references/{divergent-reviewer,judgment-reviewer,synthesizer,tooling-reviewer}.md` | SKILL adapted (`tasks`/`role`, `recall` tool, automatic backlog filing, "Pi Agent Skills standard" loops); 4 copy |
| `figure-it-out` | `SKILL.md` | adapted (short principle names, todolist) |

### W4-B: 6 rows, 11 files, Mimir primary except `make-bot-ui`

| Row | Source files | Disposition and non-portable content |
| `automate-me` | `SKILL.md` | adapted (`recall` tool, "a user question", "Pi Agent Skills standard", PR landing) |
| `recall` | `SKILL.md` | adapted (`recall` tool, sweep via the **why** investigators) |
| `show-me-your-work` | `SKILL.md`, `references/decision-log-template.tsv`, `scripts/log.sh` (mode 100755) | SKILL adapted (`recall` tool, short names); TSV and **script** copy, executable bit preserved |
| `create-verification-skill` | `SKILL.md`, `references/feature-map-example/{README,create-note,search}.md` | SKILL and README adapted (relative links); 2 copy |
| `maintain-verification-skill` | `SKILL.md` | copy candidate (generic fan-out, `/skill:` references to a sibling that ships in the same batch) |
| `make-bot-ui` | Cursor `SKILL.md` only | **not portable** (Grok Bot routines, `update_state`, `SendToUser` secret request, `api2.cursor.sh`, Cmd+Shift+I panel). Frontmatter `name: Make Bot UI` is invalid for Pi and becomes `make-bot-ui`. Disposition is decision D4 |

### W4-P: 11 playbooks and 1 script under `skills/poteto-mode/`

All of them are adapted. Each has at least one of: short principle names, `inherit-parent`, `/loop`, `omp`, `orch`, `gt`, `recall` tool, repo-root `pstack/skills/…` or `packages/pi-pstack/…` paths, or W4 references.

`playbooks/{hillclimb,eval,visual-parity,authoring-a-skill,babysit,shipping,autopilot-full,autopilot-stack,multi-phase-plan,orchestrate,worktree-cleanup}.md`, and `scripts/check-plan.mjs` (Node, no dependencies, mode 100644). The script is adapted with the multi-phase-plan skeleton because it enforces the `/loop 1h` and `git show origin/main:` markers.

**Scripts that stay excluded**, with dispositions updated to name their replacement: `scripts/orch/*` (3 files; duplicate ledger and scheduler), `scripts/watch-pr/*` (11 files; replaced by the watcher child below), `scripts/worktree-audit.sh` (replaced by `worktree_list`/`worktree_remove`), `scripts/{bootstrap.ts,bun.lock,package.json}` (runtime installer and Bun pins).

Totals if D4 ships `make-bot-ui`: 33 + 11 + 12 = **56 new files** (26 copies). Add one new file, `skills/poteto-mode/references/fan-out.md`, giving 57. The packed skill files rise from 56 to 113.

## What an honest Pi port means

Pstack may use only the public host surface:

- **Launch.** Bare `subagent` with `name`, `task`, `systemPrompt`, `model`, `thinking`, `tools`, `cwd`, `fork: false` and an optional `worktree`. There is no `agent` key anywhere in pstack.
- **Results.** Automatic result delivery, including the child's `Session:` path.
- **Liveness.** Host stall and `no-progress advisory` wakes.
- **Control.** `subagent_cancel` and `subagent_interrupt`, and `caller_ping` from a child.
- **Worktrees.** Retained worktrees, inspected with `worktree_list` and removed only with `worktree_remove`.
- **Session files.** `$PI_SESSION_FILE` in bash, plus the per-cwd session directory rule already written in `playbooks/session-pickup.md`.

There is no scheduler, timer, durable ledger, cloud worker, parallel `tasks` array or child-side wait. Bare children auto-exit once their turn settles, per `subagent-done.ts:251-316` (code reading only; gate G7 proves it).

C0 freezes one shared protocol in `references/fan-out.md`, so both batches and the playbooks cite it instead of restating it:

1. **Fan-out lives in the parent session only.** Every fan-out skill (`how`, `why`, `arena`, `swarm`, `interrogate`, `reflect`, `recall`, `automate-me`, `maintain-verification-skill`) launches its N children as N independent `subagent` calls in one turn, then ends the turn.
   - The parent keeps a visible checklist of the expected child names. It synthesizes only after every name has a terminal result: delivered, failed, or cancelled and recorded as a dropout.
   - A child that receives a fan-out skill uses the skill's single-pass path itself. This applies to the comment-sicko delegate and to hillclimb and autopilot delegates. A child never spawns unless its brief names the delegation. Pi has no todo tool, so "todolist" becomes a visible checklist.
2. **Prompts.** A fixed reference prompt goes verbatim in `systemPrompt` with `fork: false`. Examples: architect `runner-prompt.md`, interrogate `reviewer-prompt.md` and the reflect reviewers. A template with placeholders is filled into `task`, and `systemPrompt` carries the matching Investigator, Reviewer or Verifier prompt from `references/delegation.md`. Examples: the how explorer and explainer, the why investigator and synthesizer.
3. **Models.**
   - Ordinary seats use task categories. Explorers and investigators use `task:recon`, reviewers and judges `task:review`, design runners `task:architecture`, code candidates `task:coding`, and verifiers `task:qa`.
   - Seats whose value is model diversity use exact authenticated `provider/model-id` picks of distinct families from the live catalog. These are arena and architect runners, interrogate reviewers, the cross-judge, and the show-me-your-work trail reviewer.
   - Fewer families than seats means fewer seats, or same-family seats that are disclosed as context-isolated. A cross-family gate then reports itself incomplete.
   - Delete `inherit-parent`, the per-skill "configured X model" lines (setup writes only task categories), the `claude-*`/`gpt-*`/`grok-*` prefix fallback, and "open a PR to update the default table".
4. **Dropouts and stalls.** A failed child means proceeding with N−1 and recording it. A no-progress advisory gets one `subagent_cancel` and, if still needed, one fresh replacement with consolidated scope. Never poll, sleep or tail.
5. **Writers.** Code candidates and parallel writers each get a `worktree` branch from committed HEAD. Results are retained handoffs, and removal falls under `references/authorization.md`.
6. **Watcher child (the only wait primitive).** A bare child with `tools: "read, bash"` runs one bounded, blocking external wait and returns a summary, and its delivery wakes the parent. Examples: `gh pr checks <pr> --watch`, `gh run watch <id> --exit-status`. The parent re-arms it explicitly after each wave. It is one-shot, never a sleep loop or a timer, and nothing in pstack schedules it.
7. **Help and stop.** A child that hits an authorization boundary uses `caller_ping`, never a guess. An operator "stop" or "hold" means `subagent_cancel` on every running child and no new spawns. "Release" means fresh children with consolidated scope.

### Per-workflow fidelity

| Workflow | Pi port | Fidelity |
| how, why, architect, arena, swarm, interrogate, reflect, figure-it-out, recall, automate-me, show-me-your-work, create/maintain-verification-skill | Protocol above. `why` investigators get no `tools` key so MCP stays visible (gate G5); if a child cannot see MCP, report source control only and name the gaps. `reflect`/`show-me-your-work`/`recall`/`automate-me` read `$PI_SESSION_FILE` and the per-cwd session directory, never another project | **Faithful** |
| hillclimb, eval, visual-parity, authoring-a-skill, multi-phase-plan (authoring the plan only) | Delegate completions are the wake; eval reads the delivered `Session:` path; "Pi Agent Skills standard" becomes Pi's skills documentation plus the authoring playbook; check-plan adapted | **Faithful** without timers |
| babysit, shipping | GitHub through `gh` only (D5). `check` and `threads-only` are faithful. `drive`/`background` use the watcher child. `watch-pr` verdicts (`READY`, `WAITING`, `ADVANCE`, `COMPLETE`) become stated `gh` field conditions. Replies, verdict comments, pushes, arming and merges each need explicit authorization | **Scoped down** (D5, D6) |
| autopilot-full, autopilot-stack | Root-run program. An "owner" is a role whose rounds (build, fix, rebase, merge-prep) are successive fresh leaf children, as the hub's Fresh-subagents rule already says. The root runs verification swarms and watchers. The hourly `/loop 1h` tick becomes an audit at every delivery and advisory, or on operator request. "Full-autonomy grant is merge authorization" becomes an explicit grant naming push, PR and merge | **Scoped down** (D1) |
| orchestrate | Depth-1, single-session coordinator. Its store is plain files maintained by hand under show-me-your-work append-only rules, with a rolling window of leaf children and the frontier from `gh` PR bases. It has no `orch`, `gt`, cloud, sub-coordinators, nesting-to-depth-3, multi-day unattended run or restart reattachment by agent ID | **Scoped down or deferred** (D2) |
| worktree-cleanup | `worktree_list` inventory; per-path `worktree_remove` or `git worktree remove` only with explicit authorization; transcript checks limited to this cwd's sessions; Cursor "pinned chats/sidebar" becomes asking the user; simulators and caches only on macOS with `xcrun` present and per-item authorization | **Faithful core**, platform steps conditional |
| make-bot-ui | See D4 | **No equivalent** |

**Prose claims that must be removed** (the content test bans them):

- Runner and model leftovers: `poteto-agent`, `inherit-parent`, parallel `tasks`/`role`, `cloud_base_branch`, and the "cloud workers / restacks run in cloud" wording.
- Removed loops and engines: `/loop`, `omp` with its `github` tool, `run_watch` and `pr://`, every `orch` command and store lock, `watch-pr`, and `worktree-audit.sh`.
- Missing tools and paths: the "`recall` tool", "the agent's store (path in the system prompt)", repo-root `pstack/skills/…` and `git show origin/main:packages/pi-pstack/…`, "todolist", "a user question", and the "Pi Agent Skills standard … loop".
- False host claims: "nesting works to depth 3", "Pi subagents … cannot be resumed" (`subagent_resume` exists, but fresh is preferred), and "after a Pi restart local agents are dead" (not established).
- Unauthorized external actions: automatic backlog filing, verdict comments without authorization, and "full autonomy authorizes merges".
- Cursor-only references: Cmd+Shift+I, `update_state`, `SendToUser`, `api2.cursor.sh`, pinned chats and the sidebar.

## Retiring the 93 tuples and `(planned W4)` rules

The current fixture has 93 tuples: 48 to W4-A, 15 to W4-B and 30 to W4 playbooks. By source file, 42 are in `hub.json`, 5 in `w3-a.json` and 46 in `w3-b.json`; poteto-help alone accounts for 39. Shipped files carry `planned W4` on 103 lines (118 occurrences) and 41 `Until … ship(s)` clauses.

1. **Retirement happens on ship, in the reconcile commit only.** That commit removes every tuple targeting a shipped row or playbook, removes `planned W4` from each line, and deletes or rewrites each interim clause: hub lines 21–51 and 144–169, the base playbooks, `bugbot-triage.md`, `setup-pstack` line 46, and the poteto-help routing rows. Each of those then names the real behavior, including its scope-down limits. `w2.json` `planned` entries move to `files`. Inventory rows flip to `shipped`.
2. **Changed W3 bytes.** `comment-sicko.md`, `no-comments`, `teach`, `blast-radius`, `benchmark-checklist` and `principle-prove-it-works` change. Their provenance hashes are recomputed, and the comment-sicko real-child gate reruns (G8).
3. **New tuples.** These are exact `{sourcePath, targetPath, owningWave}` tuples, recomputed by the test.
   - Cross-batch tuples live on batch branches only: `figure-it-out`→`show-me-your-work`, `recall`→`why`, `reflect`/`automate-me`→`playbooks/authoring-a-skill.md`, and the playbooks→A/B skills. They retire at integration.
   - Same-batch cycles need no tuples: `create-verification-skill`⇄`maintain-verification-skill`, `babysit`⇄`shipping`, and `architect`→`how`/`why`/`arena`/`interrogate`.
4. **Deferred items.** Anything D1, D2 or D4 defers keeps its tuples with `owningWave: "W5"` and a `planned W5` marker on the same line. The test learns W5 at C0. The W4 gate then lists them by tuple. The W5 gate allows none.

**Order inside batches.**

- W4-A: `arena`, `swarm`, `interrogate`, `how`, `why`, `architect`, `reflect`, `figure-it-out`.
- W4-B: `show-me-your-work` first, because figure-it-out, hillclimb and the autopilots cite it. Then `recall`, `automate-me`, `create-verification-skill`, `maintain-verification-skill`, `make-bot-ui`.
- Playbooks depend only on `fan-out.md` and the A/B names, so they can start from C0.

## Ownership, parallelism and review

| Step | Writer | Owns exclusively | Base / output |
| C0 checkpoint | parent | this contract and the AGENTS.md scope line (it still says W4 implementation is not authorized); `references/fan-out.md` plus a pointer from `delegation.md`; test generalization; fixture split; W5 owning-wave support; script mode/shebang checks; banned-pattern additions; inventory encoding of D4 | `wave4/integration` from `b82bcfd`; check stays 119/119 |
| W4-A | worker 1, worktree `wave4/engineering` from C0 | `skills/{how,why,architect,arena,swarm,interrogate,reflect,figure-it-out}/**`, `fixtures/*/w4-a.json` | commits on branch |
| W4-B, then W4-P | worker 2, worktree `wave4/capabilities` from C0, sequential | `skills/{automate-me,recall,show-me-your-work,create-verification-skill,maintain-verification-skill,make-bot-ui}/**`, then `skills/poteto-mode/playbooks/<11>.md` and `scripts/check-plan.mjs`; `fixtures/*/w4-b.json`, `w4-p.json` | commits on branch |
| Integrate | parent | merges and per-batch review only | `wave4/integration` |
| Reconcile | one fresh writer after A, B and P integrate | hub, `references/*`, `setup-pstack`, `poteto-help`, the six W3 files above, `hub.json`/`w2.json`/`w3-*.json`, inventory flips | single commit series |

There are at most two writers at any time. Workers do not edit the hub, extension, manifest, inventory, shared tests, docs or notices; they propose that text in their reports. Workers run only `npm run check` with `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE` and `PI_HERDR_AGENTS_SOURCE` set. They do no Herdr runs, paid model calls, spawning, pushing or merging. Reports follow the 03 §7 template with exact SHAs.

**Review.** One fresh read-only review per batch (A, B, P, Reconcile), each by an exact model from a different provider and family than the author, chosen from the live catalog at launch, plus a final synthesis review of the assembled vector. Each reviewer gets the pinned sources, this contract, `fan-out.md` and the edit-class rules. It checks every adapted file against its primary source and the fidelity table, and spot-checks copy hashes. Missing reviewer capacity leaves the gate incomplete.

**Content tests to add at C0** (later steps change fixtures, not assertions):

- Every `json subagent` example is schema-valid at `7d35371`.
- Every example with `systemPrompt` has `fork: false`.
- `why` investigator examples omit `tools`.
- No example sets `persistent`.
- Shipped scripts have a shebang and the source mode; `log.sh` stays 100755.
- Unit tests cover `log.sh` (header on first use, tab and newline stripping, formula prefix) and `check-plan.mjs` (the adapted skeleton passes, a mutated one fails).
- The extended banned list above.
- `make-bot-ui` loads with zero diagnostics.

**Parent QA** runs on the reconciled candidate only, one Herdr suite at a time, with a deterministic provider, isolated outer and child `PI_CODING_AGENT_DIR`, and test-owned HOME and XDG directories.

1. `npm run check` with no skips, `npm pack --dry-run`, `git diff --check`, and LSP on changed TS (Herdr not needed).
2. Real-Herdr host-mechanics gates. These are deterministic and provider-scripted. They prove host mechanics, not model obedience.
   - **G1. Fan-out.** Three bare children launched in one turn, each with a different reference prompt, get one initial message and three deliveries. The parent makes no polling call. The synthesizer launches after the third delivery.
   - **G2. Dropout and cancel.** One child fails and one is cancelled. Each produces exactly one terminal result, and the others are unaffected.
   - **G3. Candidate worktrees.** These come from committed HEAD and are retained. `worktree_list` shows them, and `worktree_remove` is refused while a child is live.
   - **G4. Watcher child.** A stub `gh` on PATH blocks and then returns, and the delivery wakes the parent. The advisories raised during the blocked tool are recorded.
   - **G5. Child MCP visibility.** A test-owned stub MCP server is checked with and without `tools`. If no stub is feasible, the gate is reported incomplete.
   - **G6. `caller_ping` round trip.**
   - **G7. Nesting.** A bare child spawns a grandchild and ends its turn. Expected: the child exits first, which confirms the leaf rule.
   - **G8. comment-sicko gate rerun.**
3. Combined host integration regression `pi-herdr-agents@7d35371 npm run test:integration` with roles and pstack loaded. The baseline is 77/77, and the extension load path is unchanged.

Keep every failure log, and distinguish skipped checks from passed ones. The following can only be judged by live models and **do not run without the user's authorization** (D7):

- whether models follow the fan-out protocol;
- picking families from the catalog;
- MCP category mapping;
- arena graft quality and interrogate calibration;
- reflect routing and eval blinding;
- babysit triage and shipping or autopilot behavior against a real forge, which also needs a sandbox repository (D8);
- the full run of `create-verification-skill` and `maintain-verification-skill`;
- the end-to-end `make-bot-ui` run.

## Exit gate

The W4 handoff records:

- the I4 vector, with host, roles and pstack SHAs, the Pi version and fixture digests;
- the 14 rows and 11 playbooks shipped, or the user-approved W5 deferrals listed by tuple;
- script dispositions;
- G1–G8 and regression results, with evidence under `docs/evidence/wave4-gates/`;
- review identities and findings;
- the fidelity table as shipped, open risks, and rollback to I3 (`b82bcfd`).

Stop for the human W4 gate. W5 (full-inventory release candidate) is not authorized.

## Non-goals

- No live-model or paid evaluations without the user. A scripted provider is not evidence that a model obeys the prose.
- No new runtime features in pstack: no scheduler, timer, ledger CLI, watcher script, catalog probe, MCP probe, or mode, setup or writer-gate change. There is no extension change.
- No host change. The undocumented `systemPrompt` channel and auto-exit facts are follow-ups for the host repository, outside this wave.
- No Origin, Graphite, cloud workers or the omp `github` tool unless D5 keeps Origin.
- No pushes, PRs, merges, publication, version bumps, normal Pi install or config changes, or global skill copies. Each needs the user.
- No renaming or prefixing skills, named roles, registered role directories, or dependency on pi-herdr-roles.
