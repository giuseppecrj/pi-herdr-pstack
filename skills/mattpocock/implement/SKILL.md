---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask. The issue tracker should have been provided to you: the `## Agent skills` section of `AGENTS.md` (or `CLAUDE.md`) points at `docs/agents/issue-tracker.md`. If not, tell the user to run `/skill:setup-repo`. Run every tracker command the way the tracker doc writes it, with the repo it names (`-R <owner>/<repo>`), never the CLI's implicit default repo.

Load the `tdd` skill (read `../../pstack/tdd/SKILL.md`) and follow it where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, load the `code-review` skill to review the work. Find its `SKILL.md` in your available skills list, or at `../../*/code-review/SKILL.md` in this pack (Pi hides skills that disable model invocation from that list). If it isn't installed, tell the user the review was skipped and why; don't stand in for it with another skill.

Commit your work to the current branch.
