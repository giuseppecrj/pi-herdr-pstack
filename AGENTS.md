# pi-herdr-pstack contributor instructions

This package supplies the full unprefixed pstack skill inventory and a small Pi extension using pi-herdr-agents' public APIs. It must not own another child runner, scheduler, model store, package installer or general shell-permission engine.

## Current scope

All 51 skills and 23 playbooks ship, and pi-herdr-agents, pi-herdr-roles and pi-herdr-pstack are published on npm via trusted publishing. Releases follow `RELEASING.md`; version bumps on `main` publish. Historical wave plans were deleted; they remain readable at commit `96910f507046285071453b660099b0c3549e6161` under `docs/plans/`.

Use `pi-herdr-agents` for the execution host; Herdr is the terminal multiplexer. Do not prefix skill names. `poteto-mode` and `/setup-pstack` are retained; pstack contributes no named roles and delegates use deliberate bare prompts. The other roles belong to the optional `pi-herdr-roles` package. `/iterate` and `/btw` are not part of this pack. The host writer gate is unconditional while pstack is loaded.

No pushes, PR creation, merges, package publication, release-triggering version changes, normal Pi installation/configuration changes or paid live-model evaluations without explicit authorization.

## Implementation boundaries

- Do not import pi-herdr-agents internals. Pstack contributes no named roles and must not register a role directory; comment-sicko is a bare delegate prompt under `skills/no-comments/references/`. If a role is later authorized, use the public `pi-herdr-subagents:roles:discover:v1` protocol.
- Declare pi-herdr-agents as a peer and an explicit Pi installation prerequisite. A peer declaration is not extension activation.
- Keep initial experimental packages private. A temporary peer range is not a published compatibility promise; record the exact candidate host SHA used in tests.
- Preserve applicable upstream license notices and record file provenance.
- Follow the installed Pi documentation and verify APIs against the actual tested SDK/runtime, not stale sibling node_modules.
- Use isolated `PI_CODING_AGENT_DIR` and test-owned configuration. Never edit the user's credentials, model preferences, package settings or installed extensions.
- New roles and skills must close their dependencies. Never replace a missing named role with an unannounced bare agent.
- Do not infer read-only execution from a read/bash allowlist; Bash is not sandboxed.

## Coordination and verification

Two implementation writers maximum. One owner per file/interface at a time. Do not spawn further agents from delegated tasks. Parent owns integration and acceptance; workers do not push, merge or release.

Only one real pi-herdr-agents integration suite may run on a Herdr instance at a time. Workers may run isolated unit/contract checks; coordinate real multiplexer/lifecycle tests with the parent. Keep failure evidence and distinguish skipped checks from passing evidence.

Before reporting completion, inspect the diff, run declared package checks, `npm pack --dry-run`, `git diff --check`, and active LSP diagnostics for changed TypeScript when available. Report the exact base/result SHAs, files, tests and remaining blockers. Do not claim a fixture or scripted provider demonstrates live-model compliance.
