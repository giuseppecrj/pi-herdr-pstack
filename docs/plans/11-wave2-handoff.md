# Wave 2 handoff

Status: **candidate complete, awaiting the human Wave 2 gate.** No Wave 3 or Wave 4 porting has started.

## Exact revision vector

| Component | Branch | Head | Base |
| --- | --- | --- | --- |
| Host (layer 1) | `wave1/pack-neutral-host`, PR #70 | `e262c584` | `main` `c2177dff` |
| Host (layer 2) | `wave2/conditional-model-writes`, PR #71 | `b04906b6` | layer 1 |
| Host (layer 3) | `agent-cancel/skill`, PR #72 | `2692c51` | layer 2 |
| Host (layer 4) | `agent-cancel/runtime`, PR pending | `f146db2` plus one bounded fix round | layer 3 |
| Roles pack | `wave1/role-pack` | `22e1816` | unchanged since W1 |
| Pstack | `wave2/skills-only-fixes` | `9839e7d` | `wave1/pstack-foundation` `b3f9c9d` |

Pstack's Wave 2 was built and tested against host layer 2 (`b04906b6`). Layers 3 and 4 add a skill and a cancel tool and do not change the writer contract pstack depends on.

## What Wave 2 delivers

- `poteto-mode` skill: the single methodology hub with three references and twelve base playbooks; 24 principle summaries marked planned W3; 23 routing rows (12 shipped, 11 planned W4); 96 exact forward-reference tuples enforced by tests.
- `/poteto-mode` command: sticky mode as a strict versioned session entry owned by the Pi session, reduced over the active branch; survives user fork and clone; copied parent entries are ignored in a child; direct `/skill:poteto-mode` is non-sticky; task form sends the literal full-skill wrapper in one turn; refused while busy; filtered or shadowed skills refuse with the reason.
- `setup-pstack` skill and `/setup-pstack` command: a code-built report of host tools, writer contract, owned resources, authenticated exact models and the shared task preferences, with distinct fail-closed config states and no disclosure of unrelated fields. `/setup-pstack <request>` proposes one change; the user approves the complete writer payload, including `expectedConfigRevision`, in a dialog with a timeout; the extension then calls the host writer through public `executeTool` and reconciles the saved file before reporting.
- **Unconditional writer gate** (user decision, plan 10): while pstack is loaded, the host's task-model writer executes only as that exact approved nested call. `/subagents-init` and direct model calls to the writer are refused with a pointer to `/setup-pstack`. This replaced a run-tracking design that failed four consecutive reviews.
- **No named role.** The user removed `poteto`; delegation is deliberately bare with explicit briefs. Pstack registers no role directory. The W1 role is recorded as removed in provenance.
- Host conditional writes (`expectedConfigRevision`, advisory lock, `configRevision` result) were added in layer 2 to close the stale-approval gap that an independent probe reproduced.

## Evidence

| Check | Result |
| --- | --- |
| Pstack `npm run check`, all inputs, isolated outer state | 111 passed, 0 failed, 0 skipped |
| Pstack content checks against pinned sources | 19/19, hashes reproduced from the pinned Mimir and Cursor commits |
| Combined real-Herdr integration, host `b04906b6` + roles + pstack `b10a40c` | 72 passed, 0 failed, 0 skipped |
| Host layer 2 units | 750 passed, 1 skipped |
| Host layer 4 units at `f146db2` | 824 passed, 1 skipped; real-Herdr integration 77/77 including five cancel cases |
| Cross-family reviews of the final pstack gate | no blockers (OpenAI, against the real host writer, eight independent scenarios) |

The combined Herdr run was at pstack `b10a40c`; the gate rewrite in `9839e7d` did not change the extension's load path, so it was not rerun. Evidence directories: `docs/evidence/wave2-combined/`, `docs/evidence/host-cancel-qa/`, and `docs/evidence/wave2-fixes/` and `docs/evidence/wave2-runtime/` inside the pstack branch.

## Review history worth knowing

The setup guard went through five implementations. Each cross-family review found a genuine approval bypass in the previous one: protection cleared before settlement; lost across reload; derived from prompt text that input hooks legitimately transform; defeated by pre-start lifecycle interleavings. The fifth replaced the design with the unconditional gate and passed review. The lesson is recorded in `docs/research/host-stack-status.md`.

## Known limits

- Deterministic faux-provider and scripted-dialog evidence; no live-model obedience or human TUI dialog was exercised.
- Same-process extensions are trusted code; the gate is a tool-call hook, not a filesystem sandbox.
- Setup's apply window goes to whichever run starts first after the command; the dialog remains the gate.
- The host's 63-diagnostic TypeScript baseline is unchanged, not clean.
- Installed-package and npm-tarball behavior was not exercised; all runs used local package paths.

## Next actions

1. Pstack stack opened per the user's "stack the PRs" direction: `wave1/pstack-foundation` to `main`, then `wave2/skills-only-fixes` on top (PR numbers recorded in `docs/research/host-stack-status.md`).
2. Finish host layer 4 (two P2 fixes in progress), re-review, rerun the Herdr suite, open PR #73.
3. Wave 3 planning only after the human Wave 2 gate.
