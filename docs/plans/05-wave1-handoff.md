# Wave 1 handoff — accepted

Date: 2026-10-05. **The user accepted Wave 1 and subsequently explicitly authorized Wave 2.** The evidence below records the completed W0–1 milestone. See [the Wave 2 contract](./06-wave2-contract.md) for current authority and the separately approved private GitHub creation/initial pushes. Integration into main branches, publishing and installation changes remain unauthorized.

## Exact candidate vector

| Repository | Base | Reviewed result | Branch |
| --- | --- | --- | --- |
| pi-herdr-agents | `c2177dff835da44937e614e8a03d0405d442e848` | `e262c584f54a7c8d60eb1fa5510f47c1299e3801` | `wave1/pack-neutral-host` |
| pi-herdr-roles | `f31b3ca9c20e04b4ad6f31dc2040507fe30ffe63` | `22e1816725ba0910573f667f52e97c9757ca0305` | `wave1/role-pack` |
| pi-herdr-pstack | `34f170c35893b2476300f72a29e9c32d4209b307` | `b3f9c9d48d2735fb97246ab00270ea039687cc8f` | `wave1/pstack-foundation` |

Retained review locations:

- Host: `/home/g/.herdr/worktrees/pi-herdr-agents/wave1-pack-neutral-host`
- Roles: `/home/g/Projects/pi-herdr-roles`
- Pstack: `/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation`

All candidate trees were clean at the final revision check. This handoff and its evidence live on the pstack planning `main` branch, separately from the candidate vector; no candidate was merged. The original host checkout and GitHub main remain at `c2177df`. PRs #66–#68 remain open, unmerged and at the frozen heads in the Wave 0 contract; see the timestamped [evidence manifest](../evidence/wave1/manifest.json).

## Delivered scope

- **Host:** no production roles, `/plan` prompt/command or orchestrate resources. `/iterate`, `/btw`, `/btw-close` and exclusively used helpers removed. Generic discovery, launch, supervision, persistence, resume and worktree behavior retained. Valid `roles.bundled` booleans are deprecated no-ops with a parent warning; malformed values still fail. No user configuration rewrite.
- **Roles:** six generic roles, `/plan` plus its native skill, orchestrate and supporting workflow/evaluation assets. Public v1 registration and shutdown unsubscription. `/plan` preserves literal skill-wrapper delivery and refuses execution without its host tool prerequisite.
- **Pstack:** private foundation and byte-identical `poteto` role. **No pstack skills, setup command, mode state or `comment-sicko` yet.** The full 51-skill target remains later work.
- Both new packs declare peers and explicit Pi activation prerequisites. They are private `0.1.0-experimental.0` candidates. Temporary `*` host peers are not compatibility promises. The host version remains 2.0.5; the published npm 2.0.5 is an older, unextracted release and was not modified.

## Verification

Durable logs and parent-owned QA fixtures are in [`docs/evidence/wave1`](../evidence/wave1/README.md). Scratch source and fuller transcripts remain in `/tmp/pi-herdr-wave1-qa-y7ClZe`.

| Check | Result / evidence |
| --- | --- |
| Frozen host baseline | 759 unit passes, 1 skip; deterministic lifecycle smoke passed. Original logs: `/tmp/pi-herdr-wave1-baseline-r3tX5r`. |
| Candidate host standard checks | Parent rerun: **738 passed, 1 skipped, 0 failed**; format, lint, pack dry-run and diff checks pass. `host-parent-unit.log`, `host-format.log`, `host-lint.log`, `host-pack.json`. |
| Host-only real Herdr suite | **72 passed, 0 failed, 0 skipped**. `host-integration.log`. |
| Final roles candidate | `npm run check`: **42 passed**, typecheck/lint/format pass, source reconstruction and package checks included. `roles-final-check.log`. |
| Final pstack candidate | `npm run check`: **13 passed**, typecheck/lint/format pass, exact poteto reconstruction and package checks included. `pstack-final-check.log`. |
| Wrong-host negative gate | Normal suites pointed at the frozen pre-extraction host both exit **1**, with genuine role-provenance and `/plan` collision assertion failures. `*-old-host-negative.log`. |
| Real isolated catalog / overrides | **2 passed**: host-only catalog empty; combined seven-role catalog retains global-over-package and project-over-global precedence. `combined-catalog.log`. |
| Actual migrated-role children | **2 passed**: standalone `worker` and forked `poteto` launch, execute the deterministic task and deliver results. Both packs answer discovery in the child; the roles pack's plan/orchestrate skills are visible. `combined-child-visibility-corrected.log`. |
| Combined targeted lifecycle | **5 passed**: fresh, fork, restricted resume, persistent turns/stop and retained-worktree cleanup/history. `combined-lifecycle.log`. |
| **Complete combined real Herdr suite** | **72 passed, 0 failed, 0 skipped** with both packs configured in isolated agent settings. `combined-full-integration-isolated.log`. |
| Combined startup observations | 65 observed Pi processes: 18 parent and 47 child observations. Both pack bridges answered public discovery, one unsuffixed `/plan`, roles' plan/orchestrate skills, no retired commands. Saved-session paths identify two resumed sessions across processes. `combined-lifecycle-summary.json`. |

