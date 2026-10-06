# Wave 2 fix round: role removal and setup review fixes

Logs for the fix round in `docs/plans/09-wave2-no-poteto-role.md`: removal of
the `poteto` role and the four confirmed setup review findings. Local
deterministic checks with a faux provider; not live-model, TUI or real Herdr
evidence. Earlier W2 runtime logs in `../wave2-runtime/` are historical and
unchanged.

Inputs: Pi CLI and SDK 1.0.3; Node 26.8.2; npm 11.19.1; pstack base
`a8b2c3ccc01f5f7fc2ccb6bfc834574893881b10`, authority checkpoint
`92dfc8a1d7456e39a2d92f99df1abecba3d72ee0`, logs run on the clean tree of
`74d1bf603a31e73fb041a9e9a13f0e671f18b6eb`; host
`b04906b6d6d0f81ac23a64753a5aec2b506c6423` (clean worktree); roles
`22e1816725ba0910573f667f52e97c9757ca0305` (clean); pi-herdr-agents source
checkout containing `c2177dff`; mimir `f07dd981f62c9c994a5d043ede67d6c63c721454`;
Cursor `2cbf58508f40de470d7490b55c51d71241928fa2`. Temporary test directories
are shown as `/tmp/<test-owned>`.

| Log | What it shows |
| --- | --- |
| `baseline-check.log` | `npm run check` at the authority checkpoint before any fix, all inputs set: 84 passing tests. The new regression tests did not exist yet. |
| `check-full.log` | `npm run check` with `PI_HERDR_AGENTS_HOST`, `PI_HERDR_ROLES_PACK`, `PI_HERDR_AGENTS_SOURCE` and both upstream sources: typecheck, lint, format and 92 passing tests. The opt-in legacy suite is skipped here. |
| `rpc-with-legacy-host.log` | The RPC suite with `PI_HERDR_AGENTS_LEGACY_HOST` set to a `git archive` export of host `c2177dff` whose `node_modules` is a read-only symlink to the W1 host worktree (`e262c584`, identical dependencies): 7 passing, including both legacy characterizations. |
| `test-default-noenv.log` | `npm test` with no integration inputs: 57 pass, 3 skipped suites/tests with their reasons. |
| `npm-pack-dry-run.log` | 28 packed files: no `agents/`, no `roles.ts`. |
| `mutation-checks.log`, `mutate.py` | Thirteen deliberate faults in `setup.ts`/`config.ts`, each run against the setup SDK and unit tests, then the source restored and compared with `cmp`. |

Mutation results: twelve faults are caught. These include the original P1 shape,
where protection ends with the apply attempt (`M1b`). They also include
report-command revocation, the ignored revocation flag, the missing branch
lookup after reload, error-means-no-write (`M5`), the unchanged-file check, key
echoing in diagnostics, the withholding of unprintable references, the
aborted-signal check, prefix parent matching and the missing input freeze. `M2`
alone, which ignores the in-memory apply-call set, is not caught. The
branch lookup independently recognizes the same apply call. Removing both
(`M2M3`) is caught.

Not run here: real Herdr suites, the interactive TUI dialog, TUI `/new` or quit
during a dialog (session replacement and shutdown use the SDK
`AgentSessionRuntime`), installed-package checks, child-visible resources and
live models. Pi 1.0.3 itself refuses an aborted nested call before `tool_call`,
so the replacement-between-approval-and-dispatch test accepts either Pi's
refusal or pstack's cancelled-turn block; the signal check is covered by the
unit test and `M7`.

## Reload and reservation follow-up (`b0207b4`)

A cross-family review of `b5d8e99` found that a `/reload` during a setup run
left the fresh extension instance without a flow, so raw and relayed writer
calls later in that same run were not blocked (P1). It also found that a setup
prompt consumed by an input handler left the reservation open and blocked the
next unrelated run's writer once (P3). The fix keeps run identity in the
session branch: the setup prompt carries a run ID and pstack appends a
`pi-herdr-pstack:setup-run` settled entry when the run settles. The guard
blocks every writer call while Pi is busy and the branch's latest marker is
unsettled. Approval is not restored. The reservation starts only when
`before_agent_start` sees its marker.

