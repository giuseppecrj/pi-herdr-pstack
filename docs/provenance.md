# Provenance

## Wave 1: moved role and package files

| Destination | Source | Status |
| --- | --- | --- |
| `agents/poteto.md` | pi-herdr-agents `agents/poteto.md` at `c2177dff835da44937e614e8a03d0405d442e848` | unchanged (byte-identical) |
| `LICENSE` | pi-herdr-agents `LICENSE` at the same commit | unchanged |

`poteto.md` first appeared in pi-herdr-agents' launch commit `4fa3f26`. Its text
contains no host-owned paths or bundled-ownership wording, so no adaptation was
needed. `test/fixtures/provenance.json` records the SHA-256 of each source blob
and destination; `npm test` fails on unreviewed drift and, when a
pi-herdr-agents checkout is available, compares each file to the source commit.

`pi-extension/pstack/{index,roles}.ts` (bridge adapted from pi-herdr-agents'
`examples/role-pack/extension.ts` and ADR-0003), package metadata, tests,
`README.md`, `THIRD_PARTY_NOTICES.md` and these documents are new.

## Wave 2: methodology skills

The `skills/poteto-mode/` and `skills/setup-pstack/` files are adaptations of
upstream pstack, recorded separately from the Wave 1 role fixture in
`test/fixtures/skill-provenance.json`. Sources:

| Key | Repository | Commit | Root |
| --- | --- | --- | --- |
| mimir | https://github.com/casualjim/pi-mimir | `f07dd981f62c9c994a5d043ede67d6c63c721454` | `packages/pi-pstack/skills` |
| cursor | https://github.com/cursor/plugins | `2cbf58508f40de470d7490b55c51d71241928fa2` | `pstack/skills` |

| Destination | Primary source | Status |
| --- | --- | --- |
| `skills/poteto-mode/SKILL.md` | mimir `poteto-mode/SKILL.md`, Cursor hub as context | adapted |
| `skills/poteto-mode/playbooks/*.md` (12 base playbooks) | mimir playbook of the same name, Cursor as context | adapted |
| `skills/poteto-mode/references/bugbot-triage.md` | mimir file of the same name | adapted |
| `skills/poteto-mode/references/delegation.md` | derived from both hubs' Subagents sections | new |
| `skills/poteto-mode/references/authorization.md` | derived from both hubs' Autonomy sections | new |
| `skills/setup-pstack/SKILL.md` | Cursor `setup-pstack/SKILL.md` | adapted, substantially rewritten |

The fixture records, for every shipped file, its SHA-256, each source path and
blob hash at the pinned commit, and what changed. The adaptations share four
themes:

- Delegation uses pi-herdr-agents' public single-call `subagent` schema (tested
  host `e262c584f54a7c8d60eb1fa5510f47c1299e3801`). The `poteto` role covers
  implementation, and deliberate bare delegates cover investigation, review and
  verification. Upstream `poteto-agent`, `role`/`tasks`/`chain`,
  `subagent_type`, model aliases and hardcoded model defaults are gone.
- Methodology never grants permission. Commits follow the task's commit policy.
  Pushes, PR operations, review-thread replies, merges, deletions and shared
  configuration writes need explicit authorization. Pstack has no
  shell-command guard, so this is behavioral, not enforced.
- Platform tools (`set_tasks`, `AskQuestion`, `/loop`, Cursor transcripts,
  `cursor-team-kit` control and cleanup skills, the Cursor rule file) are
  replaced by Pi or pi-herdr-agents equivalents or by explicit manual steps.
- Skills from later waves keep their names. Every reference to one is marked
  planned W3 or planned W4 on the line that makes it, with a safe manual
  equivalent or a reported skip. The 96 exact references are listed in
  `test/fixtures/wave2-forward-references.json`.

Of the 45 mimir `poteto-mode` source files, 14 are adapted here. The other 11
playbooks are planned W4 methodology work and are not shipped as empty files.
The 20 helper-script files have documented dispositions: excluded (dependency
bootstrap, a duplicate scheduler/ledger, direct worktree pruning) or deferred to
W4 replacements (the PR watcher and plan checker). `npm test` checks
destination hashes and source accounting. It reproduces the source hashes when
`PSTACK_MIMIR_SOURCE` and `PSTACK_CURSOR_SOURCE` point to checkouts that
contain the pinned commits.
