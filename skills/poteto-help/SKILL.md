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

This release ships the two W2 skills, `poteto-mode` and `setup-pstack`, and the W3 skills. Rows below marked **planned W3** or **planned W4** are not installed yet. Never offer one as a working command, never say one ran, and never quote it. Say it is planned, then give the interim route the hub (`../poteto-mode/SKILL.md`) names for it, if there is one.

Pstack ships no named roles. Every delegate it launches is a bare pi-herdr-agents subagent that gets a reference prompt as its `systemPrompt`. `/skill:no-comments` launches its comment reviewer this way. A user who wants a named role installs a role pack and asks for that role by name.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- If the user hasn't seen a `/setup-pstack` report in this session, suggest it first. It shows whether pi-herdr-agents is loaded, whether each pstack skill resolves to this package, which exact models are authenticated, and which task categories poteto-mode uses are unset.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention the gap when the question is about proving a change works. The **create-verification-skill** skill that generates one is planned W4, so do not offer it.

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
| Know how code works now, or where new code should live | `/skill:how` (planned W4) |
| Know why code is shaped this way, or where a number came from | `/skill:why` (planned W4) |
| Understand a change or subsystem, explained plainly | `/skill:teach` |
| Catch up on their own recent work on a topic | `/skill:recall` (planned W4) |
| Know what a small diff could break outside itself | `/skill:blast-radius` (planned W3) |
| Settle types and module shape before code that crosses a function boundary | `/skill:architect` (planned W4) |
| Get several attempts at one brief, merged into the best one | `/skill:arena` (planned W4) |
| Run parallel checks over slices, or race workers | `/skill:swarm` (planned W4) |
| Have several models review a diff and try to break it | `/skill:interrogate` (planned W4) |
| Fix a bug test-first when a cheap local test exists | `/skill:tdd` (planned W3) |
| Apply TypeScript rules to `.ts` or `.tsx` work | `/skill:typescript-best-practices` (planned W3) |
| Strip comments before review, using a reviewer that didn't write them | `/skill:no-comments` |
| Clean AI tells out of prose | `/skill:unslop` |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | `/skill:technical-writing` |
| Hear the last reply again in plain words | `/skill:bro` |
| Give agents a scripted way to drive the app and prove behavior | `/skill:create-verification-skill` (planned W4) |
| Bring a verification skill and its feature map back in line with the app | `/skill:maintain-verification-skill` (planned W4) |
| Vet a performance number before reporting or acting on it | `/skill:benchmark-checklist` (planned W3) |
| Run a large or cross-cutting change, or one to review after stepping away | `/skill:figure-it-out` (planned W4) |
| Keep a decision log during a run, and review it afterward | `/skill:show-me-your-work` (planned W4) |
| See which models pstack's delegates use, or change them with approval | `/setup-pstack`, explained by `/skill:setup-pstack` |
| Turn their own working habits into a personal mode skill | `/skill:automate-me` (planned W4) |
| Turn what a finished task taught into skill edits | `/skill:reflect` (planned W4) |
| Stop agents from repeating the same mistakes in this repo | `/skill:correct` (planned W3) |
| Build a page whose buttons wake a bot over a webhook | `/skill:make-bot-ui` (planned W4) |
| Find their way around pstack | `/skill:poteto-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/skill:how` explains what the code does. `/skill:why` explains the reasons. `/skill:teach` runs one or both and explains the result plainly. Until how and why ship (planned W4), `/skill:teach` traces the code and its history itself and says so.
- `/skill:arena` gives every worker the same brief and merges the best parts. `/skill:swarm` splits work into slices or a race and returns one report. Both are planned W4.
- `/skill:architect` (planned W4) implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/skill:interrogate` (planned W4) reviews the diff. `/skill:blast-radius` (planned W3) looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/skill:recall` (planned W4) rebuilds context across recent sessions. Resuming one specific session or branch is the Session pickup playbook, `../poteto-mode/playbooks/session-pickup.md`.
- `/skill:figure-it-out` (planned W4) designs one rigorous run. The Orchestrate playbook (`../poteto-mode/playbooks/orchestrate.md`, planned W4) runs a program that spans days and many PRs. The Autonomous run playbook, `../poteto-mode/playbooks/autonomous-run.md`, drives one task to a finish condition.

Not in pstack:

