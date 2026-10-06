---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The active transcript is `$PI_SESSION_FILE`, set in the bash tool. Use it directly when present. To choose an earlier transcript for this working directory, read only this working directory's sessions, per the session directory rule in `../poteto-mode/playbooks/session-pickup.md`. Never glob Pi's global session directory. If no session file resolves, write a tight digest of the current session and pass that instead.

### 2. Spawn three reviewers in parallel

Three independent bare `subagent` calls in one turn, per `../poteto-mode/references/fan-out.md`, each with a prompt that forbids file writes as its `systemPrompt` (`fork: false`) and no `tools` list. Reviewers may use MCPs available to their Pi child process for context lookups (tickets, chat threads, observability traces referenced in the transcript). The parent applies edits.

| Lens | `model` | Prompt template |
|---|---|---|
| Judgment | `task:review` | `references/judgment-reviewer.md` |
| Tooling | `task:review` | `references/tooling-reviewer.md` |
| Divergent | `task:review` | `references/divergent-reviewer.md` |

Pass each template verbatim as `systemPrompt`, and put the transcript path for `<ABSOLUTE_PATH>`, or the digest, in `task`. Reviewers return findings in their delivered `subagent` results.

```json subagent
{
  "name": "reflect-judgment",
  "task": "<ABSOLUTE_PATH> is <the transcript path>. <Or: no path; the digest follows: ...>. Do not write files. You are a leaf: launch nothing.",
  "systemPrompt": "<the full text of references/judgment-reviewer.md, verbatim>",
  "model": "task:review",
  "thinking": "high",
  "fork": false
}
```

The tooling and divergent reviewers differ only in `name` and prompt file.

### 3. Synthesize

After all three reviewers have delivered, one bare `subagent` call on `task:review` with no `tools` list. The synthesizer may use MCPs available to its Pi child process to spot-check citations. Use `references/synthesizer.md` verbatim as `systemPrompt`, with each reviewer's full output in `task` under its marker.

```json subagent
{
  "name": "reflect-synthesizer",
  "task": "<JUDGMENT_OUTPUT>: <the judgment reviewer's full output>. <TOOLING_OUTPUT>: <the tooling reviewer's full output>. <DIVERGENT_OUTPUT>: <the divergent reviewer's full output>. Do not write files. You are a leaf: launch nothing.",
  "systemPrompt": "<the full text of references/synthesizer.md, verbatim>",
  "model": "task:review",
  "thinking": "high",
  "fork": false
}
```

The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **principle-encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items go to whatever devex / backlog tracker your team uses. Filing one is an external action under `../poteto-mode/references/authorization.md`, so present the Backlog list with the Accepted list and file only the items the user approves.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): draft, test and iterate it per the authoring playbook (`../poteto-mode/playbooks/authoring-a-skill.md`) and Pi's skills documentation (`docs/skills.md` in the installed Pi package).
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rewrite the description per Pi's skills documentation, which says the description determines when the model considers loading the skill.
- `new skill via Pi skill authoring: <kebab-name>`: create it per the authoring playbook (`../poteto-mode/playbooks/authoring-a-skill.md`) and Pi's skills documentation. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker with the user's approval: `<issue title>` (`<tags>`). One line each. List unapproved Backlog items as not filed.
- Dropped: one line per rejected finding + reason from the synthesizer.
