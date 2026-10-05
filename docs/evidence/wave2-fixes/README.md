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
