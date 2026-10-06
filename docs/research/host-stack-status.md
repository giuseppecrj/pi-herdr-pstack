# Host PR stack and operating skill: status

User decisions on 2026-10-05: stack the host pull requests linearly (Wave 1, Wave 2, operating skill, cancel); the skill must describe the final Wave 2 host including cancel; copy the skill into the global skills folder only after an independent review.

## Stack on `giuseppecrj/pi-herdr-agents`

| Layer | PR | Branch | Head | Base |
| --- | --- | --- | --- | --- |
| 1 | #70 | `wave1/pack-neutral-host` | `e262c584` | `main` `c2177dff` |
| 2 | #71 | `wave2/conditional-model-writes` | `b04906b6` | layer 1 |
| 3 | #72 | `agent-cancel/skill` | `2692c51` | layer 2 |
| 4 | #73 | `agent-cancel/runtime` | `fa483ea` | layer 3 |

Layers 1 and 2 were pushed and opened after their reviews had already passed. Layer 3 went up after two review passes (nine findings fixed, two leftovers fixed by the parent). Layer 4 opened as #73 after five cross-family review rounds (every finding fixed and re-verified), units 829 passed / 1 skipped, and real-Herdr integration 77/77 at the final head.

Open PRs #66, #67 and #68 remain untouched. #67 overlaps the fallback path; the cancel author reports its `index.ts` change targets code that no longer exists on this base, and that the stale-context bug it fixes likely persists here. Coordinate before merging either.

## Operating skill

`skills/pi-herdr-agents/SKILL.md` is the host's only shipped skill. Verified facts:

- An explicit `pi` manifest disables conventional `skills/` discovery (Pi 1.0.3 packages doc). The worker's first commit omitted `pi.skills`, and the real loader returned nothing; the parent added the entry and re-verified.
- Independent reviews checked every claim against the Wave 2 README and the live tool schema. Corrections included: task results do not stop persistent specialists; fallback lists are rejected with worktrees; managed-worktree sessions cannot be resumed; the thinking enum and precedence; the writer removes omitted categories; persistent specialists are forced non-interactive and never auto-exit.
- Global copy: `/home/g/.pi/agent/skills/pi-herdr-agents/SKILL.md`, byte-identical to the skill at `4a3992d`, which is unchanged through the final cancel head `fa483ea`. The real loader finds it with no diagnostics.

## Cancel runtime (layer 4, PR #73)

`agent-cancel/runtime` final head `fa483ea`. History: `05e53b8` first implementation; `3572b4f` edge-case fixes; `37d8c62` launch-verified process identity replaces command-line matching (Pi rewrites its process title); `f146db2` capture race and deadline bounds; `4a3992d` failed-SIGTERM and clock-checked timeout; `fa483ea` scopes the integration test's untouched-pane check to the runner's own workspace after one environmental failure (a finishing subagent closed its own pane mid-run; two isolated reruns passed). Parent reran units at every head (final 829 passed, 1 skipped). Real-Herdr cancel cases passed at `3572b4f`, `37d8c62`, `f146db2` and `fa483ea`, full integration 77/77 each time; evidence in `docs/evidence/host-cancel-qa/`. Acknowledged residual: the OS-level PID reuse window between the final identity check and `kill(2)`.

## Pstack Wave 2 (separate repo)

`wave2/skills-only-fixes` now at `9839e7d` (checkpoint `6f36a1b` copies planning `96dbd16`, code `9bef548`). Role removed; mode and setup implemented; the setup writer guard is now the unconditional gate the user chose in [plan 10](../plans/10-wave2-unconditional-writer-gate.md): every host writer call blocks while pstack is loaded except the one exact approved nested call, with the approval held only in memory for that dispatch. All run-identity code is deleted (setup.ts: 50 insertions, 253 deletions). Parent check 111/111 with every input set. Earlier history: four cross-family reviews of the run-tracking design each found a new approval bypass (`b5d8e99`, `61048b0`, `b10a40c`), which is why the design was replaced rather than patched a fifth time. Combined real-Herdr run at `b10a40c` passed 72/72 (`docs/evidence/wave2-combined/`); the extension load path did not change in `9839e7d`. Cross-family review of the gate: no blockers (eight independent scenarios against the real host writer). Pstack stack opened: PR #1 `wave1/pstack-foundation` -> `main`, PR #2 `wave2/skills-only-fixes` -> `wave1/pstack-foundation`. Handoff brief: `docs/plans/11-wave2-handoff.md`.

