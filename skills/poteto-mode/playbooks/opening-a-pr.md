### Opening a PR

Run this at the end of a code-changing playbook **only when the task authorizes opening a pull request**. Turning on poteto-mode, an autonomy grant or reaching this step does not authorize it. Without that authorization, finish with ordered local commits or an uncommitted diff, as the commit policy says. Report that no PR was opened, and give the user the branch plus the proposed title and description. Pushing and creating, editing, retargeting or marking a PR ready are all external actions under `references/authorization.md`.

**Worktree.** Work from a git worktree off main for anything nontrivial. Each parallel writer gets its own pi-herdr-agents managed worktree through the `worktree` parameter of its `subagent` call, based on committed state. Uncommitted parent changes are not copied. Sequential delegates on one branch each start from its committed tip. Dirty branch with unrelated work: save that work as a patch, make a fresh worktree, apply your change there. Snarled worktree: start a fresh one from main and redo the change minimally. Never `git reset --hard` or delete a worktree that holds someone else's uncommitted work. Removing a managed worktree is an explicit action, never automatic cleanup.

**Commits.** Commit liberally when the commit policy allows. Rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made, unpushed commit. New commit when separable. Never rewrite pushed history without authorization.

**PRs.** Run a manual cleanup pass over the diff before commit: accidental files, debug output, narrating comments, slop. Apply the **no-comments** skill before review. Write every PR title, PR description, and commit body with the **technical-writing** skill, applying every layer except Diátaxis, then apply the **unslop** skill. Use one word for each action, keep articles, and avoid `-ing` when a plain verb works.

**Titles.** Use Conventional Commits in the form `type(scope): subject`. Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type. Use the changed area, such as `pstack` or `poteto-mode`, as the scope. Keep the subject short and imperative. Name a real symbol when one carries the change. For example, `fix(pstack): retarget opening-a-pr babysit trigger`. Do not add a trailing period.

**Descriptions.** The PR body is a briefing, not the lab notebook. A reviewer who has the diff should learn why the change exists, what it leaves out, what it could break, and how you proved it works, in under a minute. Write short, simple sentences with few identifiers. Do not write walls of text. The squash commit body is the PR body. If the body would make the squash commit longer than about 40 lines, cut the body.

Put each section under a `##` heading, not a bold lead-in, so the sections stand apart. Use these sections in order. Drop a section when it has nothing to say.

- `## Why` gives the problem and the approach in one to three short sentences. Do not list SHAs or rebase genealogy. Do not add a "based on main" preamble.
- `## What changed` has one to three short bullets. Name a real symbol or path only when it carries the change. Name both sides of a rename or retarget.
- `## Scope` always names what the PR covers and what it deliberately leaves out, for example a related follow-up or a known gap. Use one to three short items. Do not list symbols or paths, and do not write a file-by-file essay.
- `## Tradeoffs` names only rejected alternatives that a reviewer would otherwise ask about. Skip this section when there was no real choice.
- `## Blast Radius` gives one or two sentences on who or what the change touches and why that is safe or risky. If main is red, state the cost of leaving it red.
- `## Verification` has one to three bullets. Each bullet names a real run path and its outcome. For a performance change, report one primary number with its unit in `before → after` form. Link the evidence directory for the rest. Do not include sample-size methodology, fan-out recitals, or metric tables.

After these sections, attach videos or screenshots when they prove a claim. Do not paste full SHAs, fan-out lane recitals, lever-correction essays, file-by-file checklists, or "CLEAN" verdicts. Put these details in a linked artifact. A commit body does not restate its subject.

**Forge.** Use the GitHub CLI (`gh`) for every PR operation: create, edit, view, watch, and merge. Confirm `gh auth status` succeeds and `gh repo view` resolves the repository. If either fails and the run provides a built-in PR tool, use the tool and report each `gh` step you could not run. If either fails and the run has no such tool, report the branch, title and description as in the no-authorization path. Do not require Graphite (`gt`).

**Built-in PR tool.** When the run provides a built-in PR tool, create, edit, retarget, and mark ready through it, never through `gh`. Its own instructions say how. A PR made with the CLI misses what the tool tracks, such as a description later runs can edit. Use `gh` for everything the tool does not cover, and for every PR operation when the run has no such tool.

**Size and stacks.** Prefer five narrow PRs to one large PR. A stack is a base-branch chain. The root PR targets trunk. Each child branch rebases onto its parent's exact tip and its PR targets the parent branch. Without a built-in PR tool, create a child with `gh pr create --base <parent-branch>`, and retarget an existing child with `gh pr edit <pr> --base <parent-branch>`. Branch from trunk only for independent work. Rebase on trunk before substantial stack work.

**Readiness.** Open every PR ready, never as a draft, unless the user asks for a draft. A built-in PR tool can default to draft, so set `draft: false` on every creation call through it. With `gh`, omit `--draft`. If a PR still opens as a draft, mark it ready through the PR tool or with `gh pr ready <number>`. Run `gh pr view <number>` before you refer to PR status.

**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. Run a separate babysit pass, the Babysit playbook (`playbooks/babysit.md`), only when the user asks for one after the whole stack exists. A babysit for each new PR stalls the build and spends checks on commits that later waves restart. Push back when feedback drifts from intent.

A subagent opens a PR only when its brief authorizes it. It first runs the **interrogate** skill, then a manual diff cleanup pass and the **no-comments** skill. Then it posts the URL and returns to the parent without babysitting. In Autopilot-full and Autopilot-stack (`playbooks/autopilot-full.md` and `playbooks/autopilot-stack.md`), an owner round's brief may assign a babysit pass. Children are leaves, so the root runs every watcher and launches each round fresh.
