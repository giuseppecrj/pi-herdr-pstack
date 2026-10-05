# Wave 0: approved execution contract

Status: Wave 0 preparation complete; Wave 1 implementation may start against these local inputs. The user approved all seven execution questions. This file is the current authority/scope record; it supersedes historical planning statements that initialization or local commits were not authorized.

## Authority and stop point

- Execute Waves 0–1 only; stop for human acceptance before Wave 2.
- Initialize pi-herdr-pstack and pi-herdr-roles locally, create isolated experimental branches/worktrees, and make local commits.
- Maximum two implementation workers, plus read-only reviewer capacity. One real pi-herdr-agents/Herdr integration suite at a time.
- No pushes, PR creation, merges, release/version-triggering changes, package publication or modification of the normal Pi installation/configuration.
- Paid live-model evaluations need separate approval. Deterministic provider tests and isolated dependency installation for development are allowed.
- Integrate the three independently authored repository results by testing an exact revision vector; do not use Git merge to combine them. All results remain on local candidate branches.

## Frozen inputs and external-work disposition

- pi-herdr-agents source baseline: `c2177dff835da44937e614e8a03d0405d442e848`, merged Maestro main. The original source checkout was clean.
- Pi CLI observed: `1.0.3`; Node `v26.8.2`; npm `11.19.1`. SDK dependencies and runtime probes must be recorded separately.
- New optional pack name/location: `pi-herdr-roles` at `/home/g/Projects/pi-herdr-roles`.
- Pstack location: `/home/g/Projects/pi-herdr-pstack`.
- Reference source: pi-mimir `f07dd981f62c9c994a5d043ede67d6c63c721454`; original Cursor source `2cbf58508f40de470d7490b55c51d71241928fa2`.
- PR #66 remains open at `eb19bf9935dacf1fbad9cde5bd74d743193dc1bf`; #67 at `f6a3e00e63d4f2324d6d9cb646f5bf924f583517`; #68 at `34719712d40c5b6ef4f8f4d7bf2ac429680ea471`. All three heads and GitHub main were rechecked unchanged immediately after execution approval.
- User-approved disposition: leave those PRs untouched and do not implement their fixes. Work on the frozen Maestro baseline in isolated candidates. Recheck at integration boundaries; changed relevant upstream inputs require a pause and explicit disposition, not automatic rebase/merge.
- Existing unrelated local branches are not inputs and must not be changed.

## W1 ownership contract

### pi-herdr-agents candidate

Owns runtime, discovery/validation, configuration, model routing, execution, supervision, persistence, worktrees and child delivery.

Remove:

- all seven production role definitions after replacement destinations are verified;
- `/plan` registration and its prompt, plus top-level orchestrate resources after migration;
- `/iterate`, `/btw` and exclusively used companion commands/state/helpers, including `/btw-close` where exclusive;
- name-specific default-role assumptions and dead package references.

Preserve:

- generic bare and named launches, explicit `fork:true`, role allow/deny policy, persistent controls, resume and worktree ownership;
- project > global > registered package role precedence, strict invalid-role handling, duplicate-package collision diagnostics and v1 event identity;
- existing valid `roles.bundled` booleans as deprecated no-ops, without rewriting user configuration;
- the frozen baseline behavior of unrelated fallback/worktree paths owned by open PRs.

Document/test the current parent/child signal without inventing a new protocol merely for this extraction.

### pi-herdr-roles candidate

Receives six role definitions: `scout`, `planner`, `worker`, `reviewer`, `adversarial-reviewer`, `visual-tester`. Preserve existing behavior and optional prerequisites. Receives `/plan`, its prompt as a native skill, top-level `orchestrate`, required supporting resources and workflow tests/evals.

Use the existing synchronous `pi-herdr-subagents:roles:discover:v1` bridge and shutdown unsubscription. No privileged precedence, pstack dependency or private runtime imports.

### pi-herdr-pstack W1 candidate

Scaffold a private experimental role pack and receive the existing `poteto` definition unchanged except for justified ownership/path wording. No setup/mode implementation or bulk skill port in this wave. In particular, do not add `skills: poteto-mode` before its actual resource exists and is tested in W2.

Pstack must eventually operate without pi-herdr-roles; its own roles and explicit bare delegates provide its workflow dependencies. Later `comment-sicko` is part of the full skill port, not required to move unchanged poteto in W1.

## Packaging contract for experiments

