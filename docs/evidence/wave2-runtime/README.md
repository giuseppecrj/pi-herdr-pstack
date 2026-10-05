# Wave 2 runtime evidence

Runtime-owner logs for the `/poteto-mode`, `/setup-pstack` and role-activation
work in `wave2/pstack-commands`. These are local deterministic checks with a
faux provider, not live-model or real Herdr evidence.

Inputs: Pi CLI and SDK 1.0.3; Node 26.8.2; npm 11.19.1; host
`b04906b6d6d0f81ac23a64753a5aec2b506c6423` (clean worktree); roles
`22e1816725ba0910573f667f52e97c9757ca0305`; mimir
`f07dd981f62c9c994a5d043ede67d6c63c721454`; Cursor
`2cbf58508f40de470d7490b55c51d71241928fa2`.

| Log | What it shows |
| `check-full.log` | `npm run check` with `PI_HERDR_AGENTS_HOST`, `PI_HERDR_AGENTS_SOURCE`, `PI_HERDR_ROLES_PACK` and both upstream sources set: typecheck, lint, format and 84 passing tests; the opt-in legacy characterization is skipped. |
| `test-default-noenv.log` | `npm test` with no integration inputs: 58 pass, host/source-dependent suites skip with their reasons. |
| `guard-mutation-checks.log` | Eight deliberate regressions in the setup guard (no freeze, no payload comparison, prefix parent matching, unconditional payload, raw writer allowed, no saved-file verification, no post-dialog recheck, reusable approval), each caught by at least one test. The source was restored and compared afterwards. |
| `child-skill-startup-3x.log` | Three runs of the role skill-startup characterization against the real CLI and the host's child extension: the task is cut off in both delivery shapes; a fast fake reply hides the race. |

Not run here: real Herdr suites, an interactive TUI dialog, child-visible
package resources in a real launch, live models.
