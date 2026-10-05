# Wave 2 amendment: unconditional writer gate

**User decision (2026-10-05): option 1.** While pi-herdr-pstack is loaded, the host's `subagents_write_task_models` tool may execute only as pstack's exact approved nested call. This replaces the run-tracking design in `setup.ts` after four consecutive cross-family reviews each found a new approval bypass (protection cleared before settlement; lost across reload; derived from prompt text; defeated by pre-start lifecycle interleavings and displaced prompts). It supersedes the run-identity requirements in [09](./09-wave2-no-poteto-role.md) and the "host writer behaves exactly as without pstack outside a setup flow" wording in earlier contracts.

## Rule

1. A `tool_call` for the writer is **blocked by default** whenever pstack is loaded, in every run, regardless of whether a setup flow is open. The block reason points the user to `/setup-pstack`.
2. The only exception is a nested call whose `parentToolCallId` strictly equals the tool-call ID of a pstack apply invocation that holds a live, unconsumed authorization created after the user approved the exact payload in the dialog. The authorization compares the whole canonical payload, including `expectedConfigRevision`, is consumed once, and is cleared when the nested dispatch returns, on abort, on session replacement, and on shutdown.
3. Authorization lives only in memory for the duration of the nested dispatch. After a reload there is none, so every writer call blocks. No session markers, run IDs, prompt text matching, displaced-run sets, or reconstruction logic remain.
4. The apply tool itself must still be invoked directly by the model (no parent) and only during a `/setup-pstack <request>` turn; it keeps every current check: parent session, hasUI, conditional-schema writer present, config state usable, authenticated exact refs, retained categories, code-generated metadata, exact-payload dialog with 120 s timeout and abort, post-dialog recheck of revision/auth/writer, deep-freeze of validated input and event, post-write reconciliation of the saved file (success, unchanged, matches-despite-error, uncertain), no automatic retry.
5. If the apply tool is reachable outside a setup turn, the dialog is still the gate; the apply activation window is a convenience, not the security boundary. Simplify or remove window bookkeeping that only existed to identify the setup run.

## Consequences to document

- `/subagents-init` and any direct model call to the writer are refused while pstack is installed. README and `docs/compatibility.md` must say so plainly and name `/setup-pstack` as the replacement.
- Children never see the writer (host behavior); pstack in a child does nothing new.
- The block applies to relayed calls too (a writer call under any parent other than an authorized apply call).

## Required tests

Replace the run-identity suites with: writer blocked in an ordinary run (direct and relayed); blocked after reload in every prior bypass shape (during nested dispatch, after decline, after success, pre-start hook reload, displaced prompt, custom-message run); approved apply writes exactly once and a second writer call in the same turn blocks; relay under the apply call blocks; parent-ID prefix or sibling does not authorize; authorization cleared on abort, session replacement and shutdown; `/subagents-init` path refused with the pointer message; mutation controls for each gate. Delete fault-injection shapes that no longer apply and record the reason.

## Process

Fifth fix round in `wave2/skills-only-fixes` from `b10a40c`. Parent reruns the check, one fresh cross-family review, then the pstack PR and the Wave 2 handoff. The combined real-Herdr run at `b10a40c` (72/72) stands for host lifecycle; rerun only if the extension's load path changes.
