# Wave 3 handoff

Status: **candidate complete, awaiting the human Wave 3 gate.** Nothing is pushed or merged for Wave 3. Wave 4 has not started.

## Exact revision vector (I3)

| Component | Branch | Head | Notes |
| --- | --- | --- | --- |
| Pstack | `wave3/integration` (local) | `d611b6a` | base `main` `e2cf538`; C0 `0c4187c`; W3-A `9f80152`; W3-B `d3e844f`; merged `36060fb`; reconcile `f884fa8`; parent edit `d611b6a` |
| Host | `main` | `7d35371` | pack-neutral, conditional writer, operating skill, `subagent_cancel` |
| Roles | `main` | `3b75aa4` | unchanged |
| Pi CLI and SDK | 1.0.3 | | |
| Sources | Mimir `f07dd981`, Cursor `2cbf5850` | | pinned; all 39 source files accounted for once |

## What Wave 3 delivers

- 35 skills, bringing the shipped total to 37 of 51: the 24 `principle-*` leaves, `tdd`, `correct`, `benchmark-checklist`, `blast-radius`, `typescript-best-practices`, `unslop`, `bro`, `technical-writing`, `teach`, `no-comments`, `poteto-help`.
- 22 files are byte-identical copies of the pinned Mimir sources; 17 are adaptations with one primary source each and an explanation per file. The only edit classes used: relative links to skill-relative paths, short principle names to full names, `(planned W4)` markers with honest interim rules, dropping Cursor's `paths:` key, and the Pi re-authoring of `poteto-help`.
- comment-sicko ships as a **bare delegate** prompt at `skills/no-comments/references/comment-sicko.md`, per your decision. It edits comments only, reports touched files and counts, and pstack still registers no role.
- The hub's 24 principle summaries now point at shipped leaves with no planned markers; "planned W3" no longer appears anywhere under `skills/`. 93 forward-reference tuples remain, all to Wave 4 targets.
- Attribution added for two sentences in `technical-writing` quoted from Diátaxis and the ASD-STE100 FAQ; the copied skill bytes are unchanged.

## Evidence

| Gate | Result |
| --- | --- |
| Pstack `npm run check`, all inputs, isolated outer state, at `d611b6a` | 119 passed, 0 failed, 0 skipped |
| Copied-file hashes vs pinned sources (parent, independent) | 22/22 match |
| Cross-family reviews (OpenAI, against pinned sources) | C0 n/a; W3-A no blockers; W3-B three additive findings, all fixed in reconcile; reconcile no blockers |
| comment-sicko real-child gate, real Herdr, fresh and fork | 2/2: task executed, narrating comments removed and the why-comment kept, child bare, pstack skills visible, one initial prompt, no fallback request |
| Combined host integration, host `7d35371` + roles + pstack `f884fa8` | 77 passed, 0 failed, 0 skipped |
| `npm pack --dry-run` | 56 skill files; no plans, evidence or `agents/` |

Evidence: `docs/evidence/wave3-gates/` (gate logs, provider request dumps, test, overlays, manifest with hashes).

## A host fact the gate surfaced

For a bare spawn, pi-herdr-agents delivers `systemPrompt` as a role block at the top of the child's first message (artifact-backed when long). It does not append it to the system prompt, and **fork mode drops it entirely**. The first gate run asserted the wrong channel and failed on that assertion only; the corrected gate passes and the first-run log is kept. Consequence: a bare delegate that relies on a reference prompt must use `fork: false`. The `no-comments` skill and the delegation reference now say so (parent edit `d611b6a`, two sentences, not separately reviewed). The host README and operating skill do not document this; recommended follow-up in the host repo, outside this wave.

## Known limits

- Deterministic provider and scripted dialogs; no live-model obedience or human TUI exercised.
- `poteto-help` describes 14 Wave 4 skills as planned; its routing table is complete but those rows are not usable yet.
- The `no-comments` interim rules for the absent `how`, `why` and `architect` skills mean an interim run deletes more comments than upstream would; this is stated in the skill.
- The thin-content rule was relaxed to "copied, or at least half the source length unless explained" so the 7-line `bro` skill ships as upstream wrote it.
- Installed-package behavior was not exercised; all runs used local package paths.

## Decisions for the gate

1. Accept Wave 3.
2. Push `wave3/integration` and open the pstack PR against `main`, then merge.
3. Start Wave 4 planning: the 14 remaining skills and 11 playbooks, several of which depend on each other and on multi-model tooling.
