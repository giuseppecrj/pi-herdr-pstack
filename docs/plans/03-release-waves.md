# Dependency-aware implementation and release waves

Status: execution sequencing plan. **Wave 1 is accepted and Wave 2 is explicitly authorized**, with two implementation workers maximum and one real Herdr integration suite at a time. See [the Wave 2 contract](./06-wave2-contract.md) for current scope, accepted inputs and the separately completed initial private GitHub pushes. No new pushes, PRs, merges, publication, normal Pi installation changes, paid live-model evaluations or W3/W4 implementation are authorized. The initial planning snapshot below is historical.

Inputs: [shared decisions](./README.md), [pi-herdr-agents extraction](./01-host-pack-extraction.md), [full pstack port](./02-pstack-pack.md), and the `agent-release-waves` procedure. Those plans remain the detailed acceptance specifications. This document assigns ownership, sequence and integration gates; it does not narrow the full skill inventory.

## 1. Current evidence

### Completed versus proposed

| State | Evidence |
| --- | --- |
| Completed upstream work | Maestro is merged on local/GitHub main at `c2177dff835da44937e614e8a03d0405d442e848` (PR #69). It is not part of the previously checked npm 2.0.5 release. |
| Completed planning | The two implementation plans, shared roadmap, this wave plan and upstream assessment exist; user annotations require pi-herdr naming, removal of `/iterate` and `/btw`, and the full skill inventory. |
| Current local workspace | pi-herdr-agents main is clean; Git reports one local worktree. pi-herdr-pstack contains planning documents and has no Git repository. `../pi-herdr-roles` does not exist. |
| Existing remote work | PRs #66, #67 and #68 are open. Their overlapping files require owner coordination before implementation. Open does not establish whether an author is currently working. |
| Other local branches | `docs/software-factory-autoresearch-spec` at `7e0f463` and `feat/factory-measurement-foundation` at `a93e092` contain separate research/plan documents beyond main. Do not absorb, reset or overwrite those branches. |
| Proposed only | Every wave below, all candidate repository revisions, all worker assignments, integration branches and release versions. |
| Blocked pending decisions | Implementation authority, repository initialization/commit authority, final pack name/location, concurrency limit, shared contract decisions and open-PR disposition. |

GitHub CLI authentication returned HTTP 401. The public REST API was then used read-only to enumerate all open PRs and issues (no additional pages; no open non-PR issues). This does not authorize refreshing credentials or changing remote work.

### Open PR coordination boundaries

| PR and exact head inspected | Existing ownership area | Wave overlap and required action |
| --- | --- | --- |
| [#66: submodule worktree source resolution](https://github.com/giuseppecrj/pi-herdr-agents/pull/66), `eb19bf9935dacf1fbad9cde5bd74d743193dc1bf` | Worktree cleanup/source lookup, README and worktree guide/tests | Do not reimplement its fix. Confirm whether it will land before our baseline or remain a separate follow-up; carry its regression coverage into the selected Maestro paths when integration is authorized. |
| [#67: live parent context for fallback launches](https://github.com/giuseppecrj/pi-herdr-agents/pull/67), `f6a3e00e63d4f2324d6d9cb646f5bf924f583517` | `pi-extension/subagents/index.ts`, lifecycle test/provider, README | Direct conflict with host extraction and test rewiring. Settle ownership and integration order before assigning these files. |
| [#68: close the opened primary workspace](https://github.com/giuseppecrj/pi-herdr-agents/pull/68), `34719712d40c5b6ef4f8f4d7bf2ac429680ea471` | Launch/surface/worktree code, shared tests, README, worktree docs and ADR-0011 | Paths include pre-Maestro locations; compare behavior at the selected integration base instead of blindly applying old paths. Do not rewrite this fix as part of removing roles. |

These are external changes, not tasks newly assigned by this plan. Their authors/maintainer must agree on disposition. No wave assumes that an open PR is approved, merged, obsolete or abandoned. Refresh this evidence immediately before implementation and at each integration boundary. If a listed PR head/status or host main changes after baseline selection, pause the affected work for the re-baselining rule in section 3; do not assume the authors froze their work.

## 2. Shared contracts and boundaries

Wave 0 must freeze:

1. Package identity: recommend `pi-herdr-roles` at `../pi-herdr-roles`, separate from both host and pstack, with no privileged discovery status.
2. Role ownership: `poteto` in pstack; six existing generic roles in pi-herdr-roles. Preserve generic role behavior in the extraction. The full pstack port also supplies `comment-sicko` for `no-comments`.
3. Resource ownership: `/plan` and top-level `orchestrate` in pi-herdr-roles; `/setup-pstack`, `/poteto-mode` and upstream pstack skills in pstack. Pstack's nested orchestrate playbook is not a top-level skill collision.
4. Explicit removals: `/iterate`, `/btw`, and exclusively used companion surfaces such as `/btw-close`; preserve general fork, resume, persistent-session and worktree capabilities.
5. Public seams: existing role-pack v1 discovery; no private imports or new registry. Document/test a minimal parent-versus-child discriminator or explicitly pin that assumption. Set mode inheritance semantics for Pi user forks/clones and direct pi-herdr-agents child forks.
6. Setup write contract: identify the real loaded tool/schema and read-only config path; approve the complete map plus metadata; ensure actual write arguments match approval. Missing consent/capability/malformed config is report-only. Changing the map invalidates prior approval.
7. Role dependencies: recommend pack-owned poteto/comment-sicko plus explicit bare leaf delegates so pstack does not depend on the optional generic pack. Decide any exceptions from the full inventory before implementation.
8. Full inventory and provenance: pin both upstream commits and map every skill/resource, preserving unprefixed names. Platform-specific functionality is adapted, never silently dropped or stubbed.
9. Test/runtime baseline: real Pi API version, candidate pi-herdr-agents revision, child resource visibility and isolated config paths. A local unchanged version string is not published compatibility evidence.

Schemas, model-writer arguments, persisted mode entries, shared skill references, manifests/lockfiles, role capability declarations, integration fixtures and generated inventory/schema artifacts are integration boundaries. One named owner changes each at a time; interface changes pause dependent work until reviewed.

## 3. Concurrency and integration revision rules

Approved limit: **two implementation workers at a time**, plus read-only review capacity. Run only **one real pi-herdr-agents integration suite at a time** per Herdr terminal-multiplexer instance. Do not parallelize shared npm/config changes or duplicate an active file owner.

Once implementation is authorized, each parallel writer gets a unique branch/worktree based on committed input. The two new repositories first need explicitly authorized initialization and baseline commits; worktrees cannot inherit the current uncommitted planning directory. A single sequential owner may use a dedicated checkout instead.

Manifest/lockfile ownership is explicit: W1-A owns pi-herdr-agents' files, and W1-B creates/owns both new packages' files sequentially. In W2, pstack manifest changes belong solely to W2-A, with W2-B submitting resource-path requirements rather than editing the manifest. During W3/W4 leaf batches, only the parent integration owner edits manifests/lockfiles. These assignments transfer at the wave gate; no two owners hold the same file concurrently.

Use a candidate integration branch in each affected repository, not the user's main checkout. Multi-repository gates use a revision vector:

```text
I<n> = {
  pi-herdr-agents: <exact SHA>,
  pi-herdr-roles: <exact SHA>,
  pi-herdr-pstack: <exact SHA>,
  Pi runtime: <exact version>,
  integration config/fixtures: <digest>
}
```

No `I0` through `I5` exists yet. The only existing runtime baseline is pi-herdr-agents `c2177df`; the other repositories have no baseline SHA. At each gate the parent records all three revisions, even if a repository is unchanged. Live-model evidence additionally records exact provider/model IDs and limits.

A changed coordinated PR head/status or host main after I0 suspends the affected wave's baseline approval. The parent coordinates with existing owners and records either a newly approved exact base or an explicit agreement to retain the pinned base with the external change deferred. No automatic rebase, merge or inclusion of a moving PR is allowed. If input revisions change, integrate onto the new approved base, record a new vector and rerun affected host/integration checks and review before dependent waves resume. Historical evidence remains valid only for its old vector, not as approval for the changed candidate.

A worker's green branch is not the integration result. Run checks against the assembled vector. Reuse valid evidence only for the identical inputs and relevant environment; a changed revision invalidates affected checks. Preserve failed-run output. The Bats commands mentioned in the general wave skill belong to another repository and are not added to this project.

## 4. Dependency graph

```text
W0: settle contracts, open-PR disposition and authorized repository baselines
 │
 ▼
W1: candidate pack-neutral ecosystem
 ├─ host extraction/removals              [owner A]
 └─ generic pack + pstack role foundation [owner B, sequential across new repos]
 │       integrate all three; no release
 ▼
W2: pstack command and methodology contracts
 ├─ first freeze skill paths/entry contract [owner B + parent; committed checkpoint]
 ├─ then setup/mode runtime                 [owner A]
 └─ and methodology hub/shared references  [owner B, parallel after freeze]
 │       integrate hub before enabling role skill activation
 ▼
W3: portable skill foundations
 ├─ principles and technical practices    [owner A]
 └─ communication and cleanup workflows  [owner B]
 │
 ▼
W4: complete advanced and platform-adapted workflows
 ├─ investigation/design/delegation       [owner A]
 └─ automation/memory/verification/UI     [owner B]
 │       serialize final hub/playbook/script reconciliation
 ▼
W5: full inventory, cross-package QA and release-readiness review
 │
 └─ Optional later release operation: separate explicit authorization
```

Every wave is an internal candidate milestone. None is a permission to publish a partial port or ship a breaking host without replacement packs.

## 5. Wave table

Owner names below are proposed responsibilities, not running agents or created assignments. They can be staffed by different fresh workers at each wave with complete handoffs.

| Wave / goal | Tasks and product impact | Depends on / owners | Integration revision | Acceptance checks | Main risks | Rollback | Review gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **W0 — settle inputs** | Resolve PR/base ordering; approve pack identity, full inventory, mode/setup contracts and worker budget; initialize repositories only after explicit authority. Prevent duplicate work and ambiguous behavior. | User + parent; read-only investigation as needed | `I0`: selected host SHA plus newly authorized baseline SHAs; none assigned now | Complete inventory/ownership table; real API probes; clean isolated setup; exact PR disposition recorded | Stale SDK types, old PR paths, unresolved platform equivalents | No runtime change; keep current planning files and original source refs | Human approves contracts, concurrency and implementation/commit scope before writers launch |
| **W1 — pack-neutral ecosystem candidate** | A: remove host roles/workflows and retired commands, maintain legacy config compatibility and safety. B: extract six roles + plan/orchestrate into pi-herdr-roles; scaffold pstack and receive unchanged poteto. Users can select packs instead of mandatory defaults. | W0; host owner A + pack-foundation owner B | `I1`: integrated host/roles/pstack SHAs | Empty host catalog and bare launches; all seven moved roles accounted for; pack provenance/overrides/collisions; plan/review flow; removed commands absent; lifecycle/worktree regression suite | Missing role during cutover; PR #67/#68 overlap; command/skill collision | Switch only isolated test config/checkouts back to recorded I0; retain candidate branches; stable installation was untouched | Fresh cross-family migration/runtime review + parent QA; human accepts ownership/removal milestone |
| **W2 — functional setup and mode subsystem** | A: commands, approved config writes, mode state. B: poteto-mode/setup skill entry points, shared delegation/verification conventions and routing. Establish correct parent/child behavior before bulk porting. | I1 accepted; B/parent freeze entry paths first, then runtime A and methodology B work independently | `I2`, host/roles pinned to I1 unless a reviewed contract fix is necessary | Exact approved writer payload; retained categories; cancellation/report-only paths; lifecycle/child isolation; real skill dispatch; exact tracked future-resource exceptions only (not full-inventory completion) | Consent bypass, state leakage, missing child resources, shared prompt drift | Return experimental vector to I1; restore only test-owned config snapshots; no deletion of user config/session data | Fresh cross-family review of config/state boundaries; parent signs subsystem gate; unresolved product semantics go back to user |
| **W3 — portable skill foundations** | A: 24 principles + core technical practices. B: writing/teaching/cleanup/help skills and comment-sicko. Establish consistent reusable guidance for advanced workflows. | I2 accepted; two disjoint skill owners | `I3` | Assigned inventory rows complete; resource/frontmatter/call-schema checks; comment-sicko role test; no install scripts or retired commands; shared contracts unchanged | Prose silently changes delegation policy; renamed or hidden skills; incomplete resources | Return experimental vector to I2; retain reviewed source/provenance reports | Fresh content-contract review and parent integration; intermediate progress is not full-port approval |
| **W4 — complete the full port** | A: investigation, design, panels and parallel execution. B: automation, session recall, decision trails, verification-skill authoring and UI equivalents. Then one owner integrates complex playbooks/helpers. Deliver every upstream skill, not a subset. | I3 accepted; two disjoint skill owners, then serialized methodology owner | `I4` | All target inventory rows covered; per-workflow dependencies resolved; scheduling/PR mutation remains authorization-aware; meaningful platform equivalents; no duplicate runner/ledger | Missing host capabilities, unresolved UI equivalent, inter-skill cycles, scripts bypassing ownership | Return experimental vector to I3; retain blockers and evidence; never reclassify missing skills as optional to pass | Fresh cross-family workflow review; any missing adaptation blocks the gate |
| **W5 — integrated release candidate** | Validate host alone, each pack and both packs; run full lifecycle/setup/skill matrices and approved bounded evals; finalize tarballs, migration, compatibility and rollback docs. Produce a reviewable release candidate, not a publication. | I4 accepted; parent integrator + sequential QA + fresh reviewers | `I5`, exact combined revisions/runtime/config/evidence | Full inventory parity; all standard checks; serial deterministic integration; real child visibility; provenance; package-content checks; bounded eval results or explicit unrun status | Individual green branches hide integration defects; unsupported peer claims; broken upgrade/rollback | Restore isolated installation vector to last verified candidate or stable snapshot; preserve failure logs | Fresh independent review, resolved material findings and explicit human acceptance of release readiness; shipping remains separately gated |

## 6. File ownership and implementer briefs

Every worker receives the raw user decisions and both implementation plans, not just a summary. No worker may expand scope, reset a shared checkout, coordinate further agents, merge, push, publish, install into normal Pi settings, or edit another owner's files. Commit policy must be explicit in each launch brief; the user has authorized local Wave 0–1 commits only.

### W1-A: pi-herdr-agents extraction

- **Own:** `pi-extension/subagents/index.ts`, role discovery/config composition in `maestro/core/roles/` and `maestro/core/config/`, retiring `agents/` and moved `skills/`, exclusive iterate/btw code, associated host tests and required synchronized docs. Resolve open PR overlaps before ownership begins.
- **Preserve:** unrelated worktree fixes, child delivery, lifecycle/resource ownership, generic forks, resume, persistent controls, model preferences and role-pack v1.
- **Coordination:** do not finalize role/workflow deletion until W1-B's destinations pass extraction checks in the combined candidate. W1-A alone edits the host manifest/lockfile; W1-B alone edits the two new packages' manifests/lockfiles. The parent owns cross-repository integration approval, not competing edits to these worker-owned files.
- **Acceptance:** H1–H5 in Task 1, including deprecated config handling and no commands or hidden role dependencies remaining.

### W1-B: pack foundations

- **Own sequentially:** new pi-herdr-roles package files (including its manifest/lockfile), role definitions, plan/orchestrate resources and moved tests; then pstack package skeleton (including its manifest/lockfile), notices, role-pack bridge, unchanged `agents/poteto.md` and bridge tests.
- **Limit:** pstack is an internal role-pack foundation at this wave, not a published pstack release. Do not add `skills: poteto-mode` until its real skill is available and tested in W2; do not fake it with an empty file.
- **Acceptance:** six generic roles and poteto preserve baseline behavior apart from approved path/ownership changes; pack lifecycle cleanup, provenance and launch work through public interfaces. No pstack dependency for the generic six.

### W2-A: pstack extension behavior

- **Own:** `pi-extension/pstack/{index,mode,setup}.ts`, pstack manifest/lockfile changes, runtime unit/integration fixtures, and the poteto role's explicit skill activation only after the real hub is integrated. Treat the existing `roles.ts` bridge as read-only unless a reviewed bug requires an ownership transfer.
- **Depend on:** W0 probes and a committed W2-B/parent path-and-entry-contract checkpoint before parallel runtime work starts. Use real test fixtures for subsystem tests while W2-B authors content. Adding `skills: poteto-mode` is a serialized integration step after the actual skill passes its load test, not a parallel assumption.
- **Acceptance:** Task 2 P2/P4; consent and persistence verified behaviorally, no private host imports or implicit installer.

### W2-B and later serialized hub ownership

- **First checkpoint:** W2-B and parent freeze the exact skill entry paths, command expansion expectations, delegation conventions and prerequisite shapes on a committed base. Only then do W2-A runtime work and W2-B content work run in parallel.
- **Own in W2:** `skills/poteto-mode/SKILL.md`, its common references and agreed base playbooks; `skills/setup-pstack/**`. W2-B does not edit extension code, role activation or manifests.
- **Later ownership transfer:** the methodology owner exclusively owns the hub routing table and complex `poteto-mode/playbooks/**` and `poteto-mode/scripts/**` reconciliation at serialized checkpoints after W3 and W4 leaf work. W3/W4 workers and the parent do not edit those paths concurrently; they submit proposed routing changes. The parent records the handoff, then integrates that owner's result.
- **Acceptance:** completed resources must resolve. W2 may contain only explicitly enumerated forward references to W3/W4 inventory rows; checks report those exact paths as planned incomplete dependencies, not a passing full-inventory result. Unlisted missing resources fail. Resolve every exception before I4/I5; no fake files, broad ignores or release with outstanding references.

### Skill partition: full coverage, not scope selection

Read-only source census: requested pi-mimir snapshot has **48 skills**, including **24 principle skills**. The original Cursor snapshot has **51**, containing the same 48 plus `setup-pstack`, `poteto-help`, and `make-bot-ui`. Recommended full-target lock is all 51, including the already approved setup experience and Pi adaptations for help/UI. Wave 0 records that exact inventory and any user clarification; it must not silently reduce the agreed full inventory.

| Batch | Owned `skills/<name>/**` directories | Owner and dependencies |
| --- | --- | --- |
| W2 hub | `poteto-mode`, `setup-pstack` | W2-B; common paths/contracts precede leaves; complex nested playbooks finish in serialized W4 reconciliation |
| W3 technical | All 24 `principle-*` directories, `tdd`, `typescript-best-practices`, `benchmark-checklist`, `blast-radius`, `correct` | W3-A; read W2 contracts, own per-batch test fixtures only |
| W3 communication | `unslop`, `technical-writing`, `no-comments`, `teach`, `bro`, `poteto-help`; `agents/comment-sicko.md` | W3-B; same read-only common contracts |
| W4 engineering | `how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `figure-it-out` | W4-A; depends on W3 foundations and real delegation schema |
| W4 capability adaptations | `automate-me`, `recall`, `show-me-your-work`, `create-verification-skill`, `maintain-verification-skill`, `make-bot-ui` | W4-B; each gets explicit Pi capability mappings and absence/error tests |

Workers own resources beneath their assigned directories, not a shared top-level script directory. Cross-batch dependencies are declared in W0; if a discovered dependency changes an interface, pause that task, integrate the prerequisite, and restart from its exact revision instead of coordinating through uncommitted files.

During parallel W3/W4 skill batches, the parent integration owner alone edits the canonical inventory, aggregated schema fixtures, shared test harness, package manifests/lockfiles, extension registration/index files and release notes. The skill hub routing/playbooks/scripts are a separate, exclusively methodology-owned surface updated only at the serialized checkpoints above. Workers submit proposed central changes in their reports; the parent does not also edit the methodology owner's files. This prevents disjoint prose work from becoming conflicting shared-state edits.

## 7. Reports, reviews and human gates

Every implementation report must include:

```text
Task / wave:
Source base SHA(s):
Result SHA(s), or explicitly uncommitted paths if commits were not authorized:
Owned files changed:
Behavior and inventory rows completed:
Commands run, exact result and evidence paths:
Failed/skipped checks and unresolved dependencies:
Compatibility/merge risks:
No-push/no-merge/no-release confirmation:
```

The parent inspects each diff against its stated base, not merely the report. Then assemble the candidate vector and run its acceptance checks. Reviewers examine that exact candidate, including migration docs and packaged artifacts, in fresh sessions.

For substantive implementation review, choose an authenticated exact reviewer model from a different provider and family than the author. For example, a Claude-authored component can be reviewed with an eligible exact OpenAI model, and an OpenAI-authored component with an eligible exact Claude model. Recheck the live catalog at launch; record author/reviewer identities. Mixed-author vectors may need partitioned reviews plus a fresh integration synthesis rather than claiming one reviewer is independent of every author. Missing eligible capacity leaves the gate incomplete. Avoid redundant stacks of QA skills; one relevant QA pass plus the required review is sufficient.

Human gates:

- **Before W0 execution/writers:** fulfilled by the user's approval of all seven questions; record exact baselines and contracts before W1 writers start. Later-wave authority is not implied.
- **After W1:** accept the coordinated ownership migration and deliberate removal of unused commands before dependent implementation proceeds.
- **After W5:** accept the complete release candidate and its remaining explicitly labeled risks. This is not permission to publish.
- **Before any shipping:** separately approve exact versions, PR/push/merge/publish scope, package order, normal-installation changes and rollback. No release automation is triggered merely to save progress.

At each gate produce a wave brief with outcome, scope, revision vector, check evidence, reviewer findings, remaining risks, rollback instructions and real links/paths. An unrun check or inaccessible resource is incomplete coverage, never a pass.

## 8. Stop and rollback rules

Stop affected/dependent work for a changed coordinated PR head/status or host main pending explicit baseline reapproval, an unresolved interface or PR ownership conflict, a failing safety/config/inventory gate, exhausted tool/model budget, absent review capacity, or missing human approval. Keep the last verified vector and failure evidence. Do not compensate by dropping a skill, restoring an unwanted default role, bypassing consent or auto-installing a missing dependency.

During experimentation rollback means selecting the previous committed candidate and restoring only isolated test-owned settings. It does not mean resetting user branches, deleting retained worktrees, erasing session history or editing the normal Pi installation. Retain all worker artifacts until the parent has reviewed and authorized cleanup.

For an eventual release, rehearse rollback of the entire compatible package/config vector, not just the host: reinstalling an older host beside replacement roles can create collisions. Release verification must check installed versions, catalog provenance, removed commands, setup/mode behavior and child resource visibility before calling the migration shipped.

## Planning verification

A fresh read-only review identified four coordination issues: changing PR/base inputs, manifest ownership, shared methodology ownership, and W2's internal dependency barrier. The parent updated this plan to address them and aligned setup-skill ownership in Task 2. The review also confirmed the 51-skill partition and that this plan grants no execution authority.

Local checks verified that plan links resolve and the listed skill groups cover the original source's 51 directories exactly once (2 + 29 + 6 + 8 + 6). No implementation tests, package installs, lifecycle runs or release checks have been performed for these proposed waves. pi-herdr-agents remains unchanged.
