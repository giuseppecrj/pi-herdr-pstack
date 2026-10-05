# Wave 2 conditional shared-preference writer

Status: **explicitly authorized by the user** after independent recon reproduced a stale-configuration write despite approval checks and argument freezing. This is the narrow host-contract addition to W2. No release, merge, push, normal-installation change or unrelated host fix is authorized.

## Revision and ownership boundary

- Start a dedicated host W2 branch from accepted host `e262c584f54a7c8d60eb1fa5510f47c1299e3801`; retain the W1 candidate unchanged.
- Roles remains `22e1816725ba0910573f667f52e97c9757ca0305`.
- Pstack methodology proceeds in `wave2/pstack-commands` from accepted `b3f9c9d48d2735fb97246ab00270ea039687cc8f`; its runtime owner follows the content handoff.
- Host writer owner exclusively edits the model-config write implementation, public tool schema/handler, related tests and narrowly relevant docs. No fallback, placement, role discovery, removed commands or PR #66–#68 work.
- Parent rechecked upstream main and all three coordinated PRs unchanged immediately before assigning this work.
- At most two implementation writers: methodology and host now; pstack runtime takes over only after methodology finishes. Parent runs real Herdr suites serially.

## Frozen public contract

Extend `subagents_write_task_models` with optional `expectedConfigRevision`:

- Existing-file revision: `sha256:<64 lowercase hex digits>`, computed over the **exact file bytes**, not normalized JSON or only `models.tasks`.
- Missing-file revision: the literal `missing`.
- Omitted revision retains the existing unconditional-write behavior for compatibility. Existing and conditional host writes still share serialization.
- Invalid revision strings fail closed. Do not overload null/empty strings as missing/unconditional.
- The writer returns `configRevision` for the successfully written output alongside existing normalized fields. No unrelated configuration or sensitive file content appears in revision diagnostics.

Inside the write operation, acquire exclusive serialization, read one current snapshot, compare the supplied revision to that snapshot, validate/preserve its configuration, construct output, and publish it atomically. On mismatch, do not replace configuration; return an actionable stale-proposal error requiring a fresh read, proposal and approval. A conditional `missing` write must reject a now-existing file; a conditional existing revision must reject a removed file. Missing-file seeding retains the existing packaged defaults and must be disclosed by setup before approval.

Use a bounded, dependency-light cross-process lock/serialization mechanism shared by all calls to this writer, including unconditional calls. Failing clearly on contention is acceptable; no unbounded waits, retry daemon or new scheduler. Clean up only locks/temp artifacts the invocation owns. Crash/stale-lock behavior must be explicit and fail closed; never silently delete another active writer's lock. Preserve existing atomic-publication behavior and unrelated keys. Add no dependency unless justified and approved by the parent.

**Boundary:** cooperating host writes are serialized. Advisory serialization does not constrain a text editor or arbitrary process that ignores it, and trusted extensions remain same-process code rather than sandboxed adversaries. Document this honestly. The new precondition must close the demonstrated later-hook stale-snapshot case; do not claim a filesystem transaction against all external actors.

## Pstack integration requirements

- Keep setup report-only against an older/unconditional writer. Detect the conditional contract from the loaded public tool schema, not npm version strings or private host imports.
- Read exact bytes (or explicit missing state) and generate the public revision independently with Node crypto. Do not import the host's private config loader/hash helper.
- Include `expectedConfigRevision` in the complete canonical writer payload shown to and approved by the user. Bind approval to the before-state, all retained categories, metadata, current session/generation and one exact apply-tool invocation.
- A setup-scoped apply tool may call the host only through public `ExtensionToolContext.executeTool`, not a discovered raw `.execute` callback. Command contexts cannot execute tools in Pi 1.0.3.
- Use strict `parentToolCallId` equality, not prefix matching. Compare the whole validated payload and recursively freeze **validated `event.input`** in the tool-call guard (validation clones the originally submitted object); freeze the event identity fields too. Later mutators fail closed. Consume the authorization once and clear it on completion/cancellation/session replacement/shutdown.
- Keep all current task categories; no category deletion in W2. No cached consent, guessed model IDs, private preference store, direct file write, alternate writer or getter/proxy workaround.
- Verify returned normalized values/revision and the saved result before reporting success/reload. A stale/busy/aborted/failed call is not success and does not reuse approval on retry.
- Existing direct host writer behavior outside a setup flow remains host-owned; this is not a global shell or general permission engine.

## Required evidence

Host unit/contract checks cover success with exact byte revision; changes to tasks, unrelated fields and whitespace; created/deleted/missing file states; invalid revisions; malformed configuration; unconditional compatibility; unrelated-field preservation; lock contention across cooperating processes; success/failure cleanup; stale-lock failure; returned revision matching saved bytes.

Pstack real-SDK/faux-provider checks cover accept/decline/cancel/timeout/no UI; absent/old writer and children; malformed/unreadable config and unavailable models; changed proposal/current file/context; raw writer blocked during setup; exact direct nested parent identity; later-hook argument mutation; and a later-hook config change causing the **real conditional writer** to refuse without losing the newly added category. Post-write comparison alone is insufficient.

Run active diagnostics, standard checks, package checks, a fresh cross-family review and parent combined QA on the resulting exact I2 vector. Baseline host TypeScript failures must be compared, not relabeled clean. No worker runs real Herdr integration or paid models. Keep all failure evidence.

## Recon evidence

- Initial API probes: `/tmp/pstack-w2-probe-KN0scA` (Pi 1.0.3, actual W1 host, isolated state/faux provider).
- Independent hardening probes: `/tmp/pstack-w2-freeze-iy1DFA` (10 scenarios, including reproduced unsafe behavior). `stale-hook.log` adds a category after the pack guard, then demonstrates the unconditional host overwriting it.
- These probe passes establish the diagnosis, not setup acceptance. Only the new implementation plus its tests can satisfy the conditional-write gate.
