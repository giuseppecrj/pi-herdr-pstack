# Wave 3 execution contract

Status: **draft for the human W3 gate; planning only.** The user accepted Wave 2 and authorized Wave 3 *planning*. Nothing in this document authorizes implementation, worktrees, commits, pushes or Herdr runs until the user approves it and answers the decisions in [notes](./12-wave3-notes.md). It follows the style of `docs/plans/06-wave2-contract.md` and `07-wave2-entry-contract.md` and inherits AGENTS.md, plans 09 (no `poteto` role) and 10 (unconditional writer gate) unchanged.

## Accepted inputs (proposed I2 vector)

| Component | Revision |
| pstack `main` | `e3e8bbe` (product tree identical to merged W2 `0eedac1`; `e3e8bbe` adds one status doc) |
| host `pi-herdr-agents` `main` | `7d35371` (pack-neutral, conditional writer, operating skill, `subagent_cancel`) |
| roles `pi-herdr-roles` `main` | `3b75aa4` |
| Pi CLI / pack SDK | 1.0.3 |
| Mimir source | `casualjim/pi-mimir` `f07dd981…`, `packages/pi-pstack/{skills,agents}` |
| Cursor source | `cursor/plugins` `2cbf5850…`, `pstack/{skills,agents}` |

`SubagentParams` and `TASK_CATEGORIES` are identical at host `e262c584` (the pin in `test/skill-content.test.ts`) and `7d35371`; checked during planning. W3 repins the test to `7d35371`. W2 evidence (111/111 pstack check, 72/72 combined Herdr at `b10a40c`) stands only for its own vector.

## Exact scope

35 inventory rows (W3-A 29, W3-B 6) and one pstack role. Every listed source file exists at the pinned commits, and `git ls-files` shows no additional file under these directories. **No W3 source file is a script, lockfile or executable.** Only `poteto-help` lacks a Mimir copy.

### W3-A: 29 rows, 30 files, primary source Mimir

| Row | Source files | Mimir vs Cursor | Non-portable content to adapt |
| 24 `principle-*` | `<name>/SKILL.md` each | byte-identical | 17 need no edit. 7 need only reference edits: relative links in `attack-the-premise`, `build-the-lever`, `explain-the-number`, `minimize-reader-load`; short names (`**prove-it-works**`, `**boundary-discipline**`…) in `sequence-verifiable-units`, `type-system-discipline`; `show-me-your-work` (W4-B) in `prove-it-works` |
| `tdd` | `tdd/SKILL.md` | identical | none |
| `correct` | `correct/SKILL.md` | identical | none |
| `benchmark-checklist` | `benchmark-checklist/SKILL.md` | identical | relative link; playbooks named by title (`Opening a PR`, `Perf issue` shipped; `Hillclimb` W4) |
| `blast-radius` | `blast-radius/SKILL.md` | identical | `how`, `why`, `arena` (W4-A); "ask several models" |
| `typescript-best-practices` | `SKILL.md`, `references/patterns.md` | SKILL differs in the boundary-validation row; patterns identical | Cursor-only `paths:` frontmatter (Pi ignores it); short principle names in both files |

### W3-B: 6 rows, 8 files, plus the role