Inputs are as above, except that the logs ran on fix commit
`b0207b4` (base `b5d8e9993700608e7306876c12600cac045fc523`) with the evidence
files uncommitted. Host `b04906b6` and roles `22e1816` were clean; Node
26.8.2, npm 11.19.1, Pi 1.0.3.

| Log | What it shows |
| --- | --- |
| `reload-check-full.log` | `npm run check` with all inputs: typecheck, lint, format and 102 passing tests (92 before). The new tests cover reload during the approved nested dispatch, after a decline and after a success, each followed by raw and relayed writes in the same run, one `agent_start`/`agent_settled` pair and normal host behavior in the next run. They also cover a setup prompt consumed by an input handler followed by a prompt or a triggered custom message, a marker-preserving input transform, and isolated unit tests for branch reconstruction and the remembered apply-call IDs. |
| `reload-test-default-noenv.log` | `npm test` with no integration inputs: 61 pass, 3 skipped, each with its reason. |
| `reload-npm-pack-dry-run.log` | 28 packed files, unchanged. |
| `reload-mutation-checks.log`, `run-mutations.sh`, `mutate.py` | Twenty-three faults, each run against the setup SDK and unit tests, then the source restored and checked with `git diff`. |

Mutation results: the eight new faults are caught (`M13`–`M20`). These remove
the branch-based run protection (the reviewed P1 shape), the settled entry,
idle-only reconstruction, settlement at idle `session_start`, abandoning an
unstarted reservation by prompt or by `agent_start`, and latest-marker
selection. `M2`, which ignores the remembered apply-call IDs, is now caught by
the isolated unit test. Earlier faults `M3` and `M5`–`M12` stay caught. `M1`
and `M1b`, which end the in-memory protection early, are no longer caught on
their own: once the setup prompt is in the branch, the branch record protects
the same calls. Each paired with `M13` is caught (`M1M13`, `M1bM13`).

Limits: the reviewer's `/tmp` probes were not rerun, because they import
another checkout; the new SDK tests reproduce their reload timing. A reload
inside `before_agent_start`, before the setup prompt is persisted and the run
is marked active, is not reconstructed. A transform that removes the marker
makes the run unrecognized, which clears the apply tool and lets later writes
through. A user message that copies the marker text protects its own run, which
fails closed. Real Herdr, TUI, installed-package and live-model checks were not
run.

## Entry-based run identity follow-up (`76f877f`)

A third cross-family review of `61048b0` found that the guard treated a setup
prompt whose line-anchored marker no longer matched as consumed and dropped
protection (P1). An ordinary input hook that only normalized whitespace, or one
that stripped the marker, let raw and relayed writer calls through in the setup
run. Idle cleanup ran only at `session_start`, so navigating the session tree
back into a setup run left an unsettled marker. The next unrelated run's writer
was then blocked once (P3).

The fix removes prompt-text identity. The command appends a
`pi-herdr-pstack:setup-run` `opened` entry before it sends the setup prompt. The
first new run's `before_agent_start` claims it and appends `started`.
Settlement appends `settled`. The guard protects the claimed run in memory, and
after a reload it protects any running turn whose branch shows an opened run
without a settled entry. The claiming run gets apply authority only if its
prompt still contains the random run ID. If the ID is missing, the run fails
closed: it stays protected until it settles, the apply tool is removed, and the
user is notified to run `/setup-pstack` again. That includes a consumed setup
message, which blocks the next new run's writer once, and a stripped ID. Stale
started runs are settled at idle `session_start`, at `session_tree` and at the
next new run's `before_agent_start`. The approved-apply path is unchanged.

Inputs are as above, except that the logs ran on fix commit `76f877f` (base
`61048b00202aea16952f6a0c31eb0a82ca148d1f`) with the evidence files
uncommitted. Host `b04906b6` and roles `22e1816` were clean; Node 26.8.2,
npm 11.19.1, Pi 1.0.3.

