# Skill mechanics

The skill-specific branch of `writing-for-agents` (`SKILL.md`): what changes when the document is a Pi skill (frontmatter, the invocation choice, and router skills). Everything else about writing it is the universal reference in `SKILL.md`.

## Frontmatter

A Pi skill is a directory holding `SKILL.md`, which opens with frontmatter. `name` uses lowercase letters, digits and single hyphens, at most 64 characters, and matches the directory. `description` is required, at most 1024 characters: Pi does not load a skill without one. `disable-model-invocation: true` makes the skill user-invoked (below). Refer to bundled files by paths relative to the skill directory. Pi's skills documentation (`docs/skills.md` in the installed Pi package) is the authority, and poteto-mode's authoring playbook (`../../pstack/poteto-mode/playbooks/authoring-a-skill.md`) validates a skill against it.

## How Pi reaches a skill

Pi has no tool that fires a skill. At startup it lists each model-invoked skill's name, description and path in the system prompt, and the agent loads one by reading its `SKILL.md`. The human loads any skill by typing `/skill:<name>`. Another skill loads one by naming its `SKILL.md` by a path relative to its own directory (`../<name>/SKILL.md`), whatever that skill's invocation setting; a subagent's brief carries the absolute path, because a child's list omits user-invoked skills.

## Invocation

Two choices, trading the two loads:

- A **model-invoked** skill keeps a `description` in the agent's context, so the agent can fire it autonomously. You can still type `/skill:<name>`: model-invocation always _includes_ user reach; a description only ever adds agent discovery, never removes the human's. The description is the skill's top-level context pointer, forced to stay loaded at all times: permanent context load in exchange for discoverability. A model-invoked skill whose content is all reference is also one home for shared reference: the agent finds it on its own and other skills point at it by path, so reference needed by several skills lives in one place. Mechanics: omit `disable-model-invocation`, and write a model-facing description carrying the trigger branches (the pointer-writing rules in `SKILL.md` apply in full).
- A **user-invoked** skill keeps the description out of the agent's context: the agent never sees it listed, so it fires only when the human types `/skill:<name>`, or when another skill names its `SKILL.md` by path. Zero context load, but it spends cognitive load: you are the index that must remember it exists. Mechanics: set `disable-model-invocation: true`; the `description` stays, because Pi requires it, but becomes human-facing: a one-line summary, trigger lists stripped.

Pick model-invocation only when the agent must reach the skill on its own. Another skill reaching it is no reason in Pi, since a path reaches either kind. If it only ever fires by hand or from another skill, make it user-invoked and pay no context load.

Shared reference that two user-invoked skills both need still has a home: each points at it by a relative path, whether it sits in one skill's folder or in a plain file outside the skill system. Keep that path inside the package that ships both skills, so it resolves wherever the package is installed.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`): split off a model-invoked skill when you have a distinct leading word that should trigger it on its own (a trigger word you actually use in your prompts). Another skill reaching it is not a reason by itself: a skill reads any other skill's `SKILL.md` by path. You pay context load for the new always-loaded description, so that independent reach has to be worth it.

## Router skills

When user-invoked skills multiply past what you can remember, that piled-up cognitive load is cured by a **router skill**: one user-invoked skill that names the others, with each one's `/skill:<name>` command, and when to reach for each, so the human has one skill to remember instead of many. It can only hint: the agent never finds user-invoked skills on its own, so the human picks one, then types its command or has the router read its `SKILL.md` by path.
