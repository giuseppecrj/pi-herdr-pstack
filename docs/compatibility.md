# Compatibility

Status: pi-herdr-pstack `0.3.0` (full inventory, 51 skills and 23 playbooks).

## Host baseline

The compatibility baseline is the published **pi-herdr-agents `3.0.0`**: the
first role-free host release, with the conditional task-model writer
(`expectedConfigRevision`) that setup writes need, the operating skill and
`subagent_cancel`. The package declares `"pi-herdr-agents": ">=3.0.0"`,
`"@earendil-works/pi-coding-agent": "^1.0.3"` and `"typebox": "^1.3.27"` (the
version Pi 1.0.3 resolves in the lockfile). The temporary `"*"` peer ranges
used during the private wave experiments are gone.

| Component | Tested revision |
| --- | --- |
| pi-herdr-agents | `1b6bacd0b5eecb6f83ffba1d5a5ee57a8b0fa944` (3.1.0 release candidate feature commit; published `3.0.3` is `f182ea592c666eaca358a4fe6a13b886af0b1c98`) |
| pi-herdr-roles (coexistence) | `fc3383daaa839228cc9f703c2d99728684acfe07` |
| Pi SDK and CLI | `1.0.3` (full checks); `1.1.0` (mode and init CLI checks) |

The peer range `>=3.0.0` keeps the report and explicit change flows working
on hosts 3.0.x. Task-model init (`/setup-pstack init`, `/subagents-init`
routed through pstack) requires pi-herdr-agents `>=3.1.0`; the range does not
enforce that, and an older host leaves init unsupported.

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
`skills/no-comments/references/`, launched by `/skill:no-comments` through the
public `subagent` schema with `systemPrompt`; pstack still ships no named roles.
Wave 3 repins the delegation schema to host
`7d35371f5d7d0df3edd208a1d5c9a187767d563b`, whose `SubagentParams` and task
categories match the Wave 2 pin. Wave 4 keeps that pin: every `json subagent`
example is checked against host `7d35371`, and the Wave 4 real-Herdr gates ran
against it.

## Host facts the Wave 4 workflows rely on

Observed at host `7d35371f5d7d0df3edd208a1d5c9a187767d563b` with a
deterministic provider (gates G1 to G7); they prove host mechanics, not model
behavior. `skills/poteto-mode/references/fan-out.md` states them for agents.

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
roles. Its writer has no `expectedConfigRevision`, so setup stays report-only.
`roles.bundled: false` disables only the host's role layer. That host still
registers its own workflow commands, so it is not a supported combination.

## Setup writer contract and the writer gate

`/setup-pstack` detects the conditional writer from the loaded
`subagents_write_task_models` schema: an optional `expectedConfigRevision`
accepting exactly `missing` or `sha256:<64 lowercase hex>`. It does not read
package versions or import host code. An older writer without that field, an
unrecognized schema, an inactive or absent writer keeps setup report-only. The
host serializes cooperating writers with an advisory lock and compares the
revision inside that lock; an editor or process that ignores the lock is
outside that guarantee, and same-process extensions are trusted code, not a
sandboxed adversary.

**While pstack is loaded, every `subagents_write_task_models` call is refused
by default**, in every run, whether or not a setup flow is open. That includes
any direct model call and any call relayed through another tool. It also
includes the writer call an older host's `/subagents-init` prompt asks for; a
host with the task-model init events sends its draft to pstack's flow instead
(see below). The block reason names `/setup-pstack <request>` and
`/subagents-init`.

The sole exception is checked in pstack's `tool_call` handler: a nested call
whose `parentToolCallId` strictly equals the tool-call ID of a pstack apply call
that holds a live, unused approval. The apply call creates that approval in
memory only after the user approved the exact payload in the dialog and the
post-dialog recheck passed. The call's arguments must match the approved
payload canonically, including `expectedConfigRevision`, and the file's
revision must still match. The approval is used once and is cleared when the
nested dispatch returns, when the apply call's abort signal fires, and at
`session_shutdown`, which Pi emits for reload, session replacement and quit.
Nothing is written to the session to identify setup runs, and prompt text is
never consulted. After a reload the fresh instance holds no approval, so every
writer call blocks. Pi 1.0.3 awaits extension `tool_execution_start` handlers
for a nested call before `tool_call`; anything another extension does in that
window, such as a report command, a reload or a session replacement, clears
the approval or leaves the call to a fresh instance without one.

