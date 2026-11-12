# Matt Pocock's flows

Which skill or flow fits the user's situation, among Matt Pocock's skills in this package. This map is adapted from his `ask-matt` router. It lists only flows whose skills ship here, each together with every skill it loads, and every step is a `/skill:<name>` command. A few of his skills are not in this package; the map names them only to say so, never as a step.

Paths here are relative to the poteto-help skill directory. Matt's skills live in `../../mattpocock/`, and `tdd`, `teach` and `prototype` in `../` (the `merged` folder). Before stating what a skill does or recommending a step be skipped, read that skill's SKILL.md: the summaries here are for orientation only. Playbooks are not skills: they are step lists inside poteto-mode, with no `/skill:` command, and this map names one only as poteto-mode's route.

A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/skill:grill-with-docs`** sharpens the idea by interview. Start here whenever you are **working in a working directory**: it's stateful, retaining what it learns in `GLOSSARY.md` and ADRs. (No working directory? Use `/skill:grill-me` instead, covered under Standalone. Both run the same `grilling` primitive; `grill-with-docs` is the one that leaves a paper trail, which makes it the better of the two whenever a repo is there to leave it in.)
2. **Branch: can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you have to see), detour through a prototype, bridged by **`/skill:handoff`** in both directions (a prototype lives in its own scratch directory, which is exactly what a handoff is for; see Phase boundaries):
   - **`/skill:handoff`** out, then open a fresh session against that file,
   - **`/skill:prototype`** to answer the question with throwaway code,
   - **`/skill:handoff`** back what you learned, and reference it from the original idea thread.
3. **Branch: is this a multi-session build?**
   - **Yes** → **`/skill:to-spec`** (turn the thread into a spec), then **`/skill:to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. Then work the tickets one of two ways:
     - **`/skill:implement`** per ticket, **starting a new session (`/new`) between each one**. On a local tracker that's one file per ticket under `.scratch/<feature>/issues/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed. Each ticket is self-contained, so the last one's context is disposable.
     - **`/skill:implement-spec`** for the whole spec in one run. It reads the tickets as a **task graph**, runs implementer subagents across the ready **frontier** in parallel, and lands everything on one **integration branch**. Reach for it when you'd rather orchestrate the build than drive each ticket yourself.
   - **No** → **`/skill:implement`** right here, in the same context window.

   Either way, the code gets built by driving **`/skill:tdd`** (one red-green slice at a time) and closes out with **`/skill:code-review`**, a two-axis review (Standards + Spec) of the diff. `implement` runs both per ticket, reviewing the uncommitted work before it commits; `implement-spec`'s implementers each drive `tdd`, and it runs one `code-review` over the integration branch. Reach for **`/skill:tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/skill:code-review`** on its own whenever you want to review a branch, a PR or work in progress against a fixed point.

   When the work goes up as a pull request, **`/skill:pr`** shapes the body: the smallest visual that shows the change, before/after evidence that it works, and a one-way or two-way door call. It's model-invoked, so the agent reaches for it whenever it writes a PR body. It drafts text only; opening or editing the PR needs the user's grant.

4. **Close the loop.** Matt's `retro` skill is not in this package. To turn what a build taught into edits the user approves, use **`/skill:reflect`**.

None of these steps pushes, opens a pull request or writes to the tracker on its own say-so: each skill names what invoking it grants, and `implement` and `implement-spec` grant no remote write.

### Context hygiene

Keep steps 1–3 in **one unbroken context window** (don't compact or start a new session until after `/skill:to-tickets`) so the grilling, spec, and tickets all build on the same thinking. Each `/skill:implement` then starts fresh, working from the ticket.

The limit on this is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)**: the window (~150k tokens on state-of-the-art models) within which the model still reasons sharply. If a session approaches it before `/skill:to-tickets`, don't push on degraded; `/compact` at the nearest phase boundary and carry on (see Phase boundaries).

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → **`/skill:triage`**. It moves issues through triage roles and produces agent-ready issues, which **`/skill:implement`** later picks up.

  Triage is only for issues **you didn't create**: bug reports, incoming feature requests, anything that arrives raw. Tickets that `/skill:to-tickets` produced are already agent-ready, so **don't triage them**.

- **Something's broken** → Matt's `diagnosing-bugs` skill is not in this package. Inside poteto-mode, describing the bug runs the Bug fix playbook (`../../pstack/poteto-mode/playbooks/bug-fix.md`): reproduce it yourself on the matching surface, binary-search the cause, then fix and verify on the same surface, with the failing test first where a cheap local test path exists (`/skill:tdd`). Where the real finding is that there's no good seam to lock the bug down, that's a job for **`/skill:improve-codebase-architecture`**.

