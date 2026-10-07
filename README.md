# pi-herdr-pstack

pstack methodology for [Pi](https://pi.dev): 51 skills (including `poteto-mode` with its 23 playbooks), two slash commands and one bare delegate prompt, running on the [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents) subagent host.

pi-herdr-agents is the execution host; Herdr is the terminal multiplexer it runs children in. This package supplies methodology only. It has no child runner, scheduler, model store, package installer or shell-permission engine of its own, and it ships no named roles.

## Install

pi-herdr-agents is a peer dependency, and a peer declaration does not activate an extension. Install both packages through Pi:

```bash
pi install npm:pi-herdr-agents   # >=3.0.0
pi install npm:pi-herdr-pstack
```

Install the pack wherever pi-herdr-agents children load packages too (normally the same user settings). Requires Pi `^1.0.3` and a role-free host; see [compatibility](docs/compatibility.md) for the tested revisions.

## Quick start

1. Run `/setup-pstack` for a read-only report: the host, this package's skills and commands, authenticated models and the shared task-model preferences.
2. Run `/poteto-mode <task>` to turn on the methodology and start a task, or `/skill:poteto-help` for a guide to which skill fits.
3. Load any other skill with `/skill:<name>`, for example `/skill:how` or `/skill:tdd`.

All skills except `setup-pstack` are explicit-only: they load through `/skill:<name>` or when `poteto-mode` reads them for a step.

## Commands

| Command | Effect |
| --- | --- |
| `/poteto-mode [on]` | Turns the sticky methodology mode on for this session branch. Starts no work. |
| `/poteto-mode status` | Reports on/off, whether it is persisted or memory-only, and whether the skill resolves to this package. |
| `/poteto-mode off` | Stops future reminders. Earlier context and running subagents are unchanged. |
| `/poteto-mode <task>` | Turns the mode on and sends the full `poteto-mode` skill followed by the task. Refused while a turn is running; nothing is queued. |
| `/setup-pstack` or `/setup-pstack report` | Shows the setup report. Makes no change. |
| `/setup-pstack <request>` | Opens a one-turn change flow for shared task-model preferences. Nothing is written without your approval. |

### `/poteto-mode`

- While on, each prompt gets a short `pstack_poteto_mode` system-prompt section naming the hub file. Turning the mode on or off during a turn affects the next prompt, not the running turn.
- State is a small versioned session entry that follows the branch through tree navigation, compaction, reload, resume, `/fork` and `/clone`. In a pi-herdr-agents child (`PI_SUBAGENT_ID` set, a hint rather than a security boundary), records copied from a parent session are ignored.
- `/skill:poteto-mode` loads the methodology once and never turns the mode on.
- If the effective `poteto-mode` skill is filtered out or shadowed by another file, the command refuses to enable and says why.
- Mode never grants permission for external or irreversible actions.

### `/setup-pstack`

The report is built in code and reads `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`). It shows the shared task categories and default model only; per-agent overrides and other fields are never shown, and diagnostics never echo keys from the file.

A change flow works like this:

1. The model may call the setup-only `pstack_apply_task_models` tool once with the categories to replace. The extension keeps every other category and rejects unknown categories, duplicates, `task:` aliases and unauthenticated references.
2. A dialog (two-minute timeout) shows the complete `subagents_write_task_models` payload, including `expectedConfigRevision`.
3. Only after you approve, and after rechecking the file, session and authentication, pstack calls the host writer and verifies the saved file before reporting success.

Declined, rejected, stale or cancelled attempts stop before the writer runs. If the writer errors after being called, pstack rereads the file and reports it as unchanged, as holding the approved preferences, or as changed in a way it cannot attribute. Nothing is retried. Setup stays report-only in a subagent, without a dialog-capable UI, with an older or inactive writer, or with an unreadable or invalid config.

Task categories are shared pi-herdr-agents preferences: a change affects every workflow and role pack that uses them. An explicit `model` argument, exact or `task:<category>`, takes precedence over role, per-agent and default models.

## Shared task-model writer restriction

**While pstack is loaded, it refuses every `subagents_write_task_models` call except its own approved one.** That includes pi-herdr-agents' `/subagents-init`, which has the model call the writer directly, and any direct or relayed call in any run. The refusal names `/setup-pstack <request>` as the replacement. To use `/subagents-init`, uninstall or disable pstack.

The single exception is the nested call the apply tool makes after you approve the exact payload. It must come directly from that apply call, match the approved arguments including `expectedConfigRevision`, and find the file unchanged. The approval lives only in memory, is used once, and ends when the dispatch returns, the turn is aborted, or the session is replaced, reloaded or shut down; after `/reload`, every writer call is refused. The host's conditional writer still rejects a file that changed after approval. Children never see the writer, so this changes nothing there. Details are in [compatibility](docs/compatibility.md#setup-writer-contract-and-the-writer-gate).

## Skills

Pstack skills keep unprefixed names.

