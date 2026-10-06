### Session pickup

**You own the resume point. Read the prior trail, don't redo it.**

1. Locate the prior trail. In a shell, `$PI_SESSION_FILE` names the active session's JSONL file, and it is unset for an in-memory session. Earlier sessions for this working directory are in Pi's session directory, by default under `~/.pi/agent/sessions/` and grouped by working directory, unless `PI_CODING_AGENT_SESSION_DIR` or `--session-dir` moves it. Read only the sessions for this working directory. Searching other projects' sessions crosses into unrelated private work. The **recall** skill searches them for you under the same rule. A pushed branch, a handoff report or a resume note from `playbooks/pause-safely.md` is also valid evidence. Read the metadata overview and last messages first, then scan back for the decision points.
   Parse a long transcript in a subagent and keep the reduced timeline in the main thread (**principle-guard-the-context-window**).
2. Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open checklist items, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass means you're treating the trail as untrustworthy when it's authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here. The routed playbook owns the rest.
5. Verify the inherited claims against the original goal on the real artifact (**principle-prove-it-works**). A passing prior self-report is not the proof.

The prior agent's authority does not carry over. Re-read the current request and repository instructions before any action in `references/authorization.md`, even if the prior trail shows it was approved earlier.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
