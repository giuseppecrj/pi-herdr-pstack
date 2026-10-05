# Task 1: Extract roles and workflows from pi-herdr-agents

Status: proposed implementation plan, not implemented. Source repository: `../pi-herdr-agents`. See [the shared roadmap](./README.md) and [Task 2](./02-pstack-pack.md).

## Outcome

`pi-herdr-agents` becomes a pack-neutral execution host. It ships no default agent definitions and does not require an opinionated workflow pack. Existing general-purpose roles and their workflows remain available through a separately installed optional pack; `poteto` belongs to pstack.

This is a breaking product change, but development does not require a release. Work against the current unreleased Maestro baseline and isolated Pi settings. Do not publish Maestro, bump versions, or update a user's stable installation merely to begin extraction. The eventual release/version strategy requires a separate approval.

## Ownership map

| Current surface | Owner after extraction |
| --- | --- |
| `agents/poteto.md` | `pi-herdr-pstack/agents/poteto.md` |
| `agents/{scout,planner,worker,reviewer,adversarial-reviewer,visual-tester}.md` | Optional general-purpose pack, working name `STARTER_PACK` |
| `/plan` registration and `pi-extension/subagents/plan-skill.md` | STARTER_PACK; preserve `/plan` plus a Pi-native plan skill |
| `skills/orchestrate/` and its referenced resources | STARTER_PACK |
| Workflow-specific review eval corpus and `docs/review-evaluation.md` | STARTER_PACK; split any genuinely generic test helpers rather than moving them blindly |
| Role parsing, discovery, precedence, provenance, collision diagnostics | `pi-herdr-agents` |
| Public launch/control/listing tools, child protocol, parent delivery | `pi-herdr-agents` |
| Worktree ownership and explicit cleanup | `pi-herdr-agents` |
| Model configuration, authenticated routing, task categories | `pi-herdr-agents` |
| `/iterate`, `/btw` and their exclusively used helpers | Remove; do not migrate into either pack |

STARTER_PACK is a planning placeholder for the recommended `pi-herdr-roles` package at `../pi-herdr-roles`; the name/location awaits confirmation. It is not a new privileged discovery tier. Keep `visual-tester` and the compatibility `adversarial-reviewer` in the initial extraction to preserve existing functionality; document the former's optional `chrome-cdp` prerequisite. Changes to their methodology can be later pack changes.

## H0. Freeze the contract and experimental environment

1. Confirm the recommended name `pi-herdr-roles` and sibling repository path `../pi-herdr-roles`. A separate repository decouples role/workflow maintenance and releases from pi-herdr-agents without implying a mandatory default pack.
2. Record the Maestro baseline commit separately from the unchanged local version string. Stable npm 2.0.5 predates Maestro.
3. Record an extraction inventory for seven roles, workflow resources, commands, tests, docs and examples. Capture effective frontmatter and source hashes for baseline comparisons.
4. Establish isolated tests using explicit candidate package paths and `PI_CODING_AGENT_DIR`. Include installed-resource discovery in child Pi processes; parent `-e` alone is not a valid install-scope test.
5. Write an ADR for role-free host ownership and a migration design. Do not change the role-pack v1 event or invent a workflow contribution registry: the current protocol is sufficient for independently installed packs.

**Gate:** approved ownership and named pack destination; repeatable local host/pack test environment; no modifications to production config or stable packages.

## H1. Decouple host tests and guidance

Relevant source seams:

- `pi-extension/subagents/index.ts`: `getBundledAgentsDir`, `discoverAgents` composition, role lookup text, `BUNDLED_WORKTREE_WARNINGS`, config loading, `/plan` registration, `/iterate` and `/btw` surfaces, tool guidelines.
- `/iterate`, `/btw`, and any companion surface such as `/btw-close`: inventory their exclusive handlers, state, session adapters, UI, fixtures and documentation before deletion. Retained generic fork/session helpers must not be deleted merely because these commands also use them.
- `maestro/core/roles/discovery.ts`: bundled directory option, bundled catalog layer, bundled collision handling.
- `maestro/core/config/role-config.ts`: strict `roles.bundled` parser.
- `maestro/core/routing.ts` and `maestro/core/config/task-model-init.ts`: embedded references to named review workflows.
- `test/integration/subagent-lifecycle.test.ts`: lifecycle coverage depending on the shipped adversarial coordinator role.
- `test/test.ts` (baseline around line 4992): assertion that bundled `poteto` is discoverable; move role-content expectations to pstack and replace host coverage with fixtures.
- `README.md` (baseline around lines 180 and 1044): bundled `poteto` catalog entries.
- `package.json`: `pi.skills` and format/lint paths naming `skills/orchestrate/adversarial-review-example.js`.

