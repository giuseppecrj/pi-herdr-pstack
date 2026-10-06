# Wave 2 runtime/content entry contract

Status: **path and methodology checkpoint frozen for implementation**. W1 is accepted and W2 is authorized. Configuration mutation remains blocked unless the exact-consent guarantee below is demonstrated; report-only setup is the required fallback, not permission to weaken the guarantee. See [execution authority](./06-wave2-contract.md).

## Shared entry points

- Command `poteto-mode`: no argument enables without inventing work; `status` reports state/persistence/resource availability; `off` removes future guidance; other text is the task form. Refuse the task form while a turn is busy rather than queueing duplicate work. On/off/status may update state during a turn, but cannot retract already-built prompts or steer continuations.
- Skill `skills/poteto-mode/SKILL.md`: exact name `poteto-mode`, meaningful description, `disable-model-invocation: true`. A direct `/skill:poteto-mode` invocation loads methodology only, never silently enables sticky state.
- Command `setup-pstack`: report-first capability and shared-preference onboarding. No installation, activation, child dialogs or private model map. Direct skill invocation is informational, not configuration-write authority.
- Skill `skills/setup-pstack/SKILL.md`: exact name `setup-pstack`; describe report-first shared configuration and explicit consent. No Cursor rules, model-budget ladder or invented aliases.
- Own skill paths are resolved from the extension/package location, not the user's cwd. Compare the effective resource's canonical path with the owned file; missing, filtered or shadowed resources are diagnosed, not silently replaced.
- Task dispatch uses a tested full-skill path, with a literal `<skill name="poteto-mode" location="...">…</skill>` wrapper preferred over assuming slash expansion. Check effective resource ownership first. Native expansion is acceptable only if tested, including skill-command settings and filtering.
- Per-turn sticky guidance is a short named structured system-prompt section with the full skill path. Never replace the entire system prompt or inject every skill body on every turn.

## The role is an adapter, not a second methodology

After discussion, the user explicitly approved replacing the old generic `poteto` instructions with a **thin adapter to the pstack methodology**. Keep the `poteto` role name and established runtime/capability settings. The skills are the single source of engineering methodology; the role carries its bounded task and directs it to that methodology.

The runtime owner performs this change and updates provenance/tests only after the real hub exists. Test explicit skill startup before adding `skills: poteto-mode`: it must load the full content without losing the actual task, premature auto-exit or unintended sticky activation. A failed startup gate is reported, not bypassed. Do not add `poteto-agent`, another generic worker role or `comment-sicko` in W2. `comment-sicko` belongs to **pstack in W3**, not to the optional roles package.

**Subsequent real-child gate:** native `skills: poteto-mode` startup failed for a forked child on host b04906b6: startup completed before the assigned task executed. A turn-free public structured-section bootstrap passed fresh and forked real Herdr cases with the complete hub on actual task requests. Use that package-owned loading approach, not the failing native kickoff, and re-prove it in the final candidate with missing/filtered/shadowed-resource handling. See [interim evidence and follow-ups](../research/wave2-interim-validation.md). This changes no host launch policy and does not turn on sticky mode.

## W2 methodology files

Exactly two top-level skills. Shared references:

- `skills/poteto-mode/references/bugbot-triage.md`
- `skills/poteto-mode/references/delegation.md`
- `skills/poteto-mode/references/authorization.md`

The following **12** base playbooks are real adaptations in W2 under `skills/poteto-mode/playbooks/`:

`investigation.md`, `bug-fix.md`, `feature.md`, `refactoring.md`, `prototype.md`, `perf-issue.md`, `opening-a-pr.md`, `autonomous-run.md`, `session-pickup.md`, `pause-safely.md`, `runtime-forensics.md`, `trace-forensics.md`.

The remaining **11** of the 23 upstream playbooks are explicit W4 methodology work, not empty files:

`hillclimb.md`, `eval.md`, `visual-parity.md`, `authoring-a-skill.md`, `babysit.md`, `shipping.md`, `autopilot-full.md`, `autopilot-stack.md`, `multi-phase-plan.md`, `orchestrate.md`, `worktree-cleanup.md`.

The nested orchestrate playbook is not the roles pack's top-level `/skill:orchestrate`. Do not add a top-level pstack skill with that name. No upstream bootstrap, watcher, ledger, worktree-pruning or scheduler script ships in W2. Later workflows require real replacements, not a duplicate engine or silently omitted inventory row.

Preserve methodology substance: the 24 principle summaries and applicability, routing, evidence before claims, reproduction before changes, smallest safe changes, explicit skipped steps, prototype empirical uncertainties, bounded delegation, context stewardship, verification and clear final reports. Preserve named future skills but clearly mark them unavailable until their wave. Do not claim a missing principle's full leaf has been read. Where safe, use the hub's actual summary/manual equivalent; otherwise stop that dependent workflow.

External actions remain authorization-aware. In particular, opening a PR is not an automatic final step, autonomy is not permission to push/merge/deploy/delete, and review cleanup is not permission to mutate a remote review thread.

## Dependencies, examples and provenance

