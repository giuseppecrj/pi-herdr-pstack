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
predates Maestro, bundles `poteto` and is **not** a supported host.

## Pi runtime

Developed and tested against Pi `1.0.3` (`@earendil-works/pi-coding-agent`
`1.0.3` dev dependency and CLI). Pi 1.0.3 also removes extension bus listeners
on reload and dispose; the pack's explicit `session_shutdown` unsubscribe is
still required by the role-pack protocol and is tested directly.

## Observed behavior with a host that still bundles roles

pi-herdr-agents `c2177dff835da44937e614e8a03d0405d442e848` (exported read-only
copy) on Pi 1.0.3:

| Host configuration | Observed result |
| --- | --- |
| Default (`roles.bundled` true) | The host keeps its bundled `poteto` and reports its own `Role pack cannot replace bundled role "poteto"` diagnostic. |
| `roles.bundled: false` | `poteto` lists as `package:pi-herdr-pstack`. With pi-herdr-roles also installed, all seven roles list with their own package provenance and no role diagnostics. |

`roles.bundled: false` disables only the host's role layer. That host still
registers its own workflow commands, so it is not a supported combination.

## Setup writer contract

`/setup-pstack` detects the conditional writer from the loaded
`subagents_write_task_models` schema: an optional `expectedConfigRevision`
accepting exactly `missing` or `sha256:<64 lowercase hex>`. It does not read
package versions or import host code. An older writer without that field, an
unrecognized schema, an inactive or absent writer keeps setup report-only. The
host serializes cooperating writers with an advisory lock and compares the
revision inside that lock; an editor or process that ignores the lock is
outside that guarantee, and same-process extensions are trusted code, not a
sandboxed adversary.

## Child-context signal

`/poteto-mode` ignores mode records owned by another Pi session when
`PI_SUBAGENT_ID` is set, so a forked pi-herdr-agents child does not inherit the
parent's sticky mode. The Wave 0 probe observed that pi-herdr-agents sets
`PI_SUBAGENT_ID` for fresh and resumed children but not for a user-driven
worktree handoff, and nested shells inherit it. It is a context hint, not a
security boundary; the host owns documenting that signal. Tests emulate fork
seeding by copying a parent session's entries under a new header; real Herdr
fork launches are a parent-owned gate.

## Role skill startup

The approved thin `poteto` adapter needs `skills: poteto-mode`. It is **not**
enabled. The host launches role skills as separate prompt arguments: direct
(fork) delivery runs `/skill:poteto-mode` as its own turn before the task;
artifact (fresh) delivery runs the task first and the skill-only turn second.
With `auto-exit: true`, the host's child extension shuts the child down when
the first run settles, and Pi 1.0.3's interactive shutdown cuts off the second
run. `test/child-skill-startup.test.ts` reproduces this with the real Pi CLI
under a pseudo-terminal, the host's own child extension and a delayed second
reply: the task's reply never arrives and the completion sidecar still reports
`done`. An instant fake reply finishes inside the shutdown window and hides the
race. Activation waits for a host or Pi change that delivers the skill and task
in one run, or for a separately approved alternative.

## Not covered by this package's tests

Real Herdr child launches, child-scope resource visibility, worktree lifecycle,
the interactive TUI dialog itself and live-model behavior. These belong to the
parent-owned sequential integration suite or later approved evaluations. The
RPC and SDK checks exercise the same confirm API with scripted responses.
