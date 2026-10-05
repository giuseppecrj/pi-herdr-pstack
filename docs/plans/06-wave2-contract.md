# Wave 2 execution contract

Status: **authorized; entry paths and methodology contract frozen** in [the W2 entry checkpoint](./07-wave2-entry-contract.md). API recon demonstrated mode behavior and exposed an unresolved setup-write guarantee; that path remains report-only unless independently proven safe. The user accepted Wave 1 and explicitly answered yes to proceeding with Wave 2. This supersedes the earlier Waves 0–1-only authorization, not the later-wave or shipping gates.

## Accepted inputs

- Host: `e262c584f54a7c8d60eb1fa5510f47c1299e3801`, retained at `/home/g/.herdr/worktrees/pi-herdr-agents/wave1-pack-neutral-host`.
- Roles: `22e1816725ba0910573f667f52e97c9757ca0305`, `/home/g/Projects/pi-herdr-roles`.
- Pstack foundation: `b3f9c9d48d2735fb97246ab00270ea039687cc8f`, retained at `/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation`.
- W1 evidence/handoff: planning main `1031187fbf7b8ffc38e894b115d047627c3d3132`.
- Pi CLI and pack SDK 1.0.3; host dependencies remain SDK 1.0.0. Do not use or alter the original host's stale node_modules.
- Host main remains `c2177dff835da44937e614e8a03d0405d442e848`. At W2 entry, PRs #66–#68 were rechecked open/unmerged at the exact frozen heads in the W0 contract. No automatic rebase or inclusion of those changes.

After W1, the user separately authorized creation and initial pushes of the two new **private** GitHub repositories:

- https://github.com/giuseppecrj/pi-herdr-pstack — `main` and `wave1/pstack-foundation` pushed and verified.
- https://github.com/giuseppecrj/pi-herdr-roles — `main` and `wave1/role-pack` pushed and verified.

Those uploads did not merge the candidates, publish packages or upload the host candidate. They are not a blanket release or future-push authorization.

## Authorized scope and limits

Implement the W2 row and W2-A/W2-B briefs in [the wave plan](./03-release-waves.md), with detailed behavior from Task 2 P2/P4 in [the pstack plan](./02-pstack-pack.md):

- `/poteto-mode` enable/task/status/off, validated branch-sensitive persistence, lifecycle restoration and explicit parent/child ownership.
- `/setup-pstack` capability/configuration reporting and an exact-payload consent boundary for the host-owned preferences writer, where supported and demonstrated by the public Pi API.
- Real `poteto-mode` and `setup-pstack` skill entry points plus the agreed methodology/shared references needed for this subsystem.
- Canonical 51-skill inventory and only exact, enumerated future-resource exceptions for W3/W4. No fake or placeholder skill implementations.
- The user additionally approved replacing the generic poteto role body with a thin adapter to pstack skills as the single methodology source. Preserve the role name and runtime settings; enable explicit skill startup only after the real resource and child-loading behavior are verified.

Local candidate branches/worktrees, local commits and isolated deterministic probes/tests continue the established workflow. At most two implementation writers, no overlapping ownership, and one real Herdr integration suite at a time. Read-only reviewers may operate independently.

No W3/W4 bulk skill port, `comment-sicko` implementation, merges, new pushes/PRs, package releases, version/release automation, normal Pi configuration/installation changes, paid live-model evaluations or external state-changing workflow runs are authorized by this W2 approval.

## Ordering and ownership

1. Read-only API recon verifies dispatch, consent enforcement, lifecycle events and child resource behavior. Independent content recon identifies the actual upstream hub/setup dependencies and required notices.
2. Parent and methodology owner freeze exact entry paths and runtime/content interfaces in a committed checkpoint before runtime implementation. A genuine API/consent gap is reported, not papered over with model instructions.
3. Methodology and runtime ownership remain separate. Implementation may be sequential in one dedicated W2 candidate to avoid shared-file or Git-integration conflicts. The accepted W1 candidate is retained unchanged.
4. The methodology owner controls the two skill trees and shared methodology resources. The runtime owner controls extension modules, manifest/lockfile, runtime fixtures and final role activation. The parent controls authorization/integration evidence and the canonical inventory unless explicitly handed off.
5. Parent inspects commits, runs combined QA on an exact revision vector and obtains fresh cross-family review of configuration/state boundaries. No worker pushes, merges, ships or launches further agents.

## Non-negotiable semantics

- User Pi forks/clones preserve sticky mode. A pi-herdr-agents child does not implicitly inherit activation from a copied parent entry; `PI_SUBAGENT_ID` is a context hint, not a security boundary.
- Direct `/skill:poteto-mode` invocation is non-sticky. Off removes future reminders, not history or running children. Filtered/mismatched resources must not be presented as working mode.
- Setup preserves all retained task categories and unrelated configuration. Approval binds the complete actual writer arguments and current state; changed arguments/state require new approval. Missing consent, malformed/unreadable config, unavailable capabilities/authentication or inadequate UI is report-only.
- No private host imports, second model store, runner, scheduler, installer or shell permission engine.
- Tests isolate outer as well as child `PI_CODING_AGENT_DIR`; use test-owned HOME/XDG where required. Retain failures and label ambient resource visibility. Scripted providers do not establish model obedience.

## Exit gate

Deliver a W2 handoff with exact host/roles/pstack revisions, completed resources, explicit future exceptions, package/type/lint/format/content checks, deterministic consent/state/child evidence, independent review, risks and rollback to I1. Stop for W2 review before proceeding to W3.
