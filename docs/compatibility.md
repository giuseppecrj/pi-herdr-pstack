# Compatibility

Status: pi-herdr-pstack `0.6.0` plus the unreleased #35 setup rewrite (75 skills and 23 playbooks).

## Host baseline

The compatibility baseline is the published **pi-herdr-agents `3.10.0`**
(`cbe538e637bbf8d3ee36d70aad182da33a044d9b`): the release that ships
per-category thinking (`models.tasksThinking`) and the approval dialog in its
task-model writer, both of which `/setup-pstack` relies on. The package
declares `"pi-herdr-agents": ">=3.10.0"`, `"@earendil-works/pi-ai": "^1.0.3"`
and `"@earendil-works/pi-coding-agent": "^1.0.3"`. The tests run against that
exact published host, pinned as the `pi-herdr-agents` devDependency, unless
`PI_HERDR_AGENTS_HOST` selects another checkout. An older host leaves
`/setup-pstack` refusing to start; poteto-mode and the other skills do not
depend on the newer host.

| Component | Tested revision |
| --- | --- |
| pi-herdr-agents | `3.10.0` from npm (`cbe538e637bbf8d3ee36d70aad182da33a044d9b`) |
| pi-herdr-roles (coexistence) | `0.1.0` from npm (`fc3383daaa839228cc9f703c2d99728684acfe07`) |
| Pi SDK and CLI | `1.0.3` |

For the #35 setup rewrite (unreleased), `npm run check` with the pinned
upstream sources passed 205 tests with 4 skipped; with
`PI_HERDR_AGENTS_SOURCE` (`/path/to/pi-herdr-agents` at `cbe538e`),
`PI_HERDR_ROLES_PACK` (npm `pi-herdr-roles@0.1.0`) and
`PI_HERDR_AGENTS_LEGACY_HOST` (an exported copy of `c2177dff`) also set,
`npm test` passed all 207 with none skipped. The setup checks drive
`/setup-pstack` through the real Pi 1.0.3 SDK and RPC mode with a scripted
provider and test-owned agent directories; they prove the flow and the
host's approval, not that a live model follows the skill.

For 0.5.0, `npm test` with the pinned upstream sources passed 162 tests with
0 skipped at the test level: cursor/plugins
`1ba91fc25c0977741dd0e267849e6234b037ed0a` (pstack 0.15.36), pi-mimir
`f07dd981f62c9c994a5d043ede67d6c63c721454` (unchanged), and pi-herdr-agents
`8864764e65a469f7d90f9a0deb39ec3f0b26befc` as `PI_HERDR_AGENTS_SOURCE`. The
optional `statechart` skill ships and checks models with the pack `tla-ts`
dependency (no Java). The host,
legacy-host and roles-pack suites were unset and were not counted as passes.

For 0.4.0, `npm test` with the pinned upstream sources passed 162 tests with
0 skipped at the test level: cursor/plugins
`190d28736eff128ec94f502a22c7fe0c4b56cd37`, pi-mimir
`f07dd981f62c9c994a5d043ede67d6c63c721454`, and pi-herdr-agents
`6164458896a2c2284863b935ffa94e3b340612cb` as `PI_HERDR_AGENTS_SOURCE`.
The host, legacy-host and roles-pack suites were unset and were not counted
as passes. The same `npm run check` without those variables (what CI runs)
passed 153 tests with 9 skipped, 0 fail.

For 0.3.2, `npm test` with the pinned upstream sources passed 162 tests with
0 skipped at the test level: cursor/plugins
`f713f14203cd6420cec13cd7c55c32d598dbab68`, pi-mimir
`f07dd981f62c9c994a5d043ede67d6c63c721454`, and pi-herdr-agents
`f79aa68c834f9739e7b8853168616073361779c8` as `PI_HERDR_AGENTS_SOURCE`.
The host, legacy-host and roles-pack suites were unset and were not counted
as passes. The same `npm run check` without those variables (what CI runs)
passed 153 tests with 9 skipped, 0 fail.

