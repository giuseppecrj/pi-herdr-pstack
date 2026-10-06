---
name: no-comments
description: "Spawn Comment Sicko as a bare delegate, fix accepted findings, and offer encodings for claimed constraints."
disable-model-invocation: true
---

# No comments

Spawn Comment Sicko. Act on accepted findings.

Defer to Comment Sicko's fresh perspective.

Paths here are relative to this skill directory.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Comment Sicko

Comment Sicko is a deliberate bare delegate, not a named role. Pstack registers no roles. Its prompt is `references/comment-sicko.md`. It edits comments in your checkout and never application code. It runs while you wait, and you review its diff. Launch it through pi-herdr-agents' `subagent` tool with this call:

```json subagent
{
  "name": "comment-sicko",
  "task": "Scope: <the caller's files, or the diff against <base> including the working tree>.",
  "systemPrompt": "<the full text of references/comment-sicko.md, verbatim>",
  "tools": "read, bash, edit",
  "model": "task:review",
  "thinking": "medium",
  "fork": false
}
```

- Read `references/comment-sicko.md` and pass its full contents as `systemPrompt`. Do not paraphrase, shorten or add to it.
- If that file is missing, unreadable or filtered out of this package, stop and report it. Never launch Comment Sicko, or any bare child in its place, without that prompt.
- Choose `model` at launch. Use `task:review`, or an exact authenticated `<provider>/<model-id>` from the live catalog when the review must come from a different model family than the author. Use `medium` thinking, or `high` for a large diff.
- `fork: false` gives it a fresh perspective. Give it no `worktree`. It edits the checkout you are in, so no other writer touches the scoped files while it runs.
- Bash is not sandboxed. The `tools` list narrows what it is offered, not what it can do. Step 2 is where you enforce its limits.

## Steps

1. Launch Comment Sicko with the call above and the scoped files or diff in `task`. Do not restate its rules.
2. Inspect its report and diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, and flags that treat kept intentional code as guilty. Reshape flags on our-code surprises stay actionable. Do not restore those comments. A keep survives only with proof it is about something we cannot change. Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions stay actionable `MUST KILL`s. Restore deletions only with exact exceptions and scoped proof. Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, run `/skill:how` or `/skill:why` on their symbol (planned W4). Until they ship, read the symbol, its callers and its history yourself, and say the skills were unavailable. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail `/skill:no-comments`.
3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, run `/skill:architect` once for the accepted set and surrounding code (planned W4). Until it ships, sketch two or three shapes yourself with their tradeoffs, and record `architect skipped: planned W4`. Stop at the sketch. Architect shapes. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. The **principle-fix-root-causes** and **principle-redesign-from-first-principles** skills (planned W3) guide intent only. Neither authorizes widening the fence nor fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.
6. Report that Comment Sicko ran as a bare delegate, then the deletion count, restored comments, reruns, architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