Steps:

1. Replace host tests' dependence on bundled production roles with test-only role-pack fixtures. In particular, test coordinator lifecycle using a dedicated role with explicit spawning and auto-exit settings, not the real adversarial-review methodology.
2. Separate model-selector mechanics from review policy. Keep task-category configuration, authenticated candidates, fallback semantics and exact invocation behavior in the host. Move references to specific skills/roles and their methodology to the owning pack. Generic advice can remain if it describes the API rather than mandating a pack's workflow.
3. Remove the bundled-name worktree warning table. Preserve universal worktree warnings and document role-specific recommendations in the roles/workflows. Do not infer that an agent cannot write from the absence of `write`/`edit`: Bash and other tools can mutate files.
4. Change public lookup text to installed role packs, global definitions and project definitions. Do not promise that `worker`, `scout` or `reviewer` comes with the runtime; examples should state prerequisites or use an explicit fixture/bare role.
5. Remove `/iterate` and `/btw` as confirmed scope, including exclusively used companion commands such as `/btw-close`; do not move them into the role pack. Remove command-specific dead code and replace any tests using these commands as proxies with direct generic subagent coverage. Preserve supported bare launches, `fork:true`, role inheritance, persistent sessions, resume and worktree handoff. Coordinate the minimal child-context contract with Task 2: the launcher currently sets `PI_SUBAGENT_ID`, but packs need a documented, tested discriminator or a clearly pinned compatibility assumption for retained launch paths.

**Gate:** host lifecycle tests pass using fixtures even when the production `agents/` directory is not consulted; safety invariants are unchanged.

## H2. Build the optional general-purpose pack

Suggested structure:

```text
STARTER_PACK/
  package.json
  extension.ts
  roles/
    scout.md
    planner.md
    worker.md
    reviewer.md
    adversarial-reviewer.md
    visual-tester.md
  skills/
    plan/SKILL.md
    orchestrate/
  test/
  docs/
  LICENSE
  THIRD_PARTY_NOTICES.md
```

1. Initially extract role bodies with minimal path/terminology adjustments. Record source commits and preserve applicable license notices.
2. Register roles through the same v1 event, with shutdown unsubscription. The pack receives no priority over other packs.
3. Move `/plan` and its prompt into the pack, keeping its familiar entry point. Resolve its resource paths from the pack, check prerequisites before starting, and test actual command-to-skill execution on the supported Pi version.
4. Move all `orchestrate` resources, content contracts and methodology evals with it. Update cross-references and citations to host-owned worktree behavior without relying on a sibling filesystem layout after publication.
5. Declare host peers and explicit Pi installation prerequisites, consistently with pstack. Do not bundle/import the host's private runtime modules.
6. Verify extracted catalog parity against the captured baseline, with intentional changes reviewed. Tests in the pack should load the real host through its public integration surface rather than rely on private discovery APIs as a supported library.

**Gate:** generic pack roles, planning and review work against the candidate host. No pstack installation is required for the six generic roles. The pack preserves existing workflow entry points without installation side effects.

## H3. Remove the production bundled layer

1. Delete production `agents/`, moved `skills/`, the plan prompt and the host `/plan` registration only once their destinations are implemented and tested. Delete `/iterate`, `/btw` and their exclusively used surfaces outright; no replacement pack is required for these intentionally retired commands.
2. Remove the bundled directory argument and loading branch in role discovery. Preserve strict pack parsing, missing-role failures before resource creation, package identity, invalid-contribution diagnostics and deterministic duplicate-pack disabling.
3. Maintain effective precedence: project > global > registered package roles. An empty catalog is valid. Bare launches remain supported; a missing explicitly requested role must fail, not degrade silently into a bare run.
4. Accept existing valid `roles.bundled: true|false` as a deprecated no-op during migration and report a concise diagnostic. Remove it from new example configuration. Continue rejecting invalid types and unrelated unknown keys; do not auto-rewrite user config. Removing the accepted key without a compatibility path would break existing configurations under the strict parser.
5. Remove moved resource references from `package.json`, format/lint targets and package-content tests. Replace dead empty directories rather than leaving an empty packaged surface.
6. Preserve in-flight run ownership and delivery across reload. Do not assume already-running children remain unaffected: cover reload, persistent follow-up and resume in the lifecycle tests, distinguishing saved prompt state from subsequent launches that resolve roles anew.

