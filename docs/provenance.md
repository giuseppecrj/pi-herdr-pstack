# Provenance

## Upstream scope

The mattpocock/skills upstream has its own section below. Parity reviews and the weekly upstream sync cover three cursor/plugins roots
(decision Q6): `pstack/skills`, `pstack/agents` and `pstack/docs`. Two roots
are out of scope:

- `pstack/automations/**`: Cursor Automations with Slack event triggers (the
  benny triage and reproduce-and-fix pack). They need a scheduler or event
  trigger, and pstack has no scheduler, timer or ledger.
- `pstack/.cursor-plugin/**`: the Cursor plugin manifest, which is
  platform-specific. This package's manifest is the `pi` block in
  `package.json` plus `pi-extension/pstack/*.ts`.

The top-level `pstack/README.md`, `LICENSE`, `.gitignore`, `assets/` and
`plugin.json` are unscoped: none of them is ported. `pstack/plugin.json` is
the Agent Plugins v1 root manifest added at this pin; it is platform-specific
in the same way as `pstack/.cursor-plugin`. `pstack/LICENSE` is also watched, because
`THIRD_PARTY_NOTICES.md` reproduces its MIT notice. The fixture records its
SHA-256 at the pin. With a checkout, the scope test fails when the upstream
file at the recorded commit no longer matches that hash. Without one, it fails
unless a `text` block in `THIRD_PARTY_NOTICES.md` hashes to the same value, so
the hash cannot move until the notice reproduces the new `LICENSE` text byte
for byte. The sync PR body should still call out any upstream `LICENSE`
change.

`pstack/skills` is accounted for by `docs/skill-inventory.json` and
`test/fixtures/skill-provenance/`. Its `root` stays `pstack/skills`, so a
sibling path such as `../agents/comment-sicko.md` is relative to it.
`test/fixtures/upstream-scope.json` holds one pin record per upstream
(ADR-0003): its `upstream` key in the inventory's `sources`, the skills
`folder` it maps to, and its `repository`, `commit` and `root`. Every folder
under `skills/` must map to exactly one record. The `cursor` record maps
`skills/pstack/` to cursor/plugins at `root` `pstack`, and records the scope and
the status and SHA-256 of every file under `pstack/agents` and `pstack/docs` at
the cursor pin `1ba91fc25c0977741dd0e267849e6234b037ed0a`. The checks below run
once per record, with that upstream's checkout in `PSTACK_<UPSTREAM>_SOURCE`.
To move skills between folders, run `node scripts/move-skills.mjs <folder>
<skill>...`: it moves them with `git mv` and rewrites the `../` links between
skills, which `test/skill-tree.test.ts` requires to resolve.
With `PSTACK_CURSOR_SOURCE` set,
`npm test` checks that the file list and every hash match the pin, that every
top-level `pstack/` entry is classified, and that every file under
`pstack/skills` at the pin is referenced by the inventory or a skill-provenance
fixture. Without it, `npm test` still checks the fixture against the
skill-provenance fixtures and against the table below: a path that a
skill-provenance cursor source resolves to must be `carried`, and each row's
status must match the fixture. The checkout must hold the commit's blobs (a
full clone, or a partial clone that already fetched them): the tests and the
script disable lazy fetching.

On a pin move, `npm run fixtures:upstream-scope -- <upstream> <checkout>`
(for example `cursor`) rewrites that upstream's record at its own `commit`; the
checkout defaults to `PSTACK_<UPSTREAM>_SOURCE`, and the older
`npm run fixtures:upstream-scope -- <checkout>` form still means `cursor`. It re-hashes every file, keeps each existing
status, adds new paths as `not-carried`, and prints what was added, removed or
changed, any unclassified top-level entry and any watched file that changed.
It never updates a watched hash, and it exits non-zero when a top-level entry
or a watched file needs a person. A new `not-carried` path then fails the
table check until it gets a row here.

