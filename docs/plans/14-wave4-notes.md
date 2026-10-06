# Wave 4 planning notes: decisions and contradictions

Read-only planning. No repository was edited, and no installation, Herdr session, child agent or model call took place. Inputs:

- pstack `main` `1cbf75f`, with product files identical to `wave3/integration` `d611b6a` (checked with `git diff --stat`). During planning, `main` advanced to `b82bcfd`, a docs-only commit that changes the AGENTS.md scope line and a status note. The contract pins `b82bcfd`;
- host `7d35371`;
- roles `3b75aa4`;
- Mimir `f07dd981`, Cursor `2cbf5850`;
- the installed Pi 1.0.3 docs at `~/.local/share/mise/installs/pi/1.0.3/pi/docs`.

## Source facts checked

- **Inventory and fixtures.** The 14 planned rows' `sourceFiles` match `git ls-files` in both trees. The 93 tuples split 48 W4-A, 15 W4-B and 30 playbook. By fixture file, they are `hub.json` 42, `w3-a.json` 5 and `w3-b.json` 46.
- **Mimir and Cursor differences.** Every W4 `SKILL.md` and every W4 playbook differs between the two trees. Cursor uses `Task`, `pstack-models.mdc` and concrete model slugs. Mimir uses `poteto-agent`, `inherit-parent` and parallel `tasks`/`role`. The references and scripts are byte-identical, except reflect's four reviewer prompts and four `scripts/` files (`package.json`, `watch-pr/github{,.test}.ts`, `worktree-audit.sh`). `make-bot-ui` exists in Cursor only.
- **W4 dependency edges** (excluding the "`recall` tool" mentions):
  - `why`→`how`
  - `architect`→`how`,`why`,`arena`,`interrogate`
  - `figure-it-out`→`architect`,`arena`,`show-me-your-work`
  - `recall`→`why`,`automate-me`
  - `create`⇄`maintain-verification-skill`
  - playbooks→`how`,`arena`,`swarm`,`interrogate`,`show-me-your-work`
  - `babysit`⇄`shipping`
  - autopilots→`babysit`,`shipping`
  - `multi-phase-plan`→four playbooks
  
  There is no cycle across batches. The cross-batch edges are `figure-it-out`→`show-me-your-work`, `recall`→`why`, and playbooks→A/B.
- **Host facts at `7d35371`.**
  - Bare children auto-exit at `agent_settled` (`subagent-done.ts:251-316`).
  - Children still receive the `subagent` tool, because only `spawning: false` roles deny it.
  - Results carry `Session: <file>`.
  - No-progress advisories classify a long tool as `blocked-tool`.
  - `worktree_list` and `worktree_remove` are registered only in parent sessions.
  - There is no depth limit, scheduler or timer.
- **Pi 1.0.3 facts.** `PI_SESSION_FILE` exists in the bash tool environment only. Sessions are stored per cwd under `~/.pi/agent/sessions/`. MCP servers come from `mcp.json`. There is no `/loop` and no `recall` tool. Skill names must be lowercase and hyphenated.

## Contradictions with the inventory, plans or brief

1. **The `poteto-mode` row says `shipped` while 11 playbooks and 20 script files are still `planned` or `excluded`.** Row status cannot express a partly shipped row. W4 closes this. Until then, "37 of 51 shipped" overstates the hub row.
2. **Plan 03's W4 partition (A: 8 rows, B: 6) omits the 11 playbooks and `check-plan.mjs`.** These are methodology files owned by the hub, and 30 of the 93 tuples point at them. This draft adds W4-P, written by worker 2 after W4-B, so the two-writer cap holds.
3. **"Mimir is the Pi fork" does not make its W4 files Pi-ready.** They still use `poteto-agent`, `inherit-parent`, `tasks`/`role`, cloud workers, `/loop`, `omp`, `orch`, `gt`, a `recall` tool, and "your configured X model" lines that `/setup-pstack` never writes. Only 26 of 56 files can be copied.
4. **The `recall` tool does not exist.** reflect, show-me-your-work, automate-me, recall, eval and orchestrate tell the agent to use it. Its name also collides with the `recall` skill. The replacement is the per-cwd session rule already in `session-pickup.md`.
5. **Nesting and long-lived children conflict with the host.**
   - Orchestrate claims "nesting works to depth 3" and relies on sub-coordinators.
   - Autopilot owners spawn their own subagents and run babysit loops.
   - A bare auto-exit child cannot wait for its own children. This is code reading and still unproven, so gate G7 tests it.
   - The hub already says children are leaves and that a role outlives its agent. The scoped-down port follows the hub.
