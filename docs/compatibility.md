# Compatibility

Status: private Wave 2 candidate. Nothing here is a published compatibility
promise.

## Intended host

Only a **role-free pi-herdr-agents candidate** is an intended host. Setup writes
additionally need the Wave 2 conditional writer. Runtime tests were run against
host `b04906b6d6d0f81ac23a64753a5aec2b506c6423` (branch
`wave2/conditional-model-writes`, based on the W1 host `e262c584`); the parent
integration owner records the final combined revision vector. Run the combined
checks with:

```bash
PI_HERDR_AGENTS_HOST=/path/to/candidate/pi-herdr-agents \
PI_HERDR_ROLES_PACK=/path/to/pi-herdr-roles \
npm test
```

`"pi-herdr-agents": "*"` in `peerDependencies` is temporary scaffolding for
private local experiments. A publication-compatible range must name a released
role-free host and is a later release gate. npm `pi-herdr-agents@2.0.5`
predates Maestro, bundles its own roles and workflow commands and is **not** a
supported host.

Pstack contributes no named roles and registers no role directory. Alone with a
role-free host, `subagents_list` lists no roles; with pi-herdr-roles it lists
that pack's six roles.

## Pi runtime

Developed and tested against Pi `1.0.3` (`@earendil-works/pi-coding-agent`
`1.0.3` dev dependency and CLI).

## Observed behavior with a host that still bundles roles

pi-herdr-agents `c2177dff835da44937e614e8a03d0405d442e848` (exported read-only
copy) on Pi 1.0.3, opt-in through `PI_HERDR_AGENTS_LEGACY_HOST`. Wave 1 observed
the first table while pstack still shipped `poteto`:

| Host configuration | Observed result |
| --- | --- |
| Default (`roles.bundled` true) | The host keeps its bundled `poteto` and reports its own `Role pack cannot replace bundled role "poteto"` diagnostic. |
| `roles.bundled: false` | `poteto` lists as `package:pi-herdr-pstack`. With pi-herdr-roles also installed, all seven roles list with their own package provenance and no role diagnostics. |

Since Wave 2 removed the role, the same host lists only its own seven bundled
roles with no pack diagnostic, and with `roles.bundled: false` it lists no
roles. Its writer has no `expectedConfigRevision`, so setup stays report-only.
`roles.bundled: false` disables only the host's role layer. That host still
registers its own workflow commands, so it is not a supported combination.

## Setup writer contract and run protection

`/setup-pstack` detects the conditional writer from the loaded
`subagents_write_task_models` schema: an optional `expectedConfigRevision`
accepting exactly `missing` or `sha256:<64 lowercase hex>`. It does not read
package versions or import host code. An older writer without that field, an
unrecognized schema, an inactive or absent writer keeps setup report-only. The
host serializes cooperating writers with an advisory lock and compares the
revision inside that lock; an editor or process that ignores the lock is
outside that guarantee, and same-process extensions are trusted code, not a
sandboxed adversary.

Pstack guards the writer from its `tool_call` handler for the whole setup run,
until `agent_settled`. Pi 1.0.3 awaits extension `tool_execution_start`
handlers for a nested call before `tool_call`, so another extension can revoke,
reload or replace the session in that window; the guard treats a late nested
call under a known apply call as expired, not as an unrelated call. After a
reload, the new instance recognizes the apply call from the active branch.
Results are judged from the saved file because a later `tool_result` handler
can mark a completed write as an error.

## Child-context signal

`/poteto-mode` ignores mode records owned by another Pi session when
`PI_SUBAGENT_ID` is set, so a forked pi-herdr-agents child does not inherit the
parent's sticky mode. The Wave 0 probe observed that pi-herdr-agents sets
`PI_SUBAGENT_ID` for fresh and resumed children but not for a user-driven
worktree handoff, and nested shells inherit it. It is a context hint, not a
security boundary; the host owns documenting that signal. Tests emulate fork
seeding by copying a parent session's entries under a new header; real Herdr
fork launches are a parent-owned gate.

## Historical: role skill startup

Before Wave 2 removed the `poteto` role, a thin adapter was planned to declare
`skills: poteto-mode`. A characterization with the real Pi 1.0.3 CLI and the
host's child extension found that the host delivers a role skill as its own
startup prompt and an `auto-exit` child can shut down before the task's reply
arrives (`docs/evidence/wave2-runtime/child-skill-startup-3x.log`). With no
pstack role there is no pstack startup gate, and that test was retired. The
finding remains a host/Pi observation for any role pack that declares skills.

## Not covered by this package's tests

Real Herdr child launches, child-scope resource visibility, worktree lifecycle,
the interactive TUI dialog itself, TUI `/new` and quit during a dialog, and
live-model behavior. These belong to the parent-owned sequential integration
suite or later approved evaluations. The RPC and SDK checks exercise the same
confirm API with scripted responses; session replacement and shutdown during a
pending approval use the SDK's `AgentSessionRuntime`, not the TUI.
