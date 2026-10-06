### Investigation

**You own the answer. Plan, route, write.**

Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.

1. Route through the **how** skill (planned W4). For motivation questions, also route through the **why** skill (planned W4). Until they ship, investigate directly. Read the code, run read-only commands, and cite file:line or command output for each claim. For motivation, read `git log`, `git blame` and the linked discussions you can actually open. Delegate bulky reading to bare investigators per `references/delegation.md` and keep the reduced findings in the main thread.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the how-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Apply the **unslop** skill to the reply.

No PR, no babysit, no design-exploration pass unless the investigation precedes a code change. If it does, hand back to the user and re-route to Bug fix or Feature.

**Reply:** the investigation output. For "are we sure?" answers, include your real judgment with reasons. Push back if the premise is wrong (see the hub's Autonomy section). Name anything you could not check.
