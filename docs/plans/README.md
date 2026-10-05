# Pack separation and pstack delivery

Status: Waves 0–1 candidates are implemented and verified; **human Wave 1 acceptance is pending**. See [the Wave 1 handoff](./05-wave1-handoff.md) for exact revisions, checks, review and limitations, and [the Wave 0 contract](./04-wave0-contract.md) for authorized scope. Stop here: Wave 2, pushes, PRs, merges, publication, normal-installation changes and paid live-model evaluations remain unauthorized.

## Two workstreams

1. [Extract bundled roles and workflows from pi-herdr-agents](./01-host-pack-extraction.md).
2. [Build pi-herdr-pstack as an installable pack](./02-pstack-pack.md).

[Dependency-aware waves](./03-release-waves.md) sequences both workstreams, assigns file ownership, records open-PR overlaps, and defines integration/review/rollback gates. It is a planning overlay, not a third product workstream or authorization to execute.

These are independently reviewable changes with a coordinated migration. Host work belongs in `../pi-herdr-agents`; pstack work belongs here. A separate optional pack will receive the remaining general-purpose roles and their associated workflows. Approved name: `pi-herdr-roles`, in the sibling repository `../pi-herdr-roles`. This gives it independent releases and no privileged default status.

Naming: use `pi-herdr` for the package ecosystem and `pi-herdr-agents` for the execution host. `Herdr` refers only to the terminal multiplexer, not the extension.

## Confirmed product decisions

- `pi-herdr-agents` owns execution, supervision, sessions, worktrees, model routing, and the existing role-pack discovery protocol.
- Packs own agent definitions and engineering workflows. The host will ship no default agent definitions.
- `poteto` moves from the host into `pi-herdr-pstack`, retaining its role name.
- Pstack skills keep unprefixed names. Do not rename `how` to `pstack-how`, for example.
- Port the full upstream skill inventory, not a curated subset. Implementation may proceed in batches, but all skills and their required resources must be accounted for before the first release.
- Keep `/setup-pstack` for onboarding and `/poteto-mode` for session methodology activation.
- Pstack declares `pi-herdr-agents` as a peer dependency. Users must also install/enable both packages through Pi; dependency resolution is not extension activation.
- No new runner, scheduler, package manager, private model map, or shell-permission engine.
- Preserve public role-pack v1 discovery and project > global > package precedence. No privileged replacement default pack.

## Proposed ownership

| Surface | Destination |
| --- | --- |
| Public subagent controls, delivery, lifecycle, worktree controls | `pi-herdr-agents` |
| Model task categories, authenticated routing, shared preferences writer | `pi-herdr-agents` |
| Role parsing, pack discovery, overrides and collision diagnostics | `pi-herdr-agents` |
| `poteto` | Pstack pack |
| `scout`, `planner`, `worker`, `reviewer`, `adversarial-reviewer`, `visual-tester` | Optional general-purpose pack |
| `/plan`, its plan skill, and `/skill:orchestrate` with its supporting resources | Optional general-purpose pack |
| Pstack skills, setup command, mode command and mode state | Pstack pack |

Remove `/iterate` and `/btw` from `pi-herdr-agents`; they are unused in production and will not move into either pack. Remove their command-specific helpers, companion commands, tests and documentation where no retained feature depends on them. Preserve generic subagent fork, session and lifecycle functionality.

## Cross-workstream constraints

1. A workflow must close its role dependencies: it supplies the roles, explicitly requires another installed pack, or deliberately uses a bounded bare agent. Never silently fall back to a bare agent when a named role is missing.
2. Removing bundled roles does not remove host safety invariants: explicit worktree cleanup, constrained role capabilities, cancellation, lifecycle ownership, and fail-closed discovery remain runtime concerns.
3. Existing host versions reject pack roles colliding with enabled bundled roles. Publishing a replacement pack alone is not enough to make it safe to install beside the old host.
4. Old host `/plan` and `orchestrate` resources can also collide with replacements; `roles.bundled: false` does not disable commands or skills. It does permit pstack's `poteto` role to register, but that alone is not full compatibility. Keep pstack's inventory disjoint from the generic pack's owned skill and command names and test the complete package combination. Pi keeps the first discovered duplicate skill and warns; never rely on that order to choose the intended workflow.
5. Child Pi sessions must discover the pack and its skills in their own scope. A parent-only `pi -e` load is not proof of child availability.
6. Setup must preserve existing `pi-herdr-agents` configuration. Its task writer replaces the task-category map, so all retained categories must be included in an approved update.
7. Peer ranges and a minimum Pi version are selected from tested contracts, not assumed from the current package versions.

