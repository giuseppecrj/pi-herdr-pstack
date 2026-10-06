### Visual parity

**You own pixel-exact equivalence. The baseline is the spec. You do not touch it.** Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask, don't edit it.
3. Migrate one component at a time. Parallelize across worktrees, one owner per component, with each writer on its own `worktree` branch per `references/fan-out.md` (**principle-separate-before-serializing-shared-state**). Shared primitives migrate first as a blocking phase.
4. Verify each component against its baseline via image diff on the matching surface, driven through the project's verification skill (the **create-verification-skill** skill generates one when the repo has none). A nonzero diff is a fail. Investigate the pixel delta. Loop per component until the diff is zero. Each fix round is a fresh child whose delivered result wakes you, so the loop needs no timer.
5. Run **Opening a PR** (`playbooks/opening-a-pr.md`) per component or per safe batch, only when the task authorizes a pull request. Otherwise stop at the verified local commits.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.
