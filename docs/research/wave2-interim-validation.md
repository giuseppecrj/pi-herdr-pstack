# Wave 2 interim validation and runtime follow-ups

This is an intermediate checkpoint, **not W2 acceptance**. Accepted W1 candidates remain unchanged. The pstack runtime writer is still implementing against the explicit conditional-writer contract.

## Host conditional writer

Candidate `b04906b6d6d0f81ac23a64753a5aec2b506c6423`, based on `e262c584f54a7c8d60eb1fa5510f47c1299e3801`, is retained at `/home/g/.herdr/worktrees/pi-herdr-agents/wave2-conditional-model-writes`.

- Author and parent independent full unit runs: **750 passed, 1 skipped, 0 failed**. Parent used isolated outer HOME/XDG/agent state.
- Parent format, lint, package dry run and diff checks passed; checkout remained clean.
- Fresh OpenAI review of Claude-authored code found no blocking findings; reviewer independently ran 14 focused tests, all passed.
- TypeScript remains the same 63 baseline diagnostics, independently compared ignoring line shifts. Not a clean host typecheck.
- The author's later-hook test calls the registered handler directly. It is not public dispatch evidence.

Parent subsequently adapted the independent security prototype to the new host and ran **10 actual Pi SDK 1.0.3 public-dispatch scenarios**. A later hook adding `qa` now causes the host to reject the stale proposal, preserving the new category. The unmodified proposal succeeds and returns the revision of actual saved bytes. Original-object-only freezing remains an intentionally unsafe negative control; validated-input/event freezing prevents the tested argument mutators. Relay descendants are rejected by exact parent matching. All scenario assertions passed, including the negative-control assertions.

This uses a stand-in apply tool and scripted UI, not the final pstack implementation or a human TUI approval. Final pstack must reproduce these guarantees. Evidence: `/tmp/pstack-w2-conditional-dispatch/`; parent host checks: `/tmp/pstack-w2-host-parent-dgHOMr/`; independent host review: `/tmp/w2-review-UfEMON/`; author logs: `/tmp/w2-host-logs/`. Active LSP probes on parent temporary harnesses were inconclusive, not confirmed clean.

## Methodology checkpoint

Pstack `f1a9167c80224a69cbe5e3edab5de314cf9ee3a4`, after metadata checkpoint `547c39d805c632d974af9c21594529929055f317`, supplies 17 methodology files. Parent and fresh OpenAI review independently reproduced **19/19 content checks without skips** against the pinned source trees. Reviewer inspected all resources and confirmed 24 principle summaries, 23 routing rows (12 shipped / 11 planned), 96 exact future-reference tuples, public delegation parameters, authority boundaries and complete source notices.

Immutable review snapshot: `/tmp/pstack-w2-methodology-review-ryRYfY`. Parent log: `/tmp/pstack-w2-parent-content.log`.

Two setup findings must be closed during runtime integration:

1. The original read-only snippet accepts JSON scalars/arrays and malformed `models` shapes as present and may print invalid nested values. Validate relevant shapes, report invalid state without dumping values, and add behavioral cases.
2. A poteto model default does **not** shadow an explicit `model: "task:coding"` request. Explain precedence accurately; the override matters when no explicit selector is supplied. The reviewer reproduced this through the host router.

Runtime ownership already includes setup skill, its scoped tests and provenance hash. The new approved host write seam supersedes the content-stage blanket report-only wording, but direct skill invocation stays informational and no raw-writer bypass is permitted.

## Real Herdr role-startup gate: native startup failed

Parent tested the proposed `skills: poteto-mode` frontmatter on a **temporary** package derived from f1a9167 (manifest gained the two skills), against an archive of host b04906b6. The host archive was compared across all **165 tracked files**: only `test/integration/fake-provider.ts` differs. The fixture adds explicit false-fork parsing, a child-only marker task recognizer, and request capture. No production host code changed.

The standalone case passed, but the forked case failed: the child loaded the full hub, the host reported it completed from that startup turn, and the actual task was appended without executing. Parent waited for the task marker and timed out. The saved transcript and parent result corroborate premature completion; do not treat a startup-model reply as completion of the assigned task.

- Failed native run: `/tmp/pstack-w2-role-startup/startup.log` (**1 passed / 1 failed**), original observations and `child-true-1129947.jsonl`/`parent-true.jsonl` beside it.
- Control removing native skill startup: `without-native.log`, **2 passed**, fresh and forked. This control intentionally does not load the full hub.
- Turn-free bootstrap prototype: `structured-bootstrap.log`, **2 passed**, fresh and forked. A thin role retains the existing launch/tool settings and has no native `skills` kickoff. The pstack extension supplies the owned hub's full body in a named structured system-prompt section via public `before_agent_start`. Actual provider requests contain the complete hub and actual task, both tasks execute and results are delivered. Each child has one prompt, avoiding a separate startup-model turn.

These suites ran serially, used the deterministic local provider and isolated outer/child agent directories, and cleaned their fixture workspaces. Ambient `~/.agents/skills` remain visible in the real panes and are explicitly recorded in observations. The callbacks/harness are at `/tmp/pstack-w2-role-startup/`; production-host parity is in `archive-audit.json`.

**Runtime disposition:** do not enable native `skills: poteto-mode` frontmatter on this vector based only on a loader/RPC check. Prefer the proven turn-free public bootstrap for the thin role, without another host scope expansion or duplicated methodology. The final implementation must additionally handle missing/filtered/shadowed resources safely, keep this explicit-role methodology separate from sticky mode, and prove it in the final real-child matrix. The prototype's throw on a missing resource is not a finished fail-closed policy and must not be copied as one.

No live-model obedience, full final-candidate lifecycle coverage, npm-installed-package acceptance or human TUI approval has been established here. Final runtime review, combined QA, durable evidence and the human W2 gate remain outstanding.
