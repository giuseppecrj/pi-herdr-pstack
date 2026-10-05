# Compatibility

Status: private Wave 1 candidate. Nothing here is a published compatibility
promise.

## Intended host

Only the **role-free pi-herdr-agents candidate** from the Wave 1 host extraction
is an intended host. Its exact SHA is recorded by the parent integration owner in
the combined revision vector. Run the combined checks with:

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

## Child-context signal (pinned assumption for Wave 2)

Wave 1 implements no mode state. For later mode work, the Wave 0 probe observed
that pi-herdr-agents sets `PI_SUBAGENT_ID` for fresh and resumed children but
not for a user-driven worktree handoff, and nested shells inherit it. Treat it as
a context hint, not a security boundary; the host owns documenting that signal.

## Not covered by this package's tests

Real Herdr child launches, child-scope resource visibility, worktree lifecycle
and live-model behavior. These belong to the parent-owned sequential
integration suite or later approved evaluations.