- Both new packages declare the Pi host peer and pi-herdr-agents peer, and document separate Pi installation/enablement.
- Keep both packages `private: true` with a clearly experimental version. Do not claim npm stable 2.0.5 contains Maestro or is the tested extraction host.
- A broad temporary peer declaration is only scaffolding for private local candidates. Document the exact tested host SHA and that a publication-compatible range is a later release gate.
- W1-A exclusively edits the host manifest/lockfile; W1-B edits the two new packages' manifests/lockfiles sequentially.
- Preserve applicable MIT notices and record moved file source paths/commit. No first-run package installation or modifications of user-level role directories.

## Later-wave contracts already approved (not implementation authority)

- Unprefixed skills and full upstream inventory, not a curated subset. Census: 48 reference skills; original source contains those plus `setup-pstack`, `poteto-help`, `make-bot-ui`, for a 51-skill target.
- `/setup-pstack` reuses shared pi-herdr-agents preferences and requires exact-payload approval, preserving all retained categories. No second model store.
- `/poteto-mode` supports enable/task/status/off; own Pi forks/clones preserve mode, pi-herdr-agents children do not implicitly activate, and `/skill:poteto-mode` invocation is non-sticky.
- No runner, scheduler or general permission engine added to pstack.
- W2 must verify API dispatch/consent behavior before implementing setup/mode. W1 must not invent placeholder implementations.

## Planned W1 verification

1. Real role-free host loads with an empty isolated catalog; missing named roles fail before resources; bare launches remain valid.
2. Both new packs register/unregister via the actual public bridge and show package provenance. All seven original roles are accounted for in replacement destinations.
3. Combined catalog has no role or skill/command collision; project/global overrides still work.
4. `/plan` invokes its moved prompt through supported Pi messaging; `/iterate`, `/btw` and exclusive companion commands are absent.
5. Valid legacy bundled booleans are accepted; malformed values still fail clearly; shared user configuration is never changed.
6. Standard checks, active diagnostics and packaging checks on each changed repository; deterministic real-Herdr suite once on the combined candidate, with failure evidence retained.
7. Fresh cross-family review of exact candidate revisions. Any material fix receives targeted rechecks and review before W1 acceptance.

## Evidence and baseline SHAs

Initial local repository commits:

- pi-herdr-pstack: `34eeb826014948472d815cea5fd7e5c75b90240c` (approved plans/instructions; the subsequent evidence commit is the W1 worker base).
- pi-herdr-roles: `f31b3ca9c20e04b4ad6f31dc2040507fe30ffe63` (instructions/ignore rules), with candidate branch `wave1/role-pack` created.
- pi-herdr-agents: unchanged at `c2177dff835da44937e614e8a03d0405d442e848`.

Read-only compatibility recon used a new `/tmp/packwave0-probe-jV2arF` directory, Pi binary 1.0.3 and SDK types 1.0.3, with an in-process faux provider and no external model/network request. The frozen host's real public event lists a sample pack role with package provenance; existing role-pack APIs and literal skill-wrapper delivery for `/plan` have no blocking API gap.

Important observed boundaries:

- Original host node_modules contains SDK 0.84.0 despite the lock selecting 1.0.0. Do not typecheck against that stale tree or modify it. Candidate dependencies are isolated; record their actual versions.
- Preserve `/plan`'s direct `<skill name="plan" location="...">` prompt wrapper after relocating its file. Do not rely on slash text expanding implicitly. Two registered `plan` commands become `plan:1`/`plan:2` on Pi 1.0.3 and bare `/plan` can become literal prompt text, so host removal and pack addition must be tested together.
- Fresh/resumed pi-herdr-agents children receive `PI_SUBAGENT_ID`; user-driven worktree handoff does not. The variable is inherited by nested shell processes and is a context hint, not a security boundary. Document/test this W1 contract without extending the protocol.
- RPC can emit duplicate session-start events. Forked sessions can contain parent custom entries. These are later mode idempotence/ownership test cases, not W1 implementation scope.
- Role `skills:` startup may create a separate model turn, and a missing skill can become literal prompt text. W1 therefore does not add that field to poteto.
- Probe limitations: no TUI tree/compaction test, no real Herdr child launch, no installed-child resource visibility test, and no host full-suite run. Those remain explicit W1/later integration gates.

The preceding evidence describes the initial Wave 0 snapshot. Completed W1 candidate revisions, checks, review and remaining limitations are now recorded in [the Wave 1 handoff](./05-wave1-handoff.md). Human Wave 1 acceptance remains pending.