For 0.3.1, `npm run check` on Pi 1.0.3 passed 155 tests with 6 skipped: the
host, legacy-host and upstream-source checks ran without their variables. The
mode tests ran against Pi 1.2.0 in a scratch copy with test-owned agent
directories and a scripted provider. Before the fix, a run started by an
extension message with poteto-mode on raised an `extension_error` in
`before_agent_start`; after it, no error. 18 of the 20 mode tests pass on
1.2.0. The two wake tests fail because they assert the pre-1.2 behavior, where
such runs skip `before_agent_start` and lose the section after the first turn;
on 1.2.0 those runs keep the section and receive the hub like prompt runs.

For 0.3.0, `npm run check` passed all 219 tests with no skips using the host
and roles revisions above, the legacy host fixture, and all pinned upstream
sources.

For 0.2.1, `npm run check` passed all 189 tests with no skips on Node
26.8.2, using host `f182ea592c666eaca358a4fe6a13b886af0b1c98` (published
3.0.3), the roles revision above, the legacy host fixture, and all pinned
upstream sources. The 20 mode tests also passed against
installed Pi 1.1.0 with test-owned agent directories and a scripted provider.
These checks cover hub deduplication, compaction recovery, extension-message
wakes, failed prompt preparation, and session transitions; they prove
instruction delivery, not live-model adherence.

For 0.2.1, a separate parent-owned real-Herdr smoke gate also passed both
the task-form and explicit-enable paths on Pi 1.1.0 with host
`f182ea592c666eaca358a4fe6a13b886af0b1c98` and a local scripted provider. Each parent request, including the actual child
completion wake, contained exactly one hub; each forked child inherited the
parent's mode record but received no sticky reminder. These two focused
checks are not a rerun of the historical G1 to G7 host/worktree suite.

For 0.2.0, `npm run check` passed on Node 22.22.2 with host
`80aa97306ee74b03cedf92e413945a2985d5b44f` as `PI_HERDR_AGENTS_HOST`
(real-writer consent, writer-gate, RPC setup and
combined-host checks), pi-herdr-roles as `PI_HERDR_ROLES_PACK` (coexistence),
and the pinned upstream sources. The same checkout served as
`PI_HERDR_AGENTS_SOURCE`, whose provenance and schema checks read the pinned
commits in its history, not `80aa973`. The real-Herdr gates were not rerun for
0.2.0; G1 to G7 last ran against host `7d35371` for 0.1.0 (below). Published
hosts 3.0.0 to 3.0.2 are allowed by the range but were not tested for this
release. Run the combined checks with:

```bash
PI_HERDR_AGENTS_HOST=/path/to/pi-herdr-agents \
PI_HERDR_ROLES_PACK=/path/to/pi-herdr-roles \
npm test
```

Earlier wave runtime tests used host `b04906b6d6d0f81ac23a64753a5aec2b506c6423`
(branch `wave2/conditional-model-writes`, based on the W1 host `e262c584`);
that branch is superseded by the 3.0.0 line. npm `pi-herdr-agents@2.0.5` and
earlier predate Maestro, bundle their own roles and workflow commands and are
**not** supported hosts.

Pstack contributes no named roles and registers no role directory. Alone with a
role-free host, `subagents_list` lists no roles; with pi-herdr-roles it lists
that pack's six roles. comment-sicko is a bare delegate prompt under
`skills/pstack/no-comments/references/`, launched by `/skill:no-comments` through the
public `subagent` schema with `systemPrompt`; pstack still ships no named roles.
Wave 3 repins the delegation schema to host
`7d35371f5d7d0df3edd208a1d5c9a187767d563b`, whose `SubagentParams` and task
categories match the Wave 2 pin. Wave 4 keeps that pin: every `json subagent`
example is checked against host `7d35371`, and the Wave 4 real-Herdr gates ran
against it.

## Host facts the Wave 4 workflows rely on

Observed at host `7d35371f5d7d0df3edd208a1d5c9a187767d563b` with a
deterministic provider (gates G1 to G7); they prove host mechanics, not model
behavior. `skills/pstack/poteto-mode/references/fan-out.md` states them for agents.

