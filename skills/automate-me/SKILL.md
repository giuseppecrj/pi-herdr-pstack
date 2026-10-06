---
name: automate-me
description: "Use for \"automate me\", \"create/update/refresh my -mode skill\", \"turn/capture my preferences or working style into a skill\", or wanting agents to follow how the user works. Drafts or revises a personal -mode skill via Pi skill authoring + unslop, optionally pulling fresh evidence from recent transcripts."
disable-model-invocation: true
---

# Automate me

A guided flow for turning the user's working conventions into a skill agents will follow. The output is one `-mode` skill tailored to them (e.g. `jay-mode`, `priya-mode`).

This skill orchestrates three others: an inline mining pass (see step 1), Pi skill authoring (authoring), and the **unslop** skill (prose discipline). Pi skill authoring here means Pi's skills documentation (`docs/skills.md` in the installed Pi package) plus the skill-authoring playbook, `../poteto-mode/playbooks/authoring-a-skill.md` (planned W4). It sequences them; it doesn't replace them.

## Flow

### 0. Check for an existing skill

Look recursively for `.pi/skills/**/*-mode/SKILL.md` and `~/.pi/agent/skills/*-mode/SKILL.md` matching the user's handle. Mode skills can live in a personal category directory (`.pi/skills/<handle>/`), not only at the top level. If one exists, confirm intent by asking in your reply and ending the turn (unless they already said "update my skill" or similar):

- Update the existing skill (default for repeat runs)
- Start fresh (rare; ask why before doing it)

Update mode changes the rest of the flow:
- Step 1 mines only history since the skill was last edited (`git log -1 --format=%cI <path>`).
- Step 2 asks what's changed or missing, not what to capture from zero.
- Step 4 edits the existing file in place. Preserve sections the user hasn't contradicted; revise ones with new evidence; add new sections only for genuinely new rules.

### 1. Mine their history

Locate prior Pi sessions for the current working directory before fanning out, with the per-cwd session directory rule in `../poteto-mode/playbooks/session-pickup.md`. Read only that one directory. Never glob all of `~/.pi/agent/sessions/`, because that crosses project boundaries and may read unrelated private chats.

Survey recent agent conversations within that scope for recurring patterns. Launch one bare investigator child per slice of history (e.g. last 2-4 weeks, split into 3 slices so each has enough material), as independent `subagent` calls in one turn per `../poteto-mode/references/fan-out.md`, with `model: "task:recon"`. Each slice mining child reads only the session files the parent lists in its task, looks for the signals below, and returns a short structured list of patterns it saw with evidence pointers. Default signals worth hunting:

- Response preferences (length, tone, format, "dumb it down" corrections)
- Delegation habits (subagents, models, specialized workflows, parallelism)
- Verification posture (what "done" means; unit tests vs live repro; reviewers)
- Code and prose discipline (style, principles cited, lint/format tools)
- Process conventions (worktrees, commits, PRs, review/merge tooling)
- Meta preferences (fixing skills mid-task, proposing new ones)

Cross-check across slices before elevating a signal. Patterns seen in 2+ slices are high-confidence; lone signals are weak and usually get dropped.

### 2. Ask the user directly

Mining misses intent that has not come up yet. Ask one or two concise questions in your reply, each with 4-6 numbered options, then one optional free-form follow-up, and end the turn for the answers. Do not block on questions that an experiment or repository evidence can answer.

Don't dump 20 questions. Two structured rounds plus one open question is usually enough.

### 3. Cluster findings

Group the combined signals into sections. Common ones (use only what applies):

- **Response style**: length, tone, format.
- **Autonomy**: how much to do without asking; MCP tool use.
- **Understand first**: which skills to reach for when scoping or investigating a change.
- **Subagents**: default, parallelism, model-to-task, specialized workflows.
- **Prose / code discipline**: principles, lint tools, style guides.
- **Review and verify**: repro posture, verification skills, live-testing tools.
- **Process**: git worktrees, commits, PRs, review/merge tooling.
- **Skills**: skill-authoring habits, fix-the-skill-first, proposing new skills.

The **poteto-mode** skill shows the shape. Read it for granularity. Don't copy its content; the user's rules are not the same as poteto-mode's.

### 4. Draft the skill

Author the skill with Pi skill authoring. Placement:

- Path: preserve an existing mode skill's category. For a new mode, use `.pi/skills/<handle>/<handle>-mode/SKILL.md` when the repo has an established personal category for that handle; otherwise default to `.pi/skills/<handle>-mode/SKILL.md` in the project. Writing inside the project's `.pi/skills/` needs no permission. A personal skill at `~/.pi/agent/skills/<handle>-mode/` changes the user's Pi configuration, so write there only after the user explicitly confirms that path.
- Handle: the user's first name or chosen identifier.
- Frontmatter `description`: trigger on their name + `/<handle>-mode` + "work in their style", not on generic keywords like "write code" or "review PR".
- Frontmatter formatting: follow Pi's skills documentation. The `name` is lowercase letters, digits and single hyphens, at most 64 characters, and the `description` is at most 1024 characters. Keep `description` as one YAML scalar; quote it or use `description: >-` with indented continuation lines when punctuation or wrapping requires it.
- Frontmatter `disable-model-invocation: true` by default. Mode skills are heavy and opinionated; they should only apply when the user explicitly invokes them (by name or slash command), not auto-trigger on description matching. Opt out only if the user explicitly wants their mode to apply on every turn.

### 5. Iterate on prose

Apply the **unslop** skill and the writing rules of Pi skill authoring to every line. Both apply to any agent-read prose, not just skills.

Show the draft to the user and take feedback. Expect multiple iterations. Cut ruthlessly; a mode skill is not a manual.

### 6. Land it

Work in a worktree off main and commit there when the task's commit policy allows. Pushing and opening a PR so the user can review it each need the user's explicit authorization (`../poteto-mode/references/authorization.md`). Without it, report the branch, the commit and the diff. Don't push to main directly.

## Guardrails

- **Don't overfit to one conversation.** A preference stated once and contradicted another time is noise. Require multiple instances before codifying it.
- **Don't be clever.** Restating other skills' contents, inventing metaphors, or writing "poetic" prose for an agent reader is cost without benefit. Keep it operational.
- **Reference, don't inline.** Other skills the user relies on should appear as path references, not pasted excerpts. Same for any principle docs they maintain elsewhere.
- **Keep sections minimal.** Only add a section if the user has a specific, non-default rule there. "Communicate clearly" is not a section. "Short paragraphs. Tables when comparing options. Bullets only when items are genuinely parallel." is.
- **Name conventions generic.** Use "the user" or "the human" in imperatives, not the author's first name. Others may read or adopt the skill.
- **Don't force symmetry.** If a user has no process rules worth writing down, skip the Process section entirely. Sparse is fine; bloated is not.

## Evaluation

A `-mode` skill is subjective output. A benchmark-style test and iterate loop isn't useful here. Vibe-check with the user: does it read like them? Did it miss anything? Then ship.

Run a description-optimization loop only if the skill's trigger accuracy turns out to be a problem in practice.

## When not to use

- User wants a task-specific skill (not working conventions): Pi skill authoring alone, no mining required.
- User wants to capture one narrow workflow (e.g. "how I write commit messages"): that's a regular skill, not a mode skill.

## Reference files

- The **poteto-mode** skill: example of the output shape.
- The **unslop** skill: prose discipline for every line.
- Pi's skills documentation and `../poteto-mode/playbooks/authoring-a-skill.md` (planned W4): skill authoring process and writing guidelines.
