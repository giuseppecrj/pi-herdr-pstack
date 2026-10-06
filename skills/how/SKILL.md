---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

## Step 1. Assess Complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. One explainer explores and explains in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): spawn parallel explorers first, then hand off to the explainer. Go to Step 2a.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Launch all explorers as independent bare `subagent` calls in one turn, per `../poteto-mode/references/fan-out.md`, then end the turn:

- `model`: `task:recon`
- do not grant write/edit tools

Each explorer gets the prompt in `references/explorer-prompt.md` with its angle filled in, as its `task`. Then go to Step 3.

```json subagent
{
  "name": "<slug>-explore-1",
  "task": "<references/explorer-prompt.md with the question and this explorer's angle filled in>. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Investigator prompt in ../poteto-mode/references/delegation.md, verbatim>",
  "model": "task:recon",
  "thinking": "medium",
  "tools": "read, bash",
  "fork": false
}
```

## Step 2b. Direct Explain (simple questions)

Spawn one bare subagent that explores and explains in one pass:

- `model`: `task:recon`
- do not grant write/edit tools

Build its prompt from `references/explainer-prompt.md` without the explorer-findings section. Go to Step 4.

## Step 3. Synthesize (complex questions only)

Once all explorers have returned, spawn one bare subagent to synthesize their findings into one explanation:

- `model`: `task:recon`
- do not grant write/edit tools

Build its prompt from `references/explainer-prompt.md` with every explorer's findings filled in.

```json subagent
{
  "name": "<slug>-explain",
  "task": "<references/explainer-prompt.md with the question and every explorer's findings filled in>. Read-only. You are a leaf: launch nothing.",
  "systemPrompt": "<the Investigator prompt in ../poteto-mode/references/delegation.md, verbatim>",
  "model": "task:recon",
  "thinking": "medium",
  "tools": "read, bash",
  "fork": false
}
```

The Step 2b explainer takes the same launch, with the explorer-findings section dropped from its `task`.

## Step 4. Present

Present the explainer's output to the user. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output Format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
