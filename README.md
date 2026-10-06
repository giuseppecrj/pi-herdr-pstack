# pi-herdr-pstack

> **Experimental, private, unpublished — Wave 3 candidate.** This package
> contributes 37 skills of the full pstack inventory (the two Wave 2 skills and
> the 35 Wave 3 skills), the `/poteto-mode` and `/setup-pstack` commands and one
> bare delegate prompt. It ships no named roles. The other 14 skills are
> planned for Wave 4 and are **not** shipped. Nothing is published or released.

A Pi methodology pack for [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents).
pi-herdr-agents is the execution host; Herdr is the terminal multiplexer it runs
children in. This pack owns methodology, never a child runner, scheduler, model
store, installer or shell-permission engine.

## Contents

| Resource | Kind | Notes |
| `poteto-mode` | skill | The single source of poteto's methodology: hub, three references, twelve base playbooks. Explicit-only (`disable-model-invocation: true`). |
| `setup-pstack` | skill | Explains the setup report and drives one approved change inside a `/setup-pstack` change flow. |
| 24 `principle-*` skills | skills | One rule each: `principle-attack-the-premise`, `principle-boundary-discipline`, `principle-build-the-lever`, `principle-encode-lessons-in-structure`, `principle-exhaust-the-design-space`, `principle-experience-first`, `principle-explain-the-number`, `principle-fix-root-causes`, `principle-foundational-thinking`, `principle-guard-the-context-window`, `principle-laziness-protocol`, `principle-make-operations-idempotent`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-minimize-reader-load`, `principle-model-the-domain`, `principle-never-block-on-the-human`, `principle-outcome-oriented-execution`, `principle-prove-it-works`, `principle-redesign-from-first-principles`, `principle-separate-before-serializing-shared-state`, `principle-sequence-verifiable-units`, `principle-subtract-before-you-add`, `principle-test-behavior-not-implementation`, `principle-type-system-discipline`. poteto-mode cites them; the hub keeps a summary of each. |
| `tdd`, `correct`, `benchmark-checklist`, `blast-radius`, `typescript-best-practices` | skills | Engineering technique: test-first fixes, repo lessons, vetting measured numbers, breakage outside a diff, TypeScript rules (load explicitly before `.ts`/`.tsx` edits). |
| `unslop`, `technical-writing`, `no-comments`, `teach`, `bro` | skills | Prose and communication: AI-tell cleanup, documentation standards, comment removal through a bare delegate, plain explanations, plain-words recap. |
| `poteto-help` | skill | Pi guide to installing pstack, the commands and which skill, playbook or principle fits a task. |
| `/poteto-mode` | command | Sticky methodology mode for the current session branch. |
| `/setup-pstack` | command | Report-first setup; shared task-model changes only with explicit approval. |

All skills except `setup-pstack` are explicit-only: they load through
`/skill:<name>` or when poteto-mode reads them for a step. Skills from Wave 4
are named with a `planned W4` marker and an interim route wherever a shipped
file refers to them.

Pstack registers no role directory and depends on neither pi-herdr-roles nor
another pack. comment-sicko is a bare delegate prompt under
`skills/no-comments/references/`, not a role: `/skill:no-comments` passes it as
`systemPrompt` with `tools: "read, bash, edit"`, and pstack still ships no named
roles. `poteto-mode` delegates are deliberately **bare**: each call omits
`agent` and passes a bounded reference prompt (implementer, investigator,
reviewer or verifier) as `systemPrompt`, with explicit `model`, `thinking`,
`fork` and, for parallel writers, `worktree`. The `poteto` role that Wave 1
moved here was removed in Wave 2 at the user's request; see
[provenance](docs/provenance.md).

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
  metadata and the default model from
  `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default
  `~/.pi/agent/herdr-agents/config.json`). Per-agent overrides and other config
  fields are never shown, and diagnostics never echo keys from the file. It
  makes no change.