**Gate:** host-only installation exposes no bundled roles, moved workflow commands, `/iterate` or `/btw`. Retained generic launch/control/worktree/session functionality operates normally; neither pack reintroduces the retired commands.

## H4. Synchronize contracts and migration documentation

Update in the same implementation change:

- `README.md`: installation, role catalog, source precedence, config deprecation, examples and moved command/skill pointers.
- `CONTEXT.md`: runtime terminology versus pack-owned workflow glossary.
- `docs/README.md` and a new ownership ADR.
- ADR-0003: registered packs are now the entire package role layer; retire bundled protection while retaining duplicate-pack policy.
- Status notes in ADR-0002 and ADR-0009 where their descriptions of shipped roles/skills become historical.
- `docs/worktree-subagents.md`: keep runtime guidance canonical; fix stale removed-runner references and make named-role prerequisites explicit.
- `AGENTS.md`, `RELEASING.md` and `.pi/skills/run-integration-tests/SKILL.md`: new tests, resource locations and package-content checks.
- Change notes and a migration table mapping all seven roles and both moved workflow surfaces to their destination packs. Explicitly list `/iterate` and `/btw` as removed, not relocated; remove recommendations for them from current docs and mark historical ADR descriptions as superseded where needed.

A migration hint may mention removed roles in a clearly bounded compatibility diagnostic. It must not introduce a permanent built-in role registry or automatically install anything. Decide the deprecation removal version at release planning, not now.

## H5. Acceptance matrix

### Host-only

- Empty catalog with isolated user/project directories.
- Bare launch, direct forked subagent launch, retained session operations, persistent controls and worktree controls work.
- `/iterate`, `/btw` and exclusively associated companion commands are absent from command discovery and both pack manifests/registrations. No current help or workflow instructs users to call them.
- Named missing role fails before a pane or worktree is created.
- No production role/skill resources in the npm tarball, no `pi.skills` entry pointing at the removed directory, and no tool guidance requiring the moved workflows.
- Both legacy bundled booleans are accepted as no-ops; invalid values remain errors.

### Role-pack behavior

- Real public event discovery, provenance and launch with fixtures and the new packs.
- Project and global overrides retain precedence.
- Duplicate role names from two packs are disabled with actionable diagnostics.
- Invalid roles fail closed rather than falling through to a lower-priority same-name role.
- Pack unsubscription removes stale contributions after remove/reload.
- Generic pack and pstack coexist without shared role names, duplicate commands or conflicting shipped skill names.

### Migration and compatibility

- Old published host + default roles + replacement packs: verify the existing host-owned collision diagnostics, not a new pstack error. Do not advertise the combination as harmless coexistence.
- Old host + `roles.bundled:false`: pack roles, including `poteto`, can register without bundled-role collisions. Only the role layer is disabled: `/plan` and `orchestrate` may still collide when installing their replacement pack, so this is not a complete migration recipe.
- Candidate role-free host + either pack separately, both packs together, or neither pack.
- Existing per-agent model preferences survive; removing role files does not discard the user's model configuration.
- Test installation scope, child launches into another cwd/worktree, reload with active runs, persistent specialists and resume.

### Standard verification

Run the relevant unit tests, `npm test`, `npm run format:check`, `npm run lint`, active LSP diagnostics for changed TypeScript, `npm pack --dry-run` and `git diff --check` in each affected repository. Run deterministic pi-herdr-agents integration suites sequentially against an isolated environment in the Herdr terminal multiplexer. Keep optional live-provider tests separate and report unavailable/skipped coverage honestly.

**Gate:** host without packs and both replacement packs have passing deterministic acceptance evidence. Role/workflow extraction has not changed the worktree or child-lifecycle contracts.

## Release handoff, not a release instruction

Prepare candidate versions and migration documentation together with Task 2. The host removal warrants an intentional breaking release; the exact number is not selected by this plan. It may be useful to release Maestro independently later, but a stable release is not a prerequisite for local experimentation.

Before publishing anything, agree on ordering, compatibility ranges, rollback and the explicit installation commands. Replacement pack publications must not make false compatibility promises for old hosts that still own the same roles/commands. Do not auto-migrate global/project definitions, auto-install STARTER_PACK, update remote machines, or change the user's stable Pi installation.

## Completion criteria

The runtime has no privileged default roles or dependency on a methodology pack. Users can choose the generic pack, pstack, another pack, their own role definitions, or bare invocations. Existing users have an explicit migration route preserving the roles and workflows they chose to keep.
