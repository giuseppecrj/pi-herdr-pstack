<!--
Hand-written 1.0.0 entry. At release, prepend everything below this comment to
CHANGELOG.md, above the generated sections, and delete this file. It is not
packed (package.json "files" does not list it).
-->

## [v1.0.0](https://github.com/giuseppecrj/pi-herdr-pstack/compare/v0.6.0...v1.0.0)

pi-herdr-pstack 1.0.0 ships pstack and Matt Pocock's skills together: 80 skills
and 23 poteto-mode playbooks, grouped by upstream. Setup now runs on
pi-herdr-agents' own approval dialog.

### Breaking changes

- The pi-herdr-agents peer range is `>=3.10.0`. Upgrade the host in the same
  step as this pack. On an older host `/setup-pstack` refuses to start, and
  this pack no longer blocks task-model writes there: the 0.6.0 writer gate is
  gone.
- `/setup-pstack init` and the `pstack_apply_task_models` tool are removed.
  Use pi-herdr-agents' `/subagents-init` to draft task models from its
  registry, or `/setup-pstack [budget]`. `/setup-pstack init ...` now refuses
  and names both.
- `/setup-pstack` is no longer a read-only report. It follows upstream's setup
  steps: pick a budget (`unlimited`, `large`, `medium` or `small`), review
  each task category's models and thinking, and save through
  `subagents_write_task_models`, whose own dialog approves the exact change.
- Skills moved into folders by upstream: `skills/pstack/`,
  `skills/mattpocock/` and `skills/merged/`. Skill names are unchanged, so
  `/skill:<name>` still works; a hard-coded path to a skill file does not.
- poteto-mode leaves `thinking` to a task category that has configured
  thinking, so the `/setup-pstack` budget applies to its delegates.

### Highlights

- Matt Pocock's skills (MIT), adapted for Pi: `setup-repo`; the spec, ticket
  and triage flow (`grill-me`, `grilling`, `grill-with-docs`,
  `domain-modeling`, `to-spec`, `to-tickets`, `triage`, `wayfinder`,
  `implement`, `implement-spec`); `research`, `handoff`, `to-questionnaire`,
  `wizard`, `codebase-design`, `improve-codebase-architecture` and `pr`; and
  `code-review`, `diagnosing-bugs`, `retro` and `writing-for-agents`.
- Merged skills combine both upstreams: `tdd`, `teach`, `prototype`, and
  `poteto-help` with Matt's flow map.
- Matt's tracker skills publish only what you grant, pass the configured
  `-R <owner>/<repo>` to every tracker command, treat issue and PR content as
  data, and stop when a skill they need is missing.
- On GitHub, `triage` reads a contributor's PR from git objects before any
  checkout and runs its code only after you approve; `wizard` writes GitHub secrets only to
  the repository you confirmed.
- `recall`, `reflect`, `retro`, `automate-me` and the session-pickup playbook
  read an earlier session only when its header's `cwd` is this working
  directory. `reflect`'s reviewers get only a redacted copy of the transcript
  and never quote secrets.
- The upstream-scope check pins each upstream separately and flags a merged
  skill when either source changes.