- `/setup-pstack <request>` opens a one-turn change flow. The model may call the
  setup-only `pstack_apply_task_models` tool once with the categories to
  replace. The extension keeps every other category, rejects unknown
  categories, duplicates, `task:` aliases and unauthenticated references,
  generates the metadata, and shows the complete `subagents_write_task_models`
  payload, including its `expectedConfigRevision`, in a dialog with a
  two-minute timeout. Only after approval, and after rechecking the file,
  session and authentication, does it call the host writer through
  `ctx.executeTool`. It then verifies the saved file before reporting success.
- **While pstack is loaded, it refuses every `subagents_write_task_models`
  call except its own approved one.** That includes pi-herdr-agents'
  `/subagents-init`, whose prompt has the model call the writer directly, and
  any direct or relayed writer call in any run, inside or outside a setup flow.
  The refusal names `/setup-pstack <request>` as the replacement. The single
  exception is the nested call the apply tool makes after you approve the exact
  payload: it must come directly from that apply call, match the approved
  arguments including `expectedConfigRevision`, and find the file unchanged.
  The approval lives only in memory while that call dispatches. It is used
  once, and it ends when the dispatch returns, when the turn is aborted, and
  when the session is replaced, reloaded or shut down. After a `/reload` there
  is no approval, so every writer call is refused. The validated arguments are
  frozen against later hooks. The host's conditional writer still rejects a
  file that changed after approval.
- The apply tool is visible only to the next run after `/setup-pstack
  <request>`, for one proposal. If another extension delays or consumes the
  setup prompt, the run that starts first may make that proposal instead; the
  dialog still shows the exact payload, and nothing is written without your
  approval.
- Declined, rejected, stale or cancelled attempts stop before the writer runs.
  Once the writer has been called, an error result does not prove nothing was
  written: pstack rereads the file and reports it as unchanged, as holding the
  approved preferences, or as changed in a way it cannot attribute. Nothing is
  retried.
- Setup is report-only in a subagent, without a dialog-capable UI, with a
  missing, inactive or older unconditional writer, or with an unreadable,
  malformed, non-object, missing-status or invalid-models config.
- Task categories are shared pi-herdr-agents preferences: a change affects every
  workflow and role pack using them, not only pstack. An explicit `model`
  argument, exact or `task:<category>`, takes precedence over role, per-agent
  and default models.

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
same user settings). While pstack is installed, pi-herdr-agents'
`/subagents-init` and direct `subagents_write_task_models` calls are refused;
use `/setup-pstack <request>` to change shared task models. Children never see
the writer, so this changes nothing there. Only a role-free host is an intended combination; see
[compatibility](docs/compatibility.md). Pstack imports nothing from
pi-herdr-agents and copies nothing into user or project role directories.

## Development

```bash
npm install          # .npmrc disables automatic peer installation
npm run check        # typecheck, lint, format:check, test
```

Tests use test-owned temporary agent, home, XDG and project directories, the
pinned `@earendil-works/pi-coding-agent@1.0.3` SDK and CLI and a deterministic
offline faux provider. They never edit your Pi settings. A passing
faux-provider run is not evidence that a live model follows the skills.

| Variable | Effect |
| `PI_HERDR_AGENTS_HOST` | Role-free, conditional-writer host package root for the real-writer consent, writer-gate, RPC setup and combined-host checks; role-free expectations always apply. Skipped when unset. |
| `PI_HERDR_AGENTS_LEGACY_HOST` | Opt-in pre-extraction host root for separate legacy bundled-role characterization; skipped when unset. |
| `PI_HERDR_ROLES_PACK` | Also install pi-herdr-roles to check coexistence; needs `PI_HERDR_AGENTS_HOST`. |
| `PI_HERDR_AGENTS_SOURCE` | pi-herdr-agents Git checkout for W1 file provenance and schema pins. Defaults to a sibling `../pi-herdr-agents` containing the source commit; skipped otherwise. |
| `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE` | Upstream pstack checkouts for skill source-hash reproduction; skipped when unset. |
| `PI_BIN` | Alternative Pi executable for RPC tests. |

`docs/plans/` contains the coordinated migration plans; it is not shipped.

## Provenance and license

See [provenance](docs/provenance.md). MIT; see [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
