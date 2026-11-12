### Autopilot-stack

Run the Autopilot-full playbook, but do not merge.

**Scope in this release.** The scope of `playbooks/autopilot-full.md` applies unchanged. The root, this session, runs the program and launches every child. Each owner round is a fresh leaf child, and the root runs every swarm and watcher. The root audits at each child delivery, each stall or no-progress advisory, and on the operator's request, never on a timer. Pushing and creating or retargeting PRs each happen only under an operator grant that names that action. This playbook never merges. Every audit re-reads this file from the installed pstack skill directory, so each wake sees the no-merge rule.

1. **In place of Autopilot-full step 5, stop at verified.** Stop when each PR is verified and green at its current head, then hand the PRs to the operator as STACK-READY. After the handoff, nobody pushes without the operator's go.
2. **Stack a PR only when it builds on another PR.** This is the one exception to Autopilot-full step 3. Base the PR on the other PR's branch in place of trunk, per **Size and stacks** in `playbooks/opening-a-pr.md`. In place of Autopilot-full step 2's rebase onto trunk, each PR rebases onto its parent PR's branch, and the stack root rebases onto trunk. A new head on the lower PR restacks the PRs above it, and a PR whose `git patch-id` the restack leaves unchanged keeps its verdict under the patch-id rule in `playbooks/shipping.md`. The root remains the only topology writer: owners push only their own canonical PR branch, and only the root rebases or retargets a link, under the grants that name those actions.

**Choosing between the autopilots.** Autopilot-full when the PRs are independent and the operator's grant names merging. Autopilot-stack when the operator wants review before landing, the work is sequenced or coupled, or merge authority is withheld.

**Reply:** list each PR with its verdict, in place of what merged. Name which external actions ran under which grant, and anything parked or excluded with the reason.
