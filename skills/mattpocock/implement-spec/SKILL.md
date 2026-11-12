---
name: implement-spec
description: "Implement the result of /skill:to-spec and /skill:to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you: the `## Agent skills` section of `AGENTS.md` (or `CLAUDE.md`) points at `docs/agents/issue-tracker.md`. If not, tell the user to run `/skill:setup-repo`. Run every tracker command the way the tracker doc writes it, with the repo it names (`-R <owner>/<repo>`), never the CLI's implicit default repo.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Start every subagent with a fresh context window: launch each one with pi-herdr-agents' `subagent` tool, `fork: false`, and the explicit `model` and `thinking` given for its kind below. They are bare subagents (no `agent`), so the task is the whole brief: what to do, which branch to commit to, and that it pushes nothing, opens no PR and launches no subagents of its own unless this skill names that action.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency. A launch returns once the child has started, and each child's result arrives on its own as a new turn: never sleep, poll or list status to wait for one.

## Steps

1. Read the spec and tickets to understand the task graph.

2. (optional) Use an **exploration subagent** (`model: "task:recon"`, `thinking: "low"`) to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use a fresh **implementer subagent** (`model: "task:coding"`, `thinking: "medium"`) for each ticket, each in its own worktree on its own branch (`worktree: { branch: "<ticket-branch>", base: "<integration-branch>" }`). Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;
   - loads the `tdd` skill to build the ticket: its task gives the absolute path of `../../pstack/tdd/SKILL.md`, resolved from this skill's directory, since a child can't see skills that disable model invocation;
   - merges the integration branch tip into its own branch before reporting done

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent** (`model: "task:coding"`, `thinking: "low"`, no `worktree`, so it works in this checkout on the integration branch; run one merger at a time).

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, load the `code-review` skill and run it on the integration branch. Find its `SKILL.md` in your available skills list, or at `../../*/code-review/SKILL.md` in this pack (Pi hides skills that disable model invocation from that list); if it isn't installed, tell the user the review was skipped and why, and don't stand in for it with another skill. Fix all issues raised by the code review in a single fresh **implementer subagent** (`model: "task:coding"`, `thinking: "medium"`, no `worktree`, working in this checkout on the integration branch).

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

9. Clean up all **implementer subagent** worktrees: list them with `worktree_list`, show the user that list, and remove each with `worktree_remove` once they approve (it never deletes branches).