6. **Autopilot-full's merge authority conflicts with `references/authorization.md`.** Autopilot-full says the operator's full-autonomy grant plus the root's verdict authorizes merges. `references/authorization.md` says a grant authorizes nothing it does not name.
7. **Orchestrate says Pi subagents cannot be resumed.** The host ships `subagent_resume`. The hub's preference for fresh children still holds.
8. **Worktree-cleanup scope.** The W2 excluded-script disposition promises `worktree_list` and `worktree_remove`. Those tools see only managed worktrees, in parent sessions. Upstream also prunes unmanaged git worktrees, iOS simulators and IDE caches, and it relies on Cursor's pinned chats and sidebar.
9. **`check-plan.mjs` and the shipped-file ban.** The script enforces `/loop 1h` and `git show origin/main:`, which the shipped-file ban list rejects. The multi-phase-plan skeleton also uses stale repository-root paths, as the format audit noted. The script and the skeleton change together.
10. **`make-bot-ui` has nothing in Pi to adapt.** It is a Cursor Grok Bot feature, and its name is invalid in Pi. A port is new authoring, not adaptation, like `poteto-help` in W3.
11. **Upstream prose prescribes external actions that `authorization.md` gates.** Examples: "open a separate PR to update the default table" (interrogate), automatic backlog filing (reflect), "posts that verdict on its own PR" (shipping), and force-push publishing (autopilots).
12. **The W3 contract predicted at most 39 new W4 tuples from W3 files.** 51 were recorded, mostly from poteto-help. This is harmless, but the handoff's "42 + new" now resolves to 93.
13. **Cursor content Mimir lacks.** Cursor's `swarm` adds one sentence ("A worker that can prove a defect reports ISSUES and lists every issue it can prove"). Under the W3 precedent the primary source is Mimir, so taking that sentence is a reviewer note, not a silent merge.
14. **Herdr pane lifetime is undocumented.** Upstream orchestrate claims local agents die on restart. Pstack must not repeat it.

## Decisions for the user

- **D1. Autopilot-full and autopilot-stack.**
  - Recommended: the scoped-down Pi port. The root runs the program. Owner rounds are fresh leaf children. Audits happen at each delivery or advisory and on request; there is no hourly tick. Push, PR creation and merge need an explicit grant that names each action.
  - Alternative: defer both to W5, pending a host wake or scheduling capability scoped separately.
- **D2. Orchestrate.**
  - Recommended: a depth-1, single-session coordinator. Its store is plain files maintained by hand, its frontier comes from `gh` PR bases, and it has no `orch`, `gt`, cloud or sub-coordinators. It states plainly that it is not a multi-day unattended runner.
  - Alternative: keep it `planned W5`, with its hub tuples carried forward.
- **D3. Timed cadence.** Confirm that pstack ships no timer and drops every `/loop 1h` tick. Optionally, it could mention a user-installed loop extension as an external capability, which is not recommended. Without a timer, nothing prompts an audit while no child completes.
- **D4. `make-bot-ui`.**
  - Recommended: Pi re-authoring with the name `make-bot-ui`. A local page posts to a local server, and that server starts a Pi run (`pi -p` or RPC) with the POST body as untrusted data. The key lives in a local file, never in chat. The bind defaults to loopback. Tailscale exposure and installation happen only with explicit authorization. The status is "adapted, Cursor primary, substantially rewritten".
  - Alternative: a user-approved exclusion, with a new inventory status, which would be the only change to the 51-row target.
- **D5. Forge scope.**
  - Recommended: `gh` only. Drop Origin (`origin pr …`), which cannot be tested here, and the omp `github` tool. Graphite stays never-required, and orchestrate's `gt` frontier becomes `gh` PR bases.
  - Alternative: keep Origin as a detected, untested optional branch.
- **D6. Babysit and shipping wait semantics.** Approve replacing the `watch-pr` verdicts and queued-stack event stream with the one-shot watcher child and stated `gh` field conditions. Queued merge-queue mode becomes "report state and stop".
- **D7. Live-model evaluation.** None by default. Optionally authorize bounded, priced runs per workflow family, listed in the contract's live-only list.
- **D8. Forge evidence.** Recommended: a deterministic `gh` stub only. The alternative is a throwaway GitHub repository, which needs push, PR and merge authority.
- **D9. Authority.** Approve this contract before C0. Pushes, PRs and merges of the W4 result stay with the user afterwards.

## Parent decisions (routine, taken in this draft)

