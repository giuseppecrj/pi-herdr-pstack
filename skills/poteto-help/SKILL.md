---
name: poteto-help
description: Guides users through installing pi-herdr-pstack, /setup-pstack, /poteto-mode, and picking the skill, playbook, or principle for a task. Type /skill:poteto-help with a question.
disable-model-invocation: true
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and name the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read `../poteto-mode/SKILL.md`, do the work under it, and mention once that `/poteto-mode on` keeps the mode on for the session.

This file maps questions to the skills and files that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. Paths here are relative to this skill directory, and a path that starts with `../` names a sibling skill in the same package. Give the user the installed file's path. For anything else, the only public page to link is the package README at https://github.com/giuseppecrj/pi-herdr-pstack. Never build a link to a file inside that repository.

## What this release ships

This release ships the full inventory: all 51 skills in the tables below, and all 23 poteto-mode playbooks. Some workflows are scoped down for Pi. Their rows and phrases below give each limit in one line, and the hub (`../poteto-mode/SKILL.md`) and the playbook or skill state it in full. Say the limit when it changes the answer.

Pstack ships no named roles. Every delegate it launches is a bare pi-herdr-agents subagent that gets a reference prompt as its `systemPrompt`. `/skill:no-comments` launches its comment reviewer this way. A user who wants a named role installs a role pack and asks for that role by name.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- If the user hasn't seen a `/setup-pstack` report in this session, suggest it first. It shows whether pi-herdr-agents is loaded, whether the `poteto-mode` and `setup-pstack` skills resolve to this package, which exact models are authenticated, and which task categories poteto-mode uses are unset. When the setup question below applies, ask that once instead of a separate suggestion.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention the gap when the question is about proving a change works, and offer the **create-verification-skill** skill, which generates one.

When the answer depends on the task categories pstack uses (`coding`, `review`, `recon`, `qa`, `architecture`, `docs`) and you cannot see that they are set, ask once whether to run `/setup-pstack` now or leave the categories as they are for now. It depends when the user is new, the question is about setup or cost, or the answer would name which model a category resolves to. Ask at most once per chat. If the need is still unclear, fold this into that one multiple-choice question. Offer two choices:

- Now: tell them to type `/setup-pstack`. That command only shows the report and changes nothing. Changing a category is a separate `/setup-pstack <request>` they type themselves, and the extension writes only after they approve the exact payload. Answer their question too. This skill writes nothing.
- Later: answer their question, and add one line: Until a category is set, poteto-mode delegations that use it fail. They don't fall back to host defaults, because poteto-mode always passes `task:<category>`. That stays true until an approved `/setup-pstack <request>` write sets it.

You cannot tell whether those categories are unset on your own. No host tool reads them. `subagents_list` lists roles. Leave `subagents_write_task_models` and `pstack_apply_task_models` unused. Leave `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`) unread and unwritten. The subagent tool's routing text is not a check. The only reliable signal is a `/setup-pstack` report already in this session. Classify its Config line by the ending only, so words inside the path do not count. The line is the missing file only when it ends with ` does not exist (revision "missing"). pi-herdr-agents uses its packaged defaults and no task categories are configured.` The line is a present file only when it ends with ` (revision sha256:` and 64 lowercase hex digits and `).` Any other ending is an unknown file state.

- Unset, so ask when the answer depends on the categories: the Config line is the missing file above, or it is a present file and one of `coding`, `review`, `recon`, `qa`, `architecture`, `docs` has the preference value `(not set)`. On a present file, only that exact value is unset. A Finding does not make a category unset, and it is not a reason to tell the user to write config. The report cannot show whether a ref still resolves after the host trims it, splits on the first `/`, and trims both sides. Surrounding whitespace and spaces around `/` are findings here and can still launch. Compare the preference value whole to `(not set)`. A comma inside one model id cannot change that.
- Not unset, so skip the question: the Config line is a present file and none of the six values is `(not set)`.
- Unknown file state: the Config line ends with neither the missing-file sentence nor ` (revision sha256:` plus 64 lowercase hex digits plus `).` Repeat that line. Skip the unset question. Do not tell the user to write config.
- No report in the session: you have not checked. Ask when the answer depends on the categories, and say the check has not been run.

## Get set up

1. Install pi-herdr-agents and pi-herdr-pstack through Pi. pi-herdr-agents is the execution host and an explicit prerequisite: pstack declares it as a peer, and a peer declaration does not activate an extension. Install pstack where pi-herdr-agents children load packages too, normally the same user settings. Both packages are experimental, and the README has the current install steps.
2. Run `/setup-pstack`. It shows a report built in code and makes no change. To change which models pstack's delegates use, run `/setup-pstack <request>`, for example `/setup-pstack use <provider>/<model-id> for review`. The model proposes one change. The extension shows the complete payload in an approval dialog and writes it once, only after the user approves. Reload Pi after a saved change. `/skill:setup-pstack` explains each report section.
3. Start a real task with `/poteto-mode <task>`, stating a goal and a check that can pass or fail.

