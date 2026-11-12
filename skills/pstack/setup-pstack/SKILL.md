---
name: setup-pstack
description: Configure which models pstack's delegates use per task category and at what reasoning budget. Detects your authenticated models and writes the shared pi-herdr-agents task preferences, models and thinking, after you approve the change in the host's dialog. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write pi-herdr-agents' task preferences, `models.tasks` and `models.tasksThinking`, which set the models and the thinking level for each task category pstack's delegates launch with.

Pstack keeps no model configuration of its own. poteto-mode launches every ordinary delegate with a `task:<category>` model, and pi-herdr-agents resolves it from these shared preferences. A change affects every pi-herdr-agents workflow and role pack that uses the categories, not only pstack. The categories are `coding`, `review`, `recon`, `qa`, `architecture` and `docs`. An explicit `model` in the `subagent` call wins, whether it is an exact `provider/model-id` or a `task:<category>` selector that expands to these preferences. Only a call without `model` falls back to role, per-agent and default models, then the parent's model. Likewise an explicit `thinking` overrides a category's thinking.

Run this skill through `/setup-pstack [request]`. The command appends a setup brief that starts with "/setup-pstack started the setup flow." and makes the host writer `subagents_write_task_models` callable. Reached any other way, such as `/skill:setup-pstack`, there is no brief and no writer: explain these steps and ask the user to run `/setup-pstack`. Never edit the pi-herdr-agents config with the write, edit or bash tools. Paths here are relative to this skill directory.

## Steps

### 1. Detect available models

The brief's "Authenticated models" list is the dependable source: every exact `provider/model-id` with configured authentication in this session, with the thinking levels it supports. Never write a model you have not confirmed is in that list, and never write a remembered or guessed ID. If the list is `(none)`, ask the user to authenticate a provider and run `/setup-pstack` again. There are no model aliases: a category holds exact models only.

### 2. Load current state

The brief's "Current choices" are the saved choices: for each category, its ordered model list and its thinking level, where `null` means not set. There are no skill defaults, so an unset category needs a choice. A saved model that is not in the authenticated list cannot be written back. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** If the user's request in the brief already names one, use it. Otherwise ask with these four options and these exact labels, as a numbered list, and wait for the answer. When every category has the same saved thinking and it is one of the four targets, name that budget as the current one; otherwise say the saved thinking is mixed or not set.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the current choices. The budget changes thinking only, never models: `unlimited`, `large`, `medium` and `small` set every category's thinking to `max`, `xhigh`, `high` or `medium`. The host clamps a category's thinking to each candidate model at launch: the target when the model supports it, else the nearest supported level above it, else the highest one below. So `unlimited` runs a model that tops out at `xhigh` at `xhigh`, and a model without reasoning runs at `off`. Work out that effective level for every model from the levels the brief lists.

**(c) Show the categories and confirm.** Show every category with its models in order, each with its effective thinking, and the upstream roles it drives from the table below. Mark a category with no authenticated model as needing a choice, and list each model step 2 dropped. Ask whether to accept as-is or change specific categories, offering the authenticated models and the thinking levels. A category's list is ordered candidates: the first launches, and later ones are fallbacks when a launch fails. It is not a panel, and its length sets no fan-out count. Favor capability for `coding`, `review` and `architecture`, and efficiency for `recon` and `qa`.

| Upstream role | Category |
| --- | --- |
| feature, refactoring; bug-fix; perf-issue; hillclimb | `coding` |
| judgment and prose; hardest tasks | `architecture` |
| how explorer; why investigators | `recon` |
| how explainer; why synthesizer; reflect judgment, divergent, synthesizer | `architecture` |
| swarm workers | `qa` to verify or measure, `recon` to explore, `coding` to write |
| arena runners, arena cross-judge pool, architect runners, interrogate reviewers, reflect tooling | none: diversity seats get one exact model per family from the live catalog at launch, per `../poteto-mode/references/fan-out.md` section 3 |
| (no upstream role) | `review` for reviewers and judges, `qa` for verifiers, `docs` for documentation workers |

### 4. Validate

Every model written must be in the brief's authenticated list, every category written needs at least one model, and every thinking level is one of `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`. If a chosen model is not available, stop and ask again.

### 5. Write the preferences

Call `subagents_write_task_models` once with:

- `tasks`: every category that has models, each with its complete ordered list. The writer removes any category you leave out, so include every category the user kept.
- `tasksThinking`: the thinking for each category in `tasks`.
- `tasksMeta`: the brief's "tasksMeta for this write", exactly.
- `basis`: `{"kind":"registry-only"}`.
- `expectedConfigRevision`: the brief's value, exactly.

The writer replaces the task models and their thinking in one atomic write, so re-runs stay idempotent. The host shows the user the exact change and asks for approval. Nothing is saved unless the user chooses to save. If the call fails, say what the host said and do not call it again with the same arguments:

- Declined, cancelled or timed out: nothing was written. Ask whether they want to change something.
- `Stale task model config revision`: the file changed after the brief was read. Ask the user to run `/setup-pstack` again.
- Any other error: repeat it. It says whether the file is unchanged, holds the approved preferences, or needs inspection.

### 6. Confirm

Tell the user, from the tool result's saved `tasks` and `tasksThinking`, what was saved, that it applies after `/reload` or in a new session, and that it is shared by every pi-herdr-agents workflow. Re-running `/setup-pstack` updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /skill:create-verification-skill." On yes, read `../create-verification-skill/SKILL.md` and follow it. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill under `.pi/skills/` that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /skill:create-formal-verification-skill." On yes, read `../create-formal-verification-skill/SKILL.md` and follow it. On no, move on without pushing.
