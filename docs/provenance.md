# Provenance

## Wave 1: moved role and package files

| Destination | Source | Status |
| --- | --- | --- |
| `agents/poteto.md` | pi-herdr-agents `agents/poteto.md` at `c2177dff835da44937e614e8a03d0405d442e848` | moved unchanged in W1; **removed in W2** |
| `LICENSE` | pi-herdr-agents `LICENSE` at the same commit | unchanged |

`poteto.md` first appeared in pi-herdr-agents' launch commit `4fa3f26` and was
moved here byte-identical in Wave 1. `test/fixtures/provenance.json` records the
SHA-256 of each source blob and destination; `npm test` fails on unreviewed
drift and, when a pi-herdr-agents checkout is available, reproduces each source
hash from the source commit.

Wave 1 also added `pi-extension/pstack/{index,roles}.ts` (a role-pack bridge
adapted from pi-herdr-agents' `examples/role-pack/extension.ts` and ADR-0003),
package metadata, tests, `README.md`, `THIRD_PARTY_NOTICES.md` and these
documents.

## Wave 2: role removal

The user removed the named `poteto` role from the Wave 2 target
(`docs/plans/09-wave2-no-poteto-role.md`). `agents/poteto.md`, the `roles.ts`
bridge and its registration were deleted; pstack contributes no named roles and
registers no role directory. The provenance fixture keeps the role's W1 source
and hashes with status `removed` and `removedIn: "W2"`. No replacement role was
added and the role body was not copied elsewhere.

## Wave 2: runtime

`pi-extension/pstack/{config,mode,resources,setup}.ts` and their tests are new.

## Wave 2: methodology skills

The `skills/poteto-mode/` and `skills/setup-pstack/` files are adaptations of
upstream pstack, recorded separately from the Wave 1 role fixture in
`test/fixtures/skill-provenance/w2.json`. Sources:

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
| `skills/setup-pstack/SKILL.md` | Cursor `setup-pstack/SKILL.md` | adapted, substantially rewritten; revised by the runtime owner to describe the implemented change flow |

The fixture records, for every shipped file, its SHA-256, each source path and
blob hash at the pinned commit, and what changed. The adaptations share four
themes:

- Delegation uses pi-herdr-agents' public single-call `subagent` schema (tested
  host `e262c584f54a7c8d60eb1fa5510f47c1299e3801`). Every delegate is a
  deliberate bare delegate with a bounded reference prompt: implementer,
  investigator, reviewer or verifier. Upstream `poteto-agent`, `role`/`tasks`/`chain`,
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
  equivalent or a reported skip. Wave 2 listed 96 exact references in
  `test/fixtures/forward-references/hub.json`; the 54 W3 references retired
  when Wave 3 shipped, leaving 42.

Of the 45 mimir `poteto-mode` source files, 14 are adapted here. The other 11
playbooks are planned W4 methodology work and are not shipped as empty files.
The 20 helper-script files have documented dispositions: excluded (dependency
bootstrap, a duplicate scheduler/ledger, direct worktree pruning) or deferred to
W4 replacements (the PR watcher and plan checker). `npm test` checks
destination hashes and source accounting. It reproduces the source hashes when
`PSTACK_MIMIR_SOURCE` and `PSTACK_CURSOR_SOURCE` point to checkouts that
contain the pinned commits.

## Wave 3 fixture layout

From Wave 3 the fixtures are split by owner so parallel writers never share a
file. `test/fixtures/skill-provenance/` holds `w2.json` (the Wave 2 fixture,
moved verbatim), `w3-a.json` and `w3-b.json`. `test/fixtures/forward-references/`
holds `hub.json` (the Wave 2 tuples, moved verbatim), `w3-a.json` and
`w3-b.json`. The test unions each directory and requires every entry to lie in
its owner's skill directories. A file's status is `copied` (destination bytes
equal the primary source), `adapted` (one primary source, changes explained) or
`new` (derived only).

`docs/skill-inventory.json` is at schema version 2: rows carry a `status` of
`planned` or `shipped` that drives the content checks, and the `no-comments`
row lists `../agents/comment-sicko.md` (relative to each source's skills root)
as the source of its bare delegate prompt
`skills/no-comments/references/comment-sicko.md`. The delegation schema pin is
pi-herdr-agents `7d35371f5d7d0df3edd208a1d5c9a187767d563b`; its
`SubagentParams` and task categories are byte-identical to the Wave 2 pin
`e262c584`.

## Wave 3: 35 skills and the comment-sicko delegate

Wave 3 shipped the 35 Wave 3 inventory rows: the 24 `principle-*` skills,
`tdd`, `correct`, `benchmark-checklist`, `blast-radius` and
`typescript-best-practices` (W3-A, `test/fixtures/skill-provenance/w3-a.json`),
and `unslop`, `technical-writing`, `no-comments`, `teach`, `bro` and
`poteto-help` (W3-B, `w3-b.json`). Those rows are `shipped` in
`docs/skill-inventory.json`, so 37 rows ship in total. Of the 39 Wave 3 files,
22 are copied byte-for-byte from mimir and 17 are adapted, each with one primary
source and an explanation in its fixture.

| Destination | Primary source | Status |
| `skills/principle-*/SKILL.md`, `tdd`, `correct` | mimir file of the same name | 19 copied; 7 principles adapted for skill-relative paths, full principle names or a planned W4 reference |
| `skills/{benchmark-checklist,blast-radius}/SKILL.md`, `skills/typescript-best-practices/**` | mimir | adapted (paths, names, planned W4 interim rules; `paths:` frontmatter dropped) |
| `skills/{unslop,technical-writing,bro}/SKILL.md` | mimir | copied |
| `skills/{no-comments,teach}/SKILL.md` | mimir, Cursor as context | adapted |
| `skills/no-comments/references/comment-sicko.md` | mimir `../agents/comment-sicko.md` at `f07dd981f62c9c994a5d043ede67d6c63c721454` | adapted: frontmatter dropped, made a comment editor, planned W4 interim rule |
| `skills/poteto-help/**` (3 files) | Cursor `poteto-help/` at `2cbf58508f40de470d7490b55c51d71241928fa2` | adapted, re-authored for Pi from Cursor's structure |

comment-sicko is a bare delegate prompt under `skills/no-comments/references/`,
not a role. `/skill:no-comments` reads it and passes it as `systemPrompt`;
pstack still ships no named roles and has no `agents/` directory.

The reconcile step retired every `planned W3` marker and its interim clause in
the hub, playbooks and the W3 files, and removed the 63 forward-reference tuples
that pointed at Wave 3 rows (54 in `hub.json`, 1 cross-batch in `w3-a.json`, 8
cross-batch in `w3-b.json`). The 93 remaining tuples all point at Wave 4 rows or
playbooks. Two short example sentences in the copied `technical-writing` skill
are attributed to Diátaxis and ASD-STE100 in `THIRD_PARTY_NOTICES.md`.
