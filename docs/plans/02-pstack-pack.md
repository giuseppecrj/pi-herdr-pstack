# Task 2: Build pi-herdr-pstack

Status: proposed implementation plan, not implemented. See [the shared roadmap](./README.md) and [Task 1](./01-host-pack-extraction.md) for release coordination.

## Outcome

A separately installed Pi package contributes the `poteto` role through pi-herdr-agents' existing pack protocol, ports the full upstream skill inventory with unprefixed names, and provides `/setup-pstack` and `/poteto-mode`. It works with the new role-free host without requiring its former default agents. Full inventory is confirmed scope, not an optional expansion after a curated v0.1.

The stable npm host remains untouched during development. All experiments use explicit local candidates and an isolated `PI_CODING_AGENT_DIR`; no user settings or shared model preferences are changed by tests.

## Boundaries

- No child runner, scheduler, task ledger, model registry, shell permission engine, package installer, or imports from pi-herdr-agents' private implementation.
- No `scout`, `planner`, `worker`, or `reviewer` dependency hidden in prose. Each role call must resolve from an explicit prerequisite or this pack.
- Keep `poteto` as the moved role name; do not add `poteto-agent` as a duplicate compatibility alias without an identified need.
- No namespacing of skills: retain upstream names such as `poteto-mode`, `how`, `architect`, and `swarm` throughout the full inventory.
- Adapt platform-specific workflows to Pi rather than silently omitting their skills. External capability requirements must be explicit; unresolved equivalents are release blockers, not reasons to shrink the agreed inventory.
- Configuring shared pi-herdr-agents model preferences requires explicit consent. Activating mode does not grant permission to publish, deploy, remove worktrees, or perform other external actions.

## Proposed layout

```text
package.json
README.md
AGENTS.md
LICENSE
THIRD_PARTY_NOTICES.md
pi-extension/pstack/
  index.ts                 # registrations and lifecycle wiring
  roles.ts                 # role-pack v1 bridge with shutdown cleanup
  mode.ts                  # validated state and branch reconstruction
  setup.ts                 # capability report and configuration workflow
agents/
  poteto.md
  comment-sicko.md          # supports the included no-comments workflow
skills/
  setup-pstack/SKILL.md     # included onboarding skill backing the command
  poteto-mode/
    SKILL.md
    playbooks/
    references/
  <all upstream skill names>/
test/
  unit/
  contract/
  integration/
  fixtures/
  evals/
docs/
  architecture.md
  compatibility.md
  provenance.md
  plans/
```

Create modules only when the implementation needs them. Do not create empty skill directories or a generic workflow manifest/engine. Include `comment-sicko` with the `no-comments` workflow; account for any other role dependencies in the full inventory. Put documentation elsewhere: pi-herdr-agents interprets direct Markdown children of the registered role directory as role definitions.

## P0. Establish compatibility and scope

1. Build a complete upstream inventory with one row per skill and its required playbooks, references, scripts, roles and optional capabilities. Track source, adaptation, dependencies and verification status; there is no curated/deferred skill bucket. Implementation batches may start with a vertical slice, but the first-release gate covers the entire inventory. Record role, command and skill ownership across all three packages. Do not confuse the pstack `orchestrate` playbook nested under `poteto-mode` with the generic pack's top-level `orchestrate` skill; preserve the former without introducing a duplicate top-level skill.
2. Reconcile both pinned sources: the pi-mimir fork is the requested inspiration and its full 48-skill inventory is a required baseline; original Cursor pstack supplies source context, setup semantics and omitted/newer capabilities to account for explicitly. Record the exact full target inventory before porting rather than assuming both snapshots match. Do not silently drop a platform-specific skill or required behavior. If a top-level name truly conflicts with the generic pack, settle shared ownership or an explicit dependency without prefixes or removing the skill from scope.
3. Read the actual Pi API declarations matching the tested runtime. The sibling currently declares Pi ^1.0.0 while its existing node_modules were reported to contain older SDK packages. Reconcile this in isolated development dependencies, not the user's installation.
4. Verify with minimal real-host probes: role discovery, programmatic skill expansion, command dispatch semantics, structured prompt additions, lifecycle events, and child skill loading. Do not assume that `sendUserMessage('/some-command')` executes an extension command. Passing slash text without the appropriate host expansion path may only send literal text.
5. Resolve role dependency closure for every skill in the full inventory. Recommended design: `poteto` for implementation, `comment-sicko` for its specialized review, and deliberate bare leaf delegates with pack-owned reference prompts for bounded investigation/review responsibilities. Supply explicit tool allowlists, model, thinking, fork mode and spawning constraints. Do not silently fall back from a missing named role. If repeat usage makes a named helper worthwhile, add a distinct pack-owned role with a collision review.
6. Specify the parent/child discriminator before freezing mode state. The current launcher sets `PI_SUBAGENT_ID`, but it is not yet a documented pack contract. Either document and test that minimal host contract in Task 1 or explicitly pin the assumption in the compatibility matrix. Proposed semantics: Pi's user-created `/fork` and `/clone` preserve activation; pi-herdr-agents children, including direct `subagent({ fork: true, ... })` launches, do not silently restore a parent's sticky flag. They can receive explicit methodology instructions or activation. `/iterate` and `/btw` are being removed and must not appear as supported entry points. Verify retained launch paths and obtain agreement on the proposed inheritance semantics.