Installing adds two commands, `/poteto-mode` and `/setup-pstack`, and a writer gate. Every skill except `setup-pstack` is explicit-only. It loads when the user types `/skill:<name>` or when poteto-mode reads it for a step. Only `setup-pstack` can load from the user's words. Offer to word their first prompt with them, per `references/prompting.md`.

The writer gate matters to anyone who used pi-herdr-agents before. While pstack is loaded, it refuses every `subagents_write_task_models` call except its own approved one, including pi-herdr-agents' `/subagents-init`. `/setup-pstack <request>` replaces it. Task categories are shared pi-herdr-agents preferences, so a change affects every workflow and role pack that uses them, not only pstack.

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and reviews, and each delegate is one subagent. poteto-mode picks each delegate's model through a task category such as `task:coding` or `task:review`. Pointing a category at a cheaper exact model through `/setup-pstack <request>` makes those delegates cheaper. Asking for fewer delegates spends fewer tokens. Save `/poteto-mode` for work that needs rigor.

pstack in this package is built for Pi and pi-herdr-agents. Its skills use the Agent Skills format, so other tools can read them. But poteto-mode delegates through pi-herdr-agents' `subagent` tool, and the commands and the writer gate come from this package's extension, so those parts work only in Pi with pi-herdr-agents loaded.

## Start a task with `/poteto-mode`

poteto-mode matches the task to a playbook, copies the playbook's steps into the checklist, and reads the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read `references/prompting.md` before you help word one.

Whether the mode stays on depends on how the user starts it:

- `/skill:poteto-mode` loads the methodology for the current request only. It fades as the session moves on, and it never turns the mode on.
- `/poteto-mode` or `/poteto-mode on` turns sticky mode on for the current session branch and starts no work. While it is on, each prompt carries a short reminder that points back to the hub.
- `/poteto-mode <task>` turns the mode on and sends the full methodology with the task. It is refused while a turn is running, and nothing is queued.
- `/poteto-mode status` says whether the mode is on and whether the `poteto-mode` skill resolves to this package.
- `/poteto-mode off` stops future reminders. Earlier context and running subagents are unchanged.

Mid-session, "new task" makes the mode match a fresh playbook. The mode never grants permission. Pushes, pull requests, merges, deletions, messages and configuration writes still need the user's request or the repository's instructions, per `../poteto-mode/references/authorization.md`. To launch a delegate of your own in poteto-mode's style, copy an example from `../poteto-mode/references/delegation.md`.

## Pick a skill