| Row | Source files | Primary | Non-portable content to adapt |
| `unslop` | `unslop/SKILL.md` | Mimir (identical) | none |
| `bro` | `bro/SKILL.md` | Mimir (identical) | none. It is 7 lines by design |
| `technical-writing` | `technical-writing/SKILL.md` | Mimir (has a review checklist that Cursor lacks; `/skill:` syntax) | none |
| `teach` | `teach/SKILL.md` | Mimir (identical) | `how`/`why` (W4-A) are its main mechanism; "image-generation tool" is not a Pi tool |
| `no-comments` | `no-comments/SKILL.md` | Mimir (already uses `subagent` + `agent: "comment-sicko"`; Cursor uses `Task`/`subagent_type`) | `how`, `why`, `architect` (W4-A); named-role call |
| `poteto-help` | `SKILL.md`, `references/prompting.md`, `references/recipes.md` | **Cursor only** | Cursor-specific throughout. See below |
| role `comment-sicko` | `agents/comment-sicko.md` | Mimir (has Pi frontmatter; Cursor's has only name/description) | `/skill:how`, `/skill:why` (W4-A); description says "read-only" but the body deletes comments |

Target file count: 39 (30 + 8 + 1). The final checked numbers are 37 loaded skills (2 + 35) and one role file.

## What "adapted" means

Statuses in provenance are **copied**: the destination bytes equal the primary source bytes. **adapted**: one primary source, with every change explained. A file that needs no edit must be copied, not rewritten.

### Group A: the 24 principles, `tdd`, `correct`, `benchmark-checklist`, `blast-radius`, `typescript-best-practices`

Port with minimal edits. Only these edit classes are allowed. A reviewer rejects any other change to the methodology text.

1. Relative Markdown links (`[X](../principle-y/SKILL.md)`) become backticked skill-relative paths (`` `../principle-y/SKILL.md` ``), as the W2 reference checker requires. A playbook named by title gets its backticked path `../poteto-mode/playbooks/<name>.md`.
2. A short principle name (`**boundary-discipline**`) becomes its full inventory name (`**principle-boundary-discipline**`).
3. A reference to a W4 skill or playbook is marked `(planned W4)` on the same line, followed by an honest interim rule. Upstream wording is kept for the future. Examples: in `blast-radius`, "until `arena` ships, run one independent bare Reviewer per `../poteto-mode/references/delegation.md` with an exact eligible model". For `how`/`why`, "until they ship, read the code and its history yourself and say the skill was unavailable". Never claim that an absent leaf was run.
4. Obsolete runner APIs, Cursor tools, model names and the `poteto` role are removed. W3-A sources contain none of them today, so this class should not occur. Remove `paths:` from `typescript-best-practices` per decision D6.
5. Invocation syntax stays Pi's `/skill:<name>`.

Expected outcome: 17 principles plus `tdd`, `correct`, `unslop`, `bro` and `technical-writing` are **copied**. Everything else is **adapted**.

### Group B: delegation and tooling adaptation

- **`no-comments`.** This is the first pstack workflow that calls a named role. It must close the role dependency through pstack's own `comment-sicko`. The call example is schema-valid against host `7d35371`: `name`, `task` (scope: files or diff), `agent: "comment-sicko"`, explicit `model` (a `task:review` or `<provider>/<model-id>` metavariable), `thinking`, `fork: false` (fresh perspective), with no worktree unless D1 makes the role a worktree writer. If the role is missing, filtered or shadowed in a way that defeats the call, the skill stops and reports. It never substitutes a bare agent, as hub line 112 requires. `how`, `why` and `architect` are marked planned W4 with interim rules: ambiguous keeps follow the skill's own "if ambiguous, delete" rule, and the architect step becomes "sketch two or three shapes yourself; record `architect skipped: planned W4`", mirroring W2's refactoring playbook. Interactive-approval wording in step 5 stays as written. It grants no authority beyond `references/authorization.md`.
- **`teach`.** Keep the method. Until W4, the agent orients and traces itself and says that `how`/`why` were unavailable. It keeps `why`'s confidence language rule for later. Images become conditional: use an image tool only if the session exposes one; otherwise use mermaid or ASCII and say so. No invented tool names.
- **`poteto-help`.** This is a Pi re-authoring that uses the Cursor file as structure, not a port. Remove: `/add-plugin`, Custom Modes and Option+Enter, `~/.cursor/rules/pstack-models.mdc`, reasoning-budget ladder, `auto`/`inherit-parent` model refs, `poteto-agent`/`subagent_type`, cloud agents, `/loop`, `cursor-team-kit`/`/deslop`/`control-*`, Cursor Plan Mode, Cursor docs links, and `../../docs/guide/*.md` links (not in the inventory or the package). Replace them with facts this package actually ships: the explicit pi-herdr-agents + pstack install prerequisite; the `/setup-pstack` report-first flow and its single approved write; `/poteto-mode` enable/task/status/off with sticky versus non-sticky `/skill:poteto-mode`; `/skill:<name>` invocation; no named roles except `comment-sicko`; the writer gate (`/subagents-init` refused while pstack is loaded). The routing table keeps every inventory row. W4 rows are marked planned W4 and are not offered as working. Recipes are converted to `/skill:` and Pi phrasing. Recipes that rely on `/loop` or cloud agents are dropped or marked unavailable, per D5. The public link target is D5.
- **`unslop`, `bro`, `technical-writing`.** Copy.

### `comment-sicko`: a pstack role through the public discovery protocol

- File `agents/comment-sicko.md` is the only direct `.md` child of `agents/`. Place no docs there; the host reads every direct child as a role.
- Registration restores the W1-tested bridge shape (`78f6529:pi-extension/pstack/roles.ts`): a synchronous `pi.events.on("pi-herdr-subagents:roles:discover:v1")`, `apiVersion === 1` gate, `register(<package>/agents)`, and unsubscribe on `session_shutdown`. No private host imports, no copying into user role directories. `package.json` `files` gains `agents/`. This restores a planned capability. It is not a new runtime feature.
- Frontmatter: `name: comment-sicko`, a truthful `description`, `tools` per D1, `spawning: false`, `auto-exit: true`, `system-prompt: append`. **No `skills:` key and no `model:` key.**
- **Startup method: the role body is the methodology.** Deliver the task as the single initial prompt. Rationale: at host `7d35371`, `buildPromptArgs` still sends each `skills:` entry as a separate `/skill:` prompt before the task. In W2 this made an auto-exit child complete on the startup turn without executing the task (`docs/research/wave2-interim-validation.md`, `/tmp/pstack-w2-role-startup/startup.log`). Also, `no-comments` is the *parent-side* driver that spawns this role. Preloading it into the child would tell the child to spawn itself. "`no-comments` is its skill" therefore means "the skill that owns and calls this role", not a preload. If a later wave needs skill content inside the child, use the turn-free structured-section bootstrap proven in W2, behind its own gate. Not in W3.
- The `/skill:how` and `/skill:why` lines get planned W4 markers and the interim rule from Group A. The role file is included in the reference checker and the provenance fixtures.
- False present-tense claims change in the same integrated candidate: hub lines 9 and 112, `references/delegation.md:15`, `setup-pstack/SKILL.md:28`, the README, `docs/compatibility.md`, `docs/provenance.md`, and the `Roles: none` line in `pi-extension/pstack/setup.ts`. The setup report states that pstack contributes `comment-sicko` through role-pack v1 and points to `/subagent list` for effective resolution. It does not add a catalog probe (D8).

## Retiring planned-W3 markers and forward references

Current fixture: 96 tuples, of which 54 point at W3 (47 W3-A, 7 W3-B) and 42 at W4 (21 W4-A, 16 W4 playbooks, 5 W4-B). W3 shipped files contain 54 `planned W3` markers and 32 `Until … ship(s)` fallback clauses. Some of those clauses cover W4 targets.

1. **Inventory status drives the checks.** The `status` values are `planned` and `shipped`. W2 rows are still `planned` in `docs/skill-inventory.json`, which is stale; the checkpoint C0 flips them. A W3 directory may exist while its row is `planned` only on a W3 branch, and its files must already pass every per-file check. The status flip to `shipped` happens in the reconciliation commit and nowhere else.
2. **Retire on ship.** In the commit that flips a row to `shipped`, remove every tuple that targets it. Remove `planned W3` from each line that references it, and delete or rewrite the interim clause for that target. The 24-summary hub preamble (line 54) becomes "read the leaf in full before you cite it". Hub line 21 lists what the release ships.
3. **New exact tuples.** Adapted W3 files that reference W4 targets get exact `{sourcePath, targetPath, owningWave}` tuples. The upstream text predicts at most 39: blast-radius 3, no-comments 3, teach 2, comment-sicko 2, principle-prove-it-works 1, benchmark-checklist 1, poteto-help up to 27. The test recomputes the exact set after adaptation. The handoff publishes the full remaining W4 list (42 + new) by tuple, not as an estimate.
4. **Cross-batch references** (`blast-radius` → `unslop`; `no-comments` → two principles; `poteto-help` → five W3-A skills) are tuples on batch branches only. They retire at integration. None may survive into the reconciled candidate.
5. **Fixture layout.** Split by owner so parallel writers never share a file: `test/fixtures/forward-references/{hub,w3-a,w3-b}.json` and `test/fixtures/skill-provenance/{w2,w3-a,w3-b}.json`. The test unions them, and each file's `sourcePath`s must lie inside its owner's directories. W2 content moves verbatim (D9).

### Content tests must enforce (C0 generalizes `test/skill-content.test.ts`; later steps change fixtures, not assertions)

- The shipped tree (`skills/**`, `agents/**`) equals the union of provenance-file entries. Every file belongs to an inventory row or the role. No empty directories and no stray files.
- The real Pi 1.0.3 loader returns exactly the shipped rows' names with zero diagnostics. Only `setup-pstack` is model-invocable unless D6 changes `typescript-best-practices`. No `paths` key.
- **Hash provenance for every file**: source path, source hash, destination hash, status. A copied file's hashes are equal. An adapted file has exactly one primary source and a substantive explanation. Every inventory source file of each shipped row is accounted for once. Source hashes are reproduced from the pinned commits. Parent QA sets `PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE` and `PI_HERDR_AGENTS_SOURCE` so that no hash or schema check is skipped.
- **Notices**: the existing Lauren Tan, Ivan Porto Carrero and HazAT MIT checks still pass. `docs/provenance.md` documents the W3 adaptation, the role, and both source commits.
- **No placeholders**: TODO/TBD/FIXME, lorem, "coming soon" or empty bodies are banned. Replace the W2 `>1000 chars` rule with "copied, or at least half the primary source's length unless explained", so that `bro` passes honestly.
- **References**: exact tuples in both directions, a planned marker on the same line, absent targets, and `owningWave` matching the inventory. Relative Markdown links are rejected. Short principle names are banned in all shipped files.
- **Banned patterns** extend to every shipped file: `subagent_type`, `poteto-agent`, `inherit-parent`, `set_tasks`, Cursor `Task` spawning, Custom Mode, `~/.cursor`, `.mdc`, `/add-plugin`, cloud agents, `cursor-team-kit`, `/deslop`, `/loop`, concrete model IDs, `/iterate`, `/btw`, and bare Cursor-style `/how` or `/why` slash commands. `comment-sicko` is allowed only in `no-comments`, the role file, the hub, delegation and setup lines that describe it, and in docs.
- **Delegation**: existing bare-example rules remain. Exactly one named-role example family is allowed (`agent: "comment-sicko"` in `no-comments`), schema-valid at `7d35371`.
- **Hub**: 24 summaries, each naming its shipped leaf without a planned marker. W4 playbook routes are still `(planned W4)`.
- **Package**: `test/content.test.ts` expects `agents/comment-sicko.md`, the bridge module, the `files` entry and the new packed-file count. `npm pack --dry-run` lists all 39 new files and no plans or evidence.

## Ownership, parallelism and review

| Step | Writer | Owns exclusively | Base / output |
| C0 checkpoint | parent (single writer) | this contract and the AGENTS.md scope line; test harness generalization; fixture split; inventory W2 status flip; host repin | `wave3/integration` from `e3e8bbe`; must stay 111/111 with W2 content unchanged |
| W3-A | worker 1, worktree `wave3/technical` from C0 | `skills/{24 principle-*,tdd,typescript-best-practices,benchmark-checklist,blast-radius,correct}/**`, `test/fixtures/{forward-references,skill-provenance}/w3-a.json` | commits on its branch |
| W3-B | worker 2, worktree `wave3/communication` from C0 | `skills/{unslop,technical-writing,no-comments,teach,bro,poteto-help}/**`, `agents/comment-sicko.md`, the `w3-b.json` fixtures | commits on its branch |
| Integrate | parent | merges only; per-batch review | `wave3/integration` |
| Reconcile | one writer after W3-A ends (methodology-owner handoff recorded by parent) | hub, playbooks, `references/*`, `setup-pstack/SKILL.md`, `hub.json`, `w2.json`, cross-batch tuple retirement in batch fixtures, inventory W3 status flip | single commit series |
| Role wiring | second writer, may overlap Reconcile (disjoint files) | `pi-extension/pstack/{roles,index,setup}.ts`, `package.json` `files`, `test/content.test.ts`, role unit tests, `test/fixtures/provenance.json` if touched, README, `docs/compatibility.md`, `docs/provenance.md`, `THIRD_PARTY_NOTICES.md` | commits on `wave3/integration` after Reconcile's checkpoint, or a sibling worktree merged by parent |

At most two implementation writers exist at any time. Workers do not edit hub, extension, manifest/lockfile, inventory, shared tests, docs or notices; they propose central text in their reports. Workers run only isolated unit/content checks (`npm run check` with the source env vars set). No worker runs Herdr, a paid model, or spawns agents. No worker pushes, merges or releases. Reports use the 03 §7 template with exact base/result SHAs.

**Review protocol.** Each of W3-A, W3-B, Reconcile and Role wiring gets one fresh read-only review on its exact SHA. The reviewer is an authenticated exact model from a different provider and family than the author (recheck the live catalog at launch; record identities). The reviewer receives the pinned sources, this contract and the edit-class rules. It checks every adapted file against its primary source and spot-checks copied hashes. A final integration synthesis review covers the assembled vector. Missing eligible reviewer capacity leaves the gate incomplete.

**Parent combined QA** runs only on the reconciled and role-wired candidate, one suite at a time on one Herdr instance:

1. Pstack `npm run check` with all source env vars (no skips), `npm pack --dry-run`, `git diff --check`, and active LSP diagnostics on changed TS. Not Herdr.
2. **Comment-sicko real-child gate** (deterministic provider, isolated outer/child `PI_CODING_AGENT_DIR`, test-owned HOME/XDG). Pass conditions:
   - fresh (`fork: false`) and forked launches list the role as `package:pi-herdr-pstack`;
   - the single initial provider request contains the role body and the task;
   - a task marker executes before completion, then auto-exit occurs and the result is delivered;
   - a project/global `comment-sicko` override follows host precedence visibly;
   - with pstack's role filtered out, `no-comments` stops, and no bare substitute is launched.
3. **Combined host integration** `pi-herdr-agents@7d35371 npm run test:integration` with roles + pstack loaded (W2 overlay method), because the extension load path changes. Expect no regressions against the 77/77 baseline at that host.

Keep every failure log. Distinguish skipped from passed.

## Exit gate

The W3 handoff records the exact I3 vector (host, roles, pstack SHAs; Pi version; fixture digests), the 35 rows `shipped` with closed resources, the role gate result, the recomputed W4 exception tuples, all check outputs, review identities and findings, open risks and rollback to I2. Stop for the human W3 gate before any W4 work.

## Non-goals

- W4 rows, W4 playbooks or helper scripts; `how`/`why`/`architect`/`arena` stand-ins beyond the interim rules above.
- Live-model or paid evaluations. A scripted provider is not evidence that a model obeys the prose.
- New runtime features: no catalog probing, no skill-preload bootstrap, no changes to mode or setup semantics or the writer gate, no host changes. Role-pack registration is the only extension change.
- Pushes, PRs, merges, publication, version bumps, normal Pi install/config changes, global skill copies. Each needs the user.
- Renaming or prefixing skills; adding roles other than `comment-sicko`; depending on pi-herdr-roles.