- **Batching.** C0, then W4-A (worker 1) in parallel with W4-B followed by W4-P (worker 2), then a single reconcile writer. Fixtures are split per owner (`w4-a`, `w4-b`, `w4-p`).
- **Shared protocol.** `references/fan-out.md` is written at C0 as a new methodology file. Batches cite it and do not restate it.
- **Prompt placement.** Fixed prompts go in `systemPrompt` with `fork: false`. Filled templates go in `task`, with the delegation.md Investigator, Reviewer or Verifier prompt as `systemPrompt`.
- **Model mapping.** Ordinary seats use the task categories. Diversity seats use exact distinct-family picks from the live catalog. When families run short, the run uses fewer seats or same-family seats disclosed as context-isolated; cross-family gates then report incomplete.
- **Leaf rule.** A child uses the single-pass path of any fan-out skill and never spawns unless its brief says so. This covers the comment-sicko delegate once `/skill:how` ships.
- **`why` investigators** launch without `tools` so MCP stays visible, depending on G5. If MCP is not visible, report source control only and name the gaps.
- **Script dispositions.** Ship `log.sh` (copied, 100755) and `check-plan.mjs` (adapted, with tests). Keep `orch`, `watch-pr`, `worktree-audit.sh` and the bootstrap files excluded, and update their dispositions to name the replacements.
- **Global skill writes.** `automate-me` and `create-verification-skill` write project `.pi/skills/` freely. Writing `~/.pi/agent/skills/` needs explicit confirmation.
- **Retirement.** The reconcile commit retires all shipped tuples and interim clauses, recomputes the six changed W3 hashes and reruns G8. Deferred items carry `planned W5` tuples.
- **Gates and review.** Real-Herdr gates G1–G8 plus the 77/77 regression run serially. Each batch gets one cross-family review, and the assembled vector gets a synthesis review.
- **Unchanged wording.** Keep Mimir wording where both sources agree. Cursor additions (contradiction 13) are noted for the reviewer and not merged silently.

## Risks to watch

- G4 may show that the host raises repeated `blocked-tool` advisories for a long `gh --watch`. The watcher then needs a stated time bound per arm, for example `--interval` and a step-level cap.
- G5 may show that children cannot see MCP servers, which turns `why` and `recall` into source-control-only workflows.
- G7 may show that a child does survive to receive a grandchild's result. The leaf rule stays, because it is simpler and the hub already requires it.
- Scoped-down workflows (D1, D2, D6) can read as complete. Their hub routes and poteto-help rows must state the limits.

## Parent decisions (routine calls, taken 2026-10-06)

- D3: pstack ships no timer; every `/loop 1h` tick is dropped; no mention of external loop extensions.
- D5: `gh` only. Origin and the omp `github` tool are dropped; Graphite stays never-required; orchestrate's frontier comes from `gh` PR bases.
- D6: babysit and shipping use the one-shot watcher child and stated `gh` field conditions; queued merge-queue mode becomes report-and-stop.
- D8: forge evidence uses a deterministic `gh` stub only; no throwaway GitHub repository.

## Open for the user

D1 (autopilots scoped down or deferred), D2 (orchestrate scoped down or deferred), D4 (`make-bot-ui` re-authored or excluded), D7 (live-model evaluation authority), D9 (approval to start).

## User decisions (2026-10-06)

- D1: scoped-down autopilots (root-run program, fresh leaf owners per round, audits on delivery, explicit grant naming push/PR/merge).
- D2: orchestrate as a depth-1 single-session coordinator with a hand-kept file store; states it is not an unattended runner.
- D4: `make-bot-ui` re-authored for Pi (`name: make-bot-ui`; local page posting to a loopback server that starts a Pi run; key in a local file, never in chat; exposure only with explicit authorization).
- D7: no live-model evaluation; deterministic gates prove host mechanics only.
- D9: approved. Implementation starts from the C0 checkpoint.

## Parent decisions on W4-A questions (2026-10-06)

- Fixed reviewer prompts with placeholders (interrogate reviewer-prompt, reflect reviewers) go verbatim in `systemPrompt` with placeholder values in `task`, as the contract says; reconcile aligns `fan-out.md` §2 to this wording.
- The three edits forced by the banned-pattern test on copied upstream code blocks (`why/references/sources/code-archaeology.md` rg pattern, `architect/references/runner-prompt.md` `// TODO`, `reflect/references/synthesizer.md` model slug example) are to be reverted to byte-identical copies at reconcile, with the content test exempting fenced code blocks from the placeholder and model-slug bans.
- Seat mapping: `task:recon` for the how explainer and why synthesizer, `task:review` for the three reflect reviewers.
- Cursor's extra swarm sentence (contradiction 13) stays out; Mimir wording is primary.
- Upstream slash wording such as `/arena` inside prose stays as written.

## Reconcile additions from the W4-A review (2026-10-06)

- Content test gap: the `json subagent` example check is regex-based and missed a malformed closing fence in `reflect/SKILL.md` that swallowed the rest of the skill into the code block. Reconcile adds a fence-state scan (or a Markdown parser) over every shipped skill: every fence opens and closes, every ```json subagent block parses as JSON, and no prose follows a closing fence on the same line.
- Reconcile also exempts fenced code blocks from the TODO/FIXME placeholder ban and the model-slug ban, then reverts the three test-forced edits in W4-A to byte-identical copies.
- Reviewer's input caveat: planning main was read before the parent's W4-A decisions landed (`2f99982`); findings were judged against the contract and fan-out protocol, which agree with those decisions.