| Log | What it shows |
| --- | --- |
| `identity-check-full.log` | `npm run check` with all inputs: typecheck, lint, format and 107 passing tests, none skipped. New SDK tests cover the whitespace-normalizing hook: direct and relayed writes are blocked and the dialog still applies the approved payload. They also cover the ID-stripping hook (blocked, apply refused, one user notice), tree navigation to the assistant message before the settled entry followed by an allowed unrelated write, a consumed setup message (the next run is blocked once, then the host behaves normally), a custom-message run (allowed, no apply authority), and a setup prompt delayed by an input handler past another run (both protected). Unit tests cover entry reconstruction and every settlement path. The three reload cases pass unchanged except that they now count the `settled` state. |
| `identity-test-default-noenv.log` | `npm test` with no integration inputs: 62 pass, 3 skipped, each with its reason. |
| `identity-npm-pack-dry-run.log` | 28 packed files, unchanged. |
| `identity-mutation-checks.log`, `run-mutations.sh`, `mutate.py` | Seventeen new faults (`N1`–`N17`) plus earlier ones against the setup SDK and unit tests, with the source restored and checked with `git diff`. |

Mutation results: all new faults are caught. These include the reviewed P1
shape (`N1N2`: an unconfirmed run loses protection and confirmation needs the
exact marker line) and the reviewed P3 shape (`N3N4`: no settlement at
`session_tree` or the next new run). `N4` alone is caught only by the unit test,
because `session_tree` settles first in the SDK test. `M2`, `M3` and `M5`–`M12`
stay caught. As before, `M1` and `M1b` are not caught on their own, because the
branch record protects the same calls. Each is caught when paired with `N5`,
which removes branch protection. `M13`–`M20` target the earlier marker-based
source and no longer apply.

Limits: the reviewer's `/tmp` probes were not rerun, because they import
another checkout; the SDK tests reproduce their hooks. Apply authority still
depends on the run ID surviving in the prompt. A transform that drops it fails
closed rather than open. A reload after the command but before its prompt
starts leaves an `opened` entry that the next new run claims without apply
authority. A run that claims a reservation it does not own is blocked once. A
displaced setup prompt is recognized only by this extension instance.
Real Herdr, TUI, installed-package and live-model checks were not run.

## Unconditional writer gate (`9bef548`)

After four cross-family reviews each found a new approval bypass in the
run-identity design, the user chose option 1
(`docs/plans/10-wave2-unconditional-writer-gate.md`, planning commit
`96dbd163192613ff0c105dcdb37fe7c2c88ba2d5`, copied in checkpoint
`6f36a1b4fae897c260abd88766673baefbb77348`). While pstack is loaded, its
`tool_call` handler blocks every `subagents_write_task_models` call, with a
reason naming `/setup-pstack <request>`. The only exception is a nested call
whose `parentToolCallId` strictly equals the ID of a pstack apply call holding
a live, unused in-memory approval. The approval is created after the user
approves the exact payload and the post-dialog recheck passes. The call's
canonical arguments, including `expectedConfigRevision`, must equal the
approved payload, and the file revision must still match. The approval is
consumed once and cleared when the dispatch returns, when the apply call's
signal aborts, and at `session_shutdown` (reload, replacement, quit), at
`session_start`, at `session_tree` and by any `/setup-pstack` command. The
session-entry run identity, run IDs, prompt matching, displaced-run set, branch
lookup of apply calls and `recordedRun` were deleted with their tests. The apply
window remains as a convenience: the command activates the apply tool for the
next run that starts and closes it at that run's settlement or after one dialog.
All apply-tool checks are unchanged.

Inputs: base `b10a40c07f289c545b7e64c09dbbbccd6abc6322`; logs ran on the clean
implementation tree of `9bef548146d0341477739c8bff0dfe35e2db6097` with the
evidence files uncommitted. Host `b04906b6d6d0f81ac23a64753a5aec2b506c6423`
(clean, also used as `PI_HERDR_AGENTS_SOURCE`), roles
`22e1816725ba0910573f667f52e97c9757ca0305` (clean), mimir `f07dd981`, Cursor
`2cbf5850`; Node 26.8.2, npm 11.19.1, Pi 1.0.3; `HOME`, `PI_CODING_AGENT_DIR`
and the npm cache in a temporary directory.