| Upstream path | Status at the pin |
| --- | --- |
| `pstack/agents/comment-sicko.md` | carried: context source for `skills/pstack/no-comments/references/comment-sicko.md` (adapted from mimir's copy; Wave 3) |
| `pstack/agents/poteto-agent.md` | excluded: a named role; pstack ships no named roles (Wave 2: role removal) |
| `pstack/docs/guide/**` (11 Markdown pages, 6 images) | excluded: under decision Q1 |
| `pstack/docs/harness/claude-code.md` | excluded: Claude Code harness adapter; this pack stays Pi/pi-herdr-agents only |

No file under these roots is in the not-yet-carried state. Between the previous
pin `190d28736eff128ec94f502a22c7fe0c4b56cd37` and the 8b3326d pin, `docs/guide/06-verify-and-ship.md`
changed (excluded under Q1). `pstack/agents/*` and `docs/harness/claude-code.md`
are unchanged. `pstack/LICENSE` is unchanged
(`bc957ca6bee02792566a1a028d105e02e247c6e77cf057061674273da77b200e`). Under
`pstack/skills`, `poteto-help/SKILL.md` gained a `/statechart` table row and `statechart/**` was added at 8b3326d (then flagged); both ship as of the 1ba91fc pin as an optional skill. The shipped runner uses the pack `tla-ts` dependency (no Java). `in-your-own-words`, `ketchup`, `sharpen`, and
`poteto-mode/scripts/check-plan.test.ts` stay flagged, not shipped. Unscoped
`pstack/README.md` and `pstack/plugin.json`, and out-of-scope
`pstack/.cursor-plugin/plugin.json` (0.15.29 to 0.15.30), changed and were not
ported.

## Upstream scope: mattpocock/skills

The `mattpocock` record in `test/fixtures/upstream-scope.json` maps
`skills/mattpocock/` to mattpocock/skills at
`5863806dd4e15c63174bee4e7515a4256792ecfa` (MIT, source `mattpocock` in
`docs/skill-inventory.json`, skills root `skills`). Its checkout goes in
`PSTACK_MATTPOCOCK_SOURCE`.

**Scope choice.** The whole upstream `skills/` tree is in scope, not only the
skills this pack ships, so the weekly sync sees every new, changed or removed
upstream file. All 114 files at the pin are accounted for: 33 ship in
`skills/mattpocock/` (29 adapted, 4 copied byte for byte), 6 are planned (owned
by a later issue) and 62 are excluded (with a reason), all in
`test/fixtures/skill-provenance/mattpocock.json`, and 13 ship merged in
`skills/merged/`, each the primary source of a file in
`test/fixtures/skill-provenance/merged.json`. `files` records each shipped file's source path, git blob, SHA-256
and what changed; `planned` and
`excluded` record the same hashes. With a checkout, `npm test` reproduces every
hash and blob and fails on any upstream file the fixture lacks; without one it
checks the fixtures against each other and the shipped tree. The record's root
is `.` (the repository root) so `LICENSE` can be watched like cursor's: its
SHA-256 is bound to the notice in `THIRD_PARTY_NOTICES.md`. Other top-level
entries are classified: `.claude-plugin` is out of scope (Claude Code manifests)
and the rest is unscoped repository tooling and docs.
`npm run fixtures:upstream-scope -- <upstream> [<checkout>]` also lists, for both
upstreams, skills-root files that are new, removed or changed. New and removed
are computed against the complete accounted set (inventory and provenance
fixtures). Only provenance entries carry a hash, so only they are checked for
content changes; a path the inventory alone lists is checked for presence, not
content (content checks for those paths belong to #38). It never rewrites that
accounting, and exits non-zero when any needs a person. The first run of the corrected removal check found three cursor
`poteto-mode/scripts/orch/*` paths that the inventory listed but cursor deleted
before the pin (cursor/plugins `c742dd6`); they were dropped from the cursor list
and stay in the mimir list, where they exist.

| Upstream path | Status at the pin |
| `skills/engineering/setup-matt-pocock-skills` | adapted: `skills/mattpocock/setup-repo/` (SKILL.md and the five seed templates, issue #32). Its Codex-only `agents/openai.yaml` is excluded. |
| `domain-modeling`, `grill-with-docs`, `implement`, `implement-spec`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `grill-me`, `grilling` | adapted: `skills/mattpocock/<name>/` with every supporting file (issue #33); `ADR-FORMAT.md` and `GLOSSARY-FORMAT.md` are byte-identical copies. Each Codex-only `agents/openai.yaml` is excluded. |
| `research`, `handoff`, `to-questionnaire`, `wizard`, `codebase-design`, `improve-codebase-architecture`, `pr` | adapted: `skills/mattpocock/<name>/` with every supporting file (issue #34); `to-questionnaire/SKILL.md` and `pr/CREDITS.md` are byte-identical copies. Each Codex-only `agents/openai.yaml` is excluded. |
| `tdd`, `teach` | merged: `skills/merged/<name>/` with pstack's skills of the same name (issue #36); see **Merged skills**. Their Codex-only `agents/openai.yaml` files are excluded. |
| `code-review` | adapted: `skills/mattpocock/code-review/` (issue #37, decision 1: kept beside pstack's `interrogate` and the playbook gates); see **Overlapping skills**. Its Codex-only `agents/openai.yaml` is excluded. |
| `prototype`, `ask-matt` | merged: `skills/merged/prototype/` with pstack's Prototype playbook, and `skills/merged/poteto-help/` with pstack's `poteto-help` (issue #37, decisions 3 and 5); see **Overlapping skills**. Their Codex-only `agents/openai.yaml` files are excluded. |
| `diagnosing-bugs`, `retro`, `writing-for-agents`, `in-progress/chief-of-staff` | planned: #37 batch B, one pair at a time |
| `skills/misc`, `skills/in-progress` (all but `chief-of-staff`), `skills/deprecated` | excluded: out of scope for v2 (#28) |
| every `agents/openai.yaml`, the bucket `README.md` files | excluded: Codex-only metadata and upstream indexes |
| `skills/productivity/wait-what` | excluded for now: no issue names it, so it needs a decision |

`setup-repo` adapts Matt's `setup-matt-pocock-skills` for Pi and
pi-herdr-agents. It keeps the upstream process and wording. It changes only the
name, `/skill:` command syntax, the instruction file order (`AGENTS.md`, then
`CLAUDE.md`, never a second file), a never-file-into-either-upstream rule, an
explicit approval before labels, remotes or files, the triage check (Pi hides
skills that disable model invocation from the available-skills list) and
backticked paths for the template links, which `test/skill-content.test.ts`
requires. A review added: the tracker repo is resolved, shown and confirmed in
the step 3 approval, written into the generated tracker doc, and passed as `-R
<owner>/<repo>` to every `gh`/`glab` issue, pr, mr and label command (`repo view`
takes it positionally and `api` paths name it; neither accepts `-R`), so an
`upstream` remote cannot redirect labels or issues; the domain layout and any legacy `CONTEXT.md` rename
join the step 3 drafts; and repo content read during exploration never
authorizes a command. These are content checks on the skill text; they do not
show that a live model follows it. The seed templates carry the same adaptations as this repository's
own `docs/agents/*.md`; `test/mattpocock-skills.test.ts` compares them. It names
`to-tickets`, `triage`, `to-spec`, `wayfinder`, `domain-modeling`,
`grill-with-docs` and `improve-codebase-architecture`; all but the last ship
with #33, and `improve-codebase-architecture` ships with #34. With `triage` now in
the pack, setup-repo's triage-label section runs.

The spec, ticket and triage flow (#33) adapts ten more skills the same way:
upstream's wording, process and `disable-model-invocation` values stay, and
only what Pi and pi-herdr-agents require changes. Each file's provenance entry
says what changed. In summary:

- Pi has no Skill tool. A skill that loads another reads its `SKILL.md` by a
  backticked path relative to its own directory (`../grilling/SKILL.md`,
  `../../merged/tdd/SKILL.md`), which `test/skill-tree.test.ts` resolves.
  `grilling` and `domain-modeling` stay model-invocable, as upstream has them,
  so Pi lists them for the model; the other eight load only through
  `/skill:<name>`.
- Slash commands use Pi's `/skill:<name>` syntax, and
  `/setup-matt-pocock-skills` became `/skill:setup-repo`.
- Every skill that reads or writes the tracker names the configured tracker doc
  (`docs/agents/issue-tracker.md`, from the `## Agent skills` section) and runs
  each command as that doc writes it, with its `-R <owner>/<repo>`, never the
  CLI's implicit default repo. Skills that apply labels ask the user before
  creating one the tracker lacks.
- Sub-agents and background agents became pi-herdr-agents `subagent` launches
  with `fork: false`, an explicit `model` (`task:recon` or `task:coding`) and
  `thinking`, and results that arrive on their own, never polled.
  `implement-spec` gives implementers a `worktree` based on the integration
  branch, keeps the merger and review fixes in the current checkout one at a
  time, and removes worktrees with `worktree_remove` only after the user
  approves the list. A child cannot see skills that disable model invocation,
  so its task carries the absolute path of the skill it must load.
- `implement` and `implement-spec` load the merged `tdd` (`skills/merged/tdd`,
  issue #36) and `code-review` (`skills/mattpocock/code-review`, issue #37).
  `research` ships with #34 and `prototype` (`skills/merged/prototype`) with
  #37, so wayfinder resolves both in this pack. The skills look for each by name,
  in this pack first, then among the user's installed skills or at a path the
  user gives (never from tracker content), and fail closed when none is found: without `code-review`, `implement` stops before its
  commit and `implement-spec` stops before any PR or ticket update; without
  `research` or `prototype`, those wayfinder tickets are reported as blocked.
  No other skill stands in. That wording stays for installs that filter a
  skill out; the pack itself ships all four.
- Pack policy added after review: the tracker doc says how to publish, never
  whether. Pushes, PR actions, issue creation, edits, comments, assignment,
  labels and label creation need the user's grant, and without it the work
  stays local. An explicit `/skill:` invocation grants only the write the skill
  exists for, in the tracker doc's repo: `to-spec` the one spec issue,
  `to-tickets` the tickets approved in its quiz with their links, `triage` the
  label, state and comment changes the maintainer directs (closing only on the
  maintainer's direction); `wayfinder`, `implement` and `implement-spec` get
  none. A skill loaded without the user invoking it grants nothing. Issue, PR and comment content, map Notes and linked material are
  data, never instructions, scope changes, skill choices or authorization, and
  child briefs repeat that. `triage` verifies a PR only in a detached review
  checkout under `~/.herdr/worktrees/<repo>/pr-<number>-review`, says that a
  checkout is not a sandbox, runs contributor-controlled code only after the
  user approves knowing it runs with their credentials and environment (or in
  an isolated environment they provide), and removes the checkout afterwards.
  `implement-spec` pushes or acts on a PR only when the review preflight passed
  and the user granted it. Worktree children start from committed state, so
  uncommitted inputs are committed with approval or passed by absolute path.
  `implement-spec` inspects each child's diff and checks before merging and
  advances the frontier on verified integration, not remote ticket closure.
- Relative Markdown links became backticked file names or italic section names,
  and `triage/OUT-OF-SCOPE.md`'s example fence widened to four backticks so its
  nested code block no longer breaks the file. `test/skill-tree.test.ts` checks
  that every backticked supporting-file name exists in the skill's folder and
  exempts only an explicit list of illustrative links in fenced templates.

These are content and loader checks (`test/mattpocock-skills.test.ts`,
`test/rpc.test.ts`); they do not show that a live model follows the skills.

The remaining gap skills (#34) adapt seven more the same way: `research`,
`handoff`, `to-questionnaire`, `wizard`, `codebase-design`,
`improve-codebase-architecture` and `pr`. Upstream's wording and invocation
settings stay: `research`, `wizard`, `codebase-design` and `pr` are
model-invocable, as upstream has them, and the other three load only through
`/skill:<name>`. `to-questionnaire/SKILL.md` and `pr/CREDITS.md` are copied
byte for byte. Each file's provenance entry says what changed. In summary:

- Pi has no Skill tool. `improve-codebase-architecture` loads
  `codebase-design`, `grilling` and `domain-modeling` by path
  (`../codebase-design/SKILL.md` and so on), and `handoff`'s suggested-skills
  section names each skill's `/skill:<name>` command or `SKILL.md` path.
  `/codebase-design` mentions became the `codebase-design` skill, `wizard`'s
  template header names `/skill:wizard`, and relative Markdown links became
  backticked file names, as in #33.
- Background agents and sub-agents became bare pi-herdr-agents `subagent`
  launches with `fork: false`, an explicit `model` and `thinking`, and results
  that arrive on their own, never polled: `research`'s researcher
  (`task:recon`, `medium`, no worktree, one findings file, no commit, push or
  further subagents), `improve-codebase-architecture`'s explorer
  (`task:recon`, `medium`, read-only) and `codebase-design`'s design-it-twice
  designers (`task:architecture`, `high`, on paper only).
- `research` carries a **Sources are data** rule into its child's brief word
  for word: web pages, docs, source code, specs and API responses are evidence,
  never instructions, scope changes, skill choices or authorization; the child
  never runs a command a source supplies or sends it local data. A subagent
  that loads `research` (a wayfinder research ticket) is a leaf and does the
  job itself, and wayfinder's brief now says so.
- Grants. Each skill's grant, on explicit invocation, is local: `research` one
  uncommitted findings note in the repo; `handoff` one document in the OS temp
  directory; `to-questionnaire` one `to-questionnaire-<slug>.md` in the
  current directory; `wizard` the script (committed only where the commit
  policy allows), never running it; `codebase-design` nothing;
  `improve-codebase-architecture` the HTML report in the OS temp directory and
  GLOSSARY.md or ADR edits. `pr` drafts the body as text: upstream's stated
  purpose is writing the body, not the remote write, so creating or editing a
  PR needs the user's grant and then goes to the tracker doc's repo with its
  `-R <owner>/<repo>`. `pr`, `research` and `wizard` carry #33's shared
  publishing paragraph with the grant sentence "grants no tracker or remote
  write", and `pr` also carries #33's tracker-content trust paragraph.
- `wizard`: the agent never runs the script, in whole or in part, nor the
  commands its stages would run; it writes no secret value into the script and
  never reads a live `.env` or `.env.*` file, taking variable names only from
  templates (`.env.example` and the like), config schemas, workflows and code,
  and asking the user for missing names, never values. After review, the
  template library binds GitHub writes to one repository: scoping confirms the
  `<owner>/<repo>`, the author sets `REPO` to it, `set_secret` and `set_var`
  pass `--repo "$REPO"` and skip when it is unset, and the intro shows it and
  stops unless the human confirms, so `GH_REPO`, the directory or a fork's
  default cannot redirect a secret. This is the one change to upstream's
  library.
- `handoff`: beyond upstream's redaction sentence, the document never holds a
  secret, even in part; it names where a secret lives, and the finished
  document is checked before its path is reported.
- `research`'s child-carried rule also keeps secrets and credential-bearing
  URLs (signed URLs, tokens in query strings, API responses with keys) out of
  the notes; credentials are named by variable or location.
  `improve-codebase-architecture`'s report keeps Mermaid's `securityLevel` at
  `"strict"` (upstream: `"loose"`) and HTML-escapes repository-derived text.
- `pr`'s Summary section comes through Matt's skill from HumanLayer's
  `show-me` (MIT); `THIRD_PARTY_NOTICES.md` reproduces that notice.

These are content and loader checks (`test/mattpocock-skills.test.ts`,
`test/rpc.test.ts`); they do not show that a live model follows the skills.

## Merged skills: `skills/merged/` (issue #36)

A skill drawn from both upstreams lives once in `skills/merged/` (ADR-0003) and
records every source. `tdd` and `teach` are the first two; `prototype` and
`poteto-help` followed in #37 (see **Overlapping skills**). Their provenance is
`test/fixtures/skill-provenance/merged.json`. Each file lists, per source, its
path, SHA-256 and git blob at the pin, and what changed. A source's `use` is
`primary` (Matt's file, the base of the merged text), `merged` (pstack's
cursor/plugins file, whose method is merged in by hand) or `context` (the
pi-mimir copy, which matches the cursor file for both skills; the pack's shipped
`tdd` was byte-identical to it, but the shipped `teach` at `0b1dde5` already
differed by one Pi sentence about the image tool). `prototype` follows the same
pattern, with the poteto-mode Prototype playbook as the `merged` source.
`poteto-help` reverses it: pstack's file is `primary` and Matt's `ask-matt` is
`merged`, while its flow map has ask-matt as `primary` and pstack's file as
`merged`. The inventory rows say
`skills/merged` and list the source files of all three. `test/fixtures/upstream-scope.json` has a `merged`
record naming the folder and its two pinned upstreams (`cursor` and
`mattpocock`).

Drift detection: `npm run fixtures:upstream-scope -- <upstream>` already compares
each recorded hash with the upstream at its pin. For the merged folder it also
prints the section `merged skill with a changed or removed source (manual
merge)` when this upstream's source of a file with more than one upstream
source changed or vanished, names the file, and exits non-zero. A person
merges the change by hand, then records the new hashes in `merged.json`. Run it
for each upstream: a change to either source flags the merged file.
`test/merged-skills.test.ts` proves it on scratch upstreams for a change and for
a removal on either side, and that a merged file is not flagged when neither of
its sources changed. A merged file that has a single source (Matt's
`tests.md`) is covered by the ordinary changed-hash check.

`tdd` merges Matt's red → green loop (seams agreed first, anti-patterns, rules
of the loop, `tests.md`, `mocking.md`) with pstack's gate for when to use it or
skip it, bug-fix workflow, impractical-test fallback, guardrails and evidence
report. `teach` has two modes, because the two skills teach different things.
Explain is pstack's one plain account built on `how` and `why`, and writes
nothing. Workspace is Matt's multi-session teaching workspace with lessons,
reference documents, learning records and four format files. Where the two
conflict the stricter rule is in the merged text:

- Seams. Matt confirms them with the user before any test; pstack proceeds on
  an obvious cheap test path. The merged `tdd` confirms the seam in one line for
  such a bug, counts seams confirmed in a spec or ticket, and has a delegated
  child take them from its brief, or from a spec or ticket the brief points at
  that already confirms them, and report its proposal and write no test only
  when neither names any. `implement-spec` has each implementer brief state
  where its seams are (named, or "confirmed in <spec or ticket pointer>"), and
  the parent never merges a child that stopped at "proposed seams, wrote no
  test": it confirms the seams with the user or from the spec and re-briefs, and
  the merger never integrates a diff whose tests did not go red when `tdd`
  applied.
- Skipping. The use-or-skip gate runs first and a skip is told to the user
  (before the substitution when they asked for TDD), never silent.
- Writes. Explain mode writes nothing. Workspace mode writes only after the
  user confirms the directory (a git repository with project code needs an
  explicit yes), and only the named files inside it.
- Sources and effects. Workspace mode treats web sources as data, loads no
  remote script, stylesheet or font in lessons, opens only the lesson it wrote,
  and suggests communities without joining or posting. Neither skill grants a
  push, pull request or tracker write.
- `disable-model-invocation: true` for both. pstack's `tdd` and `teach` and
  Matt's `teach` set it. Matt's `tdd` does not, but the merged `tdd` asks the
  user to confirm seams and its gate depends on what the user asked for, so the
  model does not load it unprompted. `implement` and `implement-spec` load it by
  path; the bug-fix playbook only says "see the tdd skill", by name.

`test/merged-skills.test.ts` holds the content-contract tests for both skills
(each rule is shown to fail when its text is removed), the provenance checks
with and without checkouts, and the loader tests. They are content and loader
tests, not evidence that a live model follows either skill.

## Overlapping skills (issue #37, batch A)

Issue #37 decides each pair of overlapping skills. Batch A implements decisions
1, 3 and 5 and closes the release gate #33 left open (`implement`,
`implement-spec` and `wayfinder` found no `code-review` or `prototype`).

- **`code-review`** (decision 1: keep both). Matt's two-axis review ships as
  `skills/mattpocock/code-review`, beside pstack's `interrogate` and
  poteto-mode's review gates, which are unchanged. It keeps upstream's Standards
  and Spec reviewers, smell baseline, briefs and aggregation. It is read-only:
  it changes no file, index, branch or stash, pushes nothing and posts nothing
  unless the user grants it. Every `git diff` and `git show` it documents
  carries `--no-ext-diff --no-textconv`, so configured diff drivers and textconv
  helpers never run (not a sandbox). It reviews one of two targets. Committed
  work is upstream's three-dot diff, against a named `<head>` such as
  `implement-spec`'s integration branch, read from git without a checkout.
  Uncommitted work since the merge-base of the fixed point and `HEAD` is
  reviewed as three labelled layers: commits since the base, the staged commit
  candidate (`--cached`) and unstaged changes, because one net diff can hide a
  staged change the working tree reverts. Paths are listed before any content
  is read: likely credential files are never read or handed on (and are
  excluded from every diff by pathspec), symlinks that resolve outside the
  repository are not followed, binaries are skipped and large files bounded,
  and the report names what was omitted. `implement` records its starting
  commit and, when tracked files are already dirty, a `git stash create`
  baseline (the tree and index stay untouched); code-review reviews those files
  as the delta from that baseline, so a file the task changed is never dropped,
  and `implement` asks before modifying a file that was already untracked. It
  then reviews its uncommitted work before it commits; `implement-spec` records
  the commit its integration branch starts from and reviews that branch as
  committed work. The two reviewers are bare pi-herdr-agents subagents with
  `task:review`, `thinking` only when that category has none, and no worktree,
  because a worktree starts from committed state. `tdd` names it where it
  defers refactoring.
- **`prototype`** (decision 3: merge). `skills/merged/prototype` combines
  Matt's prototype (primary; the logic and UI branches with `LOGIC.md` and
  `UI.md`) with pstack's poteto-mode Prototype playbook (merged: the empirical
  branch, references, evidence rules, reply and handoff to Feature). Scratch is
  the default location; building inside the app needs the user's explicit
  scope; keeping, committing, pushing or pointing at a prototype each need
  authorization, and prototype code never reaches the main branch. A logic
  prototype's pure module reaches production only in a separately authorized
  production change with its normal tests and review. The playbook
  keeps its place in poteto-mode's routing and points at the skill
  (`w2.json` records the change and why the file is now under half its source).
  `wayfinder`'s Prototype tickets name the skill. The skill keeps Matt's model
  invocation, since its default writes only to scratch.
- **`poteto-help`** (decision 5: merge, no separate `ask-matt`). pstack's
  `poteto-help` moved from `skills/pstack` to `skills/merged` and keeps its
  install, `/setup-pstack`, poteto-mode and troubleshooting content and the
  brief-reading contract `test/setup.test.ts` asserts. Matt's `ask-matt` flow
  map became `references/flows.md` and its phase-boundaries tree
  `references/phase-boundaries.md`, adapted to the pack: `/skill:<name>`
  commands, Pi's `/new` and `/compact`, and only flows whose skills ship and are
  dependency-closed. Matt's `retro`, `diagnosing-bugs`, `wait-what` and
  `writing-for-agents` are named only as absent, with the shipped alternative.
  Playbooks are not skills. Its provenance moved from `w3-b.json` to
  `merged.json`.

`merged.json` records both upstreams for `prototype/SKILL.md`,
`poteto-help/SKILL.md` and `poteto-help/references/flows.md`, so
`npm run fixtures:upstream-scope -- <upstream>` flags each for a manual merge
when either source changes. ask-matt's `SKILL.md` is the primary source of
`flows.md` and merged into poteto-help's `SKILL.md`; the mattpocock accounting
counts each Matt file once, by the file it is the primary source of.
`test/overlap-skills.test.ts` holds the content contracts (each rule is shown
to fail when its wording is removed), a disposable-repo run of every git
command code-review and `implement` document (no configured helper fires, the
staged layer shows a change the working tree reverts, the baseline delta keeps
a task's edit to an already-dirty file and drops the untouched user edit, an
excluded credential path stays out of a diff), the checks that the dependents find these
skills in the pack, the flow map's dependency closure and the real-Pi loader
test. They are content and loader tests, not evidence that a live model follows
the skills.

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

The `skills/pstack/poteto-mode/` and `skills/pstack/setup-pstack/` files are adaptations of
upstream pstack, recorded separately from the Wave 1 role fixture in
`test/fixtures/skill-provenance/w2.json`. Sources:

| Key | Repository | Commit | Root |
| --- | --- | --- | --- |
| mimir | https://github.com/casualjim/pi-mimir | `f07dd981f62c9c994a5d043ede67d6c63c721454` | `packages/pi-pstack/skills` |
| cursor | https://github.com/cursor/plugins | `1ba91fc25c0977741dd0e267849e6234b037ed0a` | `pstack/skills` |

| Destination | Primary source | Status |
| --- | --- | --- |
| `skills/pstack/poteto-mode/SKILL.md` | mimir `poteto-mode/SKILL.md`, Cursor hub as context | adapted |
| `skills/pstack/poteto-mode/playbooks/*.md` (12 base playbooks) | mimir playbook of the same name, Cursor as context | adapted |
| `skills/pstack/poteto-mode/references/bugbot-triage.md` | mimir file of the same name | adapted |
| `skills/pstack/poteto-mode/references/delegation.md` | derived from both hubs' Subagents sections | new |
| `skills/pstack/poteto-mode/references/authorization.md` | derived from both hubs' Autonomy sections | new |
| `skills/pstack/setup-pstack/SKILL.md` | Cursor `setup-pstack/SKILL.md` | adapted; rewritten under #35 to follow upstream's steps (below) |

`setup-pstack` was rewritten under #35 to follow the Cursor skill's eight
steps and wording where Pi allows: detect models, load current state, budget,
map and confirm, validate, write, confirm, and offer once each the
verification and formal verification skills. What changed from upstream: it
writes pi-herdr-agents' `models.tasks` and `models.tasksThinking` instead of
a Cursor rule file; the budget ladder sets every category's thinking (`max`,
`xhigh`, `high`, `medium`), which the host clamps per candidate instead of
Cursor's per-slug effort tokens; upstream's roles are mapped onto the six
task categories in a table, with panel roles left as diversity seats; there
are no `auto`-style aliases or skill defaults; the question is asked in chat;
and the write is one `subagents_write_task_models` call approved in the
host's dialog. The earlier report-first skill, change and init flows,
`pstack_apply_task_models`, the writer gate and `pi-extension/pstack/config.ts`
were deleted; `setup.ts` now only activates the host writer and briefs the
skill. The fixture records the details.

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
`skills/pstack/no-comments/references/comment-sicko.md`. The delegation schema pin is
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
source and an explanation in its fixture. `tdd` and `teach` have since moved to
`skills/merged/` (issue #36, see **Merged skills**); the rows below mark them.

| Destination | Primary source | Status |
| `skills/pstack/principle-*/SKILL.md`, `correct` (`tdd` moved to `skills/merged/tdd`, #36) | mimir file of the same name | 18 copied; 7 principles adapted for skill-relative paths, full principle names or a planned W4 reference |
| `skills/pstack/{benchmark-checklist,blast-radius}/SKILL.md`, `skills/pstack/typescript-best-practices/**` | mimir | adapted (paths, names, planned W4 interim rules; `paths:` frontmatter dropped; the boundary row follows the Cursor blob, and `references/patterns.md` is aligned to that row) |
| `skills/pstack/{unslop,technical-writing,bro}/SKILL.md` | mimir | copied |
| `skills/pstack/no-comments/SKILL.md` (`teach` moved to `skills/merged/teach`, #36) | mimir, Cursor as context | adapted |
| `skills/pstack/no-comments/references/comment-sicko.md` | mimir `../agents/comment-sicko.md` at `f07dd981f62c9c994a5d043ede67d6c63c721454` | adapted: frontmatter dropped, made a comment editor, planned W4 interim rule |
| `skills/pstack/poteto-help/**` (3 files; moved to `skills/merged/poteto-help`, #37) | Cursor `poteto-help/` at `ccb5507cec1546dc88135c1139c811e6c59115ba` | adapted, re-authored for Pi from Cursor's structure |

`skills/pstack/poteto-help/SKILL.md` (now `skills/merged/poteto-help/SKILL.md`) adapts the one-time setup nudge that landed in
cursor/plugins `1e56b2913469f05101e4ffd4d437c2e6fd2c1b8d` (PR #509) and is now
in the pin. The fixture records the Cursor blob at
`ccb5507cec1546dc88135c1139c811e6c59115ba`. The nudge asks once, when the
answer depends on the six task categories and a `/setup-pstack` report does
not already show them set, whether to run `/setup-pstack` (report only) or
leave the categories as they are. The pin also changes the interrogate table
row from "several models" to "different models". Cursor's Later line that
every role keeps its default model is still uncopied. A category counts as unset when the Config line ends with the
missing-file sentence, or when a present file's preference value is
`(not set)`. Findings are not unset: the host trims a reference and both
sides of `/` before it checks authentication, and the report cannot show
that result. Any other Config-line ending is an unknown file state.
poteto-mode always passes `task:<category>`, so
those delegations fail until an approved `/setup-pstack <request>` write sets
the category. poteto-help does not read or write task-model config.

comment-sicko is a bare delegate prompt under `skills/pstack/no-comments/references/`,
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
playbooks. The 190d287 pin move added two more inventory rows
(`create-formal-verification-skill`, `maintain-formal-verification-skill`), so
all 57 rows are `shipped` in `docs/skill-inventory.json` and all 23 playbooks
ship. Each batch owns its fixtures:

- W4-A (`w4-a.json`): `how`, `why`, `architect`, `arena`, `swarm`,
  `interrogate`, `reflect`, `figure-it-out`. 33 files, 21 copied and 12 adapted,
  all from mimir. Swarm maps the Verifier prompt's per-claim pass, fail or
  inconclusive onto one overall `PASS`, `ISSUES` or `BLOCKED`. Briefs list
  their claims first. A proved fail always means `ISSUES`. `PASS` needs at
  least one listed claim and a pass for each, and a claim with no result is
  inconclusive. Zero claims means `BLOCKED`. A `BLOCKED` coverage slice is
  reported as unverified, never as covered. A brief's claims together cover
  the slice's share of the done predicate. Aggregation recomputes each status
  from the claims in the brief, with any other proved defect still `ISSUES`,
  and uses the result whenever it differs from the reported status.
- W4-B (`w4-b.json`): `show-me-your-work`, `recall`, `automate-me`,
  `create-verification-skill`, `maintain-verification-skill`,
  `create-formal-verification-skill`, `maintain-formal-verification-skill`,
  `make-bot-ui`. 13 files, 4 copied and 9 adapted. `scripts/log.sh` is copied
  with its upstream mode `100755`. `make-bot-ui` is adapted from Cursor
  `make-bot-ui/SKILL.md` at `2cbf58508f40de470d7490b55c51d71241928fa2` and
  substantially re-authored for Pi: a loopback-bound local page whose server
  starts one `pi -p` run per request, with the key in a local file and exposure
  or installs only on authorization. Cursor's frontmatter name `Make Bot UI`
  became `make-bot-ui`. The two formal-verification skills are adapted from
  Cursor at `190d28736eff128ec94f502a22c7fe0c4b56cd37` (Pi paths, `/skill:`
  forms, install and PR authorization).
- W4-P (`w4-p.json`): `playbooks/{hillclimb,eval,visual-parity,authoring-a-skill,babysit,shipping,autopilot-full,autopilot-stack,multi-phase-plan,orchestrate,worktree-cleanup}.md`
  and `scripts/check-plan.mjs` (mode `100644`), all 12 adapted from mimir.
  `check-plan.mjs` changed with the multi-phase-plan skeleton, since upstream
  enforced `/loop` and repository-root markers. Upstream cursor/plugins
  `multi-phase-plan.md` still requires a rebased head with the "patch-id
  unchanged"; this pack's rebase item in the skeleton's Merge block
  (`multi-phase-plan.md:130`) defers to the patch-id rule in
  `playbooks/shipping.md` instead, and `check-plan.mjs` rejects the old
  wording. The divergence is deliberate, so a sync must not restore it.

Of the 56 new Wave 4 files, 25 are copied and 31 adapted. The C0 checkpoint
added one new file, `skills/pstack/poteto-mode/references/fan-out.md` (in `w2.json`),
the shared fan-out protocol. The package now ships 115 skill files: 48 copied,
64 adapted and 3 new. The ccb5507 pin move re-adapted `blast-radius` (it was a
mimir copy after reconcile) for the "more than one model" wording. The 190d287
pin move added the two formal-verification skills as adapted Cursor leaves.

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
the workflow's real behavior and scope-down limits. `principle-prove-it-works` remains a byte-identical copy.
`blast-radius` was a copy after reconcile; the ccb5507 pin move adapted it.

The content test now exempts fenced code blocks from the placeholder-marker and
model-name bans (inline code too for placeholder markers, and for model names
in byte-identical copies), and checks every fence with the `marked` lexer.
That let three W4-A edits made only to satisfy the old bans be reverted:
`why/references/sources/code-archaeology.md` and
`reflect/references/synthesizer.md` are byte-identical mimir copies again, and
`architect/references/runner-prompt.md` keeps upstream's `// TODO` marker while
staying adapted for its other edits.

## G6: judgment category

Judgment and prose synthesis (the how explainer, the why synthesizer, and
reflect's judgment, divergent and synthesizer lenses) uses `task:architecture`
with thinking at high or above. Reflect's tooling lens is a diversity seat.
The hardest implementation changes go to that category or to the strongest
exact catalog model with `thinking: xhigh`. The cursor pin is
`1ba91fc25c0977741dd0e267849e6234b037ed0a`. The host describes `architecture`
as planning and diagnosis, and its tier guidance puts that work in the
frontier tier. `/setup-pstack` reports an unset `architecture` category;
`qa` stays off that list. A flow that will need an architecture seat checks
for a `- architecture:` bullet under the host prompt's Task-category shortlists
before launching recon or review seats; the bare word architecture elsewhere in
the prompt does not count. The tooling lens's family differs from the first
model listed for architecture under those shortlists. If that launch falls
back to a later candidate whose family matches the tooling lens, the lens is
relabeled context-isolated.

## Excluded: upstream user guide

cursor/plugins ships a user guide under `pstack/docs/guide/`: a `README.md`
index, ten chapters (`01-setup.md` through `10-recipes-and-pitfalls.md`, about
1,100 lines in all at the previous pin
`2cbf58508f40de470d7490b55c51d71241928fa2`, at
`d0ef80d86795816da932a153458c5dbe192d294e`, at
`f713f14203cd6420cec13cd7c55c32d598dbab68`, at
`190d28736eff128ec94f502a22c7fe0c4b56cd37`, and at the current pin
`1ba91fc25c0977741dd0e267849e6234b037ed0a`) and six `images/*.jpg`. It walks a user from setup and prompting
through design, verification, overnight runs and customization. It sits outside
the pinned `pstack/skills` root and is deliberately not ported, adapted or
packed.

Its setup and overnight chapters are Cursor-specific; the rest walks through
skills that ship here, so an adapted copy would be a large second surface to
keep in sync. Users get the equivalent from the package `README.md` (install,
setup, first task) and `/skill:poteto-help`, which routes a question to the
installed skill, playbook or principle file and gives a prompt to send. Within
the pinned `pstack/skills` root, only `poteto-help/SKILL.md` linked the guide,
with seven `../../docs/guide/*` links (to seven of the ten chapters). The
adaptation removed them (`test/fixtures/skill-provenance/w3-b.json`), and no
shipped file links a guide page.

## Q5: one forge

Origin is dropped. `playbooks/opening-a-pr.md` uses `gh` for every PR
operation, like Babysit, Shipping and the autopilots. The mimir and Cursor
sources still offer Origin; the cursor pin is
`1ba91fc25c0977741dd0e267849e6234b037ed0a`. The content test bans capitalized
`Origin` in shipped skills, except make-bot-ui's backticked HTTP header field,
and the lowercase forge CLI forms; the git remote named `origin` is
unaffected.

## Pin move: cursor/plugins `ccb5507`

The cursor pin moved from `2cbf58508f40de470d7490b55c51d71241928fa2` to
`ccb5507cec1546dc88135c1139c811e6c59115ba`. The two commits in between that
touch `pstack/` are `1e56b29` (#509, poteto-help setup nudge) and `df58112`
(#511, drop Sol and retune default effort). The casualjim/pi-mimir pin stays
`f07dd981f62c9c994a5d043ede67d6c63c721454`.

Hand-ported, platform-neutral substance only:

- `skills/pstack/blast-radius/SKILL.md`: "several models" became "more than one
  model". Status is `adapted`; the destination equals the Cursor blob and is
  no longer a mimir copy.
- `skills/pstack/architect/references/runner-prompt.md`: "one of several runners"
  became "one of the parallel runners".
- `skills/pstack/poteto-help/SKILL.md`: the interrogate table says "different
  models". The G5 setup nudge is now in the pin; the Pi mapping is unchanged.
- `skills/pstack/interrogate/SKILL.md`: a rejected model prefers the same family and
  reasoning tier. Seats still follow the live catalog, one family each.

Documented skips (Cursor-only model defaults, rule file, budget ladder, or
excluded scripts):

- `architect/SKILL.md`, `arena/SKILL.md`, `how/SKILL.md`, `why/SKILL.md`,
  `reflect/SKILL.md`, `poteto-mode/SKILL.md`: hardcoded Cursor slugs and the
  default panel list (Opus `max` to `xhigh`, Sol dropped). This pack already
  uses task categories and exact catalog diversity seats.
- `setup-pstack/SKILL.md`: the budget ladder now treats `large` as the
  default and `unlimited` as `max`. This pack has no ladder.
- `poteto-mode/scripts/orch/orch.test.ts`: verifier label `sol` to `opus`.
  The orch/ledger scripts stay excluded.
- `pstack/docs/guide/01-setup.md` and `04-design.md`: excluded under Q1.
- `pstack/README.md`: unscoped. `pstack/.cursor-plugin/plugin.json`:
  out of scope. `pstack/LICENSE`: unchanged.

No new agents or docs file is in the not-yet-carried state.

## Skipped: Benny

cursor/plugins `pstack/automations/benny/**` is not ported. It lies outside
the pinned `pstack/skills` root. Benny is two Cursor Automations triggered
by Slack posts: one triages a report and may file a tracker ticket, and the
other reproduces the bug and may open a draft PR. Running it needs an
external trigger or scheduler, which conflicts with this pack's no-scheduler
rule, and it depends on Cursor Automations, Slack posting and tracker writes.
Four of its methodology gates are adapted into
`skills/pstack/poteto-mode/playbooks/bug-fix.md` (Q2): confirm the cause is in code
this repo or team owns, verify an existing fix instead of writing a competing
one, stop rather than race another person's claim on the fix, and reproduce
twice before and after the fix. The sources are
`reproduce-and-fix-issues/SKILL.md`,
`reproduce-and-fix-issues/references/verify-existing-fix.md` and
`triage-issue-reports/SKILL.md`, read at
`d0ef80d86795816da932a153458c5dbe192d294e` and byte-identical at the pin. The
bug-fix entry in `w2.json` records which steps changed.

## Pin move: cursor/plugins `f713f14`

The cursor pin moved from `ccb5507cec1546dc88135c1139c811e6c59115ba` to
`f713f14203cd6420cec13cd7c55c32d598dbab68`. About 79 commits sit between those
pins; the ones that change in-scope pstack methodology are the token-cut and
principle restatements (`00b14f1`, `08bd59b`, `e5136d8`, `99743e9`),
verification readiness (`c49b37a`), fence-aware plan checks (`87c8103`),
subagent-effort and playbook cuts (`ce649c0`), and the new skills
`in-your-own-words`, `ketchup` and `sharpen`. The casualjim/pi-mimir pin stays
`f07dd981f62c9c994a5d043ede67d6c63c721454`.

Hand-ported, platform-neutral substance only:

- `skills/pstack/poteto-mode/scripts/check-plan.mjs`: CommonMark fence pairing so
  nested fences are not treated as prose. PROGRAM_MARKERS, the
  unchanged-patch-id scan and git mode `100644` stay. Upstream's `/loop 1h`
  and `git show origin/main:` markers were not restored.
- `skills/pstack/correct/SKILL.md`: step 3 now fails a test that still passes when
  the checked behavior breaks, or that fails when only the internals change.
  Destination equals the Cursor blob; status is `adapted`.
- `skills/pstack/create-verification-skill/SKILL.md`: launch readiness means usable
  from an empty data dir; a missing seed precondition fails the journey;
  a stand-in proof lists unverified setup steps. `.pi/skills` paths stay.
- `skills/pstack/principle-attack-the-premise/SKILL.md`: write the premise down and
  test it; follow the evidence; remove the condition. Pi backticked paths stay.
- `skills/pstack/principle-fix-root-causes/SKILL.md`: fault versus symptom; a guard
  is a fix only when the state is legitimate; cheap always-on signal after a
  deep dig. Destination equals the Cursor blob; was a mimir copy.
- `skills/pstack/principle-make-operations-idempotent/SKILL.md`: derive steps from
  existing state; judge leftover artifacts as stale by crash-surviving
  evidence. Destination equals the Cursor blob; was a mimir copy.
- `skills/pstack/principle-test-behavior-not-implementation/SKILL.md`: two imagined
  edits (break behavior / change internals) replace the `undefined`-import
  heuristic. Destination equals the Cursor blob; was a mimir copy.
- `skills/pstack/poteto-mode/SKILL.md`: the three principle summaries above follow
  the ported leaves.
- `skills/pstack/poteto-mode/playbooks/opening-a-pr.md`: as a parent merges, move
  its child onto trunk per `playbooks/shipping.md` step 4.

Documented skips (Cursor-only tools, token cuts that only delete examples,
or excluded scripts):

- Hub and most playbooks: `poteto-agent`, `subagent_type`, hardcoded slugs,
  `cursor-team-kit`, `/loop`, Origin, Graphite, cloud agents, ketchup replies
  on Autopilot-full/stack, shipping rewrite (G1 allowlist stays).
- `multi-phase-plan.md`: upstream "full swarm once" plus `poteto-agent`.
  This pack keeps per-push swarm markers that `check-plan.mjs` still requires,
  and still defers rebase/patch-id to `shipping.md`.
- Copied mimir leaves whose Cursor delta only deleted sections or flattened
  headings (encode-lessons, exhaust-the-design-space, laziness-protocol,
  migrate-callers, most why/how/interrogate/reflect references).
- `principle-type-system-discipline`: Cursor deleted most patterns; dest
  kept. Flagged for G.
- `pstack/docs/guide/**` and `pstack/agents/poteto-agent.md`: excluded.
- `pstack/README.md`: unscoped. `pstack/.cursor-plugin/plugin.json` and
  `pstack/plugin.json`: out of scope / unscoped. `pstack/LICENSE`: unchanged.

Flagged, not shipped (recommendation: later Pi-authored leaves if G wants
them; do not copy Cursor slash-command rows as-is):

- `in-your-own-words`, `ketchup`, `sharpen`
- `poteto-mode/scripts/check-plan.test.ts` (bun tests; this pack already
  checks `check-plan.mjs` in `test/scripts.test.ts`)

No new agents or docs file is in the not-yet-carried state.

## Pin move: cursor/plugins `190d287` (pstack 0.15.29)

The cursor pin moved from `f713f14203cd6420cec13cd7c55c32d598dbab68` to
`190d28736eff128ec94f502a22c7fe0c4b56cd37` (current cursor/plugins `main`;
`pstack/plugin.json` reads `0.15.29`). The commits between those pins that
change in-scope pstack methodology are the formal-verification skills
(`4382e68`, `6b78e9f`, `7b353f7`), setup/help/guide sync (`f9be7aa`,
`d457567`), TypeScript brand type-guard (`0317eb8`), ketchup decidability
(`16541c6`, `bc14437`), sharpen restore (`75fabac`, `88d4751`), frontmatter
name fixes (`a968159`), Claude Code harness (`182f2ce`, `1b80080`), and
plugin version bumps through 0.15.29. The casualjim/pi-mimir pin stays
`f07dd981f62c9c994a5d043ede67d6c63c721454`.

Hand-ported, platform-neutral substance only:

- `skills/pstack/create-formal-verification-skill/SKILL.md`: new, adapted from
  Cursor. Pi `.pi/skills/` paths, `/skill:` forms, and install authorization.
- `skills/pstack/maintain-formal-verification-skill/SKILL.md`: new, adapted from
  Cursor. Same path and slash adaptations; PR push authorization on the
  report's change, matching maintain-verification-skill.
- `skills/pstack/typescript-best-practices/SKILL.md` and `references/patterns.md`:
  a brand comes from a verifying type guard, never from `as`.
- `skills/pstack/setup-pstack/SKILL.md`: mention once when the project has no
  formal verification skill; do not run create from setup.
- `skills/pstack/poteto-mode/SKILL.md`: inventory 53; availability routes for the
  two formal-verification skills.
- `skills/pstack/poteto-help/SKILL.md` and `references/recipes.md`: check-state,
  skill table and recipe for the two formal-verification skills.

Documented skips (Cursor-only tools, named-role agents, harness, or
excluded skills):

- `make-bot-ui/SKILL.md`: upstream only renamed frontmatter `Make Bot UI` to
  `make-bot-ui`; this pack already uses that name after the Pi re-author.
- `poteto-mode/SKILL.md`: upstream only renamed frontmatter `Poteto Mode` to
  `poteto-mode`; already that name here. Substance ports are listed above.
- `setup-pstack/SKILL.md`: Cursor auto-invokes `/create-*-verification-skill`
  from setup; this pack only mentions the gap and names the skill.
- `poteto-help/SKILL.md`: Claude Code install path, `pstack:` prefix, and
  guide/harness links; ketchup/sharpen/in-your-own-words table rows.
- `ketchup`, `sharpen`, `in-your-own-words`: still flagged, not shipped.
  Upstream ketchup and sharpen bodies changed; dispositions updated.
- `pstack/docs/guide/**`: excluded under Q1.
- `pstack/docs/harness/claude-code.md`: **new**, excluded (Claude Code
  adapter).
- `pstack/agents/poteto-agent.md`: excluded named role.
- `pstack/README.md`, `pstack/plugin.json`: unscoped.
- `pstack/.cursor-plugin/plugin.json`: out of scope (0.15.25 → 0.15.29).
- `pstack/LICENSE`: unchanged.

No file under `pstack/agents` or `pstack/docs` is in the not-yet-carried
state after classifying the harness page as excluded.

## Pin move: cursor/plugins `8b3326d` (pstack 0.15.30)

The cursor pin moved from `190d28736eff128ec94f502a22c7fe0c4b56cd37` to
`8b3326d99fd4b993cb33a24dad8af03175c642c5` (cursor/plugins `main` at sync;
`pstack/plugin.json` reads `0.15.30`). Twenty-seven commits sit between those
pins; the ones that change in-scope pstack methodology are the new
`statechart` skill (`eb4db2b`, `7698375`, `4ec7ffa`) and the poteto-help /
guide / README rows that advertise it. The casualjim/pi-mimir pin stays
`f07dd981f62c9c994a5d043ede67d6c63c721454`.

Hand-ported, platform-neutral substance: **none**. No shipped skill file
changed. Inventory stays at 53 skills and 23 playbooks.

Documented skips and classifications:

- `skills/pstack/poteto-help/SKILL.md`: upstream adds only a `/statechart` table
  row. Not copied; statechart is not shipped. Destination hash unchanged;
  Cursor primary source hash refreshed to the new pin blob.
- `skills/pstack/statechart/**` (12 files: `SKILL.md`, scripts, TLA+ model, tests,
  `.mmd` fixtures): **flagged, not shipped**. Executable Node scripts spawn
  Java/TLC via `TLA2TOOLS`/`JAVA`, write files under a work directory, and
  depend on external TLA+ tooling. Recommendation: **skip** until G
  authorizes a Pi-adapted leaf that closes the TLC dependency with explicit
  install authorization; do not copy Cursor slash rows or scripts as-is.
- `pstack/docs/guide/06-verify-and-ship.md`: excluded under Q1 (hash
  refreshed; new statechart section noted, not ported).
- `pstack/agents/poteto-agent.md`: excluded named role (unchanged).
- `pstack/README.md`, `pstack/plugin.json`: unscoped (0.15.29 → 0.15.30).
- `pstack/.cursor-plugin/plugin.json`: out of scope (0.15.29 → 0.15.30).
- `pstack/LICENSE`: unchanged.
- `in-your-own-words`, `ketchup`, `sharpen`,
  `poteto-mode/scripts/check-plan.test.ts`: still flagged, not shipped;
  bodies unchanged at this pin.

No file under `pstack/agents` or `pstack/docs` is in the not-yet-carried
state.

## Pin move: cursor/plugins `1ba91fc` (pstack 0.15.36)

The cursor pin moved from `8b3326d99fd4b993cb33a24dad8af03175c642c5` to
`1ba91fc25c0977741dd0e267849e6234b037ed0a` (cursor/plugins `main` at sync;
`pstack/plugin.json` reads `0.15.36`). The casualjim/pi-mimir pin stays
`f07dd981f62c9c994a5d043ede67d6c63c721454`.

Hand-ported substance:

- `skills/pstack/statechart/**`: **shipped** as an optional skill. Checking runs
  through the pack `tla-ts` dependency (no Java / `tla2tools.jar`).
  `SKILL.md` and `references/render.md` adapted for Pi
  (`/skill:statechart`, no silent installer, Mermaid-first, optional image
  render with install authorization). Runtime scripts started as copies from
  the pin; `scripts/run.ts` is adapted to spawn `tla-ts`. Upstream
  `scripts/test` corpora, `package.json` and `tsconfig.json` are not shipped
  (keeps the npm pack near the prior ~128-file baseline plus the new leaves).
- `in-your-own-words`, `ketchup`, `sharpen`: shipped as adapted Cursor leaves
  with `/skill:` invocation.
- Tip deltas ported into adapted leaves: arena, interrogate (refs deleted),
  poteto-mode hub/playbooks/`check-plan.mjs`, poteto-help (+ new skill rows),
  principle-explain-the-number, reflect, swarm, create-formal-verification-skill.
- Inventory is **57** skills and 23 playbooks.

Still unshipped (accounted in `w3-b.json` excluded + `FLAGGED_UNSHIPPED_CURSOR`):

- `ketchup-video` (new at this pin) — flag: depends on ketchup visuals and
  needs video render tooling outside the repo.

Shipped at this pin beyond the prior 53: optional `statechart` (runtime
scripts only; test corpora not packed), `in-your-own-words`, `ketchup` and
`sharpen`.
