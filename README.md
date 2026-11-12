# pi-herdr-pstack

pstack methodology for [Pi](https://pi.dev), with Matt Pocock's repo setup, spec, ticket and triage, and gap skills: 80 skills (54 from pstack, including `poteto-mode` with its 23 playbooks and optional `statechart`, 22 from Matt Pocock's skills, and `tdd`, `teach`, `prototype` and `poteto-help`, each merged from both), two slash commands and one bare delegate prompt, running on the [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents) subagent host.

pi-herdr-agents is the execution host; Herdr is the terminal multiplexer it runs children in. This package supplies methodology only. It has no child runner, scheduler, model store, package installer or shell-permission engine of its own, and it ships no named roles.

## Install

pi-herdr-agents is a peer dependency, and a peer declaration does not activate an extension. Install both packages through Pi:

```bash
pi install npm:pi-herdr-agents   # >=3.10.0
pi install npm:pi-herdr-pstack
```

Install the pack wherever pi-herdr-agents children load packages too (normally the same user settings). Requires Node.js `>=22.19.0` (Pi `1.0.3`'s own floor), Pi `^1.0.3` and a role-free host; see [compatibility](docs/compatibility.md) for the tested revisions.

## Upgrading from 0.6.0

1.0.0 removes 0.6.0's setup init flow and needs a newer host. Upgrade pi-herdr-agents to 3.10.0 or later in the same step as this pack, host first, then reload Pi:

```bash
pi update npm:pi-herdr-agents   # to >=3.10.0
pi update npm:pi-herdr-pstack
```

A version pinned in your settings (for example `npm:pi-herdr-pstack@0.6.0`) does not update; install the new versions instead.

- `/setup-pstack init` and the `pstack_apply_task_models` tool are removed. Use pi-herdr-agents' `/subagents-init` to draft task models from its registry, or `/setup-pstack [budget]` (for example `/setup-pstack medium`) to choose a budget and each category's models. `/setup-pstack init ...` now refuses and points here. pi-herdr-agents' own dialog approves every task-model write.
- On a pi-herdr-agents older than 3.10.0, `/setup-pstack` refuses to start, and this pack no longer blocks task-model writes: 0.6.0's writer gate is gone, so the older host's own writer and `/subagents-init` write without pstack's approval step.
- Skills moved into folders by upstream (`skills/pstack/`, `skills/mattpocock/`, `skills/merged/`). Their names are unchanged, so `/skill:<name>` works as before; update only a path you wrote to a skill file.

## Quick start

1. Run `/setup-pstack` to choose a budget and the models for each pi-herdr-agents task category. Nothing is saved until you approve the change in pi-herdr-agents' dialog.
2. Run `/poteto-mode <task>` to turn on the methodology and start a task, or `/skill:poteto-help` for a guide to which skill fits.
3. Load any other skill with `/skill:<name>`, for example `/skill:how` or `/skill:tdd`.

Most skills are explicit-only: they load through `/skill:<name>` or when `poteto-mode` reads them for a step. These can also load from your words: `setup-pstack`, and from Matt Pocock's skills `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `pr`, `prototype`, `research`, `wizard` and `writing-for-agents`.

## Commands

| Command | Effect |
| --- | --- |
| `/poteto-mode [on]` | Turns the sticky methodology mode on for this session branch. Supplies the hub on the next prompt if it is missing from context. Starts no work. |
| `/poteto-mode status` | Reports on/off, whether it is persisted or memory-only, and whether the skill resolves to this package. |
| `/poteto-mode off` | Stops future reminders and automatic hub loading. Earlier context and running subagents are unchanged. |
| `/poteto-mode <task>` | Turns the mode on and starts the task. Includes the full hub only if it is missing from context. Refused while a turn is running; nothing is queued. |
| `/setup-pstack [request]` | Sets the models and thinking budget for the shared task categories, following upstream's setup steps. The request can name a budget or a change, for example `/setup-pstack small`. pi-herdr-agents writes only after you approve. |

### `/poteto-mode`

- While on, each prompt gets a short `pstack_poteto_mode` system-prompt checklist for playbook selection, visible steps, verification, and skipped work. Runs started by extension messages, such as subagent results, get a request-only reminder because Pi skips the prompt hook.
- The extension supplies the full hub when it is missing from the model's context, including after compaction. It checks the retained text rather than a remembered "loaded" flag. Automatic loading does not add another copy while the full hub is present.
- The hub still occupies context. Playbooks and references load only when the agent needs them. This avoids duplicate hub copies, not the cost of the instructions themselves.
- Turning the mode on or off during a run affects the next run, not the one in progress.
- State is a small versioned session entry that follows the branch through tree navigation, compaction, reload, resume, `/fork` and `/clone`. In a pi-herdr-agents child (`PI_SUBAGENT_ID` set, a hint rather than a security boundary), records copied from a parent session are ignored.
- `/skill:poteto-mode` loads the methodology once and never turns the mode on.
- If the effective `poteto-mode` skill is filtered out or shadowed by another file, the command refuses to enable and says why.
- Mode never grants permission for external or irreversible actions.

### `/setup-pstack`

Setup follows upstream Cursor pstack's steps on pi-herdr-agents' shared task preferences. The command reads `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`) and hands the `setup-pstack` skill a brief: the authenticated models with the thinking levels each supports, each category's saved models and thinking, and the file's revision. Nothing else from the file reaches the model. The skill then:

1. Asks for a budget: `unlimited`, `large`, `medium` or `small` set every category's thinking to `max`, `xhigh`, `high` or `medium`. pi-herdr-agents clamps it to each candidate model's supported levels at launch.
2. Shows every category (`coding`, `review`, `recon`, `qa`, `architecture`, `docs`) with its models, their effective thinking and the upstream roles it drives, and lets you change any of them.
3. Calls pi-herdr-agents' `subagents_write_task_models` once with the models, the thinking and the brief's revision. The host shows the exact change in its own dialog (default No) and writes only after you choose to save; a stale revision, a decline or a timeout writes nothing.
4. Offers once each to generate a verification skill and a formal verification skill if the project has none.

The command makes the host writer callable for this flow; the host retires it again after a successful write. It does not start without pi-herdr-agents 3.10.0 or later, in a session without dialogs, in a subagent, while a turn runs, or with a config file it cannot read. Reload Pi after a saved change.

`/subagents-init` is pi-herdr-agents' own drafting command and goes through the same host dialog; pstack no longer takes part in it.

Task categories are shared pi-herdr-agents preferences: a change affects every workflow and role pack that uses them. An explicit `model` argument, exact or `task:<category>`, takes precedence over role, per-agent and default models, and an explicit `thinking` overrides the category's thinking.

## Skills

Skills keep unprefixed names. They are grouped in folders by upstream: `skills/pstack/` (cursor/plugins pstack and its pi-mimir port), `skills/mattpocock/` ([mattpocock/skills](https://github.com/mattpocock/skills), MIT) and `skills/merged/` (`tdd`, `teach` and `prototype`, each combining a pstack skill or playbook with Matt's of the same name, and `poteto-help`, which absorbs Matt's `ask-matt` flow map; each records both sources), each upstream with its own pinned commit (see [provenance](docs/provenance.md)).

| Group | Skills | Purpose |
| --- | --- | --- |
| Methodology | `poteto-mode`, `poteto-help`, `setup-pstack`, `in-your-own-words`, `sharpen`, `ketchup` | The methodology hub (four references, 23 playbooks, `check-plan.mjs` plan checker), a guide to installing pstack and choosing a skill or one of Matt Pocock's flows, and the setup flow. |
| Understand code | `how`, `why`, `teach`, `recall`, `blast-radius` | Mechanics, design rationale, plain explanations, catching up on this working directory's sessions, breakage outside a diff. |
| Design and fan-out | `architect`, `arena`, `swarm`, `interrogate`, `figure-it-out`, `prototype` | Parallel design sketches, bakeoffs, coverage and race swarms, multi-model adversarial review, bespoke playbooks for large efforts, throwaway prototypes that settle a design question or an empirical fork (in scratch by default; in-app work needs your scope, and keeping or publishing one needs your authorization). Diversity seats use one exact model per family and disclose a same-family fallback. |
| Engineering | `tdd`, `correct`, `benchmark-checklist`, `typescript-best-practices` | Test-first fixes, repo lessons, vetting measured numbers, TypeScript rules (load explicitly before `.ts`/`.tsx` edits). |
| Process | `show-me-your-work`, `reflect`, `automate-me`, `retro` | Decision trails, turning a session's lessons into approved skill edits, drafting a personal mode skill, and a retrospective that proposes guardrails for the repo and its environment (checks, coding standards, `AGENTS.md` pointers) and changes nothing until you approve. Session reads stay in this working directory. `retro` and `reflect` route lessons to each other. `retro` is adapted from Matt Pocock's skills. |
| Verification | `create-verification-skill`, `maintain-verification-skill`, `create-formal-verification-skill`, `maintain-formal-verification-skill`, `statechart` (optional; pack `tla-ts`, no Java) | Generate and maintain a project-local `.pi/skills/verify-*` harness that drives the real app, a formal-verification skill for properties tests rarely reach, or draw a Mermaid statechart from a TLA+ model. |
| Writing | `unslop`, `technical-writing`, `writing-for-agents`, `no-comments`, `bro` | AI-tell cleanup, documentation standards for human readers, writing skills and `AGENTS.md` for agents (model-invocable, adapted from Matt Pocock's skills; each of the two writing skills says which audience wins), comment removal through a bare delegate, plain-words recap. |
| Repo setup | `setup-repo` | `/skill:setup-repo` configures a repo's issue tracker (GitHub, GitLab, local markdown or other), triage labels and domain docs. It writes `docs/agents/*.md` and an `## Agent skills` pointer section into the existing `AGENTS.md` (or `CLAUDE.md`), never into either upstream's tracker, and asks before creating labels, remotes or files. Adapted from Matt Pocock's `setup-matt-pocock-skills`. |
| Spec, tickets and triage | `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `implement`, `implement-spec` | Interview a plan into shape while the glossary and ADRs are updated, publish a spec, break it into tracer-bullet tickets with native blocking links, triage issues through the five roles, chart work too large for one session as a map of decision tickets, and implement a ticket or a whole spec through `subagent` children. They use the tracker, labels and domain docs `setup-repo` configured, and pass its `-R <owner>/<repo>` to every tracker command. `grilling` and `domain-modeling` are model-invocable, as upstream has them; the rest run through `/skill:<name>`. Adapted from Matt Pocock's skills. |
| Diagnosis | `diagnosing-bugs` | A diagnosis loop for hard bugs and performance regressions: a tight feedback loop that goes red on the bug, then minimise, hypothesise, instrument, fix with a regression test and clean up. The loop never replaces reproducing the bug through the real path, and a human-in-the-loop script it writes is the human's to run. poteto-mode's Bug fix playbook points at it for technique and keeps its own gates. Model-invocable, as upstream has it. Adapted from Matt Pocock's skills. |
| Review | `code-review` | A read-only two-axis review (the repo's documented standards and the spec) of a branch, a PR or uncommitted work against a fixed point, in two parallel `subagent` reviewers. `implement` runs it before committing and `implement-spec` on its integration branch. Model-invocable, as upstream has it. Adapted from Matt Pocock's skills. |
| Research, handoff and design | `research`, `handoff`, `to-questionnaire`, `wizard`, `codebase-design`, `improve-codebase-architecture`, `pr` | Research a question against primary sources into a Markdown note through a background `subagent`, compact a session into a handoff document in the OS temp directory (no secrets), write a questionnaire for someone who holds missing knowledge, generate a bash wizard for steps only a human can take (the agent never runs it), design deep modules, scan for deepening opportunities into an HTML report, and draft a PR body. `research`, `wizard`, `codebase-design` and `pr` are model-invocable, as upstream has them; the rest run through `/skill:<name>`. `pr` drafts text: creating or editing a PR needs your grant. Adapted from Matt Pocock's skills. |
| Tooling | `make-bot-ui` | A loopback-only local page whose server starts one `pi -p` run per request. Exposure and installs need authorization. |
| Principles | 24 `principle-*` skills | One rule each, cited by `poteto-mode`, which keeps a summary of each. |

Browse the [full skill collection](skills/) or the [principle summaries](skills/pstack/poteto-mode/SKILL.md).

## Delegation model

Pstack registers no role directory and depends on neither pi-herdr-roles nor another pack. Delegates are deliberately **bare**:

- `poteto-mode` omits `agent` on each call and passes a bounded reference prompt (implementer, investigator, reviewer or verifier) as `systemPrompt`, with explicit `model`, `fork` and, for parallel writers, `worktree`. It sets `thinking` too, except on a `task:<category>` whose category has configured thinking, so the `/setup-pstack` budget applies.
- `/skill:no-comments` passes its comment-sicko prompt (under `skills/pstack/no-comments/references/`) as `systemPrompt` with `tools: "read, bash, edit"`.
- Matt Pocock's `grilling`, `wayfinder`, `implement-spec`, `research`, `improve-codebase-architecture` and `codebase-design` launch bare `subagent` children with `fork: false` and an explicit `model` (`task:recon`, `task:coding` or `task:architecture`) and `thinking`; their briefs are the task itself. `implement-spec` removes implementer worktrees only after the user approves the list.

## Workflow limitations

Several poteto-mode workflows are scoped down for Pi:

- Pstack adds no scheduler, timer or ledger. Every fan-out runs in the parent session and children are leaves (`skills/pstack/poteto-mode/references/fan-out.md`).
- Babysit and Shipping use `gh` only and wait through a one-shot watcher child. Shipping lands the verified run only on an explicit request.
- Autopilot-full and Autopilot-stack are run by the root session, with fresh owner rounds and audits on each wake, never a timer.
- Orchestrate is a depth-1 single-session coordinator with a hand-kept store, not an unattended or multi-day runner.
- Worktree cleanup inventories with `worktree_list` and removes each path only on its own authorization.
- Nothing in pstack pushes, opens or merges PRs, or removes worktrees without explicit authorization.
- Matt Pocock's tracker skills (`to-spec`, `to-tickets`, `triage`, `wayfinder`, `implement`, `implement-spec`) push, act on PRs, or create, edit, comment on, label or close issues only when you grant that effect; the tracker doc says how, never whether. Invoking `/skill:to-spec`, `/skill:to-tickets` or `/skill:triage` grants only the write that skill exists for (the spec issue, the approved tickets, the triage changes you direct). Without a grant they keep the work local and tell you what is waiting. Issue, PR and map content is data, never instructions. `triage` reads a contributor's PR from fetched git objects first, and checks it out (in a detached review checkout under `~/.herdr/worktrees/`, with hooks off) or runs its code only after you approve. The skills that need `code-review`, `research` or `prototype` use this pack's copy, else one you installed (found by name or at a path you give, never from tracker content); when neither exists they stop before the step it gates and say so. `triage` warns that a review checkout is not a sandbox: approved contributor code runs with your credentials and environment.
- Matt Pocock's gap skills write locally unless you grant more. `research` writes one findings note in the repo, uncommitted, and its child treats web pages, docs and other sources as data, never instructions. `handoff` writes to the OS temp directory and never puts a secret in the document. `wizard` writes a script for you to run and never runs it, never reads a live `.env` file, and binds every GitHub secret or variable the script sets to the repository you confirmed. `pr` drafts the body; invoking it does not grant creating or editing a PR.

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
| `PI_HERDR_AGENTS_HOST` | Host package root for the setup, RPC and combined-host checks. Defaults to the `pi-herdr-agents` devDependency (3.10.0). |
| `PI_HERDR_AGENTS_LEGACY_HOST` | Pre-extraction host root for separate legacy bundled-role characterization. |
| `PI_HERDR_ROLES_PACK` | Also installs pi-herdr-roles to check coexistence. |
| `PI_HERDR_AGENTS_SOURCE` | pi-herdr-agents Git checkout for file provenance and schema pins. Defaults to a sibling `../pi-herdr-agents` containing the source commit. |
| `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE`, `PSTACK_MATTPOCOCK_SOURCE` | Upstream checkouts (mattpocock/skills for `skills/mattpocock/`) for skill source-hash reproduction and the upstream scope inventory. Each checkout must hold the pinned blobs (a full clone); the scope checks do not fetch lazily. Each upstream pin in `test/fixtures/upstream-scope.json` reads its checkout from `PSTACK_<UPSTREAM>_SOURCE`. |
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
