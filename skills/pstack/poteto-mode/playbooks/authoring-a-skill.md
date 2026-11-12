### Authoring or modifying a skill

**You own the skill's voice.**

1. Author `SKILL.md` to Pi's skills documentation (`docs/skills.md` in the installed Pi package). The `name` uses lowercase letters, digits and single hyphens, at most 64 characters, and matches its directory. The `description` says what the skill does and when it applies, in at most 1024 characters. Set `disable-model-invocation: true` when the skill should load only through `/skill:<name>`. Refer to bundled files by paths relative to the skill directory.
2. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve. Run Pi where the skill is discoverable, check the startup diagnostics and the `/skill:<name>` command, and run `/reload` after each edit in an open session.
3. Test cases if structural. Skip if subjective.
4. Run **Opening a PR** (`playbooks/opening-a-pr.md`) only when the task authorizes a pull request. Otherwise stop at the validated local change.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per **principle-encode-lessons-in-structure**. Delegate to other skills by path. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.
