---
name: tdd
description: "Test-driven development: features test-first through red → green, and bug fixes with a regression test that fails before the fix. Use only when the user explicitly asks for TDD, test-first work, red-green-refactor, a failing test, a regression test or integration tests, OR when the bug has an obvious cheap local test target. Skip when the test path is unclear, expensive, integration-heavy, or not requested."
disable-model-invocation: true
---

# Test-Driven Development

TDD is the red → green loop. It builds a feature one tested slice at a time, and it fixes a bug by making the broken behavior executable before changing production code. This skill is the reference that makes that loop produce tests worth keeping: when to use it, what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

**What invoking this skill grants.** Edits to the tests and production files the task needs, and the commits its commit policy allows. It grants no push, pull request or tracker write: those need the user's own grant. Loading the skill without the user invoking it, from another skill or as a delegated child, grants nothing beyond what that skill's or brief's own grant names.

## When to use it, and when to skip

Use it when the user asks for TDD, test-first work, red-green-refactor, a failing test, a regression test or integration tests, or when a bug has a clear, cheap test path.

Do not force a test when it would be impractical. If the available test would require broad harness setup, brittle mocks, slow end-to-end infrastructure, production-only state, vague reproduction steps, or large unrelated fixture churn, skip adding a new test and use the closest useful verification instead (see **If a failing test is impractical**). Say so when you skip, and why, in your final response. When the user explicitly asked for TDD, a failing test or a regression test, tell them before you substitute the closest check, instead of quietly dropping the test. Prefer no new test over a bad test. A bad test mostly tests mocks, encodes current implementation details, depends on timing or unrelated global state, needs expensive infrastructure for a small fix, or would be deleted immediately after proving the fix.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure. It encodes intended behavior, not a mirror of the current implementation.

See `tests.md` for examples and `mocking.md` for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?" Give each proposed seam a one-line note on what it catches and what it misses. For a bug with an obvious cheap test path, the proposal is that test path, the closest existing unit, component, integration or regression test for the codepath, and the confirmation is one line. Seams the user already confirmed in a spec or ticket (`/skill:to-spec` asks for them) count as agreed. A delegated child takes its seams from its brief, or from a spec or ticket the brief points at that already confirms them; when neither names any, it reports its proposed seams and writes no test at a guess.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), load the `codebase-design` skill (read `../../mattpocock/codebase-design/SKILL.md`) for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run. If it is not available, say so and use the terms above.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **Run it red.** Run each new test before writing the code for it and confirm it fails for the intended reason. If it passes, or fails for an unrelated reason, correct the test or the reproduction before editing the implementation.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle. For a bug, the slice is the regression test and the smallest production change that satisfies the intended behavior while preserving nearby contracts.
- **Rerun it green.** Rerun the test after the change and confirm it now passes, then run the nearby tests.
- **Refactoring is not part of the loop.** It belongs to the review stage (the `code-review` skill, when one is installed; this pack's is `../../mattpocock/code-review/SKILL.md`), not the red → green implementation cycle.

## Fixing a bug

1. **Understand the bug.** Identify the intended behavior, current behavior, affected path, and smallest observable reproduction.
2. **Choose the narrowest executable check.** Prefer the closest unit, component, integration, or regression test already used for that codepath. If no practical test path is obvious, do not create one from scratch just to satisfy the workflow.
3. **Write the failing test first** at the agreed seam: the smallest focused test that would have caught the bug.
4. **Run it before fixing.** Confirm it fails for the intended reason.
5. **Fix the bug** with the smallest production change that satisfies the intended behavior.
6. **Rerun the regression test.** Confirm it now passes.

Building a feature is the same loop repeated: pick the next behavior, write its test at an agreed seam, run it red, write the minimal code, run it green.

## If a failing test is impractical

Use the closest executable regression check instead: a targeted script, manual reproduction command, browser automation, snapshot comparison, log assertion, or focused integration check.

## Guardrails

- Do not change tests merely to match a wrong implementation.
- Do not weaken existing assertions unless the expected behavior has genuinely changed and the reason is clear.
- Keep the regression test focused on the bug. Avoid broad fixture churn or unrelated coverage expansion.
- If the bug is flaky, make the test deterministic where possible and document the signal being locked down.
- If the bug exposes a broader class of failures, first land the focused regression path, then consider additional sibling coverage.

## Final response

Report the evidence, not just the outcome:

- Name the failing-before test or executable check and the failure it produced.
- Name the passing-after test run and any nearby validation performed.
- If failing-before evidence could not be demonstrated, state why and describe the closest regression check used instead.