Evidence directories: `/tmp/agentcancel-skill-parent`, `/tmp/agentcancel-parent-v19xdY`, `/tmp/pstack-w2fix-parent-XgmgSx`, `/tmp/pi-skill-load-probe`.

## Closed out (2026-10-06)

User decisions: Wave 2 accepted; merge all PRs; delete retained worktrees; make the roles and pstack repositories public.

- pi-herdr-agents: #70, #71, #72, #73 merged bottom-up with merge commits; `main` at `7d35371`. Older PRs #66, #67, #68 untouched.
- pi-herdr-pstack: #1 merged (`78f6529`); #2 needed `origin/main` merged into the branch first because the Wave 2 branch carried checkpointed planning docs (`docs/plans/07-wave2-entry-contract.md`, `docs/plans/README.md` conflicted; main's versions taken; product files did not conflict); check 111/111 after the merge; #2 merged, `main` at `0eedac1`.
- pi-herdr-roles: no PR existed, so `wave1/role-pack` was opened as #1 and merged; `main` at `3b75aa4`.
- Visibility: pi-herdr-roles and pi-herdr-pstack set to public after a secret scan over all branches found nothing and no credential files are tracked. pi-herdr-agents was already public.
- Cleanup: all eight managed worktrees removed, branches and commits retained on GitHub; finished worker workspaces closed.
- Not done: the installed pi-herdr-agents package is still the older published build; installing the merged `main` is a normal Pi configuration change and was not requested. Until then the global skill copy at `~/.pi/agent/skills/pi-herdr-agents/SKILL.md` stands in for the packaged one, and `subagent_cancel` is not available in this session.

## Wave 3 in progress (2026-10-06)

Approved contract `docs/plans/12-wave3-contract.md` at `e2cf538`. C0 checkpoint `wave3/integration` at `0c4187c`: content tests generalized and driven by inventory status, fixtures split per owner (`test/fixtures/{forward-references,skill-provenance}/`), W2 rows flipped to shipped, host repinned to `7d35371`, skills byte-identical; parent rerun 118 passed, 1 skipped (the comment-sicko launch-shape test, awaiting `no-comments`). Batches launched from C0: `wave3/technical` (W3-A, 29 skills, 30 files) and `wave3/communication` (W3-B, 6 skills plus the comment-sicko delegate prompt, 9 files). Each gets a fresh cross-family review on its exact SHA before integration; reconcile and the real-Herdr gates follow.

