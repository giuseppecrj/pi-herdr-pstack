### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.**

An autonomous run is permission to keep working, not permission to act externally. The actions in `references/authorization.md` still need explicit authorization, and the predicate cannot require one the user has not granted.

1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N authorized PRs merged, pixel-diff zero).
2. Pick the wake mechanism. Subagent results arrive automatically as a new turn, so a child's completion never needs polling. To wait on an external event (CI, a merge, a ref advancing), launch a bare watcher child per `references/delegation.md` whose brief names the event, the read-only command that detects it and a time budget. It returns when the event fires or the budget runs out, and its result wakes you. Without an event, run your own bounded loop at a fixed interval sized to when the result is worth re-checking. Never sleep-poll a subagent or tail its session.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced and the commit policy allows, and discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
   Sequence the work via **principle-sequence-verifiable-units** (planned W3), verifying each unit before the next instead of batching checks at the end.
4. Mid-run discoveries are yours. Address broken skills, related bugs, flaky verifiers, review noise, tooling failures, orphaned follow-ups, and fixable drift yourself via poteto-mode. Put out-of-band fixes in their own commit, or their own PR when PRs are authorized. Do not park reversible work for the human or use a user question tool for it. Surface only actions that need authorization, genuine product or preference calls no experiment can settle, or a real dead end. Keep the predicate as the main drive, and return to it after each side fix.
5. Checkpoint every iteration via the **show-me-your-work** skill (planned W4), a row for what changed and whether the predicate moved. Until it ships, append that row to a local Markdown decision log and give its path in the reply.
6. Stop when the predicate is met. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory.

**Reply:** the exit condition, iterations run, what landed, what was discarded, final predicate state.
