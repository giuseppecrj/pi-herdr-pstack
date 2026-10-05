# Wave 2 amendment: remove the poteto role

**User decision:** “nah, let's get rid of it, just keep poteto-mode”. This supersedes the earlier thin-adapter decision and role-bootstrap requirements. It removes the named `poteto` role, not the authorized setup work or the full 51-skill inventory. Accepted W1 candidates and historical evidence remain unchanged.

## Target

- Keep the `poteto-mode` skill and `/poteto-mode` command.
- Remove `agents/poteto.md`, its runtime bootstrap, and unused pstack role-registration code/manifest entries. Do not register an absent or empty role directory. No replacement named implementation role.
- Implementation, investigation, review and verification delegation is deliberately bare: omit `agent`, provide bounded task/system instructions, explicit model/thinking/session mode and verification/commit boundaries. Do not copy the retired engineering role body into another prompt or silently depend on pi-herdr-roles.
- Remove present-tense claims that pstack provides or requires `poteto`, including helper prose, examples and setup's poteto-specific override reporting. Preserve existing unrelated configuration, including legacy agent overrides; do not migrate or delete user settings.
- No native `skills: poteto-mode` startup and no turn-free role bootstrap are needed. Keep the native-startup failure evidence as historical diagnosis, not as a remaining pstack delivery gate.
- Update role provenance honestly as removed in W2 rather than erasing its W1 history. Recompute modified skill hashes and keep exact future-reference validation. Do not alter pinned source content or historical evidence to make tests pass.
- Pstack alone now contributes no named roles. Combined catalog expectations must reflect this. Keep meaningful conditional-host/legacy-host compatibility gates; don't retain assertions requiring the deleted role or replace them with blanket skips.
- Other W3/W4 scope remains deferred. This amendment does not implement or decide the separately planned comment-sicko role.

## Required runtime corrections before acceptance

Fresh cross-family review of runtime `a8b2c3ccc01f5f7fc2ccb6bfc834574893881b10` found:

1. **P1: post-apply raw-writer bypass.** `closeFlow()` clears protection before the setup turn settles. A model can call the raw writer after a declined or successful apply in that same run, without a new dialog. Separate apply-authorization revocation from setup-run protection; block through settlement and preserve normal host behavior only on later independent runs. Test decline, success, error and report-command cancellation followed by raw writes, and cancellation/session replacement between approval and nested dispatch. Expiring authorization must not make a late nested call look like an unrelated out-of-flow call.
2. **P2: uncertain write outcome misreported as no write.** A real write can succeed and a result handler mark the outcome erroneous. After dispatch, reconcile saved state or explicitly report uncertainty; never infer zero effects from `outcome.isError`. Keep negative state checks and no automatic retry.
3. **P2: arbitrary config keys leak through validation messages.** Use static unknown-key diagnostics or allowlisted field names, not raw model keys, agent names or category keys. Test secret/multiline keys as well as values.
4. **P3: incorrect poteto model precedence prose.** Remove role-specific guidance under the new scope. Where model precedence is described, explicit selectors win over defaults.

The reviewer independently reproduced the first three with the actual SDK and host, and ran 43 focused tests successfully; those passing tests did not cover these faults. Actual session replacement/shutdown during approval, human TUI, final combined Herdr and installed-package checks remain required or explicitly disclosed limitations.

## Coordination

- Stop `packwave2-build-2` adapter work. Do not integrate any adapter implementation.
- A successor may work in an isolated candidate from committed runtime a8b2c3c while the stop settles, avoiding overlapping checkout writes. Maximum two implementation writers still applies.
- Carry this amendment and current contributor instructions into that candidate before changes. Host remains reviewed `b04906b6`; roles remains `22e1816`. No new host scope, pushes, merges, installations, releases or normal configuration changes.
- Parent reviews fixes and runs final combined tests. W2 is not accepted until its human gate.
