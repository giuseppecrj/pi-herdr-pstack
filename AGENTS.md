# pi-herdr-pstack contributor instructions

This package supplies the full unprefixed pstack skill inventory and a small Pi extension using pi-herdr-agents' public APIs. It must not own another child runner, scheduler, model store, package installer or general shell-permission engine.

## Current authorized scope

Read `docs/plans/README.md`, `01-host-pack-extraction.md`, `02-pstack-pack.md`, `03-release-waves.md`, `04-wave0-contract.md` and the current `06-wave2-contract.md`, `08-wave2-conditional-writer.md`, `09-wave2-no-poteto-role.md`, `10-wave2-unconditional-writer-gate.md` and the approved `12-wave3-contract.md` with `12-wave3-notes.md` before implementation. Wave 3 (35 skills, bare comment-sicko delegate) is accepted and merged (pstack PR #3, main `1cbf75f`, 37 of 51 skills shipped). Wave 4 planning is authorized; Wave 4 implementation is not until its contract is approved. The latest amendment makes the host writer gate unconditional while pstack is loaded and supersedes the run-identity design; 09 removed the poteto role. Wave 2 contracts supersede historical authorization limits in earlier planning snapshots.

The user accepted Wave 1 and explicitly authorized Wave 2: setup/mode runtime and the two methodology entry points. Local candidate branches/worktrees and commits remain allowed; stop at the Wave 2 review gate before bulk W3/W4 skill porting. The user separately authorized the completed private GitHub repository creation and initial W1 branch pushes. No new pushes, PR creation, merges, package publication, release-triggering version changes, normal Pi installation/configuration changes or paid live-model evaluations are authorized by the W2 approval.

Use `pi-herdr-agents` for the execution host; Herdr is the terminal multiplexer. Do not prefix skill names. The target inventory is the full upstream inventory, not a curated first release. The user removed the named `poteto` role from the W2 target; retain `poteto-mode` and use deliberate bare delegates. The other six existing roles belong to the optional `pi-herdr-roles` package. `/iterate` and `/btw` are removed, not migrated into this pack.

## Implementation boundaries

- Do not import pi-herdr-agents internals. W2 and W3 contribute no named roles and must not register a role directory; comment-sicko is a bare delegate prompt under `skills/no-comments/references/`. If a later authorized wave supplies a role, use the public `pi-herdr-subagents:roles:discover:v1` protocol.
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
