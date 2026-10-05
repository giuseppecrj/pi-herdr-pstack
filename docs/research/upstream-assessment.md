# pi-herdr-pstack: upstream assessment

Status: historical research. Subsequent planning decisions below supersede the original assumptions about bundled roles and command naming. No runtime implementation is included.

## Sources

- Reference: <https://github.com/casualjim/pi-mimir/tree/f07dd981f62c9c994a5d043ede67d6c63c721454/packages/pi-pstack>.
- Local reference checkout: `/tmp/pi-herdr-pstack-reference`.
- pi-herdr-agents contracts: `../pi-herdr-agents/docs/adr/0003-installable-role-packs.md`, `docs/adr/0009-remove-workflow-subsystem.md`, and `examples/role-pack/extension.ts`.
- Installed Pi 1.0.3 documentation: `extensions.md`, `packages.md`, `skills.md`, and `sessions.md`.

Two read-only scouts examined the reference package and the sibling package. Findings below were checked against the primary files where noted. Upstream tests were not run; this document does not claim verified runtime failures.

## What the reference actually provides

This is already a pi-herdr-agents-oriented fork of pstack, not a competing child-process runner. It packages 48 skills, two agent definitions, a sticky `/poteto-mode` command, and a recognizable-shell-command confirmation guard. It registers no tools. Its role pack uses pi-herdr-agents' public role-discovery protocol on Pi's event bus.

The small extension understates the full maintenance surface: the skill resources also include orchestration-ledger and PR-watcher scripts. Porting the entire inventory would include auditing those scripts and their runtime dependencies, not just moving Markdown files.

## Findings that matter for a new port

### Delegation instructions have drifted from the host

`skills/poteto-mode/SKILL.md`, in its Subagents section, still describes `role`, `tasks`, and `chain` parameters and old process limits. These do not match the current pi-herdr-agents `subagent` interface. It also requires `set_tasks`, which is not universally supplied by Pi or pi-herdr-agents.

Treat agent-facing instructions as an integration surface. Examples must use current arguments and actual installed capabilities. pi-herdr-agents completion is delivered asynchronously; neither role discovery nor session-file polling is a substitute for completion delivery.

### Session state needs behavioral coverage

`extensions/pstack/index.ts` reconstructs mode from custom entries at `session_start`. The extension also changes mode through a command and an input handler. `tests/extension-contract.ts` tests config and action confirmation but does not execute those mode transitions.

A new implementation should test enable/disable, resume, reload, branch navigation, session changes, malformed persisted data, and non-TUI operation. Branch-sensitive state must come from the active branch, not the entire session file.

### The action guard has deliberately limited coverage

`extensions/pstack/index.ts` only checks the `bash` tool and matches command strings with regexes. Its git pattern does not cover `git -C dir push`; its deletion pattern does not cover uppercase `rm -R`. Other tools and child processes are not covered by that handler merely because they were launched by the parent.

Do not market this as a permission boundary. Prefer explicit workflow authorization rules and host permission integrations over introducing a second shell-policy engine. Whether to provide an additional narrowly described confirmation aid is a product decision.

### Package boundaries already exist

pi-herdr-agents ADR-0003 specifies synchronous role discovery through `pi-herdr-subagents:roles:discover:v1`, including shutdown unsubscription. Its example is sufficient to integrate a role pack without importing pi-herdr-agents internals or depending on a shared module instance.

pi-herdr-agents ADR-0009 deliberately removed a workflow execution subsystem. The new package should not recreate it under another name. pi-herdr-agents owns child execution, pane management through the Herdr terminal multiplexer, worktrees, model routing, and lifecycle. Pi owns skills, sessions, and package loading. Pstack can own engineering procedures and their small user-facing activation layer.

### Provenance must follow reused material

The reference package contains an MIT notice for Lauren Tan. Its repository root has an MIT notice for Ivan Porto Carrero. Preserve applicable notices for copied material and record source commits. Verify the original Cursor source attribution before importing its content. Do not replace upstream notices with only the new package author's notice.

## Proposed direction

Build a pi-herdr-native engineering workflow pack with the full upstream skill inventory, not a line-for-line compatibility fork.

- Keep the runtime adapter small and separable from workflow prose.
- Use public pi-herdr-agents tools and role-pack discovery only; avoid internal imports and duplicate execution infrastructure.
- Make instructions capability-aware rather than assuming optional task, memory, browser, or scheduling tools exist.
- Keep the always-on prompt small; load task-specific procedures on demand.
- Resolve every workflow's required roles explicitly. The planned host extraction removes bundled roles, so installing pi-herdr-agents alone will no longer provide scout, worker, planner, or reviewer.
- Validate embedded call examples and local resource links; supplement static checks with behavioral scenario evaluations.
- Include no hidden dependency installation or new durable scheduler in the first release.

## Subsequent scope decisions

The user chose the full upstream skill inventory, not the previously proposed curated release. Port every skill and account for required playbooks, scripts and resources. Batches may sequence the implementation, but are not permission to omit skills from the release. Platform-specific behavior needs an explicit Pi adaptation or a tracked blocker.

Other confirmed decisions: keep unprefixed skill names; retain `/setup-pstack` and `/poteto-mode`; declare `pi-herdr-agents` as a peer dependency while requiring explicit Pi installation; move the `poteto` role into this pack. Remove all bundled roles from the host into independently installed packs, including migration of workflows that depend on those roles. Remove `/iterate` and `/btw` from pi-herdr-agents outright rather than relocating them. Use pi-herdr naming for the ecosystem and the full package name for the host, reserving Herdr for the terminal multiplexer.

Recommended generic pack name/location: `pi-herdr-roles` at `../pi-herdr-roles`, pending confirmation. The current implementation plans are in `../plans/`.
