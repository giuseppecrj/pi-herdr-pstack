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