| Group | Skills | Purpose |
| --- | --- | --- |
| Methodology | `poteto-mode`, `poteto-help`, `setup-pstack` | The methodology hub (four references, 23 playbooks, `check-plan.mjs` plan checker), a guide to installing pstack and choosing a skill, and the setup flow. |
| Understand code | `how`, `why`, `teach`, `recall`, `blast-radius` | Mechanics, design rationale, plain explanations, catching up on this working directory's sessions, breakage outside a diff. |
| Design and fan-out | `architect`, `arena`, `swarm`, `interrogate`, `figure-it-out` | Parallel design sketches, bakeoffs, coverage and race swarms, multi-model adversarial review, bespoke playbooks for large efforts. Diversity seats use one exact model per family and disclose a same-family fallback. |
| Engineering | `tdd`, `correct`, `benchmark-checklist`, `typescript-best-practices` | Test-first fixes, repo lessons, vetting measured numbers, TypeScript rules (load explicitly before `.ts`/`.tsx` edits). |
| Process | `show-me-your-work`, `reflect`, `automate-me` | Decision trails, turning a session's lessons into approved skill edits, drafting a personal mode skill. Session reads stay in this working directory. |
| Verification | `create-verification-skill`, `maintain-verification-skill` | Generate and maintain a project-local `.pi/skills/verify-*` harness that drives the real app. |
| Writing | `unslop`, `technical-writing`, `no-comments`, `bro` | AI-tell cleanup, documentation standards, comment removal through a bare delegate, plain-words recap. |
| Tooling | `make-bot-ui` | A loopback-only local page whose server starts one `pi -p` run per request. Exposure and installs need authorization. |
| Principles | 24 `principle-*` skills | One rule each, cited by `poteto-mode`, which keeps a summary of each. |

Browse the [full skill collection](skills/) or the [principle summaries](skills/poteto-mode/SKILL.md).

## Delegation model

Pstack registers no role directory and depends on neither pi-herdr-roles nor another pack. Delegates are deliberately **bare**:

- `poteto-mode` omits `agent` on each call and passes a bounded reference prompt (implementer, investigator, reviewer or verifier) as `systemPrompt`, with explicit `model`, `thinking`, `fork` and, for parallel writers, `worktree`.
- `/skill:no-comments` passes its comment-sicko prompt (under `skills/no-comments/references/`) as `systemPrompt` with `tools: "read, bash, edit"`.

## Workflow limitations

Several poteto-mode workflows are scoped down for Pi:

- Pstack adds no scheduler, timer or ledger. Every fan-out runs in the parent session and children are leaves (`skills/poteto-mode/references/fan-out.md`).
- Babysit and Shipping use `gh` only and wait through a one-shot watcher child. Shipping lands the verified run only on an explicit request.
- Autopilot-full and Autopilot-stack are run by the root session, with fresh owner rounds and audits on each wake, never a timer.
- Orchestrate is a depth-1 single-session coordinator with a hand-kept store, not an unattended or multi-day runner.
- Worktree cleanup inventories with `worktree_list` and removes each path only on its own authorization.
- Nothing in pstack pushes, opens or merges PRs, or removes worktrees without explicit authorization.

Runtime checks use deterministic providers; they do not establish that a live model follows the skills. These workflows have not been evaluated with live models.

## Development

```bash
npm install          # .npmrc disables automatic peer installation
npm run check        # typecheck, lint, format:check, test
```

Tests use test-owned temporary agent, home, XDG and project directories, the pinned `@earendil-works/pi-coding-agent@1.0.3` SDK and CLI and a deterministic offline faux provider. They never edit your Pi settings. A passing faux-provider run is not evidence that a live model follows the skills.

The following variables configure additional checks or override test defaults. Checks requiring an external host or upstream checkout skip when that input is unavailable:

| Variable | Effect |
| --- | --- |
| `PI_HERDR_AGENTS_HOST` | Role-free, conditional-writer host package root for the real-writer consent, writer-gate, RPC setup and combined-host checks. |
| `PI_HERDR_AGENTS_LEGACY_HOST` | Pre-extraction host root for separate legacy bundled-role characterization. |
| `PI_HERDR_ROLES_PACK` | Also installs pi-herdr-roles to check coexistence; needs `PI_HERDR_AGENTS_HOST`. |
| `PI_HERDR_AGENTS_SOURCE` | pi-herdr-agents Git checkout for file provenance and schema pins. Defaults to a sibling `../pi-herdr-agents` containing the source commit. |
| `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE` | Upstream pstack checkouts for skill source-hash reproduction and the upstream scope inventory. The cursor checkout must hold the pinned blobs (a full clone); the scope checks do not fetch lazily. |
| `PI_BIN` | Alternative Pi executable for RPC tests. |

CI runs `npm run check` without these variables.

## Release

A GitHub Actions workflow publishes each stable version bump on `main` to npm with trusted publishing. See [RELEASING.md](RELEASING.md) and [CHANGELOG.md](CHANGELOG.md).

## Documentation

- [Compatibility](docs/compatibility.md): tested host and Pi revisions, writer contract, host facts the workflows rely on.
- [Provenance](docs/provenance.md): upstream sources, upstream scope and file provenance.
- [Third-party notices](THIRD_PARTY_NOTICES.md).

## License

MIT. See [LICENSE](LICENSE).