The complete combined run used an archive of exact host `e262c584`, symlinked to that candidate's dependencies. Of **165 tracked files**, only the test harness changed: an explicit QA overlay supplies the two package settings entries, explicit parent extension flags (parents use `-ne`) and a passive startup observer. Production files were byte-compared unchanged. The patch and audit are preserved. The package SHAs above were unchanged during these checks.

The observer emits the public discovery event itself: it proves that bridges load and answer, **not** that the host consumes their responses. Actual host catalog tests and successful named `worker`/`poteto` launches supply that separate evidence. There are no pstack skills in this wave; skill visibility assertions apply only to the roles pack.

### Reproduction inputs

Package checks require explicit integration inputs; an ordinary unset-variable run is not the combined gate:

```sh
export PI_HERDR_AGENTS_HOST=/home/g/.herdr/worktrees/pi-herdr-agents/wave1-pack-neutral-host
export PI_HERDR_AGENTS_SOURCE=/home/g/Projects/pi-herdr-agents
export PI_HERDR_ROLES_PACK=/home/g/Projects/pi-herdr-roles
export PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0
unset PI_HERDR_AGENTS_LEGACY_HOST
# Run npm run check in each new pack candidate.
```

For the recorded combined archive, run only one real suite at a time:

```sh
cd /tmp/pi-herdr-wave1-qa-y7ClZe/combined-host
PI_CODING_AGENT_DIR=/tmp/pi-herdr-wave1-qa-y7ClZe/combined-outer-agent \
PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 PI_TEST_LIVE=0 \
npm run test:integration
```

CLI and new-pack SDK: **1.0.3**; host lock/candidate SDK: **1.0.0**; Node **26.8.2**, npm **11.19.1**. The original host's stale SDK 0.84.0 node_modules was neither changed nor used for candidate verification.

## Review and corrective work

Implementation was Claude-authored; implementation reviews used fresh standalone OpenAI sessions.

1. `packwave1-review-1`, `openai-codex/gpt-6-astra`: host exact delta; no material findings.
2. `packwave1-review-2`, same exact model in a fresh session: reconstructed all 23 provenance entries across the packs; found **P2** in integration tests that inferred legacy mode from private host directory layout and weakened assertions.
3. `packwave1-test` fixed that P2 in both packs. Normal gates now unconditionally require role-free behavior; legacy characterization is separately opt-in through `PI_HERDR_AGENTS_LEGACY_HOST`. Result commits are the vector above.
4. `packwave1-review-3`, fresh `openai-codex/gpt-6-astra`: P2 resolved, no new blocking findings. Parent reran final positive and wrong-host negative gates. Legacy characterization is deliberately not part of the final neutral-host run; the author separately reported its positive opt-in checks.
5. `packwave1-review-4`, fresh `claude-bridge/claude-sonnet-5-5`: cross-family audit of the OpenAI parent's QA overlay/evidence; no blockers. It required distinguishing roles-skill visibility from the future pstack skill port, and bridge observations from actual host catalog consumption. Those distinctions are explicit above.

These reviews do not substitute for human acceptance.

## Retained failures and limitations

- The first custom child probe used `printf`, whereas the scripted provider recognizes `echo`. Both children delivered results but no requested marker was produced. The failed log is retained; the corrected test passes. No product change was made for this probe error.
- The first complete combined run omitted the **outer** temporary `PI_CODING_AGENT_DIR`. Eight mock-context placement tests read ambient `roles.bundled:true` and reached a warning handler with no mock `ctx.ui`; **64 passed, 8 failed**. The isolated rerun passes all 72 without source changes. Both logs are retained. This is why the outer isolation setting is mandatory, not just per-child configuration.
- That failed run left disposable fixture workspaces `w8W`/`w8X`. The parent traced their exact test source/checkout, closed the owned group and removed only those disposable directories. Candidate worktrees remain retained. See `cleanup.json`.
- Host TypeScript is **not clean**: the author compared baseline/candidate and reported the same **63 lenient / 66 strict pre-existing errors**. Package `tsc --noEmit` passes. Active LSP checks were performed, with some inconclusive probes; do not interpret them as universal clean coverage.
- Deterministic providers establish loading, routing, tool execution and delivery—not live-model obedience, engineering quality, or paid evaluation results.
- Herdr fixtures isolate Pi agent settings but retain HOME; ambient `~/.agents/skills` are visible. Do not call this total resource hermeticity. The RPC catalog fixture additionally isolates HOME/XDG paths.
- This run observed worktree children, **not a new user-driven Pi handoff session**. The marker distinction for user handoff rests on W0 probes and host launch-policy tests. Resume creates a new child ID; the saved session path, not the child ID, links process observations.
- No publication-compatible peer range is selected. Some shipped evaluation documentation references source-checkout tests excluded from the tarball; treat those as developer instructions, not installed-package execution guarantees. Release/documentation polishing remains a later gate.

## Human gate / rollback

**Accepted by the user.** The user then separately authorized Wave 2; see the current contract. This does not authorize later waves or shipping.

During the local W0–1 implementation and verification recorded above, no push, PR, merge, publication, stable installation change or paid live-model evaluation occurred. The user subsequently authorized creation of the two private GitHub repositories and initial pushes of their main and W1 candidate branches; those uploads are complete, without merging. To decline this candidate, simply leave the candidate branches unintegrated; normal installation and original host main are unchanged. Retain the clean candidate worktrees for review. Remove them only after review/preservation and explicit cleanup authorization, retaining their branches and commits. Do not reset the original checkout or alter PRs #66–#68.
