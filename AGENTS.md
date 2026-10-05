# pi-herdr-pstack contributor instructions

This package supplies the full unprefixed pstack skill inventory and a small Pi extension using pi-herdr-agents' public role-pack protocol. It must not own another child runner, scheduler, model store, package installer or general shell-permission engine.

## Current authorized scope

Read `docs/plans/README.md`, `01-host-pack-extraction.md`, `02-pstack-pack.md`, `03-release-waves.md`, `04-wave0-contract.md` and the current `06-wave2-contract.md` before implementation. The Wave 2 contract supersedes historical authorization limits in earlier planning snapshots.

The user accepted Wave 1 and explicitly authorized Wave 2: setup/mode runtime and the two methodology entry points. Local candidate branches/worktrees and commits remain allowed; stop at the Wave 2 review gate before bulk W3/W4 skill porting. The user separately authorized the completed private GitHub repository creation and initial W1 branch pushes. No new pushes, PR creation, merges, package publication, release-triggering version changes, normal Pi installation/configuration changes or paid live-model evaluations are authorized by the W2 approval.

Use `pi-herdr-agents` for the execution host; Herdr is the terminal multiplexer. Do not prefix skill names. The target inventory is the full upstream inventory, not a curated first release. `poteto` moves here; the other six existing roles move to the optional `pi-herdr-roles` package. `/iterate` and `/btw` are removed, not migrated into this pack.

## Implementation boundaries

- Use `pi-herdr-subagents:roles:discover:v1` with synchronous registration and shutdown unsubscription. Do not import pi-herdr-agents internals.
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
