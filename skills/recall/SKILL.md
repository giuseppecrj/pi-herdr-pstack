---
name: recall
description: "Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. Use for 'recall my work on X', 'catch me up', 'what have I been working on', 'where did I leave off', before starting or resuming work."
disable-model-invocation: true
---

# Recall

**Before you start or resume work, you rebuild the user's recent working context and hand back a tight capsule of where things stand now and what to do next.**

Keep it tight and on-topic. Read only what the in-scope threads need, then stop.

Your context lives in two records. Your own chat history holds what you did and decided. The shared record holds everything that happened around the same code under other names: the symptoms users keep reporting, the fixes that shipped and got reverted, the errors still firing in prod. That second record is what the **why** skill (planned W4) searches, across source control, the issue tracker, chat and issue channels, long-form docs, and error tracking. A feature with a long bug tail keeps most of its story there, so don't reconstruct it from your transcripts alone.

The active Pi session file is available in bash as `$PI_SESSION_FILE`, and it is unset for an in-memory session. Earlier sessions for this working directory follow the per-cwd session directory rule in `../poteto-mode/playbooks/session-pickup.md`: by default each one is a `<timestamp>_<session-id>.jsonl` file under `~/.pi/agent/sessions/--<path>--/`, unless `PI_CODING_AGENT_SESSION_DIR` or `--session-dir` moves it. List that one directory rather than guessing a path or scanning another project.

1. Classify, then route. One specific prior chat to resume is the Session pickup playbook (`../poteto-mode/playbooks/session-pickup.md`), not this. Turning habits into a durable skill is `automate-me`. A human-readable summary of your work is a different task. Recall loads working context across recent chats before you act. If the user already gave you a full state capsule (paths, branch, the change), use it and skip the mining.
2. Lock the scope before searching. Pin the window ("recent" is a real range, default the last 7 days), the topic if named, and the workspace (default the active one. Never read another project's transcripts without being asked). State the scope back. Never quietly turn "all" into "recent N".
3. Fan out across your chat history. Launch one bare investigator child per slice of the corpus, as independent `subagent` calls in one turn per `../poteto-mode/references/fan-out.md`, with `model: "task:recon"` and low thinking. Give each child its slice as explicit session file paths from this working directory's session directory. Tell every child to order candidates by real modification time (`ls -t`) and never by session id, grep the topic first and then read only the matching chats and only their relevant regions, and skip the current session (`$PI_SESSION_FILE`) plus obvious noise (subagent, eval, and test chats). Each returns the same schema, one block per chat: topic, the user's goal, decisions, open threads, struggles and corrections, and artifacts (PRs, tickets, branches), each citing the session file. For one or two chats, skip the fan-out and search directly. The raw transcripts stay in the children. The main thread gets only their findings. A child that runs this skill does the single-pass path itself and launches nothing.
4. Sweep the shared record whenever the topic names a feature, file, subsystem, area, or bug. This is the default, not a judgment call, and "my work on X" does not exempt it. Hand it to the **why** skill's source investigators (planned W4), but steer their question from "why was this built this way" to "what's the current state, what's been tried and didn't hold, and what are users still reporting". Reuse its per-source playbooks once it ships, run the investigators in the same turn as the chat-history mining, and inherit its posture: one investigator per source, null results are findings, skip an unavailable MCP and say so. Until **why** ships (planned W4), launch the source investigators yourself: one bare child per source with the Investigator prompt from `../poteto-mode/references/delegation.md`, `task:recon`, and no `tools` key, so the child keeps the MCP servers configured in `mcp.json`. A child that cannot see an MCP server reports source control only and names the gaps. Fold what comes back into the brief. Skip this step only for pure activity recall with no named target ("what did I do this week"), where your own history and live state are the entire answer.

```json subagent
{
  "name": "recall-sweep-git",
  "task": "Shared-record sweep for <topic>, source: source control. What is the current state, what was tried and did not hold, what do users still report? Cite commits, PRs and file:line. Null results are findings. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Investigator prompt in ../poteto-mode/references/delegation.md, verbatim>",
  "model": "task:recon",
  "thinking": "low",
  "fork": false
}
```

5. Verify against live state. Take the PRs, branches, and tickets that the mining and the sweep surfaced and check them with `git` and `gh`. When the answer hinges on what an agent actually did (the tools it ran, files it read, errors it hit), read the full session file, not just a trimmed local copy.
6. Write the brief to the contract below. Group by thread. Stay on the named topic.

## Output contract

Lead with the capsule, then the thread status, then the problems, then the next move. Deeper detail goes below or gets cut.

- **Capsule.** At most 5 bullets. What this work is and where it stands overall.
- **Threads.** One line each, prefixed with exactly one status tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, or `[planned, not started]`. A thread with no tag is not done yet, so tag it.
- **Problems.** At most 5, the recurring ones. Include the symptoms users keep reporting and any fix that shipped and was reverted, so the next attempt starts where the last one failed.
- **Next move.** The single most useful next action, concrete.

An adjacent feature or ticket stays out unless it blocks this one. When the capsule and thread lines outgrow a screen, cut detail before you cut threads. Write the brief through the **unslop** skill, cite chat findings by session file and shared-record findings by their source (PR #, ticket ID, chat permalink, error-tracker issue), and sanitize private context before any public output.

**Reply:** the brief, to the contract above.