- **A huge, foggy effort: a greenfield project or a huge feature build, too big for one session** → **`/skill:wayfinder`**, the most cognitively demanding flow here. When the way from here to the destination isn't visible yet, it charts a **shared map** of **decision tickets** on the issue tracker and resolves them one at a time, producing **decisions, not deliverables**, until the fog is pushed back and the way is clear. Where **`/skill:grill-with-docs`** sharpens an idea you can hold in one session, wayfinder is for the idea you can't, and it's slower and denser, so save it for exactly that, never a well-scoped feature.

  When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/skill:to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/skill:to-tickets` and `/skill:implement` as usual. Looping the map straight into `/skill:implement` skips that collapse and throws the linked detail away, so go straight to `/skill:implement` only when the effort turned out genuinely small.

## Codebase health

Not feature work, just upkeep.

- **`/skill:improve-codebase-architecture`** runs whenever you have a spare moment to keep the codebase good for agents to operate in. It surfaces **deepening opportunities**; picking one _generates an idea_ you can take into the main flow at `/skill:grill-with-docs`. It's the survey that finds the candidates; **`/skill:codebase-design`** (below) is the bench you design the chosen one on.

## Vocabulary underneath

Two model-invoked references that run *beneath* the other skills, each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **`/skill:domain-modeling`**: sharpen the project's *domain* language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline `/skill:grill-with-docs` drives to keep `GLOSSARY.md` a clean glossary.
- **`/skill:codebase-design`** is the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's *shape*: a lot of behaviour behind a small interface at a clean seam. `tdd` and `improve-codebase-architecture` both speak it.

## Phase boundaries

A **phase** is a chunk of work inside a session: the grilling, the implementation, the QA. At the **boundary** between two of them you have five options, and picking between them is the fuzziest decision in this whole map:

- **Continue**: stay put. Costs nothing, loses nothing.
- **`/new`**: start a new session, when nothing here matters to what's next.
- **`/skill:handoff`** writes a portable markdown file. Narrow: only for a **new harness**, a **new directory**, a **colleague**, or forking a side task **mid-phase**. What it buys is portability.
- **Subagent**: send a tightly-scoped task to its own window and get a report back.
- **`/compact`** compresses this context and carries on from the summary. The **default**, at the bottom of the tree rather than the first reach.

Read `references/phase-boundaries.md` for the ordered tree: the five questions, the reasoning behind each branch, and why the primary-source cost makes **Continue** the one to rule out first. Make the decision **at** a boundary; mid-phase, continue or split the rest into subagents.

## Standalone

Off the main flow entirely.

- **`/skill:grill-me`**: the same relentless interview as `/skill:grill-with-docs`, but **stateless**: it saves nothing locally and builds no `GLOSSARY.md`. Reach for it when you are **not working in a working directory** (sharpening a plan, a design, a piece of writing, anything with no repo under it). If you are in a working directory, use `/skill:grill-with-docs` instead: it runs the same interview and leaves a paper trail, so it is strictly the better one.
- **`/skill:grilling`** is the interview primitive itself: rounds, the frontier, facts are the agent's job and decisions are yours. `grill-me` and `grill-with-docs` are the two named ways in, and `triage`, `wayfinder` and `improve-codebase-architecture` all run it internally. Reach for it directly only when you want the interview with no wrapper around it.
- **`/skill:prototype`** is a small, throwaway program that answers one design question: does this state model feel right, what should this UI look like, or how does this actually behave. Throwaway is a constraint on how the code is written, not a promise to destroy it: the answer goes to the real build, and the prototype stays in scratch as a **primary source**. Building it inside the app needs your explicit scope, and keeping it on a `prototype/<name>` branch out of main, or pointing at it from the implementation issue, needs your authorization. It's the detour in step 2 of the main flow, but reach for it any time a design question is hard to settle on paper.
- **`/skill:research`**: delegate reading legwork to a **background subagent**: it investigates a question against **primary sources**, then leaves a cited Markdown file in the repo. Keep working while it reads. The file it produces is something to take *into* the main flow at `/skill:grill-with-docs`, since research feeds the thinking rather than replacing it.
- **`/skill:to-questionnaire`** comes in when the thing blocking you isn't in your head or the codebase but in **someone else's**, and it writes them a questionnaire to fill in. It's the inverse of `/skill:grill-me`: instead of interviewing you about the subject, it interviews you about the **send** (who it's going to, what you need back) and aims the questions at the gap. What comes back is material for `/skill:grill-with-docs` or `/skill:to-spec`.
- **`/skill:wizard`** is for the steps only a **human** can take: provisioning infrastructure, setting up credentials or CI secrets, clicking through an unfamiliar third-party dashboard, running a one-off migration or cutover. It generates an interactive bash script that opens each URL, captures each value, and writes it into `.env` and GitHub secrets, so the procedure stops being something you re-explain to an agent every time. It writes the script and never runs it. Model-invoked, so the agent reaches for it the moment it hits a wall only you can pass. If the agent could just do it itself, it should; this is for where a human is genuinely in the loop.
- **`/skill:teach`**: learn a concept over multiple sessions, using a directory you confirm as a stateful workspace, or have a change explained plainly.

Matt's `wait-what` and `writing-for-agents` skills are not in this package. For a reply that didn't land, `/skill:bro` restates it in plain words.

## Precondition

**`/skill:setup-repo`**: run before your first engineering flow to configure the issue tracker, triage labels, and doc layout the other skills assume. Custom issue trackers also work.
