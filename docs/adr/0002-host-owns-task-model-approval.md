---
status: accepted
---

# Task-model approval lives in the host writer

Every task-model write still needs the user's approval of the exact change. The approval prompt moves from pstack into pi-herdr-agents' `subagents_write_task_models`, the package that owns the config file, and the writer refuses when no UI can show the prompt. pstack previously gated every writer call and showed its own approval dialog because the host writer had none. With the host prompting, pstack's writer gate, apply tool and init-approval handling can be deleted.

## Consequences

- Any caller of the host writer, not only pstack, now triggers an approval prompt.
- Headless and subagent sessions cannot change task models.