## Delivery order

1. Settle the few scope choices below and record ownership in both projects' design documentation. Resolve the overlapping open PRs #66, #67 and #68 against an explicitly selected base before assigning implementation files; see the wave plan for exact heads and ownership areas.
2. Implement the optional general-purpose pack and pstack foundation against local checkouts. In parallel, prepare the role-free host change on an unreleased branch. Do not change versions merely to land implementation work.
3. Run host-only, pack-enabled, missing-pack, migration, and child-resource tests against the candidate versions. Run real pi-herdr-agents integration suites sequentially on a single Herdr terminal-multiplexer instance. Verify full skill-inventory coverage, not just an initial vertical slice.
4. Prepare migration instructions and version compatibility gates before publication. Replacements must not advertise compatibility with old host combinations that collide.
5. Publish replacement packs before the breaking host release where release tooling permits; a peer range targeting the upcoming host version may require an explicit tested first-publish procedure. Otherwise stage compatible prereleases and document the install sequence. No release step is authorized by this plan.
6. Release the host breaking change, then have users install their selected packs and reload. Do not auto-install the generic pack or edit users' global role files.

## Approved execution decisions

- Create `pi-herdr-roles` at `../pi-herdr-roles`; preserve all six generic roles, including `adversarial-reviewer` and optional `visual-tester`, with their current workflows during extraction.
- Pstack works independently of that optional pack, using its own roles and explicitly configured bare delegates where needed.
- Execute Waves 0–1 with at most two implementation workers, plus read-only reviewers; run real integration suites one at a time.
- Use Maestro commit `c2177df` as the experimental base. Leave PRs #66–#68 untouched and pause for coordination if upstream changes affect integration.
- Allow local repository initialization, isolated branches/worktrees and local commits. No pushes, merges, PRs or releases; normal Pi settings and npm stable remain untouched.
- Mode semantics approved for the later Wave 2: preserve mode through user Pi forks/clones, never implicitly activate it in child agents, and treat direct skill invocation as non-sticky. Wave 2 is not authorized yet.
- Full inventory remains mandatory. Its future platform adaptations and live-model evaluations do not expand the authorized Wave 1 scope.

## Plan evidence and verification status

Planning baseline:

- pi-herdr-agents checkout and GitHub HEAD: `c2177dff835da44937e614e8a03d0405d442e848` (merged maestro PR #69), package version still `2.0.5`; clean when inspected.
- Published npm `latest`: `2.0.5`, with registry `gitHead` `ada60185600383a207bb2a24e43d9b66b9ed8288` (the earlier release commit). `npm pack pi-herdr-agents@2.0.5 --dry-run --json` lists no `maestro/` files. Maestro is on main but is not in the currently published npm release. Do not treat the unchanged local version string as evidence that npm contains the new architecture.
- pi-mimir reference: `f07dd981f62c9c994a5d043ede67d6c63c721454`.
- Original Cursor reference: `2cbf58508f40de470d7490b55c51d71241928fa2`.

The planning baseline had no pstack Git repository. The user subsequently authorized initialization and local Waves 0–1 work; exact baseline/result revisions and checks are recorded in the Wave 0 contract and Wave 1 handoff. No release action is authorized.

A fresh read-only plan review found no blocking contradictions and identified five material clarifications. The plans now specify setup payload approval/read paths, explicit child-context discrimination, cross-pack skill ownership, old-host diagnostic ownership, and additional host extraction checks. At planning time the API spikes and behavioral tests were future gates; their subsequent results and remaining limits are now recorded in the Wave 0 contract and Wave 1 handoff. Subsequent user annotations confirm full skill coverage, removal of `/iterate` and `/btw`, and explicit pi-herdr naming; these decisions supersede earlier curated-scope and command-retention proposals.
