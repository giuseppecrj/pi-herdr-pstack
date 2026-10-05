# Authorization

Turning on poteto-mode, an autonomy phrase or a playbook step never grants permission. This reference says what you may do on your own and what needs explicit authorization. Paths here are relative to the poteto-mode skill directory.

## Where authority comes from

1. The user's current request and every later directive.
2. Developer and repository instructions, such as the system prompt and `AGENTS.md`.
3. For a child, its delegate brief. A child has only the authority its brief names.

When these conflict, the more restrictive one wins until the user resolves it. Stop and report the conflict instead of choosing silently.

## Proceed without asking

Reversible local work inside the task's scope needs no permission. That covers reading, searching, running tests and builds, local experiments in scratch directories, edits in the working tree, local branches and worktrees you create for the task, and bounded delegation under `references/delegation.md`. Do the work, present the result, and let the human course-correct. Asking "should I?" about this work only stalls it.

## Commits

Commits follow the task's commit policy. When the user, the repository instructions or your brief allow local commits, commit liberally and shape the history as the playbooks describe. When the policy is silent or says not to commit, leave the changes uncommitted, report the diff, and keep commit steps in your checklist as `skip: commits not authorized`. Never rewrite history that someone else depends on, such as a shared or pushed branch, without explicit authorization.

## Needs explicit authorization

Explicit means the user asked for this specific action, a repository instruction grants it, or the user confirmed it when you asked. A general "be autonomous" is not explicit.

- Pushing any branch, and force-pushing above all.
- Creating, editing, retargeting, marking ready or closing a pull request.
- Replying to, resolving or reacting to remote review threads, issues or tickets.
- Triggering CI, evaluations or other remote jobs that spend money or notify people.
- Merging, landing, arming auto-merge, tagging, releasing, publishing or deploying.
- Deleting data, branches, worktrees, simulators or session history, including removal of managed worktrees.
- Sending messages to people through chat, email, comments or customer channels.
- Installing packages outside the project, changing the user's Pi settings, credentials, model preferences or installed extensions, or writing shared pi-herdr-agents configuration.
- Anything else irreversible or security-sensitive that the task did not name.

## Asking well

Ask once and concisely. Name the action, why it is needed, what it touches, the reversible alternative and your recommendation. Keep working on independent reversible work while you wait. If no answer comes and nothing reversible is left, stop at a clean boundary with `playbooks/pause-safely.md`.

## Autonomy grants

"Don't stop", "going to bed", "run until done" and "be fully autonomous" mean: keep going without check-ins, decide reversible calls yourself, and report them. A grant does not authorize the actions above unless it names them. For a call only the operator can make, apply the safest default, explain it fully, and say in plain words what the operator could choose instead.

## Delegates

A child inherits none of your authority by default. Its brief states the commit policy and any external action it may take, by name. Children are leaves. They do not push, merge, open or update PRs, delete branches or worktrees, or launch further agents unless the brief explicitly says so. Integration, cleanup and every external action stay with the parent.

## Not a sandbox

Pstack does not intercept or block shell commands. Bash runs with your full permissions in parent and child sessions. A read-only instruction, a role definition or a `tools` list limits behavior by agreement, not by enforcement. Treat that as a reason for more care, not less.