**Gate:** complete pinned inventory and role/resource dependency table; demonstrated Pi/pi-herdr-agents APIs; tested candidate versions recorded. No peer range is finalized based solely on a local package version string.

## P1. Package and moved role

1. Initialize the new repository only as part of implementation, add package metadata and bounded tooling following sibling conventions, and keep release automation manual/disabled until approved.
2. Declare the Pi host peer and a tested compatible `pi-herdr-agents` peer range. pi-herdr-agents remains an explicit Pi installation/enablement prerequisite; npm resolution does not activate extensions.
3. Use a published-files allowlist or verified ignore rules. Ship all referenced skill resources and notices; exclude local plans, credentials, sessions, temporary evidence and development artifacts.
4. Adapt `../pi-herdr-agents/agents/poteto.md` here, preserving applicable notices. Add `skills: poteto-mode` if the real child-loading test proves it works as intended. Keep this explicit dependency visible to users.
5. Register `agents/` synchronously on `pi-herdr-subagents:roles:discover:v1`, accept v1, and unsubscribe on shutdown. Do not copy files into user/global role directories.
6. Test a role-free pi-herdr-agents candidate with only pstack enabled. Listing must show `poteto` with `package:pi-herdr-pstack` provenance, without importing another pack's roles.

**Gate:** install/load/list/launch succeeds with host+pstack alone. Verify that the old host's own bundled-role collision diagnostic is visible when its bundled `poteto` is enabled; do not attribute that diagnostic to pstack. With `roles.bundled:false`, old-host role registration can succeed, but that alone does not establish full compatibility. The release peer range excludes untested/pre-extraction hosts. Tests identify whether the skill startup introduces an extra model turn.

## P2. Sticky methodology activation

Implement the following command contract:

| Input | Behavior |
| --- | --- |
| `/poteto-mode` | Enable for this session branch; do not invent a task |
| `/poteto-mode <task>` | Enable and load the full skill through a tested Pi path for that task |
| `/poteto-mode status` | Report active state and whether it can be persisted; do not start work |
| `/poteto-mode off` | Disable future injected guidance; do not cancel children or erase history |

- Persist a small versioned entry, validate it strictly, and derive branch-sensitive state from the active branch. Repeated on/off should not create unnecessary entries.
- Restore on the relevant session lifecycle events, including tree navigation, not just `session_start`. Test reload, resume, new sessions, user fork/clone, compaction and session switches.
- The mode's normal per-turn reminder is short, with the full skill location. Prefer Pi's structured prompt support where verified; do not repeatedly replace the entire system prompt or inject every skill body.
- pi-herdr-agents fork seeding copies non-header session entries. Do not mistake a parent's activation record in that history for intentional child activation. Choose an explicit ownership/child-context strategy in P0, and test it across standalone, forked, persistent and resumed children. An explicit `skills: poteto-mode` dependency may supply methodology without implicitly copying the parent's sticky flag.
- Define `/skill:poteto-mode` separately. Proposed: it loads the methodology for that invocation but does not silently enable sticky mode; document this distinction and obtain agreement before implementation.
- If the required skill is filtered out, report that instead of claiming mode is functioning. Handle no-session operation as memory-only and disclose it. Guard terminal-only UI by mode, not merely by the presence of some UI API.
- Define behavior for invocations during an active turn, cancellation and repeated commands using supported Pi delivery semantics. Do not enqueue duplicate tasks or mutate a replaced session context.

**Gate:** deterministic lifecycle tests plus at least one real Pi/pi-herdr-agents child run prove activation, explicit skill delivery, and no implicit sticky-state leakage. Tests distinguish removal of new guidance from impossible guarantees about forgetting earlier conversation text.

