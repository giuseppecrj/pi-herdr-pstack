### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. Run the **how** skill (planned W4) over the affected subsystem. Until it ships, investigate it directly per `playbooks/investigation.md`.
2. Run the **architect** skill (planned W4) for parallel design exploration. Skipping stays as `architect skipped: <reason>`. Do not fold the design decision silently into implementation. Until it ships, write two or three candidate shapes with their tradeoffs, choose one, and record `architect skipped: planned W4`.
3. Write the throughput checkpoint as four checklist items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (**principle-separate-before-serializing-shared-state**, planned W3). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a `poteto` subagent per `references/delegation.md`, with `model: "task:coding"` or an exact model for the hardest changes. Give it a specific scope: file paths, the named data shape and its organizing structure per **principle-model-the-domain** (planned W3) chosen before the delegate writes logic, and success criteria. Prefer a state machine over scattered booleans, a table or registry over branching, and a typed model over repeated shape assumptions.
   When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill (planned W4) instead, so the runners surface the alternatives and the cross-judge guards the pick. Until it ships, list the valid shapes in the brief, require the delegate to justify its pick against them, have an independent bare reviewer check that pick, and record `arena skipped: planned W4`.
   Delegation here is mandatory. There is no skip-with-reason escape, and the Laziness Protocol does not override it, because the gain is review separation, not lines saved. "The app is small" is not a reason to skip it. A delegate whose brief forbids further delegation satisfies this step by owning the diff directly and asking its parent for an independent review. No "standing by" reply that waits on a nested agent.
   Comments per the hub's Comments section. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally when the commit policy allows.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits when commits are allowed. Stack follow-ups.
   Use **principle-sequence-verifiable-units** (planned W3), building, verifying, and committing each small unit before the next.
7. If the design is contested, run the **interrogate** skill (planned W4) before shipping. Until it ships, run one independent bare review on an exact model from another family and say the multi-model panel did not run.
8. Run **Opening a PR** (`playbooks/opening-a-pr.md`) only when the task authorizes a pull request. Otherwise stop at the verified local result.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase, when its brief allows. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
