# pi-herdr-pstack

> **Experimental, private, unpublished — Wave 2 candidate.** This package
> contributes the `poteto` role, the `poteto-mode` and `setup-pstack` skills and
> their `/poteto-mode` and `/setup-pstack` commands. The other 49 skills of the
> full pstack inventory are planned for later waves and are **not** shipped.
> Nothing is published or released.

A Pi methodology pack for [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents).
pi-herdr-agents is the execution host; Herdr is the terminal multiplexer it runs
children in. This pack owns methodology and roles, never a child runner,
scheduler, model store, installer or shell-permission engine.

## Contents

| Resource | Kind | Notes |
| `poteto` | role | Autonomous engineering agent moved unchanged from pi-herdr-agents. Spawns children through the host's `subagent` tool. |
| `poteto-mode` | skill | The single source of poteto's methodology: hub, three references, twelve base playbooks. Explicit-only (`disable-model-invocation: true`). |
| `setup-pstack` | skill | Explains the setup report and drives one approved change inside a `/setup-pstack` change flow. |
| `/poteto-mode` | command | Sticky methodology mode for the current session branch. |
| `/setup-pstack` | command | Report-first setup; shared task-model changes only with explicit approval. |

`poteto` names no other role and needs neither pi-herdr-roles nor another pack.

`poteto` does **not** declare `skills: poteto-mode` yet. With Pi 1.0.3 and the
tested host, a role skill is delivered as its own startup prompt, and an
`auto-exit` child exits when that first run settles, cutting off the task (see
[compatibility](docs/compatibility.md#role-skill-startup)). The role keeps its
W1 body until a startup path that keeps the task is available.

## `/poteto-mode`

| Input | Effect |
| `/poteto-mode` or `/poteto-mode on` | Turns the mode on for this session branch. Starts no work. |
| `/poteto-mode status` | Reports on/off, whether it is persisted or memory-only, and whether the skill resolves to this package. |
| `/poteto-mode off` | Stops future reminders. Earlier context and running subagents are unchanged. |
| `/poteto-mode <task>` | Turns the mode on and sends one prompt: this package's full `poteto-mode` skill, wrapped as Pi wraps `/skill:` commands, followed by the task. Refused while a turn is running; nothing is queued. |

- While on, each prompt gets a short `pstack_poteto_mode` system-prompt section
  naming the hub file. The section is computed from the active branch at every
  prompt. Turning the mode on or off during a turn affects the next prompt, not
  the running turn or its steering continuations.
- State is a small versioned session entry owned by the Pi session that wrote
  it. Tree navigation, compaction, reload, resume, user `/fork` and `/clone`
  follow the branch. In a pi-herdr-agents child (`PI_SUBAGENT_ID` set, a hint
  rather than a security boundary), records copied from a parent session are
  ignored; the child's own `/poteto-mode` survives its resume.
- `/skill:poteto-mode` loads the methodology once and never turns the mode on.
- If the effective `poteto-mode` skill is filtered out or shadowed by another
  file, the command refuses to enable and says why. Mode never grants
  permission for external or irreversible actions.

## `/setup-pstack`

- `/setup-pstack` (or `/setup-pstack report`) shows a report built in code: the
  session, the host's tools and writer contract, this package's skills and
  commands, authenticated exact models, and the shared task categories, their
  metadata, the default model and any `poteto` override from
  `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default
  `~/.pi/agent/herdr-agents/config.json`). Other config fields are never shown.
  It makes no change.
- `/setup-pstack <request>` opens a one-turn change flow. The model may call the
  setup-only `pstack_apply_task_models` tool once with the categories to
  replace. The extension keeps every other category, rejects unknown
  categories, duplicates, `task:` aliases and unauthenticated references,
  generates the metadata, and shows the complete `subagents_write_task_models`
  payload, including its `expectedConfigRevision`, in a dialog with a
  two-minute timeout. Only after approval, and after rechecking the file,
  session and authentication, does it call the host writer through
  `ctx.executeTool`. It then verifies the saved file before reporting success.
- During the flow, pstack blocks every other writer call, binds the approval to
  that one nested call and payload, and freezes the validated arguments.
  The host's conditional writer rejects a file that changed after approval.
  Stale, busy, failed, declined or cancelled attempts write nothing and are not
  retried. Outside a flow the host writer behaves exactly as without pstack.
- Setup is report-only in a subagent, without a dialog-capable UI, with a
  missing, inactive or older unconditional writer, or with a missing,
  unreadable, malformed, non-object, missing-status or invalid-models config.
- Task categories are shared pi-herdr-agents preferences: a change affects every
  workflow and role pack using them, not only pstack.

## Prerequisites and installation

pi-herdr-agents is a peer dependency and an explicit Pi installation
prerequisite: **a peer declaration does not activate an extension**. Install and
enable both through Pi. Because both candidates are private and unpublished,
experiment only with local paths and an isolated agent directory:

```bash
export PI_CODING_AGENT_DIR=/tmp/pstack-experiment/agent
pi install /path/to/candidate/pi-herdr-agents
pi install /path/to/pi-herdr-pstack
```

Install the pack where pi-herdr-agents children load packages too (normally the
same user settings). Do not install it beside a host that still bundles
`poteto`; see [compatibility](docs/compatibility.md).

## How the role is registered

`pi-extension/pstack/roles.ts` listens synchronously for
`pi-herdr-subagents:roles:discover:v1`, registers `agents/` for `apiVersion`
1 only and unsubscribes on `session_shutdown`. It imports nothing from
pi-herdr-agents and copies nothing into user or project role directories.
Project and global `poteto.md` definitions override the package role as usual.

## Development

```bash
npm install          # .npmrc disables automatic peer installation
npm run check        # typecheck, lint, format:check, test
```

Tests use test-owned temporary agent, home, XDG and project directories, the
pinned `@earendil-works/pi-coding-agent@1.0.3` SDK and CLI and a deterministic
offline faux provider. They never edit your Pi settings. A passing
faux-provider run is not evidence that a live model follows `poteto` or the
skills.

| Variable | Effect |
| `PI_HERDR_AGENTS_HOST` | Role-free, conditional-writer host package root for the real-writer consent, RPC setup, combined-host and child skill-startup checks; role-free expectations always apply. Skipped when unset. |
| `PI_HERDR_AGENTS_LEGACY_HOST` | Opt-in pre-extraction host root for separate legacy bundled-role characterization; skipped when unset. |
| `PI_HERDR_ROLES_PACK` | Also install pi-herdr-roles to check coexistence; needs `PI_HERDR_AGENTS_HOST`. |
| `PI_HERDR_AGENTS_SOURCE` | pi-herdr-agents Git checkout for role provenance and schema pins. Defaults to a sibling `../pi-herdr-agents` containing the source commit; skipped otherwise. |
| `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE` | Upstream pstack checkouts for skill source-hash reproduction; skipped when unset. |
| `PI_BIN` | Alternative Pi executable for RPC tests. |

The child skill-startup check also needs util-linux `script(1)` for a
pseudo-terminal. `docs/plans/` contains the coordinated migration plans; it is
not shipped.

## Provenance and license

See [provenance](docs/provenance.md). MIT; see [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