## P3. Port the full skill inventory

1. Preserve source attribution and record which files are original, copied, adapted or moved. A source/path/commit inventory is sufficient initially; add per-file hashes only where they support an actual update workflow.
2. Rewrite delegation against the live pi-herdr-agents schema: no old `role`, parallel `tasks`, or `chain` parameters; no fabricated `inherit-parent` model ref; no cloud-worker assumptions.
3. Use task-category routing for ordinary single-responsibility work. For panels and independence-sensitive review, select concrete eligible model identities and apply the chosen workflow's author-family policy. A task category alone is not proof of reviewer independence.
4. Give every child a bounded brief: outcome, allowed files/tools, artifacts, validation, commit policy, runtime choice and session/worktree mode. Children are leaves unless the workflow explicitly authorizes delegation.
5. Use automatic result delivery, not sleeps or session polling. Parent owns synthesis, failure reporting, integration and explicit cleanup. Read/bash allowlists are not shell sandboxes.
6. Use valid relative links and explicit optional prerequisites. Do not require absent `set_tasks`, `recall`, Cursor tools, browser tools or an uninstalled external skill. A visible checklist or plan artifact is enough when task tools are unavailable.
7. Account for every script required by the full inventory. Keep portable helpers, adapt incompatible helpers, or replace their behavior with supported Pi/pi-herdr-agents capabilities. Exclude first-run dependency bootstrapping, duplicate schedulers, direct managed-worktree pruning, and helper scripts that can violate host ownership, but retain their parent workflows through real replacements. Long-running, shipping, memory, browser/UI and verification-skill workflows remain in scope. Where a workflow needs an optional external tool, document and check that prerequisite instead of inventing a tool or shipping a placeholder.
8. Verify skill discoverability and the balance of explicit invocation versus model discovery. Statically assert disjoint shipped top-level skill/command names between pstack and the generic pack according to the complete ownership table; nested playbook names are not Pi skill collisions. For user-installed unprefixed skill collisions, Pi keeps the first discovered skill and warns; do not rely on that incidental ordering. Report the collision and explain disabling/filtering the unwanted resource. Do not silently rename skills or claim the intended skill was loaded.

**Gate:** every skill in the pinned full target inventory is present and adapted, with closed resource and role dependencies, schema-valid call examples, and a verification scenario or explicit external-capability test. Inventory parity is a release requirement; no unfinished imported skill, placeholder or unapproved omission passes this gate.

## P4. `/setup-pstack`

Setup is repeatable onboarding, not mandatory installation or activation.

1. Check loaded pi-herdr-agents capabilities and pstack resources. Report unavailable/filtered tools, role collisions, missing child-visible installation, and unavailable authenticated models. Do not infer active integration from node_modules alone.
2. Read the documented config file read-only: `$PI_CODING_AGENT_DIR/herdr-agents/config.json`, falling back to `~/.pi/agent/herdr-agents/config.json` under the supported Pi path rules. Do not import pi-herdr-agents' private loader. Distinguish a missing file from malformed or unreadable data; the latter cases are report-only. Combine this with authenticated model information to show task categories and any effective per-agent override for `poteto`.
3. Default to keeping all existing preferences. Explain that task-category edits affect other pi-herdr-agents users/workflows, not just this pack.
4. Build a complete proposed writer payload (`tasks` and `tasksMeta`) and present the before/after map before approval. The host writer and `/subagents-init` do not supply our consent gate. P0 must prove a supported path that gates the actual writer arguments immediately before execution; prefer deterministic submission where the API supports it. Do not treat prose telling a model to preserve an earlier approval as enforcement. Changed arguments require renewed approval, and a changed current map requires a fresh proposal. If a setup handoff cannot preserve this contract, keep it report-only rather than invoking it automatically.
5. Before `subagents_write_task_models`, include all retained categories because omitted categories are removed. Never treat the API as a partial patch. The tool requires metadata and a nonempty category map, may be filtered out, and is registered only in parent sessions. Preserve unrelated settings; never overwrite malformed existing config to recover.
6. With the writer absent, no authenticated choices, no consent, or insufficient UI support, provide a report and next steps without writes. Do not pop unattended child dialogs or launch recursive setup in children.
7. Check the normalized saved results against the approved payload, report any discrepancy, and state the reload requirement only after a confirmed successful write. No private pstack model map or durable reasoning-budget ladder is introduced.