- pstack has no orchestrate skill. Orchestrate is a poteto-mode playbook. pi-herdr-agents ships its own orchestrate skill for bounded reviews, which is unrelated. Any other orchestrate skill in the command list comes from another package.
- pstack keeps no model configuration, rule file or alias of its own. Models come from pi-herdr-agents.

## Playbooks and principles

Playbooks are step lists inside poteto-mode, not skills, so they have no `/skill:` command. Inside the mode, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit (`../poteto-mode/playbooks/babysit.md`, planned W4). It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship. Until it ships, poteto-mode gives a read-only status report.
- "land the stack" runs Shipping (`../poteto-mode/playbooks/shipping.md`, planned W4). Until it ships, poteto-mode lands nothing and says the workflow is unavailable.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full (`../poteto-mode/playbooks/autopilot-full.md`, planned W4). "stack them, don't ship" runs Autopilot-stack (`../poteto-mode/playbooks/autopilot-stack.md`, planned W4).
- "run the eval playbook" runs Eval (`../poteto-mode/playbooks/eval.md`, planned W4).

Without poteto-mode, a phrase such as "babysit this pr" is an ordinary request, and another installed skill may answer it instead. The Playbooks section of `../poteto-mode/SKILL.md` lists every playbook, when it applies, and which ones are planned. `../poteto-mode/playbooks/opening-a-pr.md` covers opening a PR, only when the task authorizes one.

pstack has no planning skill. For work that spans phases or stacked PRs, asking poteto-mode for a plan runs the Multi-phase plan playbook (`../poteto-mode/playbooks/multi-phase-plan.md`, planned W4), which writes the plan and doesn't implement it. Until it ships, poteto-mode writes the phases into its checklist from the closest base playbook and says the plan playbook was unavailable. For a design question, the Prototype playbook (`../poteto-mode/playbooks/prototype.md`) settles it in code first.

Principles are one-rule skills that poteto-mode reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/skill:principle-<name>` still loads one on demand. The Principles section of `../poteto-mode/SKILL.md` lists all 24 with a summary each.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | It was loaded with `/skill:poteto-mode`, which covers one request. Run `/poteto-mode on`, or start each task with `/poteto-mode <task>`. `/poteto-mode status` shows the state. |
| `/poteto-mode` refused to turn on | The `poteto-mode` skill is filtered out or shadowed by another file. The message says which. `/setup-pstack` reports where each skill resolves. |
| `/poteto-mode <task>` did nothing | It is refused while a turn is running, and nothing is queued. Send it again when the session is idle. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. `/poteto-mode off` stops the reminders. |
| A new model choice had no effect | A saved `/setup-pstack` change needs a Pi reload. An explicit `model` in a `subagent` call also wins over the task categories. |
| `/subagents-init` or a task-model write was refused | That is pstack's writer gate. Use `/setup-pstack <request>`. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `setup-pstack` loads from the user's words. The others load when the user types `/skill:<name>` or when poteto-mode reads them, and it doesn't read every skill. |
| A skill named in a reply isn't installed | It is planned for a later release. poteto-mode should have said so and used the hub's interim route. |
| Parallel agents overwrote each other | Give each parallel writer its own `worktree` in the `subagent` call, per `../poteto-mode/references/delegation.md`. |
| An autonomous run moved but finished nothing | Done needs a check that can pass or fail, not a duration. See `../poteto-mode/playbooks/autonomous-run.md`. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's Prove It Works in the hub's Principles section. |

For a run that drifts, `references/prompting.md` has one-line steers, and `references/recipes.md` has prompts worth copying.

## Make pstack my own

- `/skill:automate-me` (planned W4) drafts a personal mode skill from the user's own history, to use alongside poteto-mode.
- `/skill:reflect` (planned W4) after a session turns its lessons into skill edits the user approves.
- `/poteto-mode write a skill for <workflow>` runs the authoring playbook (`../poteto-mode/playbooks/authoring-a-skill.md`, planned W4). The eval playbook (`../poteto-mode/playbooks/eval.md`, planned W4) tests a skill change blind. Until they ship, poteto-mode says so and follows the Pi Agent Skills format by hand.
- Fix a misbehaving skill in its own commit or PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from `references/recipes.md` when one fits, then the path of the file the answer came from. Keep it short unless the user asked for the whole map.
