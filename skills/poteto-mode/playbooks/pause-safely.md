### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new. Stop the subagents you launched whose work cannot finish safely on its own, and record each child's name, state and worktree for the resume note. A managed worktree is retained, not removed.
2. Take no irreversible action to pause. Do not push or open a PR to pause. If a PR is already open and the task authorized pushing to it, you may push the checkpoint commit. Otherwise keep it local.
3. Make the work durable. When the commit policy allows commits, commit uncommitted edits as one clear `wip:` commit on the current branch so nothing is lost. If the tree is broken, say so in the commit body in one line. When commits are not allowed, leave the edits in place and record `git status` and the diff stat in the resume note.
4. Write the resume note off-context. Capture intent, what you were doing, progress and what's verified, current state, next steps, key files, running or stopped children, and gotchas. For the compaction trigger write it to a file like `/tmp/<slug>-resume.md`. If a decision log or a **show-me-your-work** trail (planned W4) exists, point at it instead of duplicating it.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits you made and whether the tree is clean, and the first action on resume. This is a pause, not a final report.