**Gate:** report-only, cancellation, repeated setup, absent writer, missing auth, malformed config, category preservation and successful approved updates are tested against isolated files. Assert that the arguments actually written match the approved payload, with all retained categories, and that changed proposals cannot reuse approval. Setup never installs packages or changes unrelated configuration.

## P5. Verification and packaging

### Static and unit checks

- Compare packaged skills against the complete pinned inventory; fail on any missing skill, unapproved substitution or unresolved required resource. Check every inventory row has an adaptation and verification outcome.
- Parse skills/roles with the real formats; verify required fields, names, relative resources and provenance notices.
- Validate structured runnable call examples against the tested host tool schema or a pinned schema fixture whose parity is checked in integration. Do not ban ordinary English words such as `tasks` or `chain` throughout documentation.
- Check every workflow's declared role and optional-tool prerequisites; detect obsolete runner syntax and references to removed `/iterate` or `/btw` commands.
- Test mode reduction, parsing, malformed entries, command classification, setup reporting and complete configuration proposals.

### Real-host deterministic checks

Use isolated Pi configuration and candidate packages, with a deterministic provider and a real event bus. Include:

| Combination | Expected result |
| --- | --- |
| Role-free host + pstack | Roles and workflows operate without the starter pack |
| Pstack without loaded pi-herdr-agents | Clear prerequisite diagnostic; no installation or fake delegation |
| Old stable host with bundled poteto enabled | Host-owned collision diagnostic remains visible; pack role does not override it |
| Old host with `roles.bundled:false` | Pack role can register; remaining SDK/resource compatibility is checked separately, not inferred |
| Pstack + generic pack | No duplicate roles, commands or shipped skill names |
| Another pack also contributes poteto/comment-sicko | Existing host collision behavior remains visible |
| Pstack skill conflicts or resource filters | Clear diagnostic and documented remediation |
| Standalone/fork/persistent/worktree child | Correct pack visibility and explicit methodology delivery |
| Parent-only explicit extension load | Missing child resources detected, not assumed inherited |
| TUI/RPC/JSON/print/no-session | Supported operations work; unsupported interactive writes remain report-only |
| Reload/tree/resume/fork/clone/compaction | State follows the documented ownership rules |
| Direct forked subagent launch | Explicitly test child detection and the approved no-implicit-sticky-state rule |
| Full packaged inventory | All upstream skill rows covered, including long-running and platform-adapted workflows |

Use a supported test-harness provider; keep loopback/proxy isolation explicit if using HTTP. Run one real pi-herdr-agents integration suite at a time in the Herdr terminal multiplexer. Do not record skipped tests as passes.

### Bounded live evaluations

Opt-in initially, with explicit model, cost/tool-call/time limits and fixture repositories. Maintain verification coverage for every skill; group live evaluations by workflow family and share fixtures where appropriate rather than requiring a costly live run per principle skill. Score actual calls and effects:

- investigation leaves the fixture unchanged;
- a seeded bug is reproduced before editing, fixed, and reverified;
- delegation uses schema-valid parameters and automatic delivery;
- parallel writers use separate committed worktree bases and parent-owned integration;
- a missing required capability is reported, not invented;
- turning mode off removes future injected guidance;
- unsupported external actions are not authorized merely by activating mode.

Archive failures and incomplete coverage; do not mistake a scripted-provider test for evidence that a live model follows the prose.

**Gate:** static, unit and deterministic integration checks pass; bounded evaluation outcomes are reported with limitations; `npm pack --dry-run` includes all required resources and no development/session data.

## P6. Documentation and release readiness

Document installation scope, explicit host installation, role ownership, model-config effects, command semantics, child visibility, conflicts with other pstack packages, and the supported version matrix. Record the tested host revision independently of its package version during unreleased development.

Coordinate publication with Task 1. The published npm 2.0.5 does not include Maestro. Do not publish pstack claiming compatibility with an unreleased host using that same version string. The eventual peer minimum must name an actually released compatible host.

No version bump, trusted-publisher configuration, tag, push, npm publication or user-installation mutation is authorized by this planning document.

## Completion criteria

A user can explicitly install a compatible pi-herdr-agents host and this pack, access the complete ported upstream skill inventory, verify its role provenance, run setup without losing preferences, enable/disable poteto methodology across documented session transitions, and run supported workflows without the old bundled roles or upstream runner APIs. All skills ship; documented external capabilities may remain optional, but missing adaptations are not disguised as optional dependencies.

The host remains independent of this pack and the generic pack remains an optional choice, unless a separately approved inventory item explicitly declares a pack prerequisite.