The default answer is `/poteto-mode`, which reads most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | `/poteto-mode`, or `/skill:poteto-mode` for one request |
| Know how code works now, or where new code should live | `/skill:how` |
| Know why code is shaped this way, or where a number came from | `/skill:why` |
| Understand a change or subsystem, explained plainly | `/skill:teach` |
| Catch up on their own recent work on a topic | `/skill:recall` |
| Know what a small diff could break outside itself | `/skill:blast-radius` |
| Settle types and module shape before code that crosses a function boundary | `/skill:architect` |
| Get several attempts at one brief, merged into the best one | `/skill:arena` |
| Run parallel checks over slices, or race workers | `/skill:swarm` |
| Have several models review a diff and try to break it | `/skill:interrogate` |
| Fix a bug test-first when a cheap local test exists | `/skill:tdd` |
| Apply TypeScript rules to `.ts` or `.tsx` work | `/skill:typescript-best-practices` |
| Strip comments before review, using a reviewer that didn't write them | `/skill:no-comments` |
| Clean AI tells out of prose | `/skill:unslop` |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | `/skill:technical-writing` |
| Hear the last reply again in plain words | `/skill:bro` |
| Give agents a scripted way to drive the app and prove behavior | `/skill:create-verification-skill` |
| Bring a verification skill and its feature map back in line with the app | `/skill:maintain-verification-skill` |
| Vet a performance number before reporting or acting on it | `/skill:benchmark-checklist` |
| Run a large or cross-cutting change, or one to review after stepping away | `/skill:figure-it-out` |
| Keep a decision log during a run, and review it afterward | `/skill:show-me-your-work` |
| See which models pstack's delegates use, or change them with approval | `/setup-pstack`, explained by `/skill:setup-pstack` |
| Turn their own working habits into a personal mode skill | `/skill:automate-me` |
| Turn what a finished task taught into skill edits | `/skill:reflect` |
| Stop agents from repeating the same mistakes in this repo | `/skill:correct` |
| Build a local web page that starts a Pi run per request | `/skill:make-bot-ui`. Loopback only, a fresh `pi -p` run per request, and exposure or installs need authorization |
| Find their way around pstack | `/skill:poteto-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories have their own table under principles below.

Close calls:

- `/skill:how` explains what the code does. `/skill:why` explains the reasons. `/skill:teach` runs one or both and explains the result plainly. how and why fan out read-only children, and why's investigators launch without a tools list so they see MCP servers.
- `/skill:arena` gives every worker the same brief and merges the best parts. `/skill:swarm` splits work into slices or a race and returns one report. Arena uses one exact model per family and discloses a same-family fallback. Swarm launches separate bare calls and gives writers worktrees.
- `/skill:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/skill:interrogate` reviews the diff with one exact model per family, and a same-family fallback is disclosed. `/skill:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/skill:recall` rebuilds context across recent sessions in this working directory, never another project's. Resuming one specific session or branch is the Session pickup playbook, `../poteto-mode/playbooks/session-pickup.md`.
- `/skill:figure-it-out` designs one rigorous run and keeps its trail via `/skill:show-me-your-work`. The Orchestrate playbook (`../poteto-mode/playbooks/orchestrate.md`) runs a program of many PRs as a depth-1 single-session coordinator with a hand-kept store. It is not an unattended or multi-day runner. The Autonomous run playbook, `../poteto-mode/playbooks/autonomous-run.md`, drives one task to a finish condition.

Not in pstack:

- pstack has no orchestrate skill. Orchestrate is a poteto-mode playbook. pi-herdr-agents ships its own orchestrate skill for bounded reviews, which is unrelated. Any other orchestrate skill in the command list comes from another package.
- pstack keeps no model configuration, rule file or alias of its own. Models come from pi-herdr-agents.

## Playbooks and principles

Playbooks are step lists inside poteto-mode, not skills, so they have no `/skill:` command. Inside the mode, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit (`../poteto-mode/playbooks/babysit.md`). It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship. It uses `gh` only, a watcher child does the waiting, and every push, reply, re-run or merge needs authorization.
- "land the stack" runs Shipping (`../poteto-mode/playbooks/shipping.md`). It lands the verified run only on that explicit request, and pushes, retargets and arming need their own grants. It uses `gh` only, waits through one-shot watcher children, and on a merge-queue base it reports and stops without merging.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full (`../poteto-mode/playbooks/autopilot-full.md`). "stack them, don't ship" runs Autopilot-stack (`../poteto-mode/playbooks/autopilot-stack.md`). Both are root-run, with fresh owner rounds continuing in the retained owner checkout and audits on wake, never a timer. Autopilot-full merges only under a grant that names merging, and Autopilot-stack never merges.
- "run the eval playbook" runs Eval (`../poteto-mode/playbooks/eval.md`).
- "clean up worktrees" runs Worktree cleanup (`../poteto-mode/playbooks/worktree-cleanup.md`). It inventories with `worktree_list` and removes each path only on its own authorization.

Without poteto-mode, a phrase such as "babysit this pr" is an ordinary request, and another installed skill may answer it instead. The Playbooks section of `../poteto-mode/SKILL.md` lists every playbook, when it applies, and any scope limit. `../poteto-mode/playbooks/opening-a-pr.md` covers opening a PR, only when the task authorizes one.

pstack has no planning skill. For work that spans phases or stacked PRs, asking poteto-mode for a plan runs the Multi-phase plan playbook (`../poteto-mode/playbooks/multi-phase-plan.md`), which writes the plan, checks it with its script, and doesn't implement it. For a design question, the Prototype playbook (`../poteto-mode/playbooks/prototype.md`) settles it in code first.

Principles are one-rule skills that poteto-mode reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/skill:principle-<name>` still loads one on demand. The Principles section of `../poteto-mode/SKILL.md` lists all 24 with a summary each. To recommend one, read its file first:

| The user wants to | Principle |
| Refactor, size a diff, or resist an extra abstraction | `../principle-laziness-protocol/SKILL.md` |
| Settle core types, data structures and shared state before logic | `../principle-foundational-thinking/SKILL.md` |
| Fold a new requirement into a design as if it had been there from day one | `../principle-redesign-from-first-principles/SKILL.md` |
| Remove dead weight before an addition, refactor or rewrite | `../principle-subtract-before-you-add/SKILL.md` |
| Make hard-to-trace code easier to follow | `../principle-minimize-reader-load/SKILL.md` |
| Run a planned rewrite or migration straight to the target | `../principle-outcome-oriented-execution/SKILL.md` |
| Weigh product, UX or scope tradeoffs for the user | `../principle-experience-first/SKILL.md` |
| Compare competing prototypes for a decision with no precedent | `../principle-exhaust-the-design-space/SKILL.md` |
| Stop after two fixes that share one premise have failed | `../principle-attack-the-premise/SKILL.md` |
| Build the script or codemod that does or proves the work | `../principle-build-the-lever/SKILL.md` |
| Replace scattered conditionals with a structure that models the domain | `../principle-model-the-domain/SKILL.md` |
| Place validation, error handling and adapters at system boundaries | `../principle-boundary-discipline/SKILL.md` |
| Design types that make illegal states unrepresentable | `../principle-type-system-discipline/SKILL.md` |
| Make commands and loops safe to rerun after crashes and retries | `../principle-make-operations-idempotent/SKILL.md` |
| Replace an internal API and delete the old one in one wave | `../principle-migrate-callers-then-delete-legacy-apis/SKILL.md` |
| Stop concurrent actors writing the same file, branch or key | `../principle-separate-before-serializing-shared-state/SKILL.md` |
| Prove a task is done on the real artifact | `../principle-prove-it-works/SKILL.md` |
| Trace a bug to its root cause instead of patching the symptom | `../principle-fix-root-causes/SKILL.md` |
| Break multi-step work into small units that each end in a check | `../principle-sequence-verifiable-units/SKILL.md` |
| Write or keep a test that checks behavior, not internals | `../principle-test-behavior-not-implementation/SKILL.md` |
| Find what limits a measured number before trusting it | `../principle-explain-the-number/SKILL.md` |
| Keep bulky output out of the main thread | `../principle-guard-the-context-window/SKILL.md` |
| Proceed on reversible work instead of asking first | `../principle-never-block-on-the-human/SKILL.md` |
| Turn a repeated instruction into a lint, check or script | `../principle-encode-lessons-in-structure/SKILL.md` |

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | It was loaded with `/skill:poteto-mode`, which covers one request. Run `/poteto-mode on`, or start each task with `/poteto-mode <task>`. `/poteto-mode status` shows the state. |
| `/poteto-mode` refused to turn on | The `poteto-mode` skill is filtered out or shadowed by another file. The message says which. `/setup-pstack` reports where the `poteto-mode` and `setup-pstack` skills resolve. |
| `/poteto-mode <task>` did nothing | It is refused while a turn is running, and nothing is queued. Send it again when the session is idle. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. `/poteto-mode off` stops the reminders. |
| A new model choice had no effect | A saved `/setup-pstack` change needs a Pi reload. An explicit `model` in a `subagent` call also wins over the task categories. |
| `/subagents-init` or a task-model write was refused | That is pstack's writer gate. Use `/setup-pstack <request>`. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `setup-pstack` loads from the user's words. The others load when the user types `/skill:<name>` or when poteto-mode reads them, and it doesn't read every skill. |
| A skill named in a reply isn't installed | Every pstack skill ships, so the package is missing, filtered or shadowed. `/setup-pstack` reports where the `poteto-mode` and `setup-pstack` skills resolve. |
| Parallel agents overwrote each other | Give each parallel writer its own `worktree` in the `subagent` call, per `../poteto-mode/references/delegation.md`. |
| A babysit, autopilot or orchestrate run sat idle | Nothing in pstack schedules a wake. The coordinator acts when a child delivers, on a stall or no-progress advisory, or when the user asks. During a watcher's blocking wait, one informational advisory per idle minute is expected and is not a stall. |
| An autonomous run moved but finished nothing | Done needs a check that can pass or fail, not a duration. See `../poteto-mode/playbooks/autonomous-run.md`. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's Prove It Works in the hub's Principles section. |

For a run that drifts, `references/prompting.md` has one-line steers, and `references/recipes.md` has prompts worth copying.

## Make pstack my own

- `/skill:automate-me` drafts a personal mode skill from the user's own history, to use alongside poteto-mode.
- `/skill:reflect` after a session turns its lessons into skill edits the user approves. It reads `$PI_SESSION_FILE` and this working directory's sessions, and files backlog items only with approval.
- `/poteto-mode write a skill for <workflow>` runs the authoring playbook (`../poteto-mode/playbooks/authoring-a-skill.md`). The eval playbook (`../poteto-mode/playbooks/eval.md`) tests a skill change blind.
- Fix a misbehaving skill in its own commit or PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from `references/recipes.md` when one fits, then the path of the file the answer came from. Keep it short unless the user asked for the whole map.