W3-A landed at `9f80152` (19 copied, 11 adapted, 6 tuples); parent rerun 118 passed / 1 expected skip; 19 copied hashes independently matched the pinned Mimir blobs; cross-family review: no blockers. W3-B landed at `d3e844f` (3 copied, 6 adapted incl. the comment-sicko delegate prompt and the Pi re-authoring of poteto-help, 54 tuples); parent rerun 119/119; cross-family review: three medium, additive findings (poteto-help overstated the setup report's coverage and omitted the 24 principle routes; two sentences in technical-writing are verbatim from Diátaxis and the ASD-STE100 FAQ and need attribution). Both batches merged into `wave3/integration` at `36060fb` (37 skills, 119/119). Reconcile step launched as a single writer with the three findings folded in.

Reconcile landed at `f884fa8` (35 rows shipped, 68 planned-W3 markers and 63 tuples retired, 93 W4 tuples remain, poteto-help findings fixed, Diátaxis/ASD-STE100 attribution added); cross-family review: no blockers. Parent gates: comment-sicko bare-delegate real-child gate 2/2 on real Herdr (after correcting the assertion channel: the host delivers a bare systemPrompt as a role block in the first message, not the system prompt, and drops it for forks); combined host integration 77/77. Parent edit `d611b6a` records the fork:false requirement in no-comments and delegation.md. Wave 3 candidate complete; handoff `docs/plans/13-wave3-handoff.md`; awaiting the human gate before push, PR and Wave 4.

Wave 3 accepted by the user (2026-10-06): `wave3/integration` pushed, pstack PR #3 opened and merged (`1cbf75f`); worktree removed, branch retained. Wave 4 planning launched (read-only draft to /tmp first). Open follow-up outside this repo: document in the host README and operating skill that a bare child's `systemPrompt` is delivered as a role block in the first message for standalone children only and dropped for forks.

## Wave 4 in progress and npm names (2026-10-06)

Wave 4 approved at `2f5de1a`. C0 `wave4/integration` at `dc48221`: shared `references/fan-out.md` protocol, generalized content tests (schema-valid examples, systemPrompt implies fork:false, extended banned list, W5 tuples, script mode checks), per-owner fixtures for w4-a/w4-b/w4-p, scripts unit tests; parent rerun 121 passed with 3 explained skips. Batches launched from C0: `wave4/engineering` (W4-A, 8 workflow skills, 33 files) and `wave4/capabilities` (W4-B 6 skills then W4-P 11 playbooks + check-plan.mjs). npm: `pi-herdr-roles` and `pi-herdr-pstack` reserved by the user via npm staged publishing (`0.0.0-stage`, two-file placeholders, maintainer giuseppecrj); `pi-herdr-agents` already published at 2.0.5. Wave 5 (release) will replace the placeholders.

W4-A landed at `9759d67` (19 copied, 14 adapted, 2 cross-batch tuples); parent rerun 122 passed / 2 expected skips, all copied hashes matched; cross-family review found four should-fix items (a malformed closing fence in `reflect` that swallowed the rest of the skill, interim rules missing on cross-batch lines, optional worktree fallbacks contradicting fan-out §5, weaker arena diversity rules); fixed at `7d6de65`, re-review no blockers, fence scan clean (30 blocks). Integrated into `wave4/integration` (fast-forward, 45 skills, 122/2). Reconcile to-do recorded in the notes: fence-parse test, fenced-code exemption and three copy reverts, fan-out §2 alignment.

Wave 4 gates G1-G7 passed 8/8 on host `7d35371` (G5 confirms MCP visible only without a `tools` key; G7 proves a child is delivered before its grandchild finishes and the grandchild's result reaches nobody; G4 shows one informational `blocked-tool` advisory per minute of watcher wait). Regression 76/77; the one failure is the environmental outer-pane assertion in cancel case (d), functional assertions all passed; host follow-up recorded. W4-B/W4-P landed at `d4943be` (130 passed / 1 expected skip; parent copied-hash and mode checks clean); cross-family review found two P1s (make-bot-ui RPC alternative; shipping merge-queue check after the merge command) and three P2s (autopilot owner-round continuation, make-bot-ui Host validation on GET, multi-phase-plan skeleton references and a fence); fix round in progress. 54 empty fixture residue worktrees removed.

W4-B/W4-P fix round at `6455147` (five findings fixed; the parent's fence finding was a false positive on a valid four-backtick fence); re-review no blockers; parent rerun 130/1 expected skip; lexer scan over 77 skill files, 38 blocks, clean. Merged into `wave4/integration` at `ad21cfc`: all 51 skill directories present, check 131 passed, 0 skipped. Reconcile launched as the single writer.

Wave 4 reconcile landed at `fbde197` (14 rows flipped: 51 shipped, 0 planned; 102 tuples retired to 0; every `planned W4` marker and interim clause removed; hub and poteto-help route all 51 skills and 23 playbooks with scope-down limits; fan-out.md aligned with the contract and the G1-G7 facts; marked-lexer fence test; three test-forced edits reverted to byte-identical copies with fenced/inline-code exemptions; recall also retired its why clause). Parent commit `2726104` declares `marked` as a devDependency and syncs the planning notes. Parent rerun: 132 passed, 0 skipped; 124 packed files, 113 skill files. Cross-family review of the reconcile and the real-Herdr G8 rerun plus combined regression on `2726104` are in progress.

Final gates on pstack `2726104`: G8 comment-sicko real-child gate 2/2; combined host integration (host `7d35371` + roles + pstack) 77/77 (`docs/evidence/wave4-gates/`). Cross-family review of the reconcile found five consistency items (workflow cancel rules must exempt a watcher inside its bound; `--interval` is refresh cadence, not a bound; a nested-delegation exception survives G7; the placeholder/model exemptions are wider than copied files; shipping and simulator routes omit limits); fix round in progress on `wave4/integration`. User request: CI publishing for pi-herdr-roles and pi-herdr-pstack mirroring the host (OIDC trusted publishing configured by the user for both npm packages); a release-setup writer is preparing `release/ci` branches in both repos with one deliberate deviation: prerelease or `private` packages yield "no release" instead of a failed run, so dependency bumps do not break CI before Wave 5. Host workflow fact: it publishes on push to `main` touching package.json with a stable, increased version, so the packs' `0.1.0-experimental.0` and `private: true` keep publishing inert until the Wave 5 release commit.

Reconcile fix round at `07ef8fd` (watcher exemptions in cancel rules, wall-clock watch bounds, nested-delegation exception removed everywhere, test exemptions narrowed to copied files plus an explicit allowlist with negative tests, shipping and simulator routes carry their limits); re-review no blockers; parent rerun 136 passed, 0 skipped; `no-comments` unchanged so G8 at `2726104` stands. Wave 4 candidate complete; handoff `docs/plans/15-wave4-handoff.md`; awaiting the human gate.

Release CI scaffolding (user request): `release/ci` branches in pi-herdr-roles (`0365c4b`) and pi-herdr-pstack (`4e2067f`) mirror the host's publish workflow with one policy deviation (private or prerelease yields no release, not a failure; first stable may share the prerelease core; removing private at a stable version releases once). Cross-family review found one medium item, malformed previous prerelease identifiers accepted, fixed by the parent with regression cases in both repos. Checks: roles 46/46; pstack 125/125 with inputs, 80/4 skipped without. Both branches pushed and opened as PRs for the user's review; not merged. Publishing stays inert until the Wave 5 release commit (drop `private`, set a stable version).

Wave 4 accepted by the user (2026-10-06): `wave4/integration` pushed, pstack PR #5 opened and merged (`e75395c`, 51 skills on main); worktree removed, branch retained. CI PRs (roles #2, pstack #4) remain open for the user; pstack #4 rebased onto the new main. Next: Wave 5 release decisions.

## Wave 5 release (2026-10-06)

User decision: merge the CI PRs, release host then packs at 0.1.0. CI PRs merged (roles `2820591`, pstack `cf2797f`); both publish workflows ran on the merge pushes and completed as successful no-release runs (private package), live proof of the policy. Release branches prepared: host `release/3.0.0` at `b8b23a0` (major: pack-neutral host removed bundled roles and commands; adds conditional writes, operating skill, subagent_cancel; also documents bare-spawn systemPrompt delivery and narrows the flaky cancel-test assertion), roles `release/0.1.0` at `603217e`, pstack `release/0.1.0` at `80baa52` (private removed, peers `pi-herdr-agents >=3.0.0`, SDK `^1.0.3`, pstack `typebox ^1.3.27`). Host-only Herdr suite on `7d35371`: 76/77 with one fixture `index.lock` race in setup (environmental); rerun on the release head is the gate before the host PR is opened. Merge order: host first, confirm npm, then roles and pstack.

Host release gate: `test:integration` on `b8b23a0` 77/77. Release PRs open for the user's final look: pi-herdr-agents (3.0.0), pi-herdr-roles #3 (0.1.0), pi-herdr-pstack #6 (0.1.0). Merging the host PR publishes; the pack PRs follow once 3.0.0 is on npm. All worktrees removed; branches retained.

