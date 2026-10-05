# Host PR stack and operating skill: status

User decisions on 2026-10-05: stack the host pull requests linearly (Wave 1, Wave 2, operating skill, cancel); the skill must describe the final Wave 2 host including cancel; copy the skill into the global skills folder only after an independent review.

## Stack on `giuseppecrj/pi-herdr-agents`

| Layer | PR | Branch | Head | Base |
| --- | --- | --- | --- | --- |
| 1 | #70 | `wave1/pack-neutral-host` | `e262c584` | `main` `c2177dff` |
| 2 | #71 | `wave2/conditional-model-writes` | `b04906b6` | layer 1 |
| 3 | #72 | `agent-cancel/skill` | `2692c51` | layer 2 |
| 4 | not opened | `agent-cancel/runtime` | `787f633` (`05e53b8` runtime rebased onto layer 3, plus the skill's reviewed cancel section) | layer 3 |

Layers 1 and 2 were pushed and opened after their reviews had already passed. Layer 3 went up after two review passes (nine findings fixed, two leftovers fixed by the parent). Layer 4 waits on: the cancel section being added to the skill, a fresh cross-family review of the runtime, and real-Herdr QA on an immutable copy.

Open PRs #66, #67 and #68 remain untouched. #67 overlaps the fallback path; the cancel author reports its `index.ts` change targets code that no longer exists on this base, and that the stale-context bug it fixes likely persists here. Coordinate before merging either.

## Operating skill

`skills/pi-herdr-agents/SKILL.md` is the host's only shipped skill. Verified facts:

- An explicit `pi` manifest disables conventional `skills/` discovery (Pi 1.0.3 packages doc). The worker's first commit omitted `pi.skills`, and the real loader returned nothing; the parent added the entry and re-verified.
- Independent reviews checked every claim against the Wave 2 README and the live tool schema. Corrections included: task results do not stop persistent specialists; fallback lists are rejected with worktrees; managed-worktree sessions cannot be resumed; the thinking enum and precedence; the writer removes omitted categories; persistent specialists are forced non-interactive and never auto-exit.
- Global copy: `/home/g/.pi/agent/skills/pi-herdr-agents/SKILL.md`, byte-identical to the layer-4 skill at `787f633` (cancel section included, after a separate review pass fixed three wording items). The real loader finds it with no diagnostics.

## Cancel runtime (layer 4 candidate)

`agent-cancel/runtime` now at `37d8c62`. History: `05e53b8` first implementation (review: P1 foreground absence taken as exit, three P2s); `3572b4f` fixes (review: P1 still open because Pi rewrites its process title and blanks the command line the check read, plus namespace/EACCES/PID-reuse P2s); `37d8c62` judges worktree termination by a launch-verified process identity the child records itself (pid, starttime, boot id, pid namespace), never by command-line text. Parent reran the suite at each head (latest 814 passed, 1 skipped). Real-Herdr cancel cases passed 5/5 at both `3572b4f` and `37d8c62`, full integration 77/77 each time; evidence in `docs/evidence/host-cancel-qa/`.

Third review closed all prior findings except the acknowledged final stat-to-kill PID window, and found two bounded P2s (capture completing during the absence check can confirm with a live identity; provider awaits not bounded by the advertised deadlines) plus skill wording. A short fix round is in progress and will also commit the integration test into the branch. PR 73 follows that round and a light re-review.

## Pstack Wave 2 (separate repo)

`wave2/skills-only-fixes` at `b10a40c`: role removed; mode and setup implemented; parent check 107/107 with every input set; combined real-Herdr run with host `b04906b6` and the roles pack passed 72/72 (`docs/evidence/wave2-combined/`).

The setup approval guard has now failed four cross-family reviews in a row, each finding a new way for a writer call to run without the dialog: run protection cleared before settlement; lost across reload; derived from prompt text that input hooks legitimately transform; and at `b10a40c`, pre-start lifecycle interleavings (a later `before_agent_start` hook that reloads, or an unrelated custom-message run settling while the setup prompt is held) plus displaced-prompt variants. The common cause is the design itself: protecting only "the setup run" requires identifying that run across Pi lifecycle events, and every identification method has leaked. Parent decision pending from the user: replace run-tracking with an unconditional rule that the host's task-model writer may only execute as pstack's exact approved nested call while pstack is loaded. That removes run identity from the problem and makes reload and interleavings fail closed by construction, at the cost that `/subagents-init` and direct model calls to the writer are refused while pstack is installed. No fifth fix round under the old design.

Evidence directories: `/tmp/agentcancel-skill-parent`, `/tmp/agentcancel-parent-v19xdY`, `/tmp/pstack-w2fix-parent-XgmgSx`, `/tmp/pi-skill-load-probe`.