- Fan-out: three bare children launched in one turn each get one initial
  message and one delivery; dropout and cancel give exactly one terminal
  result each; candidate worktrees are retained and listed, and removal is
  refused while a child is live.
- A child launched without `tools` sees MCP tools; a child with a `tools` list
  does not.
- A bare child is delivered before any grandchild it launched finishes, and the
  grandchild's result reaches no one, so children are leaves.
- An ordinary child exits after `caller_ping`.
- A blocking watcher wait draws one informational no-progress advisory per idle
  minute, and its delivery wakes the parent.
- `worktree_list` and `worktree_remove` are registered only in parent sessions.
- Pstack ships no timer: nothing wakes a coordinator except a delivery, an
  advisory or the operator.

## Pi runtime

The full suite uses Pi `1.0.3` (`@earendil-works/pi-coding-agent` `1.0.3`
dev dependency and CLI). The sticky-mode CLI suite additionally passes on Pi
`1.1.0`; that is targeted coverage, not a full rerun of every package check
on 1.1.0. The peer range remains `^1.0.3`; other Pi versions are untested.

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
roles. Its writer has no `tasksThinking`, so `/setup-pstack` refuses to start.
`roles.bundled: false` disables only the host's role layer. That host still
registers its own workflow commands, so it is not a supported combination.

## Setup and the host writer

`subagents_write_task_models` owns task-model approval (ADR-0002). From 3.10.0
it shows the exact before/after models and thinking for every call, whichever
package asks, with "No, keep current" as the default, and writes only after
"Yes, save". It refuses without a dialog-capable UI and in subagent sessions,
checks `expectedConfigRevision` before the dialog, and binds the approved
bytes under its advisory lock. pstack therefore has no writer gate, apply
tool or init-approval handling, and does not take part in `/subagents-init`.

What pstack keeps is what the host cannot do for a setup flow outside its own
init (`pi-extension/pstack/setup.ts`):

- **Make the writer callable.** The host registers its writer inactive, and
  `tool_search` never finds it; only `/subagents-init` activates it.
  `/setup-pstack` activates it for its flow, and the host deactivates it after
  a successful write.
- **Brief the skill.** The skill's steps need the authenticated models with
  the thinking levels each supports (Pi's `getSupportedThinkingLevels`), the
  saved `models.tasks` and `models.tasksThinking`, and the config revision.
  The command reads them in code and sends only those. Every config value
  and every model ID goes out as one line of JSON with controls, format
  characters and line separators escaped, so neither can add brief lines.
  A category value that is not a list of model strings, or a thinking value
  that is not a known level, refuses setup naming only its key, so the model
  never reads other settings or malformed values from the file.
- **Refuse early.** It does not start when the loaded writer lacks
  `tasksThinking` (a host before 3.10.0, whose writer also has no approval
  dialog), without dialogs, in a subagent, while a turn runs, or with a config
  file it cannot read.

It does not read package versions or import host code; the writer schema is
the contract.

## Child-context signal

`/poteto-mode` ignores mode records owned by another Pi session when
`PI_SUBAGENT_ID` is set, so a forked pi-herdr-agents child does not inherit the
parent's sticky mode. The Wave 0 probe observed that pi-herdr-agents sets
`PI_SUBAGENT_ID` for fresh and resumed children but not for a user-driven
worktree handoff, and nested shells inherit it. It is a context hint, not a
security boundary; the host owns documenting that signal. Repository tests emulate fork
seeding by copying a parent session's entries under a new header. The separate
0.2.1 real-Herdr smoke gate also verified this with actual forked children.

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
suite or later approved evaluations. This package's RPC and SDK checks answer
the host's approval `select` dialog with scripted choices. The writer's own
lifecycle (timeout, cancellation, shutdown or session replacement while an
approval is pending, and concurrent calls) is covered by pi-herdr-agents' tests
(`test/maestro/task-model-approval.test.ts` at `cbe538e`), not by this package.

Whether a live model follows the Wave 4 fan-out, seat-picking, babysit,
shipping, autopilot, orchestrate and `make-bot-ui` prose was not evaluated; no
live-model run was authorized. The real-Herdr gates above use a scripted
provider.
