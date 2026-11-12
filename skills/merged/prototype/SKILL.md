---
name: prototype
description: Build a throwaway prototype to answer a design question or settle an empirical fork by observing it. Use when the user wants to sanity-check whether a state model or logic feels right, explore what a UI should look like, or find out how a behavior, timing or approach actually turns out instead of guessing.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

You own the decision, not the code. The prototype is a throwaway instrument, and the real build comes after it. Speed over polish: code quality does not matter and there is no planning. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.

**What invoking this skill grants.** Writing and running the prototype in a scratch directory, and nothing else. Building it inside the app, keeping it after the question is answered, committing it, pushing it, or pointing at it from an issue or pull request each need more, as **Where it lives** and **Capture it when done** say. Loading the skill without the user invoking it, from another skill or as a delegated child, grants nothing beyond what that skill's or brief's own grant names.

## Scope the decision

Name the decision the prototype exists to make: which layout, which interaction, which density, which state model, or, for an empirical fork, which behavior, timing or approach. No decision means no prototype: hand the work to the real build instead (under poteto-mode, the Feature playbook, `../../pstack/poteto-mode/playbooks/feature.md`).

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → `LOGIC.md`. Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → `UI.md`. Generate several radically different UI variations, switchable via a URL search param and a floating bottom bar.
- **"How does this actually behave?"** (an empirical fork: a behavior, a timing, which of two approaches works) → **Empirical** below. Write the smallest script that exercises the question and observe the result.

The branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI; a claim about speed or behavior → empirical) and state the assumption at the top of the prototype.

When the design space is open, gather references before building: search for prior art with the search tools the session provides, summarize a moodboard of themes, palettes and layouts, and let the user pick directions. Skip this when the direction is set, or when no search tool is available, and say which.

### Empirical

For a behavioral or timing decision, build the smallest script that exercises the question: no production framework, no tests, no abstractions. Compare alternatives side by side in the same script or behind one switch, each labelled. Observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.

## Where it lives

**Scratch is the default.** Build in an isolated scratch directory outside the project's source tree: a new directory under the system temp directory (`mktemp -d`), or a path the user names. Nothing there is staged or committed, and nothing is installed into the user's project: use CDN dependencies, or install into the scratch directory itself.

**In-app needs explicit scope.** Building the prototype inside the app (next to the module or page it is for, on an existing route, or as a throwaway route) edits the project's source, so do it only when the user asked for an in-app prototype or approved one when you asked. When you ask, name the files it would touch and offer scratch as the alternative. With that scope, locate the code close to where it will be used, name it so a casual reader can see it's a prototype, follow the project's routing convention, keep it uncommitted, and list every file it adds or changes.

## Rules that apply to every branch

1. **Throwaway from day one, and clearly marked as such.** A casual reader of the prototype can see it's a prototype, not production.
2. **Trivial to run.** A UI prototype starts from one command (`pnpm <name>`, `python <path>`, `bun <path>`, etc.), run from the scratch directory, or the project's task runner when in-app scope covers adding it. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name, never a shared or production one.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Compare alternatives behind one switcher.** When there are several variants, put them behind one switcher (buttons or a keypress), each variant labelled. This is the **principle-exhaust-the-design-space** skill made cheap.
7. **Capture it when done.** See below.

## Verify on the matching surface

For a visual decision, screenshot each variant and drive the interaction with the browser or screenshot tooling the session provides. If none is available, say the visual comparison is unverified rather than describing renders you did not see. For a logic decision, click through the walkthroughs yourself and record the state after each step. For a behavioral or timing decision, report the observed output or timing.

## Capture it when done

Capture the answer: the question, the verdict and the evidence, in your reply. The validated decision goes to the real build, never as prototype code: hand the chosen direction to whoever builds it (under poteto-mode, the Feature playbook; otherwise the ticket, or `/skill:to-spec`), and the real build rewrites it properly. Lifting a logic prototype's pure module into production happens only in that separately authorized production change, with its normal tests and review.

The prototype itself is a **primary source**, so by default it stays where it was built: give the user its scratch path, or list the in-app files it added or changed and leave them uncommitted. Preserving it past the task needs the user's authorization, and each of these effects needs its own: committing it (Matt's practice is a throwaway `prototype/<name>` branch, out of main), pushing that branch, and leaving a context pointer to it on an issue or pull request, in the repo the tracker doc names. Without that, never commit prototype code, and never let it reach the main branch. Removing in-app prototype files, once the answer is captured, happens when the user agrees.

## Reply

The variants explored, the evidence (screenshots for a visual decision, the state after each walkthrough step for a logic decision, the observed output or timing for a behavioral one), tradeoffs, your recommendation, and the scratch path or the list of in-app files. Say plainly that the prototype is throwaway.
