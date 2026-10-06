---
name: setup-pstack
description: Report-first onboarding for pi-herdr-pstack. Explains the /setup-pstack report on the pi-herdr-agents host, pstack's own skills and commands, authenticated models and the shared pi-herdr-agents task-model preferences, and drives an explicitly approved change only inside a /setup-pstack change flow. Never installs packages. Use for /setup-pstack, "set up pstack", "check my pstack install" or "which models does pstack use".
---

# Setup pstack

Help the user understand and, only when they ask, change how pi-herdr-pstack's delegates pick models. The pstack extension does the checking and the writing in code. Your job is to explain its report, translate a requested change into one proposal, and report the outcome honestly.

Pstack keeps no model configuration of its own. There is no pstack rule file, model map, per-role budget ladder or model alias. Delegates choose models through pi-herdr-agents. An explicit `model` in the `subagent` call wins, whether it is an exact `provider/model-id` or a `task:<category>` selector that expands to the shared task preferences. Only a call without `model` falls back to role, per-agent and default models, then the parent's model. poteto-mode sets `model` on every call; see `../poteto-mode/references/delegation.md`.

Paths here are relative to this skill directory.

## How setup runs

- `/setup-pstack` (or `/setup-pstack report`) shows a report the extension builds in code and makes no change. It ends with "No changes were made."
- `/setup-pstack <request>`, for example `/setup-pstack use <provider>/<model-id> for review`, shows the same report to you and opens a **change flow** for this one turn. The flow's message starts with "/setup-pstack opened change flow". It closes when the turn settles.
- Any other way of reaching this skill, including `/skill:setup-pstack` or your own choice to load it, is informational. It never authorizes a configuration write. Explain the report sections below and ask the user to run `/setup-pstack` for the live report.

Never edit the pi-herdr-agents config with the write, edit or bash tools, and never call `subagents_write_task_models` yourself. While pstack is installed, the extension refuses every writer call except the single call it makes itself after the user approves the exact payload. That includes the host's `/subagents-init` flow and direct writes in any session. `/setup-pstack <request>` is the replacement.

## Reading the report

The report has these sections, in order: Session, Host, Pstack resources, Models, Shared preferences, Findings, Next steps.

- **Session.** A pi-herdr-agents subagent (`PI_SUBAGENT_ID` set) or a session without dialogs (print or JSON mode) is report-only. Setup belongs in the user's own interactive or RPC session.
- **Host.** pi-herdr-agents counts as loaded only when its tools are. Files on disk or in `node_modules` do not activate an extension. The writer must expose the conditional contract (`expectedConfigRevision` in its public schema) and be active. An older unconditional writer keeps setup report-only.
- **Pstack resources.** Each skill must resolve to this package's own file. A filtered or shadowed skill is reported, never replaced. Pstack ships no named roles, and the report says so. Child visibility is reported as not verified unless a child actually loaded the package.
- **Models.** The exact `provider/model-id` references with configured authentication. Never invent or remember model IDs.
- **Shared preferences.** The config file is `$PI_CODING_AGENT_DIR/herdr-agents/config.json`, or `~/.pi/agent/herdr-agents/config.json`. The report shows only the six task categories (`coding`, `review`, `recon`, `qa`, `architecture`, `docs`), their metadata and the default model, never per-agent overrides or other settings. Setup never changes those either. A configured reference that is not one printable token is withheld. Missing, unreadable, malformed, non-object, missing-status and invalid-models files are distinct states. Only a missing or valid file can be changed. A missing file would be created from pi-herdr-agents' packaged defaults plus the approved task preferences.
- **Findings.** Unauthenticated, aliased (`task:`) or padded references, and unset categories that poteto-mode's examples use.

## In a change flow

1. Map the user's request onto categories. Use only exact references listed under Models. If the request is ambiguous, names a model that is not listed, or would remove a category, do not guess. Explain what is possible and stop; the user can run `/setup-pstack <request>` again.
2. Call `pstack_apply_task_models` once, with `changes` holding only the categories to replace, each with its complete new list. Every other current category is kept as it is. W2 setup never deletes a category.
3. The extension validates the proposal, builds the complete writer payload (all categories, metadata it generates, and the file revision the proposal was read from), and shows it in an approval dialog. Metadata is never yours to choose.
4. Report the result as the tool states it:
   - **Declined or timed out.** Nothing was written.
   - **Rejected or stale.** Nothing was written. Name the reason. Do not retry with the same proposal; a fresh `/setup-pstack <request>` re-reads the file and asks again.
   - **Failed, busy or uncertain.** The extension checked the saved file after the call. Repeat exactly what it says: unchanged and nothing written, holds the approved preferences despite the error, or uncertain and needs inspection. A failed call is not proof that nothing was written. Do not retry.
   - **Saved.** The extension verified the saved file against the approval. Tell the user to reload Pi, and that task categories are shared: the change affects every pi-herdr-agents workflow and role pack, not only pstack.

## Check for a project verification skill

When explaining the report, check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing test harness. The **create-verification-skill** skill that generates one is planned W4 and not installed in this release. If none exists, mention the gap once and move on. Do not offer to generate one.

## Your reply

Lead with what the user asked: the state of the install, or the outcome of the change. Give each claim its evidence, such as a report line or the tool result. Label anything not checked as not checked. Outside a successful saved change, end with "No changes were made."