| Log | What it shows |
| `gate-check-full.log` | `npm run check` with all inputs: typecheck, lint, format and 111 passing tests, none skipped. |
| `gate-test-default-noenv.log` | `npm test` with no integration inputs: 67 pass, 3 skipped, each with its reason. The in-memory gate unit tests run here too. |
| `gate-npm-pack-dry-run.log` | 28 packed files, unchanged. |
| `gate-mutation-checks.log`, `run-mutations.sh`, `mutate.py` | Nineteen faults against the setup SDK and unit tests, with the source restored and checked with `git diff`. |

New and changed tests. In the SDK suites with the real host writer, direct and
relayed writes are blocked in an ordinary run, inside and outside a setup turn.
The host's own `/subagents-init` prompt runs and its writer call is refused with
the pointer. An approved apply writes exactly once. Later raw, relayed and second
apply calls in the same turn are blocked after a decline, a success, a writer
failure and a report command during the dialog. Writes stay blocked after a
reload during the nested dispatch, after a decline and after a success, and
after a `before_agent_start` hook reloads Pi for the setup prompt. They also
stay blocked in a run that displaced a held setup prompt, across a reload, in
the late setup run, and in custom-message runs after a consumed setup prompt,
before and after a reload. Under a whitespace-normalizing input hook, apply
still works and direct writes are blocked. The earlier replacement, shutdown,
mutation-freeze and reconciliation tests are unchanged except for the new block
text and their final check, which now expects a later run's writes to be
blocked instead of allowed. A new in-memory unit harness drives the real command, apply tool and
guard. It checks that only the exact parent, payload and revision pass, and
only once. A direct call, an unrelated relay, a relay beneath the apply call
(`apply-1/relay`), a parent prefix (`apply-`) and siblings (`apply-2`,
`apply-10`) are refused, as are changed tasks and a changed
`expectedConfigRevision`. The approval is cleared after an unused dispatch, on
abort, and at `session_shutdown` for `new`, `resume`, `fork`, `reload` and
`quit`. A relayed apply call is refused, and the window closes at settlement.

Mutation results: all nineteen faults are caught. Gate faults:
default-allow (`G1`), no freeze (`G2`), no payload compare (`G3`), prefix parent
(`G4`), reusable approval (`G5`), not cleared on abort (`G6`), on shutdown or
replacement (`G7`, and both together), or after the dispatch (`G8`), revision
not compared (`G9`) and any parent accepted (`G10`). Apply-tool faults: the
flow-ended recheck (`G11`), an ignored decline (`G12`), the apply tool accepted
from a relay (`G13`) and the window left open after settlement (`G14`). Earlier
faults whose code is unchanged stay caught: `M5`, `M6`, `M8` and `M10`. `G6` and
`G7` are caught only by the unit harness: Pi 1.0.3 refuses an aborted nested call
before `tool_call`, so the SDK abort and replacement tests pass on Pi's refusal
alone.

Removed fault shapes and why:

- `M1`, `M1b`, `M13`–`M20`, `N1`–`N17` and their pairs mutate run protection,
  setup-run entries, markers, reservations, settlement, displaced runs and the
  unconfirmed-run notice. That code no longer exists. The default block
  replaces it, and `G1` covers its removal.
- `M2`, `M3` and `M2M3` removed the in-memory and branch recognition of an
  expired apply call. Without a live approval every call blocks, so nothing
  needs to recognize an expired one (`G1`, `G8`).
- `M7` removed the aborted-signal check in `authorizationProblem`. Abort now
  clears the approval through a signal listener (`G6`).
- `M9` targeted the deleted `revoked` flag; the flow-identity recheck is `G11`.
- `M11` and `M12` continue as `G4` and `G2`.

Limits: an apply window can be claimed by whichever run starts first after the
command. If another extension delays or consumes the setup prompt, that run may
make the one proposal; the dialog still shows the exact payload (asserted with
a declined dialog). Same-process extensions remain trusted code: one that calls
the host writer's implementation without Pi's `tool_call` path is outside this
guard. The reviewer's earlier `/tmp` probes were not rerun. The extension's load
path is unchanged (`index.ts` and registration), so the combined real-Herdr run
at `b10a40c` (72/72) was not repeated here. Real Herdr, TUI, installed-package
and live-model checks were not run.
