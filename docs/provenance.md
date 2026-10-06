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
([historical plan 09](https://github.com/giuseppecrj/pi-herdr-pstack/blob/96910f507046285071453b660099b0c3549e6161/docs/plans/09-wave2-no-poteto-role.md)). `agents/poteto.md`, the `roles.ts`
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

## Wave 4: 14 skills, 11 playbooks and two scripts

Wave 4 shipped the last 14 inventory rows and the 11 remaining poteto-mode
playbooks, so all 51 rows are `shipped` in `docs/skill-inventory.json` and all
23 playbooks ship. Each batch owns its fixtures:

- W4-A (`w4-a.json`): `how`, `why`, `architect`, `arena`, `swarm`,
  `interrogate`, `reflect`, `figure-it-out`. 33 files, 21 copied and 12 adapted,
  all from mimir.
- W4-B (`w4-b.json`): `show-me-your-work`, `recall`, `automate-me`,
  `create-verification-skill`, `maintain-verification-skill`, `make-bot-ui`.
  11 files, 4 copied and 7 adapted. `scripts/log.sh` is copied with its
  upstream mode `100755`. `make-bot-ui` is adapted from Cursor
  `make-bot-ui/SKILL.md` at `2cbf58508f40de470d7490b55c51d71241928fa2` and
  substantially re-authored for Pi: a loopback-bound local page whose server
  starts one `pi -p` run per request, with the key in a local file and exposure
  or installs only on authorization. Cursor's frontmatter name `Make Bot UI`
  became `make-bot-ui`.
- W4-P (`w4-p.json`): `playbooks/{hillclimb,eval,visual-parity,authoring-a-skill,babysit,shipping,autopilot-full,autopilot-stack,multi-phase-plan,orchestrate,worktree-cleanup}.md`
  and `scripts/check-plan.mjs` (mode `100644`), all 12 adapted from mimir.
  `check-plan.mjs` changed with the multi-phase-plan skeleton, since upstream
  enforced `/loop` and repository-root markers.

Of the 56 new Wave 4 files, 25 are copied and 31 adapted. The C0 checkpoint
added one new file, `skills/poteto-mode/references/fan-out.md` (in `w2.json`),
the shared fan-out protocol. The package now ships 113 skill files: 49 copied,
61 adapted and 3 new.

The remaining upstream helper scripts stay excluded in `w2.json`, each
disposition naming its replacement: `scripts/orch/*` (the Orchestrate playbook
as a depth-1 coordinator with a hand-kept store), `scripts/watch-pr/*` (the
one-shot watcher child in `fan-out.md` and stated `gh` field conditions),
`scripts/worktree-audit.sh` (`worktree_list` and per-path `worktree_remove`),
and `scripts/{bootstrap.ts,bun.lock,package.json}` (no runtime installer or
script dependencies).

The reconcile step retired every forward-reference tuple: the 93 that Wave 3
left (42 in `hub.json`, 5 in `w3-a.json`, 46 in `w3-b.json`) and the 9
cross-batch tuples the batches recorded (2 in `w4-a.json`, 1 in `w4-b.json`, 6
in `w4-p.json`). No target was deferred to Wave 5, so every fixture under
`test/fixtures/forward-references/` is empty. It also removed every
`planned W4` marker and interim "until it ships" clause from the hub, the base
playbooks, `bugbot-triage.md`, `setup-pstack`, `poteto-help`, the six Wave 3
files and the Wave 4 files that cited each other, and rewrote each route to name
the workflow's real behavior and scope-down limits. `blast-radius` and
`principle-prove-it-works` became byte-identical copies again.

The content test now exempts fenced code blocks from the placeholder-marker and
model-name bans (inline code too for placeholder markers, and for model names
in byte-identical copies), and checks every fence with the `marked` lexer.
That let three W4-A edits made only to satisfy the old bans be reverted:
`why/references/sources/code-archaeology.md` and
`reflect/references/synthesizer.md` are byte-identical mimir copies again, and
`architect/references/runner-prompt.md` keeps upstream's `// TODO` marker while
staying adapted for its other edits.
