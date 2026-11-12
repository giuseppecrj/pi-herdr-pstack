# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `giuseppecrj/pi-herdr-pstack`. Use the `gh` CLI for all operations, and pass `-R giuseppecrj/pi-herdr-pstack` to every `gh issue`, `gh pr` and `gh label` command: a bare `gh` resolves the repo from the remotes, which can be another repo than this one (an `upstream` remote, or a fork's parent). Write that repo in `gh api` paths too, not `{owner}/{repo}`; `gh api` and `gh repo view` do not take `-R` (`gh repo view giuseppecrj/pi-herdr-pstack` is positional).

## Conventions

- **Create an issue**: `gh issue create -R giuseppecrj/pi-herdr-pstack --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view -R giuseppecrj/pi-herdr-pstack <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list -R giuseppecrj/pi-herdr-pstack --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create -R giuseppecrj/pi-herdr-pstack --parent <parent> ...`, or `gh issue edit -R giuseppecrj/pi-herdr-pstack <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/giuseppecrj/pi-herdr-pstack/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh issue create -R giuseppecrj/pi-herdr-pstack --blocked-by <n>,<n> ...` or `gh issue edit -R giuseppecrj/pi-herdr-pstack <child> --add-blocked-by <blocker>` (`gh` 2.94+). Older `gh`: `gh api --method POST repos/giuseppecrj/pi-herdr-pstack/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/giuseppecrj/pi-herdr-pstack/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/giuseppecrj/pi-herdr-pstack/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable). `gh issue view -R giuseppecrj/pi-herdr-pstack <n> --json blockedBy` also lists closed blockers, so filter it: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment -R giuseppecrj/pi-herdr-pstack <number> --body "..."`
- **Apply / remove labels**: `gh issue edit -R giuseppecrj/pi-herdr-pstack <number> --add-label "..."` / `--remove-label "..."`
- **Close**: post the explanation with `gh issue comment -R giuseppecrj/pi-herdr-pstack <number> --body "..."`, then `gh issue close -R giuseppecrj/pi-herdr-pstack <number>`. On an already-closed issue, `gh issue close -R giuseppecrj/pi-herdr-pstack --comment` drops the comment and still exits 0.

Infer the repo from `git remote -v` only when setting this file up, and have the user confirm it; after that use the repo named above.

File issues only into `giuseppecrj/pi-herdr-pstack`. Never file into either upstream these skills come from, `cursor/plugins` or `mattpocock/skills`. In a fork, `gh` can default to the upstream parent, so never rely on the implicit default: before the first `gh issue create -R giuseppecrj/pi-herdr-pstack` of a session, check that `gh repo view giuseppecrj/pi-herdr-pstack --json nameWithOwner` resolves to the repo named above, and confirm with the user if it does not.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/skill:triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view -R giuseppecrj/pi-herdr-pstack <number>`, then `gh pr view -R giuseppecrj/pi-herdr-pstack <number> --comments` (off a TTY, `--comments` prints only the comments, not the body), and `gh pr diff -R giuseppecrj/pi-herdr-pstack <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/giuseppecrj/pi-herdr-pstack/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment -R giuseppecrj/pi-herdr-pstack`, `gh pr edit -R giuseppecrj/pi-herdr-pstack --add-label`/`--remove-label`, `gh pr close -R giuseppecrj/pi-herdr-pstack`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view -R giuseppecrj/pi-herdr-pstack 42` and fall back to `gh issue view -R giuseppecrj/pi-herdr-pstack 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/skill:wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create -R giuseppecrj/pi-herdr-pstack --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: list the map's open children (`gh issue list -R giuseppecrj/pi-herdr-pstack --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (see **Count open blockers**, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit -R giuseppecrj/pi-herdr-pstack <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment -R giuseppecrj/pi-herdr-pstack <n> --body "<answer>"`, then `gh issue close -R giuseppecrj/pi-herdr-pstack <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