The apply tool itself must be called directly by the model; a call from another
tool is blocked. `/setup-pstack <request>` activates it for the run its own
prompt starts and closes that window when the run settles, after one dialog,
or at session start, tree navigation or shutdown. Opening requires a selected
model. The window follows its prompt through Pi's events: Pi hands a command's
prompt to `input` handlers (source `"extension"`), then checks the model and
its auth, then emits `before_agent_start` and `agent_start`. Any other input,
or a run that skipped those steps (such as a custom message that triggers a
turn), closes a window whose prompt has not started, so a prompt Pi rejected
or another extension consumed leaves nothing for a later request. Input during
the window's own run is a steer or follow-up and keeps it. Two cases remain:
if an input handler that runs before pstack's consumes the prompt, pstack never
sees it, and the next prompt from another extension may take the window; and
Pi runs asynchronous `before_agent_start` handlers before `agent_start`, so a
run triggered in that gap may too. The window is a convenience either way, and
the dialog still shows the exact payload. The approval dialog is the gate.

Pi-herdr-agents does not expose the writer in child sessions, so pstack in a
child changes nothing.

Results are judged from the saved file because a later `tool_result` handler
can mark a completed write as an error.

## Task-model init with pi-herdr-agents

pstack takes part in `/subagents-init` through two public pi-herdr-agents
events, version 1, without importing host code:

- On `pi-herdr-subagents:task-models:init:approval:v1`, pstack offers as
  `pi-herdr-pstack` before any check. When the host opens that offer, pstack
  applies the same apply blockers, idle check and selected-model check as
  `/setup-pstack <request>`, with the brief's models standing in for the
  report's model list; it builds no report. It checks that the config still has
  the brief's `configRevision`, opens its apply window with an init origin, and
  returns its tool, its instructions and a `cancel` that closes that window
  only. The host writes the prompt, and calls `cancel` when it does not hand
  the prompt to Pi (an inactive tool, or `sendUserMessage` throwing). A prompt
  Pi rejects later, such as one whose selected model has no configured auth,
  is handled by the window's event tracking above.
- `/setup-pstack init [preferences]` emits
  `pi-herdr-subagents:task-models:init:start:v1` and starts the host only when
  exactly one host offered. No host means the alias is unsupported. More than
  one host, an invalid offer, a throw or an asynchronous answer stops it; none
  of these writes anything.

An init proposal must use refs that are both in the host's brief and in the
active registry's available models now (`modelRegistry.getAvailable()`, the
same source as the brief), and it is refused when the file's revision differs
from the brief's. The post-dialog authentication recheck reads the same
source. Init never lists every registered model with `getAll`; the report and
explicit change flows still do, with `hasConfiguredAuth`. The writer gate, canonical payload, parent call check, one-use
approval, post-dialog rechecks and reconciliation are unchanged. The approval
event itself authorizes nothing.

The optional ranking `basis` uses pi-herdr-agents' writer field of the same
name and shape. pstack detects that field from the writer's public schema. With
it, the basis is part of the exact approved payload, so any change to it
fails as an argument mismatch. Without it, pstack refuses research proposals
and sends registry-only payloads without a basis.

Pi's event bus swallows listener exceptions, so a pstack listener that failed
before offering would look absent to the host. The host would then prompt for
its direct writer, and the writer gate would refuse that call.

The host-side protocol is part of pi-herdr-agents `3.1.0`. Hosts before
3.1.0 do not emit these events. Verification used host feature commit
`1b6bacd0b5eecb6f83ffba1d5a5ee57a8b0fa944` as `PI_HERDR_AGENTS_HOST`.
The real Pi 1.0.3 SDK setup suite
passed with a scripted provider, with the host loaded before and after pstack.
It covered both commands, a research basis, refusals, two approval offers,
reload and a new session, pack-only and host-only sessions, a registry whose
`getAll` throws, and init with no selected model or with a selected model that
has no configured auth, followed by an unrelated request.

On installed Pi 1.1.0, a command smoke over RPC loaded both source checkouts
as separate packages with a scripted provider and test-owned agent
directories. It passed `/subagents-init` and `/setup-pstack init` in both load
orders, a declined dialog and a submitted research basis: each showed one
dialog, wrote nothing before consent and at most one nested writer call after
it, preserved `models.default`, agent preferences and an unrelated setting,
and did not save the basis. It also passed a direct writer call and an apply
call without a flow (both refused, no dialog), an external config edit during
the dialog (approval stale, no writer dispatched, edit preserved), and
`/setup-pstack init` without a host (refused, no prompt, no write). This is
not a TUI check. Scripted providers prove routing and the gate, not model
research quality or honesty.

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
suite or later approved evaluations. The RPC and SDK checks exercise the same
confirm API with scripted responses; session replacement and shutdown during a
pending approval use the SDK's `AgentSessionRuntime`, not the TUI.

Whether a live model follows the Wave 4 fan-out, seat-picking, babysit,
shipping, autopilot, orchestrate and `make-bot-ui` prose was not evaluated; no
live-model run was authorized. The real-Herdr gates above use a scripted
provider.
