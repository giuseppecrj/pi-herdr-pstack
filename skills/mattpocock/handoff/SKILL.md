---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows) - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should load: each by name, with the `/skill:<name>` command the user runs or the path to its `SKILL.md`, which the agent reads to load it.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information. Never write a secret into the document, not even in part: no API keys, tokens, passwords, private keys, credentials, connection strings with credentials, or values copied from `.env` files or the environment. Name where a secret lives instead (the variable name, the file, the secret store), and check the finished document for secrets before reporting its path.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
