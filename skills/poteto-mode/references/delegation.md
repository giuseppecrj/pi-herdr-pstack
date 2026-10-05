# Delegation

How poteto-mode delegates through pi-herdr-agents' `subagent` tool. You, the parent, own the plan, every child's brief, the synthesis, integration and cleanup. Paths here are relative to the poteto-mode skill directory.

## Who to launch

| Need | Launch |
| --- | --- |
| Write or change code, tests or docs | `agent: "poteto"`, the role this package ships |
| Read-only investigation or reconnaissance | A bare delegate with the Investigator prompt |
| Independent review of a diff, plan or design | A bare delegate with the Reviewer prompt |
| Verification of a claimed result | A bare delegate with the Verifier prompt |

- Pstack depends on no optional role pack. Name only `poteto` in `agent`, unless the user asks for another installed role by name.
- A bare delegate is a deliberate choice made before launch. Omit `agent`, pass the reference prompt below as `systemPrompt`, and say in your reply that the child was bare.
- If a `poteto` launch fails because the role is not discovered, stop and report the diagnostic. Typical causes are pi-herdr-pstack not loaded in that scope, a project or global `poteto` overriding it, or a host collision. Never relaunch the same work as a bare agent to get past the failure.
- When ownership matters, check `subagents_list`. It shows every role and where it came from. A project or global `poteto` overrides this package's role.

## The brief

Every child gets a self-contained brief. A standalone child cannot see your conversation. A forked child sees the conversation but not your intent, so state the intent anyway.

1. **Outcome.** One bounded result, and how you will judge it.
2. **Scope.** The files and directories it may read and change. Everything else is off limits.
3. **Tools.** What it may use. A `tools` list narrows the surface. It is not a sandbox, and bash can still write.
4. **Outputs.** The artifact it hands back: a report, a commit SHA, a diff, a table, a file path.
5. **Verification.** The exact command or observation that proves the result, which the child runs before it reports.
6. **Commit policy.** Commit or leave uncommitted, and on which branch. No push, merge, PR operation, or branch or worktree deletion unless the brief names that specific action. See `references/authorization.md`.
7. **Session and worktree mode.** `fork: false` gives a fresh standalone child and is the usual choice. Use `fork: true` only when the child truly needs the conversation. Each parallel writer gets its own `worktree` branch, based on committed state. Uncommitted parent changes are not copied into a worktree. Read-only children run in an ordinary pane.
8. **Delegation.** Children are leaves. Say so, or name exactly what further delegation is allowed.
9. **Methodology.** For `poteto`, name the playbook that applies. For a bare child, the reference prompt is the methodology.

## Model and thinking

- Set `model` and `thinking` explicitly for every child. Omitting them inherits the parent runtime, which is a discouraged fallback.
- Ordinary work uses a task category as the entire `model` value: `task:coding`, `task:review`, `task:recon`, `task:qa`, `task:architecture` or `task:docs`. A category expands to the shared pi-herdr-agents preferences that `/setup-pstack` reports.
- Independence-sensitive review uses an exact authenticated `provider/model-id` from the live catalog that pi-herdr-agents puts in your system prompt. Pick one from a different model family than the author. A task category alone does not prove independence.
- If no other authenticated family exists, an ordinary review may use a same-family model in a fresh standalone session. Label it context-isolated, not cross-family. Cross-family verification has no such fallback, so report that gate as incomplete.
- Never write a model alias, a fuzzy name or a remembered model ID. Choose from the live catalog at launch time.
- Thinking follows difficulty. Use `minimal` or `low` for mechanical work, `medium` for ordinary implementation or review, and `high` or above for architecture, security and hard diagnosis.

## Reference prompts for bare delegates

Pass the matching prompt verbatim as `systemPrompt`, and put the specifics in `task`.

### Investigator

```text
You are a read-only investigator. Answer the question in your task with citations: file:line references and command output. Do not edit, create, delete, commit or push anything, and do not launch subagents. Bash is available but not sandboxed. Use it only to read, search and run the non-mutating commands your task allows. If an answer would require a change, stop and describe the change and why. Report the answer, the evidence, open questions and what you did not check.
```

### Reviewer

```text
You are an independent reviewer. Review the diff, commit range, plan or design named in your task against its stated intent. Do not edit files, commit, push, comment on remote reviews or launch subagents. Run the checks your task names, and any read-only commands you need to confirm a finding. For each finding give its severity (blocking, should-fix or nit), location, evidence and a concrete fix. State what you did not review. Agreement with the author is not the goal.
```

### Verifier

```text
You are a verifier. Reproduce each claimed result named in your task on the real artifact. Run the exact commands, drive the real surface and compare against the stated expectation. Do not fix anything, commit, push or launch subagents. Report pass, fail or inconclusive for each claim, with the command, its output and your reasoning. A wrong-surface or proxy check is inconclusive, not a pass.
```

## Examples

Each block is one `subagent` call using the tool's real parameters. Text in angle brackets is a placeholder you replace before launch. `<provider>/<model-id>` stands for an exact ID you pick from the live catalog. It is not a runnable value.

An implementation delegate through the pstack role, standalone in the current checkout:

```json subagent
{
  "name": "login-build",
  "agent": "poteto",
  "task": "Bug fix playbook. <symptom and repro command>. Allowed files: src/auth/**, test/auth/**. Verify with `npm test -- test/auth` and paste the failing-then-passing output. Commit on the current branch; do not push, open a PR or launch subagents. Report the commit SHA.",
  "model": "task:coding",
  "thinking": "medium",
  "fork": false
}
```

One of two parallel writers, each in its own managed worktree based on committed HEAD:

```json subagent
{
  "name": "login-api",
  "agent": "poteto",
  "task": "Feature playbook, API slice only. <outcome>. Allowed files: src/api/login/**, test/api/login/**. Verify with `npm test -- test/api/login`. Commit in your worktree; do not push, merge, open a PR or remove the worktree. Report the base and result SHAs.",
  "model": "task:coding",
  "thinking": "medium",
  "fork": false,
  "worktree": { "branch": "login-api" }
}
```

A bare investigator:

```json subagent
{
  "name": "login-research",
  "task": "Where is the session token refreshed, and what calls it? Cite file:line. Read-only.",
  "systemPrompt": "<the Investigator prompt above, verbatim>",
  "model": "task:recon",
  "thinking": "low",
  "tools": "read, bash",
  "fork": false
}
```

A bare independent reviewer on an exact model from another family than the author:

```json subagent
{
  "name": "login-review",
  "task": "Review commits <base>..<head> on branch <branch> against this intent: <intent>. Run `npm test`. Read-only.",
  "systemPrompt": "<the Reviewer prompt above, verbatim>",
  "model": "<provider>/<model-id>",
  "thinking": "high",
  "tools": "read, bash",
  "fork": false
}
```

## After launch

- Results arrive automatically as a new turn. Do not sleep, poll, tail session files or call list tools to check on a child. Work on something independent or end your turn.
- A worktree child's result is a retained handoff, not an accepted change. Inspect its diff against the reported base, rerun the relevant checks, then integrate deliberately. Its worktree stays until someone removes it explicitly, and removal falls under `references/authorization.md`.
- Resuming a session does not reattach its worktree. Continue worktree-bound follow-up in that workspace, or start a fresh child there.
- Prefer a fresh child with consolidated scope over resuming or messaging an old one. The hub's Subagents section says when reuse is justified.
- Review every diff yourself and write your own summary. Rerun the child's verification when the result matters.
- Stop or interrupt a child only when its work can no longer be used. `/poteto-mode off` does not stop running children.
