# Host PR stack and operating skill: status

User decisions on 2026-10-05: stack the host pull requests linearly (Wave 1, Wave 2, operating skill, cancel); the skill must describe the final Wave 2 host including cancel; copy the skill into the global skills folder only after an independent review.

## Stack on `giuseppecrj/pi-herdr-agents`

| Layer | PR | Branch | Head | Base |
| --- | --- | --- | --- | --- |
| 1 | #70 | `wave1/pack-neutral-host` | `e262c584` | `main` `c2177dff` |
| 2 | #71 | `wave2/conditional-model-writes` | `b04906b6` | layer 1 |
| 3 | #72 | `agent-cancel/skill` | `2692c51` | layer 2 |
| 4 | not opened | `agent-cancel/runtime` | `7a3508c` (`05e53b8` runtime rebased onto layer 3, plus the skill's cancel section) | layer 3 |

Layers 1 and 2 were pushed and opened after their reviews had already passed. Layer 3 went up after two review passes (nine findings fixed, two leftovers fixed by the parent). Layer 4 waits on: the cancel section being added to the skill, a fresh cross-family review of the runtime, and real-Herdr QA on an immutable copy.

Open PRs #66, #67 and #68 remain untouched. #67 overlaps the fallback path; the cancel author reports its `index.ts` change targets code that no longer exists on this base, and that the stale-context bug it fixes likely persists here. Coordinate before merging either.

## Operating skill

`skills/pi-herdr-agents/SKILL.md` is the host's only shipped skill. Verified facts:

- An explicit `pi` manifest disables conventional `skills/` discovery (Pi 1.0.3 packages doc). The worker's first commit omitted `pi.skills`, and the real loader returned nothing; the parent added the entry and re-verified.
- Independent reviews checked every claim against the Wave 2 README and the live tool schema. Corrections included: task results do not stop persistent specialists; fallback lists are rejected with worktrees; managed-worktree sessions cannot be resumed; the thinking enum and precedence; the writer removes omitted categories; persistent specialists are forced non-interactive and never auto-exit.
- Global copy: `/home/g/.pi/agent/skills/pi-herdr-agents/SKILL.md`, byte-identical to `2692c51`. The real loader finds it with no diagnostics. Refresh it from the final layer-4 version once the cancel section lands.

## Cancel runtime (layer 4 candidate)

`05e53b8` adds `subagent_cancel` for ordinary managed children. Parent reran the suite on the rebased head: 784 tests, 783 passed, 1 skipped; format, lint, pack and diff clean; the skill still loads. Author-disclosed limits: no SIGKILL escalation, no `/proc` cross-check on macOS, retired resumed runs report "No running subagent" rather than already-terminal, no integration tests run. Incident that motivated it: interrupting then closing a worker's pane was read as a crash and relaunched the same session under a fallback model.

## Pstack Wave 2 (separate repo)

`wave2/skills-only-fixes` at `b5d8e99`: role removed, four review findings fixed, parent check 92/92. A second review found a reload bypass (run protection lost across `/reload` mid-setup) and a non-blocking stuck-protection case; a fix round is in progress. No pstack PR until that passes review and the serial real-Herdr combined run.

Evidence directories: `/tmp/agentcancel-skill-parent`, `/tmp/agentcancel-parent-v19xdY`, `/tmp/pstack-w2fix-parent-XgmgSx`, `/tmp/pi-skill-load-probe`.
