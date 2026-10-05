# Wave 1 evidence

See [the handoff](../../plans/05-wave1-handoff.md) for conclusions, exact candidate revisions, test counts, review and limitations. `manifest.json` pins the clean product vector, final upstream check and SHA-256 digests of recorded artifacts.

These are **local QA records, not production resources or a portable test runner**. Recorded fixture files contain absolute paths from this run. Reproduction requires the pinned candidate checkouts and scratch layout, dependencies, Pi 1.0.3, the local deterministic providers and a real Herdr instance. Run only one real integration suite at a time; never point the fixtures at normal user settings.

## Successful final checks

- `host-parent-unit.log`: candidate host unit checks (738 pass, one pre-existing skip).
- `host-integration.log`: complete isolated host-only suite (72 pass).
- `host-format.log`, `host-lint.log`, `host-pack.json`: host packaging/mechanical checks.
- `roles-final-check.log`, `pstack-final-check.log`: checks with explicit final host/source/pack paths (42 and 13 pass).
- `combined-catalog.test.mjs`, `combined-catalog.log`: actual RPC host-only emptiness and combined override precedence (two pass).
- `combined-child-visibility.test.mjs`, `combined-child-visibility-corrected.log`: actual standalone worker and forked poteto, role discovery, roles-pack skill visibility and delivery (two pass).
- `combined-lifecycle.log`: five targeted real combined lifecycle checks.
- `combined-full-integration-isolated.log`: all 72 real integration checks with both packs enabled and outer agent-directory isolation.
- `combined-lifecycle-summary.json`, `combined-observation-audit.log`: startup discovery-response/command observations for that final run. They are not a substitute for actual catalog-consumption/role-launch tests.
- `cleanup.json`: verification that the failed-run disposable fixture was removed without removing candidate worktrees.

## Overlay and inference boundaries

`combined-harness-overlay.patch` changes only the archived test harness: package settings, explicit parent extension flags and a passive observer. `combined-archive-audit.json` records byte comparison of all 165 tracked host files. `lifecycle-pack-observer.ts` and `audit-final-observations.mjs` document the observations and final-run birthtime filter. Raw observation records and session transcripts remain in `/tmp/pi-herdr-wave1-qa-y7ClZe`; they are not committed here. The filter is adequate for this local run, not tamper-proof evidence provenance.

The roles pack contributes plan/orchestrate skills; pstack contributes only its poteto role and extension in Wave 1. The discovery observer calls the public event itself. Separate catalog and migrated-role child tests prove actual host consumption. No recorded test demonstrates live-model obedience or the later pstack skill inventory. Ambient HOME-level skills remained visible in Herdr fixtures.

## Preserved negative/failure evidence

- `roles-old-host-negative.log`, `pstack-old-host-negative.log`: expected assertion failures when the normal gate is intentionally pointed at the old host.
- `combined-child-visibility.log`: first custom probe failed because `printf` is outside the deterministic fixture provider's recognized command form. Corrected fixture uses `echo`; no product change.
- `combined-full-integration.log`: first complete combined run had 64 passes and eight mock-context failures after ambient legacy settings leaked through a missing outer `PI_CODING_AGENT_DIR`. The isolated full rerun passed without product changes.

The human acceptance gate remains open. Nothing here authorizes a merge, installation, publication or Wave 2.
