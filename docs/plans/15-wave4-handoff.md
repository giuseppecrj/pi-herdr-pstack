# Wave 4 handoff

Status: **candidate complete, awaiting the human Wave 4 gate.** This is the full-inventory milestone: all 51 skills and all 23 playbooks ship, with no planned markers and no forward-reference exceptions left. Nothing is pushed or merged for Wave 4. Wave 5 (release) has not started beyond the CI scaffolding the user requested separately.

## Exact revision vector (I4)

| Component | Branch | Head | Notes |
| --- | --- | --- | --- |
| Pstack | `wave4/integration` (local) | `07ef8fd` | base `main` `2f5de1a`; C0 `dc48221`; W4-A `7d6de65`; W4-B/P `6455147`; merged `ad21cfc`; reconcile `fbde197`; parent `2726104` (marked devDependency); fix `07ef8fd` |
| Host | `main` | `7d35371` | unchanged |
| Roles | `main` | `3b75aa4` | unchanged, not a dependency |
| Pi CLI and SDK | 1.0.3 | | |
| Sources | Mimir `f07dd981`, Cursor `2cbf5850` | | all 56 W4 source files accounted for once |

## What Wave 4 delivers

- 14 skills: `how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `figure-it-out`, `automate-me`, `recall`, `show-me-your-work`, `create-verification-skill`, `maintain-verification-skill`, `make-bot-ui`. 11 playbooks: hillclimb, eval, visual-parity, authoring-a-skill, babysit, shipping, autopilot-full, autopilot-stack, multi-phase-plan, orchestrate, worktree-cleanup. Two scripts: `show-me-your-work/scripts/log.sh` (copied, 100755) and `poteto-mode/scripts/check-plan.mjs` (adapted, with unit tests).
- Package totals: 113 skill files, 49 copied byte-identical, 61 adapted with one primary source and an explanation each, 3 new (`fan-out.md`, `comment-sicko.md` prompt, re-authored `make-bot-ui`).
- One shared protocol, `references/fan-out.md`, replaces upstream's runner, ledger and loop. Fan-out happens only from the parent session; children are bare with `fork: false`; the one-shot watcher child is the only wait primitive; no timers; `subagent_cancel` for stalls; children hand delegation back to the root.
- Scoped-down workflows, each stating its limits in its own text and in its hub route: babysit and shipping (`gh` only, watcher waits, merge queue means report and stop, every push, reply, re-run, arm or merge needs its own grant); autopilot-full and -stack (root-run program, fresh owner rounds continuing in the retained owner checkout, audits on delivery never on a timer, merge only under a grant naming it); orchestrate (depth-1 single-session coordinator with a hand-kept store, explicitly not an unattended runner); worktree-cleanup (inventory via `worktree_list`, per-path authorization, simulator steps only on macOS with `xcrun`).
- `make-bot-ui` re-authored for Pi: a loopback-only local page whose server validates Host and Origin on every route, holds no key in the page, and starts a fresh `pi -p` process per request. The Cursor original was Grok-Bot-specific with an invalid Pi name.
- Content tests now: lexer-based fence integrity, schema-valid `json subagent` examples with `systemPrompt` implying `fork: false`, `why` investigators without `tools`, script shebang and mode checks, and placeholder/model-name bans that exempt only byte-identical copies plus an explicit `{path, snippet}` allowlist.

## Evidence

| Gate | Result |
| --- | --- |
| Pstack `npm run check`, all inputs, isolated outer state, at `07ef8fd` | 136 passed, 0 failed, 0 skipped |
| Real Pi 1.0.3 loader | 51 skills, zero diagnostics, all explicit-only except `setup-pstack` |
| Copied-file hashes vs pinned sources (parent, independent) | 49/49 match |
| Cross-family reviews (OpenAI, against pinned sources and the contract) | C0 n/a; W4-A 4 should-fix items fixed and re-verified; W4-B/P 2 P1 + 3 P2 fixed and re-verified; reconcile 5 items fixed and re-verified (no blockers) |
| Host gates G1-G7, real Herdr, host `7d35371` | 8/8: fan-out, dropout and cancel, candidate worktrees, watcher child, MCP visibility, caller_ping (two cases), nesting |
| G8 comment-sicko real-child gate on pstack `2726104` | 2/2 (fresh and fork); `no-comments` unchanged since |
| Combined host integration, host + roles + pstack `2726104` | 77 passed, 0 failed, 0 skipped |
| `npm pack --dry-run` | 124 files; 113 skill files plus the two scripts; no plans, evidence or `agents/` |

Evidence: `docs/evidence/wave4-gates/`.

## Host facts the gates established

- A child launched without a `tools` key sees MCP tools; a restricted child does not (G5).
- A bare child is delivered to its parent before its grandchild finishes, and the grandchild's result reaches nobody (G7). Children are leaves by host behavior, not by convention.
- An ordinary child exits after `caller_ping`; the ping must carry everything (G6b).
- A blocked watcher wait draws one informational no-progress advisory per idle minute; the delivery still wakes the parent (G4). Watch arms must carry a wall-clock bound.

## Known limits

- Deterministic provider and scripted dialogs throughout; no live-model evaluation was run (user decision D7). The multi-agent workflows' quality (arena grafting, interrogate calibration, reflect routing) is unmeasured.
- Scoped-down workflows are narrower than upstream and say so; a reader skimming only the skill names could over-estimate them.
- Interim rules for absent skills are gone, but a model that ignores `fan-out.md` can still spawn nested children; G7 shows what happens then (the grandchild's work is lost).
- Installed-package behavior and the npm tarball were not exercised; all runs used local package paths.
- One environmental flake remains in the host's cancel integration test (an outer-pane assertion); host follow-up, not a pstack issue.

## Decisions for the gate

1. Accept Wave 4.
2. Push `wave4/integration`, open the pstack PR against `main`, and merge.
3. Proceed to Wave 5: the release. Decisions there are yours: drop `private`, choose the first stable version, set real peer-dependency ranges, confirm whether to publish via the CI now being set up or install from Git, and install the merged host and pstack into your actual Pi. Optional: authorize bounded live-model evaluation of the workflow skills.