- Canonical inventory: `docs/skill-inventory.json`, schemaVersion 1, 51 rows. Partition is **2 + 29 + 6 + 8 + 6**. The pinned Mimir and Cursor trees have 123 and 128 tracked skill-resource files, respectively; do not reuse the recon report's lower file totals.
- Content-owner forward-reference file: `test/fixtures/wave2-forward-references.json`. Each exception is an exact `{sourcePath, targetPath, owningWave}` tuple, with a reason if needed. Enumerate actual references after adapting the files. No glob, missing-directory wildcard or blanket ignore. Unknown missing references fail; an exception whose target is now present must be retired. Excluded scripts are documented dispositions, not a list of runnable missing dependencies.
- Mark actual forward references visibly as planned W3/W4. Do not create placeholders or claim the full inventory is complete. The 49 future top-level skills remain planned until their implementation gates.
- Use `poteto` for named implementation delegates and deliberate **bare** delegates for bounded investigation/review/verification. No implicit dependency on `scout`, `worker`, `planner`, `reviewer` or other optional-pack roles. No silent named-role fallback.
- Examples use actual public single-agent parameters: `name`, `task`, optional `agent`, `model`, `thinking`, `tools`, `systemPrompt`, `cwd`, `fork`, `interactive` and `worktree` as applicable. No obsolete `role`, parallel `tasks`, `chain` or fabricated model alias. A bare delegate omits `agent` deliberately and gets its reference prompt explicitly.
- Use authenticated task categories for ordinary work; use exact eligible identities for independence-sensitive review, excluding known author families where required. Do not hardcode a today's-only paid model into methodology. Mark metavariables as non-runnable examples, not registry model IDs.
- Child briefs specify task, allowed files/tools, outputs, verification, commit policy and explicit session/worktree mode. Default to fresh leaf children; no polling for completion. Parent owns synthesis, integration and cleanup. Read/bash restrictions are behavioral, not a sandbox.
- Methodology owner adds per-file content provenance separately from the W1 moved-role fixture: `test/fixtures/skill-provenance.json`. Record pinned source repository/commit/path and source hash, destination/hash, adaptation status and explanation. Keep existing `test/fixtures/provenance.json` under runtime ownership for the approved poteto role change.
- Preserve MIT notices for Lauren Tan and Ivan Porto Carrero in `THIRD_PARTY_NOTICES.md`; keep the package's existing license. Update `docs/provenance.md` to distinguish W1 extraction from W2 adaptations. No unrelated upstream package is a source.

## Runtime state contract

- A versioned custom entry stores an explicit boolean and owning Pi session ID. Validate data strictly and reduce the active branch, not the whole flat session file. The runtime owner owns the exact internal schema and fixtures.
- Recompute at `before_agent_start`; refresh on session start/tree/compaction and commands. Duplicate lifecycle events are idempotent. Use `getSessionFile() === undefined` for memory-only sessions, not a nonexistent persistence API.
- User fork/clone follows branch history. When `PI_SUBAGENT_ID` is set, copied entries owned by another Pi session must not activate the child. A child's explicit activation can survive its own resume. Match saved Pi session identity, not the launch ID (which changes on resume).
- Tests cover tree navigation before/after activation, reload/resume/new session/fork/clone/compaction, no-session, inherited child entries, explicit child activation/resume, busy commands, and resource loss/shadowing. Off cannot erase earlier context or cancel running children.

## Setup consent boundary and unresolved write gate

The real Pi 1.0.3 command context cannot execute a tool. A model-issued pstack apply tool can invoke the existing host writer through public `ExtensionToolContext.executeTool`. A prototype proved basic accept/decline/cancel/no-UI/stale-during-dialog checks, but also reproduced a later `tool_call` handler mutating approved arguments before the writer consumed them. The host has no revision precondition.

The user has **not** accepted a detective-only write guarantee. Independent security recon is checking straightforward public-API hardening. Do not use private host callbacks, getter/proxy tricks, an alternate writer or prose promises to fake enforcement.

Required behavior:

1. Read the documented config path without exposing unrelated or credential-bearing fields. Missing, malformed and unreadable files are distinct. Missing-file default seeding must be disclosed before any eventual approved write.
2. Report available authenticated exact models, loaded/active writer and host capabilities, owned resources and current shared task preferences plus relevant poteto overrides. Do not equate parent discovery with proven child visibility.
3. Default to no change. Preserve every current category; W2 does not introduce category deletion. Reject unknown categories, invalid/duplicate/unauthenticated refs and task aliases as stored model IDs.
4. If a safe apply path is proven, create one canonical complete `{tasks, tasksMeta}` payload in code, show before/after plus metadata and shared effects, and obtain explicit bounded/cancellable UI approval. Metadata is not selected by the model. Do not cache approval for a later call.
5. Bind actual executed arguments, session/generation identity, current configuration and the exact authorized nested call. Changed arguments/current map/context require refusal and new approval. Cancellation, shutdown, absent UI/writer/auth or malformed config never writes.
6. Verify the saved normalized result before saying a write succeeded or reload is required. Post-write verification alone does not satisfy step 5.
7. Until step 5 is proven, setup is explicitly **report-only** and tests assert zero writes. The unimplemented successful-write gate remains a disclosed limitation, not a passing acceptance claim. A required host API change must be separately scoped and reviewed before the pinned host vector changes.

## Ownership and first checkpoint

Methodology owner first commits this contract, current AGENTS/authority and the canonical inventory into a dedicated W2 branch based on accepted pstack `b3f9c9d`. It then owns only the two skill trees, content-contract tests/fixtures and methodology notices/provenance. It does not change the extension, existing role, manifest/lockfile or existing runtime test harness.

After methodology handoff and inspection, the runtime owner works sequentially in that same candidate checkout, owning extension modules, package metadata, runtime tests, documentation of actual behavior and the thin role activation. The public `roles.ts` bridge remains unchanged absent a reviewed bug. Parent owns final inventory status, assembled revision vector, QA and review. No Git merge is needed; W1 candidates are retained unchanged.
